import { Request, Response } from "express";
import { sendTelegramMessage, TelegramError, telegramSender } from "../modules/telegram";

export class TelegramController {
  async send(req: Request, res: Response): Promise<void> {
    try {
      const { phone, message } = req.body || {};
      const result = await sendTelegramMessage(phone, message);
      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof TelegramError) {
        res.status(err.statusCode).json(err.toResponse());
        return;
      }

      console.error("[TelegramController] Send error:", err);
      res.status(500).json({
        status: "error",
        code: "INTERNAL_ERROR",
        error: err.message || "Internal server error",
      });
    }
  }

  async status(_req: Request, res: Response): Promise<void> {
    try {
      const status = await telegramSender.getStatus();
      res.status(200).json({ success: true, data: status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const telegramController = new TelegramController();
