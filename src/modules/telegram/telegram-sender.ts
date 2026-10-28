import { TelegramClient, Api, helpers } from "telegram";
import { StringSession } from "telegram/sessions";
import { LogLevel } from "telegram/extensions/Logger";
import {
  telegramConfig,
  isTelegramConfigured,
  getStoredSession,
} from "./config";
import {
  TelegramError,
  TelegramSendResult,
  TelegramClientStatus,
} from "./types";

export class TelegramSender {
  private client: TelegramClient | null = null;
  private connectingPromise: Promise<TelegramClient> | null = null;

  /**
   * Normalizes an input phone number into E.164-compatible format:
   * Strips spaces, hyphens, and parentheses, and guarantees a leading '+'.
   * Returns null if the format is invalid.
   */
  public normalizePhone(raw?: string | null): string | null {
    if (typeof raw !== "string") return null;
    let p = raw.trim().replace(/[\s\-()]/g, "");
    if (!p.startsWith("+")) p = "+" + p;
    if (!/^\+\d{6,15}$/.test(p)) return null;
    return p;
  }

  /**
   * Initializes or reuses the singleton TelegramClient.
   * Uses port 443 WSS to bypass firewall / ISP port 80 restrictions.
   */
  public async getClient(): Promise<TelegramClient> {
    if (this.client && this.client.connected) {
      return this.client;
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = (async () => {
      if (!isTelegramConfigured()) {
        throw new TelegramError({
          code: "TELEGRAM_NOT_CONFIGURED",
          message:
            "Telegram is not configured. Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in your .env file.",
          statusCode: 503,
        });
      }

      const sessionStr = getStoredSession();
      const stringSession = new StringSession(sessionStr);

      const client = new TelegramClient(
        stringSession,
        telegramConfig.apiId,
        telegramConfig.apiHash,
        {
          connectionRetries: 10,
          useWSS: true,
          useIPV6: false,
          timeout: 30,
          requestRetries: 5,
          autoReconnect: true,
        }
      );

      client.setLogLevel(LogLevel.WARN);

      if (sessionStr) {
        await client.connect();
      } else {
        throw new TelegramError({
          code: "TELEGRAM_NOT_CONFIGURED",
          message:
            "No Telegram session found in session.txt. Please run 'npm run telegram:login' to authenticate once.",
          statusCode: 503,
        });
      }

      this.client = client;
      return client;
    })().finally(() => {
      this.connectingPromise = null;
    });

    return this.connectingPromise;
  }

  /**
   * Resolves a phone number to a Telegram entity.
   * 1. Attempts direct getEntity lookup.
   * 2. Imports the number as a temporary contact; Telegram only returns a user if registered.
   */
  private async resolvePhone(
    client: TelegramClient,
    phone: string
  ): Promise<{ entity: any; imported: boolean } | null> {
    // 1) Direct lookup
    const found = await client.getEntity(phone).catch(() => null);
    if (found) return { entity: found, imported: false };

    // 2) Temporary contact import
    try {
      const result: any = await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: helpers.generateRandomLong(),
              phone,
              firstName: "Temp",
              lastName: "Contact",
            }),
          ],
        })
      );

      if (!result.users || result.users.length === 0) {
        return null;
      }

      return { entity: result.users[0], imported: true };
    } catch (err: any) {
      const msg = err?.errorMessage || err?.message || "";
      if (msg === "PHONE_NOT_OCCUPIED" || msg === "PHONE_NUMBER_INVALID") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Deletes a temporarily imported contact to maintain privacy and a clean contact list.
   */
  private async cleanupContact(client: TelegramClient, entity: any): Promise<void> {
    try {
      await client.invoke(new Api.contacts.DeleteContacts({ id: [entity] }));
    } catch (err: any) {
      console.warn("[TelegramSender] Contact cleanup warning:", err.message);
    }
  }

  /**
   * Standalone send function: accepts a phone number (or chat ID) and a message.
   */
  public async send(recipientPhone: string, message: string): Promise<TelegramSendResult> {
    if (!message || typeof message !== "string" || !message.trim()) {
      throw new TelegramError({
        code: "EMPTY_MESSAGE",
        message: "Message content cannot be empty",
        statusCode: 422,
      });
    }

    if (!recipientPhone || typeof recipientPhone !== "string" || !recipientPhone.trim()) {
      throw new TelegramError({
        code: "INVALID_PHONE_FORMAT",
        message: "Recipient phone number is required",
        statusCode: 422,
      });
    }

    const trimmedTarget = recipientPhone.trim();
    const trimmedMessage = message.trim();
    const client = await this.getClient();

    let entity: any = null;
    let imported = false;
    let identifier = "";

    // Check if recipient is a phone number vs numeric chat ID / username
    const isPhone =
      trimmedTarget.startsWith("+") ||
      (/^\d{7,15}$/.test(trimmedTarget) && !trimmedTarget.startsWith("-"));

    try {
      if (isPhone) {
        const normalized = this.normalizePhone(trimmedTarget);
        if (!normalized) {
          throw new TelegramError({
            code: "INVALID_PHONE_FORMAT",
            phone: trimmedTarget,
            message: "Invalid phone number format. Must be E.164 (e.g. +1234567890)",
            statusCode: 422,
          });
        }

        identifier = normalized;
        const resolved = await this.resolvePhone(client, normalized);

        if (!resolved) {
          throw new TelegramError({
            code: "PHONE_NOT_REGISTERED",
            phone: normalized,
            registered: false,
            message: `The phone number ${normalized} does not exist on Telegram`,
            statusCode: 404,
          });
        }

        entity = resolved.entity;
        imported = resolved.imported;
      } else {
        // Chat ID or username (@handle)
        identifier = trimmedTarget;
        try {
          entity = await client.getEntity(trimmedTarget);
          if (!entity) throw new Error("Entity not found");
        } catch {
          throw new TelegramError({
            code: "INVALID_CHAT_ID",
            message: `Invalid Telegram chat ID or username: ${trimmedTarget}`,
            statusCode: 404,
          });
        }
      }

      await client.sendMessage(entity, { message: trimmedMessage });

      const recipientId = String(entity.id || entity.userId || identifier);

      return {
        status: "sent",
        registered: true,
        to: identifier,
        recipient_id: recipientId,
        was_temp_contact: imported,
      };
    } catch (err: any) {
      if (err instanceof TelegramError) {
        throw err;
      }

      const msg: string = err?.errorMessage || err?.message || "";

      if (msg === "PHONE_NOT_OCCUPIED" || msg === "PHONE_NUMBER_INVALID") {
        throw new TelegramError({
          code: "PHONE_NOT_REGISTERED",
          phone: identifier,
          registered: false,
          message: `The phone number ${identifier} does not exist on Telegram`,
          statusCode: 404,
        });
      }

      if (msg.startsWith("FLOOD_WAIT")) {
        const secs = parseInt(msg.split("_").pop() || "60", 10);
        throw new TelegramError({
          code: "RATE_LIMITED",
          retryAfterSeconds: secs,
          message: `Rate limited by Telegram. Retry in ${secs}s`,
          statusCode: 429,
        });
      }

      if (msg === "PEER_FLOOD") {
        throw new TelegramError({
          code: "PEER_FLOOD",
          message: "Telegram has temporarily limited this account from messaging new people",
          statusCode: 429,
        });
      }

      if (msg === "USER_PRIVACY_RESTRICTED" || msg === "USER_IS_BLOCKED") {
        throw new TelegramError({
          code: msg as any,
          registered: true,
          message: "This user does not accept messages from this account",
          statusCode: 403,
        });
      }

      console.error("[TelegramSender] Delivery failure:", err);
      throw new TelegramError({
        code: "TELEGRAM_API_ERROR",
        message: err.message || "Telegram API delivery failure",
        statusCode: 500,
      });
    } finally {
      if (imported && entity) {
        await this.cleanupContact(client, entity);
      }
    }
  }

  /**
   * Retrieves connection and authorization status.
   */
  public async getStatus(): Promise<TelegramClientStatus> {
    if (!isTelegramConfigured()) {
      return {
        configured: false,
        connected: false,
        error: "TELEGRAM_API_ID and TELEGRAM_API_HASH not configured in .env file.",
      };
    }

    try {
      const client = await this.getClient();
      const me: any = await client.getMe();

      return {
        configured: true,
        connected: Boolean(client.connected),
        user: me
          ? {
              id: String(me.id),
              firstName: me.firstName,
              lastName: me.lastName,
              username: me.username,
              phone: me.phone,
            }
          : null,
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        error: err.message || "Failed to connect to Telegram client",
      };
    }
  }

  /**
   * Safely disconnects the client on shutdown.
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch (err: any) {
        console.warn("[TelegramSender] Disconnect error:", err.message);
      } finally {
        this.client = null;
      }
    }
  }
}

export const telegramSender = new TelegramSender();

process.on("SIGINT", async () => {
  await telegramSender.disconnect();
});

process.on("SIGTERM", async () => {
  await telegramSender.disconnect();
});
