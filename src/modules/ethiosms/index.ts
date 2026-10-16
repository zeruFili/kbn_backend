import { ethioSmsSender, EthioSmsSender } from "./ethiosms-sender";
import {
  EthioSmsError,
  EthioSmsErrorCode,
  EthioSmsSendResult,
  EthioOtpSendResult,
  EthioOtpVerifyResult,
} from "./types";
import { ethioSmsConfig, isEthioSmsConfigured, EthioSmsModuleConfig } from "./config";

/**
 * Standalone EthioSMS / SMSHub Message Sender:
 * Accepts recipient phone number and text message, delivers it via SMSHub (https://smshub.et/api/sms).
 * Completely decoupled from other services, controllers, or database models.
 *
 * @param phone - Recipient phone number (e.g. "0911223344", "+251911223344", "0711223344")
 * @param message - The SMS text message to deliver
 * @returns EthioSmsSendResult with delivery status, normalized phone, and raw gateway response
 */
export async function sendEthioSms(
  phone: string,
  message: string
): Promise<EthioSmsSendResult> {
  return ethioSmsSender.send(phone, message);
}

// Convenient alias matching the `/modules/sms/` function name
export const sendSms = sendEthioSms;

/**
 * Generates an OTP, applies cooldown and rate-limits, and sends it via SMSHub.
 *
 * @param phone - Recipient phone number
 * @param customMessage - Optional custom template or formatting function (supports `{code}` or `{otp}`)
 * @returns EthioOtpSendResult
 */
export async function sendOtp(
  phone: string,
  customMessage?: string | ((code: string) => string)
): Promise<EthioOtpSendResult> {
  return ethioSmsSender.sendOtp(phone, customMessage);
}

// Alias matching original snippet name
export const startOtp = sendOtp;

/**
 * Verifies a submitted OTP for a phone number.
 *
 * @param phone - Recipient phone number
 * @param code - The OTP code to verify
 * @returns EthioOtpVerifyResult
 */
export function verifyOtp(
  phone: string,
  code: string
): EthioOtpVerifyResult {
  return ethioSmsSender.verifyOtp(phone, code);
}

/**
 * Boolean verification helper (returns true if valid, false if invalid/expired).
 *
 * @param phone - Recipient phone number
 * @param code - The OTP code to verify
 * @returns boolean
 */
export function checkOtp(
  phone: string,
  code: string
): boolean {
  return ethioSmsSender.checkOtp(phone, code);
}

/**
 * Normalizes Ethiopian phone numbers to international standard +2519... / +2517...
 *
 * @param phone - Raw phone input
 * @returns Normalized phone or null if invalid
 */
export function normalizePhone(phone: string): string | null {
  return ethioSmsSender.normalizePhone(phone);
}

export {
  ethioSmsSender,
  EthioSmsSender,
  ethioSmsConfig,
  isEthioSmsConfigured,
  EthioSmsModuleConfig,
  EthioSmsError,
  EthioSmsErrorCode,
  EthioSmsSendResult,
  EthioOtpSendResult,
  EthioOtpVerifyResult,
};

export default sendEthioSms;
