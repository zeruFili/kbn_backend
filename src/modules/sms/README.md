# SMS Delivery & OTP Module

A standalone, completely decoupled module for sending SMS messages and verifying OTPs via SMS Ethiopia (`smsethiopia.com`).

This module does **not** depend on any Express routes, controllers, or database models. You can import and use it anywhere.

---

## Features

- **Decoupled API**: Just pass recipient phone number and message string.
- **Ethiopian Phone Normalizer**: Supports formats like `0911223344`, `+251911223344`, `0711223344`, `911223344`, etc., converting to `251911223344`.
- **OTP Generation & Verification**:
  - Secure random 6-digit code generation.
  - Constant-time HMAC-SHA256 verification (prevents timing attacks).
  - 60-second cooldown between requests.
  - 5-minute code expiration.
  - Max 5 attempts protection.
  - Single-use consumption on verification.
- **Customizable**: Optionally override config parameters or provide custom SMS templates.

---

## Configuration

Set the following environment variables in your `.env` file (or pass them when instantiating `SmsSender`):

```env
SMS_API_URL=https://smsethiopia.com/api/sms/send
SMS_API_KEY=your_smsethiopia_api_key
OTP_SECRET=your_secure_random_otp_secret_key
```

---

## Quick Usage Examples

### 1. Send an SMS Message
```typescript
import { sendSms } from "./modules/sms";

async function deliverMessage() {
  const result = await sendSms("0911223344", "Hello, your order has arrived!");
  console.log("Delivered to:", result.phone);
}
```

### 2. Send an OTP Verification Code
```typescript
import { sendOtp } from "./modules/sms";

async function requestVerification() {
  // Uses default OTP text: "Your verification code is 123456. It expires in 5 minutes. Do not share it."
  const result = await sendOtp("0911223344");
  console.log(result.message); // "OTP sent successfully"

  // Or with custom message template:
  await sendOtp("0911223344", "Welcome to Wase! Your code is {otp}");
}
```

### 3. Verify an OTP Code
```typescript
import { verifyOtp } from "./modules/sms";

function confirmOtp(phone: string, enteredCode: string) {
  try {
    const result = verifyOtp(phone, enteredCode);
    console.log("Verified:", result.success); // true
  } catch (err: any) {
    console.error("Verification error:", err.message);
  }
}
```

### 4. Create an Isolated Sender Instance
```typescript
import { SmsSender } from "./modules/sms";

const customSender = new SmsSender({
  apiKey: "different_api_key",
  otpExpiryMs: 10 * 60 * 1000, // 10 minutes
});

await customSender.send("0911223344", "Custom sender message");
```
