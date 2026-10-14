import { telegramSender, TelegramSender } from "./telegram-sender";
import {
  TelegramError,
  TelegramSendResult,
  TelegramErrorCode,
  TelegramClientStatus,
} from "./types";

/**
 * Standalone Telegram Message Sender:
 * Sends a message via Telegram by passing recipient phone number (or chat ID) and message content.
 * Completely decoupled from other services, controllers, or database models.
 *
 * @param phone - Recipient phone number in E.164 format (e.g. "+1234567890") or chat ID
 * @param message - Text message content to send
 * @returns TelegramSendResult with delivery status and recipient ID
 */
export async function sendTelegramMessage(
  phone: string,
  message: string
): Promise<TelegramSendResult> {
  return telegramSender.send(phone, message);
}

export {
  telegramSender,
  TelegramSender,
  TelegramError,
  TelegramSendResult,
  TelegramErrorCode,
  TelegramClientStatus,
};

export default sendTelegramMessage;
