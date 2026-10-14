import readline from "readline";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import {
  telegramConfig,
  saveStoredSession,
  getStoredSession,
} from "../config/telegram.config";

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("=================================================");
  console.log(" Telegram MTProto Interactive Authentication");
  console.log("=================================================");

  const apiId = telegramConfig.apiId;
  const apiHash = telegramConfig.apiHash;

  if (!apiId || !apiHash) {
    console.error("❌ TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in your .env file.");
    process.exit(1);
  }

  const existingSession = getStoredSession();
  const client = new TelegramClient(
    new StringSession(existingSession),
    apiId,
    apiHash,
    {
      connectionRetries: 10,
      useWSS: true,
      useIPV6: false,
      timeout: 30,
      requestRetries: 5,
      autoReconnect: true,
    }
  );

  client.setLogLevel("info");

  console.log("🔐 Starting authentication session...");
  await client.start({
    phoneNumber: async () => await ask("Phone number (+country code): "),
    phoneCode: async () => await ask("Telegram login code: "),
    password: async () => await ask("2FA password (leave blank if none): "),
    onError: (err) => console.error("Login error:", err.message),
  });

  const sessionString = client.session.save() as unknown as string;
  saveStoredSession(sessionString);

  console.log("\n=================================================");
  console.log(`✅ Session saved to ${telegramConfig.sessionFile} — you won't need to log in again.`);
  console.log("=================================================");

  const me: any = await client.getMe();
  console.log(`Logged in as: ${me.firstName} (@${me.username || "no_username"}) id=${me.id}`);

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal login error:", err);
  process.exit(1);
});
