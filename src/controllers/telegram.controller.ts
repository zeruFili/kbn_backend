import { Request, Response } from "express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SendTelegramDto } from "../validators/telegram.dto";
import { telegramService } from "../services/telegram.service";
import { telegramSenderService } from "../services/telegram-sender.service";
import { TelegramError } from "../types/telegram.types";

export class TelegramController {
  /**
   * POST /api/v1/telegram/send
   * Delivers a Telegram message to a recipient phone number, chat ID, or username.
   */
  async send(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(SendTelegramDto, req.body);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const messages = errors
          .map((e) => Object.values(e.constraints ?? {}))
          .flat();

        res.status(422).json({
          status: "error",
          code: "VALIDATION_FAILED",
          error: messages.join("; "),
          details: messages,
        });
        return;
      }

      const result = await telegramService.sendMessage({
        phone: dto.phone,
        chatId: dto.chatId,
        to: dto.to,
        message: dto.message,
      });

      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof TelegramError) {
        res.status(err.statusCode).json(err.toResponse());
        return;
      }

      console.error("[TelegramController] Unexpected send error:", err);
      res.status(500).json({
        status: "error",
        code: "INTERNAL_ERROR",
        error: err.message || "Internal server error occurred while sending Telegram message",
      });
    }
  }

  /**
   * GET /api/v1/telegram/status
   * Checks Telegram configuration and active connection state.
   */
  async status(_req: Request, res: Response): Promise<void> {
    try {
      const status = await telegramSenderService.getStatus();
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (err: any) {
      console.error("[TelegramController] Status check error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Failed to retrieve Telegram status",
      });
    }
  }
}

export const telegramController = new TelegramController();
