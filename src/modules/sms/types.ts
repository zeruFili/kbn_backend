export type SmsErrorCode =
  | "INVALID_PHONE_FORMAT"
  | "EMPTY_MESSAGE"
  | "SMS_NOT_CONFIGURED"
  | "SMS_API_ERROR"
  | "RATE_LIMITED"
  | "OTP_EXPIRED"
  | "OTP_INVALID"
  | "OTP_NOT_FOUND"
  | "MAX_ATTEMPTS_EXCEEDED"
  | "INTERNAL_ERROR";

export interface SmsSendResult {
  status: "sent";
  phone: string;
  data?: any;
}

export interface OtpSendResult {
  success: boolean;
  phone: string;
  message: string;
}

export interface OtpVerifyResult {
  success: boolean;
  phone: string;
  message: string;
  attemptsLeft?: number;
}

export class SmsError extends Error {
  public statusCode: number;
  public code: SmsErrorCode;
  public phone?: string;
  public details?: any;

  constructor(params: {
    message: string;
    code: SmsErrorCode;
    statusCode?: number;
    phone?: string;
    details?: any;
  }) {
    super(params.message);
    this.name = "SmsError";
    this.code = params.code;
    this.phone = params.phone;
    this.details = params.details;

    if (params.statusCode) {
      this.statusCode = params.statusCode;
    } else {
      switch (params.code) {
        case "INVALID_PHONE_FORMAT":
        case "EMPTY_MESSAGE":
          this.statusCode = 422;
          break;
        case "OTP_NOT_FOUND":
          this.statusCode = 404;
          break;
        case "RATE_LIMITED":
        case "MAX_ATTEMPTS_EXCEEDED":
          this.statusCode = 429;
          break;
        case "SMS_NOT_CONFIGURED":
          this.statusCode = 503;
          break;
        case "SMS_API_ERROR":
          this.statusCode = 502;
          break;
        case "OTP_INVALID":
        case "OTP_EXPIRED":
          this.statusCode = 400;
          break;
        default:
          this.statusCode = 500;
          break;
      }
    }
  }

  toResponse(): Record<string, unknown> {
    return {
      status: "error",
      code: this.code,
      phone: this.phone,
      error: this.message,
      details: this.details,
    };
  }
}
