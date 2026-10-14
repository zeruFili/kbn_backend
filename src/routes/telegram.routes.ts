import { Router } from "express";
import { telegramController } from "../controllers/telegram.controller";

const router = Router();

/**
 * POST /api/v1/telegram/send
 * Sends a Telegram message to a recipient phone number, chat ID, or username.
 */
router.post("/send", (req, res) => telegramController.send(req, res));

/**
 * GET /api/v1/telegram/status
 * Returns connection and authorization status.
 */
router.get("/status", (req, res) => telegramController.status(req, res));

export default router;
