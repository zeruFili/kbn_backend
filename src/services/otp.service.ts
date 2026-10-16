import crypto from "crypto";
import bcrypt from "bcryptjs";
import { EntityManager } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { OtpVerification } from "../entities/otp-verification";
import { OtpPurpose } from "../enums/otp-purpose.enum";
import { AppError } from "../middlewares/error.middleware";
import { sendEthioSms, ethioSmsSender, isEthioSmsConfigured } from "../modules/ethiosms";
import { emailService } from "./email.service";

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
const MAX_OTP_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS) || 5;
const RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS) || 60 * 1000; // 60 seconds

export class OtpService {
  private getRepo(manager?: EntityManager) {
    return manager ? manager.getRepository(OtpVerification) : AppDataSource.getRepository(OtpVerification);
  }

  /**
   * Normalizes an identifier (phone number or email).
   * For Ethiopian mobile numbers, normalizes to E.164 (+2519... / +2517...) using EthioSMS.
   */
  public normalizeIdentifier(identifier: string): string {
    if (!identifier) return "";
    const trimmed = identifier.trim();
    const normalizedPhone = ethioSmsSender.normalizePhone(trimmed);
    if (normalizedPhone) {
      return normalizedPhone;
    }
    return trimmed.toLowerCase();
  }

  /**
   * Generates a secure random 6-digit numeric OTP, hashes it,
   * invalidates prior active codes for (identifier, purpose),
   * persists the record to the database, and dispatches via EthioSMS / SMSHub.
   */
  async generateAndSendOtp(
    rawIdentifier: string,
    purpose: OtpPurpose,
    userId?: string | null,
    manager?: EntityManager
  ): Promise<{
    success: boolean;
    identifier: string;
    expiresAt: Date;
    message: string;
    otpForTesting?: string; // only populated in non-production for testing
  }> {
    const identifier = this.normalizeIdentifier(rawIdentifier);
    if (!identifier) {
      throw new AppError(400, "A valid phone number or identifier is required.");
    }

    const altIdentifier = identifier.startsWith("+")
      ? identifier.slice(1)
      : `+${identifier}`;

    const repo = this.getRepo(manager);

    // 1. Check rate limit / cooldown: Prevent spamming OTP generation
    const latestActive = await repo.findOne({
      where: [
        { identifier, purpose },
        { identifier: altIdentifier, purpose },
      ],
      order: {
        createdAt: "DESC",
      },
    });

    const now = Date.now();
    if (latestActive && latestActive.usedAt === null) {
      const createdTime = new Date(latestActive.createdAt).getTime();
      const timeSinceLast = now - createdTime;
      if (timeSinceLast < RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLast) / 1000);
        throw new AppError(
          429,
          `Please wait ${remainingSeconds} second(s) before requesting another verification code.`
        );
      }
    }

    // 2. Invalidate / supersede previous active OTPs for the same identifier and purpose
    await repo
      .createQueryBuilder()
      .update(OtpVerification)
      .set({ expiresAt: new Date(now - 1000) })
      .where(
        "(identifier = :identifier OR identifier = :altIdentifier) AND purpose = :purpose AND used_at IS NULL AND expires_at > :nowDate",
        {
          identifier,
          altIdentifier,
          purpose,
          nowDate: new Date(now),
        }
      )
      .execute();

    // 3. Generate secure 6-digit numeric OTP and bcrypt hash
    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(plainOtp, 10);
    const expiresAt = new Date(now + OTP_EXPIRY_MS);

    // 4. Persist to otp_verifications database table
    const otpRecord = repo.create({
      userId: userId || null,
      identifier,
      otpHash,
      purpose,
      expiresAt,
      attempts: 0,
      usedAt: null,
    });
    await repo.save(otpRecord);

    // 5. Deliver OTP via Email or EthioSMS Module
    const isEmail = identifier.includes("@");
    if (isEmail) {
      try {
        await emailService.sendOtpEmail(identifier, "User", plainOtp, purpose);
      } catch (emailErr: any) {
        console.warn(`[OtpService] Email send notice for ${identifier}: ${emailErr.message}`);
      }
    } else {
      const smsMessage = `Your Kingdom Builders Hub verification code is ${plainOtp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;
      try {
        await sendEthioSms(identifier, smsMessage);
      } catch (smsErr: any) {
        console.warn(`[OtpService] EthioSMS send notice for ${identifier}: ${smsErr.message}`);
        if (process.env.NODE_ENV === "production" && isEthioSmsConfigured()) {
          throw new AppError(502, "Failed to deliver SMS verification code. Please try again later.");
        }
      }
    }

    const channel = isEmail ? "email" : "SMS";
    return {
      success: true,
      identifier,
      expiresAt,
      message: `Verification code sent successfully via ${channel}`,
      ...(process.env.NODE_ENV === "test" ? { otpForTesting: plainOtp } : {}),
    };
  }

  /**
   * Securely verifies submitted OTP against the latest active database record.
   * Checks identifier, purpose, expiration, attempt limit, and single-use status.
   * Atomically updates used_at to prevent double usage / race conditions.
   */
  async verifyOtp(
    rawIdentifier: string,
    plainOtp: string,
    purpose: OtpPurpose,
    manager?: EntityManager
  ): Promise<{
    success: boolean;
    record: OtpVerification;
    message: string;
  }> {
    const identifier = this.normalizeIdentifier(rawIdentifier);
    if (!identifier) {
      throw new AppError(400, "A valid phone number or identifier is required.");
    }

    if (!plainOtp || !plainOtp.trim()) {
      throw new AppError(400, "Verification code is required.");
    }

    const trimmedOtp = plainOtp.trim();
    const repo = this.getRepo(manager);

    const altIdentifier = identifier.startsWith("+")
      ? identifier.slice(1)
      : `+${identifier}`;

    // 1. Fetch latest OTP record for this identifier and purpose
    const record = await repo.findOne({
      where: [
        { identifier, purpose },
        { identifier: altIdentifier, purpose },
      ],
      order: {
        createdAt: "DESC",
      },
    });

    if (!record) {
      throw new AppError(400, "No verification code found. Please request a new code.");
    }

    // 2. Check if already used
    if (record.usedAt !== null) {
      throw new AppError(400, "This verification code has already been used. Please request a new one.");
    }

    // 3. Check attempt limit / lock status
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      throw new AppError(
        429,
        "Too many failed verification attempts. This verification code has been locked. Please request a new one."
      );
    }

    // 4. Check expiration
    if (new Date() > new Date(record.expiresAt)) {
      throw new AppError(400, "Verification code has expired. Please request a new one.");
    }

    // 5. Compare OTP hash
    const isMatch = await bcrypt.compare(trimmedOtp, record.otpHash);
    if (!isMatch) {
      record.attempts += 1;
      await repo.save(record);

      const remaining = MAX_OTP_ATTEMPTS - record.attempts;
      if (remaining <= 0) {
        throw new AppError(
          429,
          "Too many failed verification attempts. This verification code has been locked. Please request a new one."
        );
      }
      throw new AppError(400, `Invalid verification code. You have ${remaining} attempt(s) remaining.`);
    }

    // 6. Concurrency-safe atomic consumption:
    // Update used_at ONLY if it is still NULL at this instant
    const updateResult = await repo
      .createQueryBuilder()
      .update(OtpVerification)
      .set({ usedAt: new Date() })
      .where("id = :id AND used_at IS NULL", { id: record.id })
      .execute();

    if (updateResult.affected === 0) {
      throw new AppError(400, "This verification code has already been used. Please request a new one.");
    }

    record.usedAt = new Date();
    return {
      success: true,
      record,
      message: "Verification successful",
    };
  }

  /**
   * Links a verified OTP record to a newly created user ID
   */
  async linkUser(otpId: string, userId: string, manager?: EntityManager): Promise<void> {
    const repo = this.getRepo(manager);
    await repo.update(otpId, { userId });
  }
}

export const otpService = new OtpService();
