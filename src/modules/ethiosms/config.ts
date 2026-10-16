export interface EthioSmsModuleConfig {
  apiUrl: string;
  apiKey: string;
  otpExpiryMs: number;
  resendCooldownMs: number;
  maxAttempts: number;
  maxSendsPerHour: number;
}

export const ethioSmsConfig: EthioSmsModuleConfig = {
  apiUrl:
    process.env.ETHIOSMS_API_URL ||
    process.env.SMSHUB_URL ||
    "https://smshub.et/api/sms",
  apiKey:
    process.env.ETHIOSMS_API_KEY ||
    process.env.SMSHUB_API_KEY ||
    process.env.SMS_API_KEY ||
    "",
  otpExpiryMs: 5 * 60 * 1000, // 5 minutes
  resendCooldownMs: 60 * 1000, // 60 seconds
  maxAttempts: 5,
  maxSendsPerHour: 5,
};

export function isEthioSmsConfigured(): boolean {
  return Boolean(ethioSmsConfig.apiKey);
}
