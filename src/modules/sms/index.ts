import { smsSender, SmsSender } from "./sms-sender";
import {
  SmsError,
  SmsErrorCode,
  SmsSendResult,
  OtpSendResult,
  OtpVerifyResult,
} from "./types";
import { smsConfig, isSmsConfigured, SmsModuleConfig } from "./config";

/**
 * Standalone SMS Message Sender:
 * Accepts a recipient phone number and message content, delivers it via the SMS provider.
 * Completely decoupled from other services, controllers, or database models.
 *
 * @param phone - Recipient phone number (e.g. "0911223344", "+251911223344", "0711223344")
 * @param message - The SMS text message to deliver
 * @returns SmsSendResult with delivery status, normalized phone, and raw gateway response
 */
export async function sendSms(
  phone: string,
  message: string
): Promise<SmsSendResult> {
  return smsSender.send(phone, message);
}

/**
 * Generates an OTP, applies cooldown and rate-limits, and sends it via SMS.
 *
 * @param phone - Recipient phone number
 * @param customMessage - Optional custom text or template function (supports `{otp}`)
 * @returns OtpSendResult
 */
export async function sendOtp(
  phone: string,
  customMessage?: string | ((otp: string) => string)
): Promise<OtpSendResult> {
  return smsSender.sendOtp(phone, customMessage);
}

/**
 * Verifies a submitted OTP for a phone number.
 *
 * @param phone - Recipient phone number
 * @param code - The OTP code to verify
 * @returns OtpVerifyResult
 */
export function verifyOtp(
  phone: string,
  code: string
): OtpVerifyResult {
  return smsSender.verifyOtp(phone, code);
}

/**
 * Normalizes Ethiopian phone numbers to international standard 2519... / 2517...
 *
 * @param phone - Raw phone input
 * @returns Normalized phone or null if invalid
 */
export function normalizePhone(phone: string): string | null {
  return smsSender.normalizePhone(phone);
}

export {
  smsSender,
  SmsSender,
  smsConfig,
  isSmsConfigured,
  SmsModuleConfig,
  SmsError,
  SmsErrorCode,
  SmsSendResult,
  OtpSendResult,
  OtpVerifyResult,
};

export default sendSms;
