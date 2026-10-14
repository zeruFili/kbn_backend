export type TelegramErrorCode =
  | "INVALID_PHONE_FORMAT"
  | "INVALID_CHAT_ID"
  | "EMPTY_MESSAGE"
  | "PHONE_NOT_REGISTERED"
  | "RATE_LIMITED"
  | "PEER_FLOOD"
  | "USER_PRIVACY_RESTRICTED"
  | "USER_IS_BLOCKED"
  | "TELEGRAM_NOT_CONFIGURED"
  | "TELEGRAM_API_ERROR"
  | "INTERNAL_ERROR";

export interface TelegramSendResult {
  status: "sent";
  registered: boolean;
  to: string;
  recipient_id: string;
  was_temp_contact: boolean;
}

export interface TelegramClientStatus {
  configured: boolean;
  connected: boolean;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
  } | null;
  error?: string;
}

export class TelegramError extends Error {
  public statusCode: number;
  public code: TelegramErrorCode;
  public phone?: string;
  public retryAfterSeconds?: number;
  public registered?: boolean;

  constructor(params: {
    message: string;
    code: TelegramErrorCode;
    statusCode?: number;
    phone?: string;
    retryAfterSeconds?: number;
    registered?: boolean;
  }) {
    super(params.message);
    this.name = "TelegramError";
    this.code = params.code;
    this.phone = params.phone;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.registered = params.registered;

    if (params.statusCode) {
      this.statusCode = params.statusCode;
    } else {
      switch (params.code) {
        case "INVALID_PHONE_FORMAT":
        case "EMPTY_MESSAGE":
          this.statusCode = 422;
          break;
        case "PHONE_NOT_REGISTERED":
        case "INVALID_CHAT_ID":
          this.statusCode = 404;
          break;
        case "RATE_LIMITED":
        case "PEER_FLOOD":
          this.statusCode = 429;
          break;
        case "USER_PRIVACY_RESTRICTED":
        case "USER_IS_BLOCKED":
          this.statusCode = 403;
          break;
        case "TELEGRAM_NOT_CONFIGURED":
          this.statusCode = 503;
          break;
        default:
          this.statusCode = 500;
          break;
      }
    }
  }

  toResponse(): Record<string, unknown> {
    if (this.code === "PHONE_NOT_REGISTERED") {
      return {
        status: "not_found",
        code: this.code,
        registered: false,
        phone: this.phone,
        error: this.message,
      };
    }

    if (this.code === "RATE_LIMITED") {
      return {
        status: "error",
        code: this.code,
        retry_after_seconds: this.retryAfterSeconds,
        error: this.message,
      };
    }

    return {
      status: "error",
      code: this.code,
      registered: this.registered,
      error: this.message,
    };
  }
}
