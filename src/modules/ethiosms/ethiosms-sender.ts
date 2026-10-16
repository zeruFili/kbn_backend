import * as crypto from "crypto";
import { ethioSmsConfig, EthioSmsModuleConfig } from "./config";
import {
  EthioSmsError,
  EthioSmsSendResult,
  EthioOtpSendResult,
  EthioOtpVerifyResult,
} from "./types";

interface OtpRecord {
  hash: Buffer;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  sendTimes: number[];
}

export class EthioSmsSender {
  private config: EthioSmsModuleConfig;
  private codes: Map<string, OtpRecord>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(customConfig?: Partial<EthioSmsModuleConfig>) {
    this.config = { ...ethioSmsConfig, ...customConfig };
    this.codes = new Map<string, OtpRecord>();

    // Housekeeping: drop expired codes every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.codes.forEach((entry, phone) => {
        if (entry.expiresAt < now) {
          this.codes.delete(phone);
        }
      });
    }, 60 * 1000);

    if (this.cleanupInterval && typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Normalizes Ethiopian phone numbers into E.164 international format (+2519... / +2517...)
   * Accepts "0911223344", "+251911223344", "251911223344", "0711223344"
   */
  public normalizePhone(input?: string): string | null {
    if (!input) return null;
    let p = String(input).trim().replace(/[\s()\-]/g, "");
    if (p.startsWith("0")) {
      p = "+251" + p.slice(1);
    } else if (p.startsWith("9") || p.startsWith("7")) {
      p = "+251" + p;
    } else if (p.startsWith("251")) {
      p = "+" + p;
    }
    return /^\+251[79]\d{8}$/.test(p) ? p : null;
  }

  /**
   * Generates a secure random 6-digit OTP code
   */
  public generateOtp(): string {
    return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  }

  /**
   * Computes SHA-256 hash buffer
   */
  public hash(s: string): Buffer {
    return crypto.createHash("sha256").update(String(s)).digest();
  }

  /**
   * Low-level method: accepts recipient phone number and text message, delivers via SMSHub API.
   *
   * @param phone - Recipient MSISDN (e.g. "+251912345678" or "0912345678")
   * @param message - The SMS text content
   * @returns Promise<EthioSmsSendResult>
   */
  public async send(phone: string, message: string): Promise<EthioSmsSendResult> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      throw new EthioSmsError({
        message: `Invalid Ethiopian phone number: "${phone}". Expected format: 09..., 07..., or +251...`,
        code: "INVALID_PHONE_FORMAT",
        phone,
      });
    }

    const trimmedText = message?.trim();
    if (!trimmedText) {
      throw new EthioSmsError({
        message: "SMS text content cannot be empty",
        code: "EMPTY_MESSAGE",
        phone: normalizedPhone,
      });
    }

    if (!this.config.apiKey) {
      console.warn("[EthioSmsModule] SMSHUB_API_KEY is not configured in environment variables.");
    }

    try {
      const response = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          msisdn: normalizedPhone,
          text: trimmedText,
        }),
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new EthioSmsError({
          message: `SMSHub API responded with HTTP ${response.status}: ${data?.error_type || data?.message || "Failed to deliver SMS"}`,
          code: "SMS_API_ERROR",
          statusCode: response.status,
          phone: normalizedPhone,
          details: data,
        });
      }

      return {
        status: "sent",
        phone: normalizedPhone,
        data,
      };
    } catch (err: any) {
      if (err instanceof EthioSmsError) {
        throw err;
      }
      throw new EthioSmsError({
        message: `Failed to deliver SMS: ${err.message}`,
        code: "SMS_API_ERROR",
        phone: normalizedPhone,
        details: err,
      });
    }
  }

  /**
   * Generates a 6-digit code, stores its hash, applies cooldown/rate-limits, and sends it via SMS.
   *
   * @param phone - Recipient phone number
   * @param textTemplate - Optional custom template or formatting function.
   *                       Use "{code}" or "{otp}" as placeholder.
   */
  public async sendOtp(
    phone: string,
    textTemplate?: string | ((code: string) => string)
  ): Promise<EthioOtpSendResult> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      throw new EthioSmsError({
        message: "Valid Ethiopian phone number required",
        code: "INVALID_PHONE_FORMAT",
        phone,
      });
    }

    const now = Date.now();
    const existing = this.codes.get(normalizedPhone);

    if (existing) {
      const wait = this.config.resendCooldownMs - (now - existing.lastSentAt);
      if (wait > 0) {
        throw new EthioSmsError({
          message: `Please wait ${Math.ceil(wait / 1000)}s before requesting a new code`,
          code: "RATE_LIMITED",
          phone: normalizedPhone,
        });
      }

      existing.sendTimes = existing.sendTimes.filter((t) => now - t < 3600000);
      if (existing.sendTimes.length >= this.config.maxSendsPerHour) {
        throw new EthioSmsError({
          message: "Too many OTP requests. Try again later.",
          code: "RATE_LIMITED",
          phone: normalizedPhone,
        });
      }
    }

    const code = this.generateOtp();
    const sendTimes = existing ? existing.sendTimes : [];
    sendTimes.push(now);

    let messageText: string;
    if (typeof textTemplate === "function") {
      messageText = textTemplate(code);
    } else if (typeof textTemplate === "string") {
      if (textTemplate.includes("{code}")) {
        messageText = textTemplate.replace(/{code}/g, code);
      } else if (textTemplate.includes("{otp}")) {
        messageText = textTemplate.replace(/{otp}/g, code);
      } else {
        messageText = `${textTemplate} ${code}`;
      }
    } else {
      messageText =
        `Your verification code is ${code}. Use this code to sign in. ` +
        `It expires in 5 minutes. If you did not request this, ignore this message.`;
    }

    this.codes.set(normalizedPhone, {
      hash: this.hash(code),
      expiresAt: now + this.config.otpExpiryMs,
      attempts: 0,
      lastSentAt: now,
      sendTimes,
    });

    try {
      const deliveryResult = await this.send(normalizedPhone, messageText);
      return {
        success: true,
        phone: normalizedPhone,
        message: "OTP sent successfully",
        data: deliveryResult.data,
      };
    } catch (err) {
      // Don't keep an OTP code if delivery failed
      this.codes.delete(normalizedPhone);
      throw err;
    }
  }

  /**
   * Verifies an OTP code using timing-safe comparison.
   * Single-use token: drops upon successful verification.
   *
   * @param phone - Recipient phone number
   * @param code - The code entered by the user
   */
  public verifyOtp(phone: string, code: string): EthioOtpVerifyResult {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone || !code) {
      throw new EthioSmsError({
        message: "Phone number and OTP code are required",
        code: "INVALID_PHONE_FORMAT",
        phone,
      });
    }

    const entry = this.codes.get(normalizedPhone);
    if (!entry) {
      throw new EthioSmsError({
        message: "No OTP found for this number. Request a new one.",
        code: "OTP_NOT_FOUND",
        phone: normalizedPhone,
      });
    }

    if (Date.now() > entry.expiresAt) {
      this.codes.delete(normalizedPhone);
      throw new EthioSmsError({
        message: "OTP expired. Request a new one.",
        code: "OTP_EXPIRED",
        phone: normalizedPhone,
      });
    }

    if (entry.attempts >= this.config.maxAttempts) {
      this.codes.delete(normalizedPhone);
      throw new EthioSmsError({
        message: "Too many wrong attempts. Request a new OTP.",
        code: "MAX_ATTEMPTS_EXCEEDED",
        phone: normalizedPhone,
      });
    }

    const candidate = this.hash(String(code).trim());
    const valid =
      candidate.length === entry.hash.length &&
      crypto.timingSafeEqual(candidate, entry.hash);

    if (!valid) {
      entry.attempts += 1;
      const attemptsLeft = this.config.maxAttempts - entry.attempts;
      if (entry.attempts >= this.config.maxAttempts) {
        this.codes.delete(normalizedPhone);
      }
      throw new EthioSmsError({
        message: `Invalid OTP code. ${attemptsLeft} attempts remaining.`,
        code: "OTP_INVALID",
        phone: normalizedPhone,
        details: { attemptsLeft },
      });
    }

    // Single use: remove entry upon successful verification
    this.codes.delete(normalizedPhone);
    return {
      success: true,
      phone: normalizedPhone,
      message: "Phone number verified successfully",
    };
  }

  /**
   * Boolean verification helper matching the checkOtp signature
   */
  public checkOtp(phone: string, code: string): boolean {
    try {
      const res = this.verifyOtp(phone, code);
      return res.success;
    } catch {
      return false;
    }
  }
}

export const ethioSmsSender = new EthioSmsSender();
