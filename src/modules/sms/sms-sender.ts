import * as crypto from "crypto";
import { smsConfig, SmsModuleConfig } from "./config";
import { SmsError, SmsSendResult, OtpSendResult, OtpVerifyResult } from "./types";

interface OtpRecord {
  otpHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  sendTimes: number[];
}

export class SmsSender {
  private config: SmsModuleConfig;
  private otps: Map<string, OtpRecord>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(customConfig?: Partial<SmsModuleConfig>) {
    this.config = { ...smsConfig, ...customConfig };
    this.otps = new Map<string, OtpRecord>();

    // Background cleanup of expired records every 10 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.otps.forEach((record, phone) => {
        if (now > record.expiresAt + 3600000) {
          this.otps.delete(phone);
        }
      });
    }, 10 * 60 * 1000);

    if (this.cleanupInterval && typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Normalizes Ethiopian phone numbers to international standard 2519... / 2517...
   */
  public normalizePhone(input?: string): string | null {
    if (!input) return null;
    let p = String(input).replace(/[\s\-+]/g, "");
    if (p.startsWith("0")) p = "251" + p.slice(1);
    else if (p.startsWith("9") || p.startsWith("7")) p = "251" + p;
    return /^251[79]\d{8}$/.test(p) ? p : null;
  }

  /**
   * Generates a secure random 6-digit OTP code
   */
  public generateOtp(): string {
    return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  }

  /**
   * HMAC-SHA256 hashes phone + OTP using secret
   */
  public hashOtp(phone: string, otp: string): string {
    return crypto.createHmac("sha256", this.config.otpSecret).update(`${phone}:${otp}`).digest("hex");
  }

  /**
   * Accepts recipient phone number and message content, delivers it via SMS API.
   *
   * @param phone - Recipient phone number (e.g. "0911223344", "+251911223344")
   * @param message - The SMS text message to deliver
   * @returns Promise<SmsSendResult>
   */
  public async send(phone: string, message: string): Promise<SmsSendResult> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      throw new SmsError({
        message: `Invalid Ethiopian phone number: "${phone}". Expected format: 09..., 07..., or +251...`,
        code: "INVALID_PHONE_FORMAT",
        phone,
      });
    }

    const trimmedMessage = message?.trim();
    if (!trimmedMessage) {
      throw new SmsError({
        message: "SMS message content cannot be empty",
        code: "EMPTY_MESSAGE",
        phone: normalizedPhone,
      });
    }

    if (!this.config.apiKey) {
      console.warn("[SmsModule] SMS_API_KEY is not configured in environment variables.");
    }

    try {
      const response = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          KEY: this.config.apiKey,
        },
        body: JSON.stringify({
          msisdn: normalizedPhone,
          text: trimmedMessage,
        }),
      });

      const raw = await response.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }

      if (!response.ok) {
        throw new SmsError({
          message: `SMS gateway responded with HTTP ${response.status}`,
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
      if (err instanceof SmsError) {
        throw err;
      }
      throw new SmsError({
        message: `Failed to deliver SMS: ${err.message}`,
        code: "SMS_API_ERROR",
        phone: normalizedPhone,
        details: err,
      });
    }
  }

  /**
   * Generates a 6-digit OTP, applies cooldown and rate limits, and delivers it via SMS.
   *
   * @param phone - Recipient phone number
   * @param customMessage - Optional message template (must include {otp} or will append)
   */
  public async sendOtp(
    phone: string,
    customMessage?: string | ((otp: string) => string)
  ): Promise<OtpSendResult> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      throw new SmsError({
        message: "Valid Ethiopian phone number required",
        code: "INVALID_PHONE_FORMAT",
        phone,
      });
    }

    const now = Date.now();
    const existing = this.otps.get(normalizedPhone);

    if (existing) {
      const wait = this.config.resendCooldownMs - (now - existing.lastSentAt);
      if (wait > 0) {
        throw new SmsError({
          message: `Please wait ${Math.ceil(wait / 1000)}s before requesting a new code`,
          code: "RATE_LIMITED",
          phone: normalizedPhone,
        });
      }

      existing.sendTimes = existing.sendTimes.filter((t) => now - t < 3600000);
      if (existing.sendTimes.length >= this.config.maxSendsPerHour) {
        throw new SmsError({
          message: "Too many OTP requests. Try again later.",
          code: "RATE_LIMITED",
          phone: normalizedPhone,
        });
      }
    }

    const otp = this.generateOtp();
    const sendTimes = existing ? existing.sendTimes : [];
    sendTimes.push(now);

    let messageText: string;
    if (typeof customMessage === "function") {
      messageText = customMessage(otp);
    } else if (typeof customMessage === "string" && customMessage.includes("{otp}")) {
      messageText = customMessage.replace("{otp}", otp);
    } else {
      messageText = `Your verification code is ${otp}. It expires in 5 minutes. Do not share it.`;
    }

    await this.send(normalizedPhone, messageText);

    this.otps.set(normalizedPhone, {
      otpHash: this.hashOtp(normalizedPhone, otp),
      expiresAt: now + this.config.otpExpiryMs,
      attempts: 0,
      lastSentAt: now,
      sendTimes,
    });

    return {
      success: true,
      phone: normalizedPhone,
      message: "OTP sent successfully",
    };
  }

  /**
   * Verifies an OTP code for a phone number using constant-time comparison
   *
   * @param phone - Recipient phone number
   * @param code - 6-digit OTP code submitted
   */
  public verifyOtp(phone: string, code: string): OtpVerifyResult {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone || !code) {
      throw new SmsError({
        message: "Phone and OTP code are required",
        code: "INVALID_PHONE_FORMAT",
        phone,
      });
    }

    const record = this.otps.get(normalizedPhone);
    if (!record) {
      throw new SmsError({
        message: "No OTP found for this number. Request a new one.",
        code: "OTP_NOT_FOUND",
        phone: normalizedPhone,
      });
    }

    if (Date.now() > record.expiresAt) {
      this.otps.delete(normalizedPhone);
      throw new SmsError({
        message: "OTP expired. Request a new one.",
        code: "OTP_EXPIRED",
        phone: normalizedPhone,
      });
    }

    if (record.attempts >= this.config.maxAttempts) {
      this.otps.delete(normalizedPhone);
      throw new SmsError({
        message: "Too many wrong attempts. Request a new OTP.",
        code: "MAX_ATTEMPTS_EXCEEDED",
        phone: normalizedPhone,
      });
    }

    const submitted = Buffer.from(this.hashOtp(normalizedPhone, String(code).trim()));
    const stored = Buffer.from(record.otpHash);
    const valid = submitted.length === stored.length && crypto.timingSafeEqual(submitted, stored);

    if (!valid) {
      record.attempts++;
      const attemptsLeft = this.config.maxAttempts - record.attempts;
      throw new SmsError({
        message: `Invalid OTP. ${attemptsLeft} attempts remaining.`,
        code: "OTP_INVALID",
        phone: normalizedPhone,
        details: { attemptsLeft },
      });
    }

    // Success - consume the OTP (single use)
    this.otps.delete(normalizedPhone);
    return {
      success: true,
      phone: normalizedPhone,
      message: "Phone number verified successfully",
    };
  }
}

export const smsSender = new SmsSender();
