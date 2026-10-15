export interface SmsModuleConfig {
  apiUrl: string;
  apiKey: string;
  otpSecret: string;
  otpExpiryMs: number;
  resendCooldownMs: number;
  maxAttempts: number;
  maxSendsPerHour: number;
}

export const smsConfig: SmsModuleConfig = {
  apiUrl: process.env.SMS_API_URL || "https://smsethiopia.com/api/sms/send",
  apiKey: process.env.SMS_API_KEY || process.env.SMS_ETHIOPIA_API_KEY || "",
  otpSecret: process.env.OTP_SECRET || "change-this-long-random-secret",
  otpExpiryMs: 5 * 60 * 1000, // 5 minutes
  resendCooldownMs: 60 * 1000, // 60 seconds
  maxAttempts: 5,
  maxSendsPerHour: 5,
};

export function isSmsConfigured(): boolean {
  return Boolean(smsConfig.apiKey);
}
