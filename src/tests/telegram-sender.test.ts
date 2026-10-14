import assert from "node:assert";
import {
  sendTelegramMessage,
  telegramSender,
  TelegramError,
} from "../modules/telegram";

async function runTelegramTests() {
  console.log("Running Standalone Telegram Module tests...\n");

  // -------------------------------------------------------------
  // Test 1: Phone number normalization
  // -------------------------------------------------------------
  console.log("Test 1: Phone normalization...");
  assert.strictEqual(
    telegramSender.normalizePhone("+1234567890"),
    "+1234567890"
  );
  assert.strictEqual(
    telegramSender.normalizePhone("1234567890"),
    "+1234567890"
  );
  assert.strictEqual(
    telegramSender.normalizePhone("+1 (555) 234-5678"),
    "+15552345678"
  );
  assert.strictEqual(
    telegramSender.normalizePhone("  +251-91-123-4567  "),
    "+251911234567"
  );
  assert.strictEqual(telegramSender.normalizePhone("not-a-phone"), null);
  assert.strictEqual(telegramSender.normalizePhone("123"), null);
  assert.strictEqual(telegramSender.normalizePhone(null as any), null);
  assert.strictEqual(telegramSender.normalizePhone(undefined as any), null);
  console.log("✅ Phone normalization passed.");

  // -------------------------------------------------------------
  // Test 2: TelegramError serialization and status codes
  // -------------------------------------------------------------
  console.log("Test 2: TelegramError serialization...");
  const notRegisteredErr = new TelegramError({
    code: "PHONE_NOT_REGISTERED",
    phone: "+1234567890",
    message: "The phone number +1234567890 does not exist on Telegram",
  });
  assert.strictEqual(notRegisteredErr.statusCode, 404);
  const notRegisteredResp = notRegisteredErr.toResponse();
  assert.deepStrictEqual(notRegisteredResp, {
    status: "not_found",
    code: "PHONE_NOT_REGISTERED",
    registered: false,
    phone: "+1234567890",
    error: "The phone number +1234567890 does not exist on Telegram",
  });

  const rateLimitErr = new TelegramError({
    code: "RATE_LIMITED",
    retryAfterSeconds: 45,
    message: "Rate limited by Telegram. Retry in 45s",
  });
  assert.strictEqual(rateLimitErr.statusCode, 429);
  const rateLimitResp = rateLimitErr.toResponse();
  assert.deepStrictEqual(rateLimitResp, {
    status: "error",
    code: "RATE_LIMITED",
    retry_after_seconds: 45,
    error: "Rate limited by Telegram. Retry in 45s",
  });

  const emptyMsgErr = new TelegramError({
    code: "EMPTY_MESSAGE",
    message: "Message content cannot be empty",
  });
  assert.strictEqual(emptyMsgErr.statusCode, 422);

  const invalidChatErr = new TelegramError({
    code: "INVALID_CHAT_ID",
    message: "Invalid Telegram chat ID or username: @nonexistent",
  });
  assert.strictEqual(invalidChatErr.statusCode, 404);
  console.log("✅ TelegramError serialization passed.");

  // -------------------------------------------------------------
  // Test 3: Standalone calling function input validation
  // -------------------------------------------------------------
  console.log("Test 3: Input validation...");
  try {
    await sendTelegramMessage("+1234567890", "   ");
    assert.fail("Should have rejected empty message");
  } catch (err: any) {
    assert.strictEqual(err.code, "EMPTY_MESSAGE");
    assert.strictEqual(err.statusCode, 422);
  }

  try {
    await sendTelegramMessage("", "Hello");
    assert.fail("Should have rejected empty phone");
  } catch (err: any) {
    assert.strictEqual(err.code, "INVALID_PHONE_FORMAT");
    assert.strictEqual(err.statusCode, 422);
  }
  console.log("✅ Input validation passed.");

  // -------------------------------------------------------------
  // Test 4: Mocked end-to-end sender flow with temp contact & cleanup
  // -------------------------------------------------------------
  console.log("Test 4: Mocked sender delivery & contact cleanup...");
  let contactsCleanedUp = false;
  let sentMessagePayload: any = null;

  const mockClient: any = {
    connected: true,
    async getEntity(_target: any) {
      // Direct lookup fails
      throw new Error("Could not find entity");
    },
    async invoke(action: any) {
      // If ImportContacts
      if (action?.contacts) {
        return {
          users: [
            {
              id: 987654321n,
              firstName: "Test",
              username: "testuser",
            },
          ],
        };
      }
      // If DeleteContacts
      if (action?.id) {
        contactsCleanedUp = true;
        return true;
      }
      return null;
    },
    async sendMessage(entity: any, payload: any) {
      sentMessagePayload = { entity, payload };
      return { id: 1001 };
    },
  };

  // Mock getClient on service
  const origGetClient = telegramSender.getClient;
  (telegramSender as any).getClient = async () => mockClient;

  try {
    const result = await sendTelegramMessage("+15551234567", "Hello from test!");

    assert.strictEqual(result.status, "sent");
    assert.strictEqual(result.registered, true);
    assert.strictEqual(result.to, "+15551234567");
    assert.strictEqual(result.recipient_id, "987654321");
    assert.strictEqual(result.was_temp_contact, true);
    assert.strictEqual(sentMessagePayload?.payload?.message, "Hello from test!");
    assert.strictEqual(contactsCleanedUp, true, "Temporary contact must be deleted");
    console.log("✅ Mocked sender flow with cleanup passed.");

    // -------------------------------------------------------------
    // Test 5: Unregistered phone detection
    // -------------------------------------------------------------
    console.log("Test 5: Unregistered phone detection...");
    const mockUnregisteredClient: any = {
      connected: true,
      async getEntity() {
        throw new Error("Not found");
      },
      async invoke(action: any) {
        if (action?.contacts) {
          return { users: [] }; // No users returned by Telegram
        }
        return null;
      },
    };
    (telegramSender as any).getClient = async () => mockUnregisteredClient;

    try {
      await sendTelegramMessage("+15550000000", "Hello");
      assert.fail("Should have thrown PHONE_NOT_REGISTERED");
    } catch (err: any) {
      assert.strictEqual(err.code, "PHONE_NOT_REGISTERED");
      assert.strictEqual(err.statusCode, 404);
      assert.strictEqual(err.phone, "+15550000000");
    }
    console.log("✅ Unregistered phone detection passed.");

    // -------------------------------------------------------------
    // Test 6: Rate limit error handling
    // -------------------------------------------------------------
    console.log("Test 6: Rate limit FLOOD_WAIT error translation...");
    const mockRateLimitedClient: any = {
      connected: true,
      async getEntity() {
        return { id: 12345 };
      },
      async sendMessage() {
        const floodErr: any = new Error("A wait of 30 seconds is required");
        floodErr.errorMessage = "FLOOD_WAIT_30";
        throw floodErr;
      },
    };
    (telegramSender as any).getClient = async () => mockRateLimitedClient;

    try {
      await sendTelegramMessage("+15551112222", "Spam check");
      assert.fail("Should have thrown RATE_LIMITED");
    } catch (err: any) {
      assert.strictEqual(err.code, "RATE_LIMITED");
      assert.strictEqual(err.statusCode, 429);
      assert.strictEqual(err.retryAfterSeconds, 30);
    }
    console.log("✅ Rate limit handling passed.");
  } finally {
    (telegramSender as any).getClient = origGetClient;
  }

  console.log("\n==========================================");
  console.log("🎉 ALL STANDALONE TELEGRAM TESTS PASSED!");
  console.log("==========================================\n");
}

runTelegramTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
