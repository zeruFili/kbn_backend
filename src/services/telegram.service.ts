import { telegramSenderService } from "./telegram-sender.service";
import {
  TelegramSendOptions,
  TelegramSendResult,
  TelegramError,
} from "../types/telegram.types";
import { User } from "../entities/User";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export class TelegramService {
  /**
   * Primary Telegram calling function.
   * Accepts recipient (phone number, chat ID, or username) and message content,
   * passing them directly to the reusable message sender without duplicating logic.
   */
  async sendMessage(
    recipientOrOptions: string | TelegramSendOptions,
    messageContent?: string
  ): Promise<TelegramSendResult> {
    let options: TelegramSendOptions;

    if (typeof recipientOrOptions === "string") {
      if (!messageContent) {
        throw new TelegramError({
          code: "EMPTY_MESSAGE",
          message: "Message content is required",
          statusCode: 422,
        });
      }
      options = {
        to: recipientOrOptions,
        phone: recipientOrOptions.startsWith("+") || /^\d+$/.test(recipientOrOptions)
          ? recipientOrOptions
          : undefined,
        message: messageContent,
      };
    } else {
      options = recipientOrOptions;
    }

    return telegramSenderService.send(options);
  }

  /**
   * Sends a message to a specific user entity by resolving their phone number.
   */
  async sendToUser(
    user: Partial<User> & { phone?: string | null; full_name?: string },
    message: string
  ): Promise<TelegramSendResult> {
    if (!user.phone) {
      throw new TelegramError({
        code: "INVALID_PHONE_FORMAT",
        message: `User ${user.full_name || "Account"} does not have a registered phone number.`,
        statusCode: 422,
      });
    }

    return this.sendMessage({
      phone: user.phone,
      message,
    });
  }

  /**
   * Formats and delivers a password reset link via Telegram.
   */
  async sendPasswordResetNotification(
    user: Partial<User> & { phone?: string | null; full_name?: string },
    rawToken: string
  ): Promise<TelegramSendResult> {
    const resetUrl = `${FRONTEND_URL}/reset-password/${rawToken}`;
    const name = user.full_name || "Valued User";

    const message = [
      `🔐 *Password Reset Request*`,
      ``,
      `Hello ${name},`,
      `We received a request to reset your password for your Wase Workflow account.`,
      ``,
      `Click the link below to set a new password:`,
      `${resetUrl}`,
      ``,
      `⏱️ _This link will expire in 30 minutes._ If you did not request this, please ignore this message.`,
    ].join("\n");

    return this.sendToUser(user, message);
  }

  /**
   * Formats and delivers payment-related notices via Telegram.
   */
  async sendPaymentNotification(
    phone: string,
    details: {
      title: string;
      amount?: string | number;
      reference?: string;
      status?: string;
      note?: string;
    }
  ): Promise<TelegramSendResult> {
    const lines = [`💳 *${details.title}*`, ""];
    if (details.amount !== undefined) {
      lines.push(`💰 *Amount:* ${details.amount}`);
    }
    if (details.reference) {
      lines.push(`🔖 *Reference:* ${details.reference}`);
    }
    if (details.status) {
      lines.push(`📊 *Status:* ${details.status}`);
    }
    if (details.note) {
      lines.push(`ℹ️ *Note:* ${details.note}`);
    }
    lines.push("", "Thank you for using Wase Workflow.");

    return this.sendMessage({
      phone,
      message: lines.join("\n"),
    });
  }
}

export const telegramService = new TelegramService();

/**
 * Convenient standalone calling function:
 * Receives the recipient's phone number or chat ID and the message content,
 * delegating to the message sender without duplicating logic.
 */
export async function sendTelegramMessage(
  recipient: string,
  message: string
): Promise<TelegramSendResult> {
  return telegramService.sendMessage(recipient, message);
}

/**
 * Convenient standalone notification helper
 */
export async function sendTelegramNotification(
  recipientPhone: string,
  message: string
): Promise<TelegramSendResult> {
  return telegramService.sendMessage({
    phone: recipientPhone,
    message,
  });
}
