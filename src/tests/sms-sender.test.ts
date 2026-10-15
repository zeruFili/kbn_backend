import assert from "node:assert";
import {
  sendSms,
  sendOtp,
  verifyOtp,
  normalizePhone,
  smsSender,
  SmsSender,
  SmsError,
} from "../modules/sms";

async function runSmsTests() {
  console.log("Running Standalone SMS Module tests...\n");

  // -------------------------------------------------------------
  // Test 1: Ethiopian phone number normalization
  // -------------------------------------------------------------
  console.log("Test 1: Phone normalization...");
  assert.strictEqual(normalizePhone("0911223344"), "251911223344");
  assert.strictEqual(normalizePhone("0711223344"), "251711223344");
  assert.strictEqual(normalizePhone("+251911223344"), "251911223344");
  assert.strictEqual(normalizePhone("251911223344"), "251911223344");
  assert.strictEqual(normalizePhone("911223344"), "251911223344");
  assert.strictEqual(normalizePhone("711223344"), "251711223344");
  assert.strictEqual(normalizePhone("  09 11-22-33-44  "), "251911223344");
  assert.strictEqual(normalizePhone("0811223344"), null); // Invalid prefix (neither 7 nor 9)
  assert.strictEqual(normalizePhone("123"), null);
  assert.strictEqual(normalizePhone(null as any), null);
  assert.strictEqual(normalizePhone(undefined as any), null);
  console.log("✅ Phone normalization passed.");

  // -------------------------------------------------------------
  // Test 2: OTP generation and hashing
  // -------------------------------------------------------------
  console.log("\nTest 2: OTP generation & hashing...");
  const otp = smsSender.generateOtp();
  assert.strictEqual(typeof otp, "string");
  assert.strictEqual(otp.length, 6);
  assert.strictEqual(/^\d{6}$/.test(otp), true);

  const hash1 = smsSender.hashOtp("251911223344", otp);
  const hash2 = smsSender.hashOtp("251911223344", otp);
  const hash3 = smsSender.hashOtp("251911223344", "000000");
  assert.strictEqual(hash1, hash2, "Same inputs must produce matching hashes");
  assert.notStrictEqual(hash1, hash3, "Different OTP must produce different hash");
  console.log("✅ OTP generation & hashing passed.");

  // -------------------------------------------------------------
  // Test 3: SmsError handling and status codes
  // -------------------------------------------------------------
  console.log("\nTest 3: SmsError response formatting...");
  const err = new SmsError({
    message: "Invalid phone",
    code: "INVALID_PHONE_FORMAT",
    phone: "123",
  });
  assert.strictEqual(err.statusCode, 422);
  const response = err.toResponse();
  assert.strictEqual(response.status, "error");
  assert.strictEqual(response.code, "INVALID_PHONE_FORMAT");
  assert.strictEqual(response.phone, "123");
  console.log("✅ SmsError formatting passed.");

  // -------------------------------------------------------------
  // Test 4: Message validation
  // -------------------------------------------------------------
  console.log("\nTest 4: Input validation on send...");
  try {
    await sendSms("invalid_phone", "Hello");
    assert.fail("Should have thrown on invalid phone");
  } catch (e: any) {
    assert.strictEqual(e.code, "INVALID_PHONE_FORMAT");
  }

  try {
    await sendSms("0911223344", "   ");
    assert.fail("Should have thrown on empty message");
  } catch (e: any) {
    assert.strictEqual(e.code, "EMPTY_MESSAGE");
  }
  console.log("✅ Send validation passed.");

  console.log("\n🎉 All standalone SMS module tests passed successfully!");
}

runSmsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
