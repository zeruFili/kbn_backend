import assert from "node:assert";
import {
  sendEthioSms,
  sendSms,
  sendOtp,
  verifyOtp,
  checkOtp,
  normalizePhone,
  ethioSmsSender,
  EthioSmsError,
} from "../modules/ethiosms";

async function runEthioSmsTests() {
  console.log("Running Standalone EthioSMS Module tests...\n");

  // -------------------------------------------------------------
  // Test 1: Ethiopian phone number normalization
  // -------------------------------------------------------------
  console.log("Test 1: Phone normalization...");
  assert.strictEqual(normalizePhone("0911223344"), "+251911223344");
  assert.strictEqual(normalizePhone("0711223344"), "+251711223344");
  assert.strictEqual(normalizePhone("+251911223344"), "+251911223344");
  assert.strictEqual(normalizePhone("251911223344"), "+251911223344");
  assert.strictEqual(normalizePhone("911223344"), "+251911223344");
  assert.strictEqual(normalizePhone("711223344"), "+251711223344");
  assert.strictEqual(normalizePhone("  +251 (911) 22-33-44  "), "+251911223344");
  assert.strictEqual(normalizePhone("0811223344"), null); // Invalid mobile prefix
  assert.strictEqual(normalizePhone("123"), null);
  assert.strictEqual(normalizePhone(null as any), null);
  assert.strictEqual(normalizePhone(undefined as any), null);
  console.log("✅ Phone normalization passed.");

  // -------------------------------------------------------------
  // Test 2: OTP generation and hashing
  // -------------------------------------------------------------
  console.log("\nTest 2: OTP generation & SHA-256 buffer hashing...");
  const otp = ethioSmsSender.generateOtp();
  assert.strictEqual(typeof otp, "string");
  assert.strictEqual(otp.length, 6);
  assert.strictEqual(/^\d{6}$/.test(otp), true);

  const hash1 = ethioSmsSender.hash(otp);
  const hash2 = ethioSmsSender.hash(otp);
  const hash3 = ethioSmsSender.hash("000000");
  assert.strictEqual(hash1.equals(hash2), true, "Same inputs must produce matching hashes");
  assert.strictEqual(hash1.equals(hash3), false, "Different code must produce different hash");
  console.log("✅ OTP generation & hashing passed.");

  // -------------------------------------------------------------
  // Test 3: EthioSmsError handling and status codes
  // -------------------------------------------------------------
  console.log("\nTest 3: EthioSmsError response formatting...");
  const err = new EthioSmsError({
    message: "Invalid phone",
    code: "INVALID_PHONE_FORMAT",
    phone: "123",
  });
  assert.strictEqual(err.statusCode, 422);
  const response = err.toResponse();
  assert.strictEqual(response.status, "error");
  assert.strictEqual(response.code, "INVALID_PHONE_FORMAT");
  assert.strictEqual(response.phone, "123");
  console.log("✅ EthioSmsError formatting passed.");

  // -------------------------------------------------------------
  // Test 4: Message validation on send
  // -------------------------------------------------------------
  console.log("\nTest 4: Input validation on send...");
  try {
    await sendEthioSms("invalid_phone", "Hello");
    assert.fail("Should have thrown on invalid phone");
  } catch (e: any) {
    assert.strictEqual(e.code, "INVALID_PHONE_FORMAT");
  }

  try {
    await sendEthioSms("0911223344", "   ");
    assert.fail("Should have thrown on empty message");
  } catch (e: any) {
    assert.strictEqual(e.code, "EMPTY_MESSAGE");
  }

  // Alias verification
  assert.strictEqual(typeof sendSms, "function");
  console.log("✅ Send validation passed.");

  console.log("\n🎉 All standalone EthioSMS module tests passed successfully!");
}

runEthioSmsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
