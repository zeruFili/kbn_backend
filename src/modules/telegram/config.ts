import path from "path";
import fs from "fs";

export interface TelegramModuleConfig {
  apiId: number;
  apiHash: string;
  sessionFile: string;
}

const rawApiId = process.env.TELEGRAM_API_ID || process.env.API_ID;
const apiId = rawApiId ? parseInt(rawApiId, 10) : 0;
const apiHash = process.env.TELEGRAM_API_HASH || process.env.API_HASH || "";

// Session is automatically saved to and reused from session.txt in the backend root
const SESSION_FILE = path.join(process.cwd(), "session.txt");

export const telegramConfig: TelegramModuleConfig = {
  apiId: isNaN(apiId) ? 0 : apiId,
  apiHash,
  sessionFile: SESSION_FILE,
};

export function isTelegramConfigured(): boolean {
  return Boolean(telegramConfig.apiId && telegramConfig.apiHash);
}

export function getStoredSession(): string {
  if (fs.existsSync(telegramConfig.sessionFile)) {
    try {
      return fs.readFileSync(telegramConfig.sessionFile, "utf8").trim();
    } catch (err: any) {
      console.warn(`[TelegramModule] Could not read session file at ${telegramConfig.sessionFile}:`, err.message);
    }
  }
  return "";
}

export function saveStoredSession(sessionStr: string): void {
  try {
    fs.writeFileSync(telegramConfig.sessionFile, sessionStr, { mode: 0o600 });
  } catch (err: any) {
    console.warn(`[TelegramModule] Failed to save session to file ${telegramConfig.sessionFile}:`, err.message);
  }
}
