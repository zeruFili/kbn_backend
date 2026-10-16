# EthioSMS (SMSHub.et) Module

A standalone, completely decoupled module for sending SMS messages and verifying OTPs using SMSHub (`https://smshub.et/api/sms`).

This module does **not** depend on any controllers, database models, or external routes. It mirrors the interface of `/modules/sms/`.

---

## Features

- **Decoupled API**: Pass recipient phone number and text message.
- **Ethiopian Phone Normalizer**: Supports formats like `0911223344`, `+251911223344`, `251911223344`, `0711223344`, formatting into international E.164 (`+251911223344`).
- **OTP Generation & Verification**:
  - Secure random 6-digit code generation.
  - Constant-time SHA-256 buffer verification (`crypto.timingSafeEqual`).
  - 60-second cooldown between requests.
  - 5-minute code expiration.
  - Max 5 attempts protection.
  - Single-use consumption on verification.
- **Template Placeholders**: Supports `{code}` and `{otp}` placeholders or custom callback functions.

---

## Configuration

Add your API credentials to `.env`:

```env
SMSHUB_API_KEY=your_smshub_api_key
SMSHUB_URL=https://smshub.et/api/sms
```

*(You can also use `ETHIOSMS_API_KEY` or `ETHIOSMS_API_URL`.)*

---

## Quick Usage Examples

### 1. Send an SMS Message (Receives Phone and Text)
```typescript
import { sendEthioSms } from "./modules/ethiosms";
// or: import { sendSms } from "./modules/ethiosms";

async function deliverMessage() {
  const result = await sendEthioSms("0911223344", "Hello, your order has arrived!");
  console.log("Status:", result.status); // "sent"
  console.log("Delivered to:", result.phone); // "+251911223344"
}
```

### 2. Send an OTP Verification Code
```typescript
import { sendOtp } from "./modules/ethiosms";

async function requestVerification() {
  // Default template:
  // "Your verification code is 123456. Use this code to sign in. It expires in 5 minutes."
  const result = await sendOtp("0911223344");
  console.log(result.message); // "OTP sent successfully"

  // Or with custom message template:
  await sendOtp("0911223344", "Your login code is {code}. Do not share it.");
}
```

### 3. Verify an OTP Code
```typescript
import { verifyOtp, checkOtp } from "./modules/ethiosms";

// Detailed verification:
try {
  const result = verifyOtp("0911223344", "123456");
  console.log("Verified:", result.success); // true
} catch (err: any) {
  console.error("Verification error:", err.message);
}

// Boolean check:
const isValid = checkOtp("0911223344", "123456");
console.log(isValid); // true / false
```
