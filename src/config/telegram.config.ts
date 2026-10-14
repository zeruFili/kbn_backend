import path from "path";
import fs from "fs";

export interface TelegramConfig {
  apiId: number;
  apiHash: string;
  sessionFile: string;
}

const rawApiId = process.env.TELEGRAM_API_ID || process.env.API_ID;
const apiId = rawApiId ? parseInt(rawApiId, 10) : 0;
const apiHash = process.env.TELEGRAM_API_HASH || process.env.API_HASH || "";

// Session is stored in session.txt in the backend root
const SESSION_FILE = path.join(process.cwd(), "session.txt");

export const telegramConfig: TelegramConfig = {
  apiId: isNaN(apiId) ? 0 : apiId,
  apiHash,
  sessionFile: SESSION_FILE,
};

export function isTelegramConfigured(): boolean {
  return Boolean(telegramConfig.apiId && telegramConfig.apiHash);
}

/**
 * Loads session string from session.txt if it exists
 */
export function getStoredSession(): string {
  if (fs.existsSync(telegramConfig.sessionFile)) {
    try {
      return fs.readFileSync(telegramConfig.sessionFile, "utf8").trim();
    } catch (err: any) {
      console.warn(`[Telegram] Could not read session file at ${telegramConfig.sessionFile}:`, err.message);
    }
  }
  return "";
}

/**
 * Saves active session string to session.txt for subsequent runs
 */
export function saveStoredSession(sessionStr: string): void {
  try {
    fs.writeFileSync(telegramConfig.sessionFile, sessionStr, { mode: 0o600 });
  } catch (err: any) {
    console.warn(`[Telegram] Failed to save session to file ${telegramConfig.sessionFile}:`, err.message);
  }
}
