/**
 * Standalone Telegram Message Sender Service
 * Delegates directly to the isolated Telegram module.
 *
 * Can be called simply by passing a phone number and message content:
 * sendTelegramMessage(phone, message);
 */

export {
  sendTelegramMessage,
  telegramSender,
  TelegramSender,
  TelegramError,
  TelegramSendResult,
  TelegramErrorCode,
  TelegramClientStatus,
} from "../modules/telegram";

import { sendTelegramMessage } from "../modules/telegram";
export default sendTelegramMessage;
