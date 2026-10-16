import assert from "node:assert";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { OtpVerification } from "../entities/otp-verification";
import { User } from "../entities/User";
import { PasswordResetToken } from "../entities/PasswordResetToken";
import { OtpPurpose } from "../enums/otp-purpose.enum";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { otpService } from "../services/otp.service";
import { authService } from "../services/auth.service";
import { emailService } from "../services/email.service";
import { userController } from "../controllers/user.controller";
import * as smsModule from "../modules/sms";
import * as ethioSmsModule from "../modules/ethiosms";

export async function runOtpVerificationTests() {
  console.log("=================================================");
  console.log("Starting OTP Verifications Feature Tests...");
  console.log("=================================================\n");

  const otpsDb: OtpVerification[] = [];
  const usersDb: User[] = [];
  const sentSmsMessages: { phone: string; message: string }[] = [];
  const sentEmailOtps: { to: string; otp: string; purpose: string }[] = [];

  // Mock sendSms and sendEthioSms to capture SMS dispatches
  const originalSendSms = smsModule.sendSms;
  const originalSendEthioSms = ethioSmsModule.sendEthioSms;

  const mockSmsSender = async (phone: string, message: string) => {
    sentSmsMessages.push({ phone, message });
    return {
      status: "sent" as const,
      phone,
      data: { success: true },
    };
  };

  (smsModule as any).sendSms = mockSmsSender;
  (ethioSmsModule as any).sendEthioSms = mockSmsSender;
  (ethioSmsModule as any).sendSms = mockSmsSender;
  (ethioSmsModule.ethioSmsSender as any).send = mockSmsSender;

  // Mock emailService.sendOtpEmail to capture email OTP dispatches
  const originalSendOtpEmail = emailService.sendOtpEmail;
  (emailService as any).sendOtpEmail = async (to: string, userName: string, otp: string, purpose: string) => {
    sentEmailOtps.push({ to, otp, purpose });
  };

  // Mock repository for OtpVerification
  const mockOtpRepo: any = {
    create: (data: Partial<OtpVerification>) => {
      const otp = new OtpVerification();
      Object.assign(otp, data);
      if (!otp.id) otp.generateId();
      if (otp.attempts === undefined) otp.attempts = 0;
      if (otp.usedAt === undefined) otp.usedAt = null;
      if (!otp.createdAt) otp.createdAt = new Date();
      return otp;
    },
    save: async (entity: OtpVerification) => {
      const idx = otpsDb.findIndex((o) => o.id === entity.id);
      if (idx >= 0) {
        otpsDb[idx] = entity;
      } else {
        otpsDb.push(entity);
      }
      return entity;
    },
    findOne: async (options: { where: any; order?: any }) => {
      const matchCondition = (item: OtpVerification, cond: any) => {
        return Object.keys(cond).every((key) => {
          const expected = cond[key];
          const actual = (item as any)[key];
          if (expected && typeof expected === "object" && ("_type" in expected || "type" in expected)) {
            const opType = (expected as any)._type || (expected as any).type;
            if (opType === "isNull") {
              return actual === null || actual === undefined;
            }
          }
          return actual === expected;
        });
      };

      const filtered = otpsDb.filter((item) => {
        if (Array.isArray(options.where)) {
          return options.where.some((cond) => matchCondition(item, cond));
        }
        return matchCondition(item, options.where);
      });
      if (filtered.length === 0) return null;
      if (options.order?.createdAt === "DESC") {
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      return filtered[0];
    },
    update: async (criteria: any, partialEntity: any) => {
      const id = typeof criteria === "string" ? criteria : criteria.id;
      const record = otpsDb.find((o) => o.id === id);
      if (record) {
        Object.assign(record, partialEntity);
      }
      return { affected: record ? 1 : 0 };
    },
    createQueryBuilder: () => {
      let updateValues: any = {};
      let whereConditions: ((item: OtpVerification) => boolean)[] = [];

      const qb: any = {
        update: () => qb,
        set: (values: any) => {
          updateValues = values;
          return qb;
        },
        where: (condition: string, params: any) => {
          if (condition.includes("id = :id AND used_at IS NULL")) {
            whereConditions.push((item) => item.id === params.id && item.usedAt === null);
          } else if (condition.includes("purpose = :purpose") && condition.includes("expires_at > :nowDate")) {
            whereConditions.push(
              (item) =>
                (item.identifier === params.identifier ||
                  item.identifier === params.altIdentifier) &&
                item.purpose === params.purpose &&
                item.usedAt === null &&
                new Date(item.expiresAt) > params.nowDate
            );
          }
          return qb;
        },
        execute: async () => {
          let count = 0;
          for (const item of otpsDb) {
            if (whereConditions.every((fn) => fn(item))) {
              Object.assign(item, updateValues);
              count++;
            }
          }
          return { affected: count };
        },
      };
      return qb;
    },
  };

  // Mock repository for User
  const mockUserRepo: any = {
    create: (data: Partial<User>) => {
      const user = new User();
      Object.assign(user, data);
      if (!user.id) user.id = "user-" + Math.random().toString(36).substring(2, 9);
      if (!user.created_at) user.created_at = new Date();
      return user;
    },
    save: async (entity: User) => {
      const idx = usersDb.findIndex((u) => u.id === entity.id);
      if (idx >= 0) {
        usersDb[idx] = entity;
      } else {
        usersDb.push(entity);
      }
      return entity;
    },
    findOne: async (options: { where: any }) => {
      return (
        usersDb.find((item) => {
          return Object.keys(options.where).every(
            (key) => (item as any)[key] === options.where[key]
          );
        }) || null
      );
    },
    createQueryBuilder: () => {
      let filtered = [...usersDb];
      const qb: any = {
        addSelect: () => qb,
        where: (condition: string, params: any) => {
          if (params.email) {
            filtered = filtered.filter((u) => u.email === params.email);
          }
          if (params.rawPhone || params.normalized || params.withPlus || params.withoutPlus) {
            filtered = filtered.filter(
              (u) =>
                u.phone === params.rawPhone ||
                u.phone === params.normalized ||
                u.phone === params.withPlus ||
                u.phone === params.withoutPlus
            );
          }
          return qb;
        },
        getOne: async () => filtered[0] || null,
      };
      return qb;
    },
  };

  const mockResetTokenRepo: any = {
    delete: async () => ({ affected: 1 }),
    create: (d: any) => d,
    save: async (d: any) => d,
    find: async () => [],
  };

  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === OtpVerification) return mockOtpRepo;
    if (entity === User) return mockUserRepo;
    if (entity === PasswordResetToken) return mockResetTokenRepo;
    return originalGetRepository.call(AppDataSource, entity);
  };

  const originalTransaction = AppDataSource.transaction;
  (AppDataSource as any).transaction = async (cb: (em: any) => Promise<any>) => {
    const mockManager: any = {
      getRepository: (entity: any) => {
        if (entity === OtpVerification) return mockOtpRepo;
        if (entity === User) return mockUserRepo;
        return originalGetRepository.call(AppDataSource, entity);
      },
    };
    return cb(mockManager);
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Secure OTP Generation & SMS Dispatch
    // -------------------------------------------------------------
    console.log("Test 1: Secure OTP Generation & SMS Dispatch");
    const testPhone = "0911223344";
    const sendResult = await otpService.generateAndSendOtp(testPhone, OtpPurpose.REGISTER);

    assert.strictEqual(sendResult.success, true, "OTP send should return success: true");
    assert.strictEqual(sendResult.identifier, "+251911223344", "Identifier should be normalized to Ethiopian standard");
    assert.ok(sendResult.expiresAt > new Date(), "ExpiresAt must be in the future");
    assert.strictEqual(sentSmsMessages.length, 1, "sendSms should have been called once");
    assert.strictEqual(sentSmsMessages[0].phone, "+251911223344", "SMS recipient should match normalized phone");
    assert.ok(
      sentSmsMessages[0].message.includes("Your Wase verification code is"),
      "SMS content must contain verification message"
    );

    // Verify DB record
    const savedRecord = otpsDb[0];
    assert.ok(savedRecord, "OTP record must be saved in database");
    assert.strictEqual(savedRecord.identifier, "+251911223344");
    assert.strictEqual(savedRecord.purpose, OtpPurpose.REGISTER);
    assert.strictEqual(savedRecord.attempts, 0);
    assert.strictEqual(savedRecord.usedAt, null);
    assert.notStrictEqual(savedRecord.otpHash, sendResult.otpForTesting, "otp_hash must NEVER store plain-text OTP");
    assert.ok(savedRecord.otpHash.startsWith("$2"), "otp_hash must be a valid bcrypt hash");

    // Extract the generated code from SMS message for testing
    const codeMatch = sentSmsMessages[0].message.match(/\b\d{6}\b/);
    assert.ok(codeMatch, "SMS message must contain 6-digit numeric OTP");
    const generatedOtp = codeMatch[0];

    const bcryptValid = await bcrypt.compare(generatedOtp, savedRecord.otpHash);
    assert.strictEqual(bcryptValid, true, "bcrypt must verify the plain OTP against stored otp_hash");
    console.log("  ✓ Passed: Secure OTP generated, hashed, persisted, and dispatched via SMS\n");

    // -------------------------------------------------------------
    // Test 2: Rate Limiting & Cooldown Protection
    // -------------------------------------------------------------
    console.log("Test 2: Rate Limiting & Cooldown on Resend");
    let cooldownCaught = false;
    try {
      await otpService.generateAndSendOtp(testPhone, OtpPurpose.REGISTER);
    } catch (err: any) {
      cooldownCaught = true;
      assert.strictEqual(err.statusCode, 429, "Expected 429 Too Many Requests");
      assert.ok(err.message.includes("before requesting another verification code"));
    }
    assert.strictEqual(cooldownCaught, true, "Rapid resend must be blocked by cooldown");
    console.log("  ✓ Passed: Cooldown timer prevents spamming OTP requests\n");

    // -------------------------------------------------------------
    // Test 3: Invalidation & Superseding of Previous Active OTPs
    // -------------------------------------------------------------
    console.log("Test 3: Superseding Previous Active OTPs");
    // Simulate passage of cooldown time
    savedRecord.createdAt = new Date(Date.now() - 70 * 1000);

    const secondSendResult = await otpService.generateAndSendOtp(testPhone, OtpPurpose.REGISTER);
    assert.strictEqual(secondSendResult.success, true);
    assert.strictEqual(otpsDb.length, 2, "A second OTP record should be created");

    // First record should be expired / superseded
    assert.ok(
      new Date(savedRecord.expiresAt).getTime() <= Date.now(),
      "Previous active OTP must be expired/superseded"
    );

    const secondCodeMatch = sentSmsMessages[1].message.match(/\b\d{6}\b/);
    const secondOtp = secondCodeMatch![0];
    console.log("  ✓ Passed: Previous active OTP properly superseded when new OTP is generated\n");

    // -------------------------------------------------------------
    // Test 4: Verification Rejects Old Superseded OTP
    // -------------------------------------------------------------
    console.log("Test 4: Verification Rejects Superseded OTP");
    let supersededCaught = false;
    try {
      await otpService.verifyOtp(testPhone, generatedOtp, OtpPurpose.REGISTER);
    } catch (err: any) {
      supersededCaught = true;
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes("Invalid verification code") || err.message.includes("expired"));
    }
    assert.strictEqual(supersededCaught, true, "Superseded OTP must be rejected");
    console.log("  ✓ Passed: Superseded OTP rejected\n");

    // -------------------------------------------------------------
    // Test 5: Failed Attempt Tracking & Account Locking
    // -------------------------------------------------------------
    console.log("Test 5: Failed Attempt Tracking & Locking");
    const activeRecord = otpsDb[1];
    activeRecord.attempts = 0;

    for (let i = 1; i <= 4; i++) {
      let wrongAttemptCaught = false;
      try {
        await otpService.verifyOtp(testPhone, "000000", OtpPurpose.REGISTER);
      } catch (err: any) {
        wrongAttemptCaught = true;
        assert.strictEqual(err.statusCode, 400);
        assert.ok(err.message.includes("attempt(s) remaining"));
      }
      assert.strictEqual(wrongAttemptCaught, true);
      assert.strictEqual(activeRecord.attempts, i, `Attempts should be incremented to ${i}`);
    }

    // 5th failed attempt should lock
    let lockCaught = false;
    try {
      await otpService.verifyOtp(testPhone, "000000", OtpPurpose.REGISTER);
    } catch (err: any) {
      lockCaught = true;
      assert.strictEqual(err.statusCode, 429);
      assert.ok(err.message.includes("locked"));
    }
    assert.strictEqual(lockCaught, true);
    assert.strictEqual(activeRecord.attempts, 5, "Attempts should reach 5");

    // Even with the correct code now, locked OTP must be rejected
    let lockedCodeRejected = false;
    try {
      await otpService.verifyOtp(testPhone, secondOtp, OtpPurpose.REGISTER);
    } catch (err: any) {
      lockedCodeRejected = true;
      assert.strictEqual(err.statusCode, 429);
      assert.ok(err.message.includes("locked"));
    }
    assert.strictEqual(lockedCodeRejected, true, "Locked OTP must reject correct code");
    console.log("  ✓ Passed: Failed attempt counting and lock enforcement verified\n");

    // -------------------------------------------------------------
    // Test 6: Successful Verification & Single-Use Enforcement
    // -------------------------------------------------------------
    console.log("Test 6: Successful Verification & Single-Use Enforcement");
    const freshPhone = "0922334455";
    await otpService.generateAndSendOtp(freshPhone, OtpPurpose.REGISTER);
    const freshRecord = otpsDb[2];
    const freshCodeMatch = sentSmsMessages[sentSmsMessages.length - 1].message.match(/\b\d{6}\b/);
    const freshOtp = freshCodeMatch![0];

    const verifySuccess = await otpService.verifyOtp(freshPhone, freshOtp, OtpPurpose.REGISTER);
    assert.strictEqual(verifySuccess.success, true);
    assert.ok(freshRecord.usedAt !== null, "used_at timestamp must be set upon verification");

    // Replay attempt: Try verifying again
    let replayCaught = false;
    try {
      await otpService.verifyOtp(freshPhone, freshOtp, OtpPurpose.REGISTER);
    } catch (err: any) {
      replayCaught = true;
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes("already been used"));
    }
    assert.strictEqual(replayCaught, true, "Already used OTP must be rejected immediately");
    console.log("  ✓ Passed: OTP verifies and enforces single-use policy\n");

    // -------------------------------------------------------------
    // Test 7: Expiration Enforcement
    // -------------------------------------------------------------
    console.log("Test 7: Expiration Enforcement");
    const expPhone = "0933445566";
    await otpService.generateAndSendOtp(expPhone, OtpPurpose.REGISTER);
    const expRecord = otpsDb[3];
    const expCodeMatch = sentSmsMessages[sentSmsMessages.length - 1].message.match(/\b\d{6}\b/);
    const expOtp = expCodeMatch![0];

    // Force expiration
    expRecord.expiresAt = new Date(Date.now() - 5000);

    let expiredCaught = false;
    try {
      await otpService.verifyOtp(expPhone, expOtp, OtpPurpose.REGISTER);
    } catch (err: any) {
      expiredCaught = true;
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes("expired"));
    }
    assert.strictEqual(expiredCaught, true, "Expired OTP must be rejected");
    console.log("  ✓ Passed: Expired OTP rejected\n");

    // -------------------------------------------------------------
    // Test 8: User Registration Flow with OTP Enforcement
    // -------------------------------------------------------------
    console.log("Test 8: User Registration Flow with OTP Enforcement");
    const regPhone = "0944556677";
    await otpService.generateAndSendOtp(regPhone, OtpPurpose.REGISTER);
    const regOtpMatch = sentSmsMessages[sentSmsMessages.length - 1].message.match(/\b\d{6}\b/);
    const regOtp = regOtpMatch![0];

    // Attempt registration without OTP -> should fail
    let noOtpCaught = false;
    try {
      await authService.register({
        full_name: "Test Builder",
        email: "builder@wase.com",
        password: "Password123!",
        phone: regPhone,
      });
    } catch (err: any) {
      noOtpCaught = true;
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes("OTP verification code is required"));
    }
    assert.strictEqual(noOtpCaught, true, "Registration without OTP must be blocked");

    // Attempt registration with invalid OTP -> should fail
    let invalidOtpCaught = false;
    try {
      await authService.register({
        full_name: "Test Builder",
        email: "builder@wase.com",
        password: "Password123!",
        phone: regPhone,
        otp: "999999",
      });
    } catch (err: any) {
      invalidOtpCaught = true;
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes("Invalid verification code"));
    }
    assert.strictEqual(invalidOtpCaught, true, "Registration with wrong OTP must be blocked");

    // Attempt registration with valid OTP -> succeeds and links user_id
    const regResult = await authService.register({
      full_name: "Test Builder",
      email: "builder@wase.com",
      password: "Password123!",
      phone: regPhone,
      otp: regOtp,
    });

    assert.ok(regResult.accessToken, "Registration must return access token");
    assert.strictEqual(regResult.user.email, "builder@wase.com");

    const regOtpRecord = otpsDb.find((o) => o.identifier === "+251944556677");
    assert.ok(regOtpRecord, "Registration OTP record must exist");
    assert.ok(regOtpRecord.usedAt !== null, "Registration OTP must be marked as used");
    assert.strictEqual(
      regOtpRecord.userId,
      regResult.user.id,
      "OTP record user_id must be linked to the newly registered user"
    );
    console.log("  ✓ Passed: Registration requires OTP, validates, and links user_id\n");

    // -------------------------------------------------------------
    // Test 9: Password Reset Workflow with OTP
    // -------------------------------------------------------------
    console.log("Test 9: Password Reset Workflow with OTP");
    const resetUserPhone = "0955667788";
    const resetUser = mockUserRepo.create({
      id: "user-reset-uuid",
      full_name: "Reset User",
      email: "reset@wase.com",
      password_hash: await bcrypt.hash("OldPassword123!", 10),
      phone: resetUserPhone,
      status: UserStatus.ACTIVE,
      role: UserRole.User,
    });
    usersDb.push(resetUser);

    // Request password reset OTP via SMS
    await authService.forgotPassword(resetUserPhone);
    const resetSms = sentSmsMessages[sentSmsMessages.length - 1];
    assert.strictEqual(resetSms.phone, "+251955667788");
    const resetOtpMatch = resetSms.message.match(/\b\d{6}\b/);
    const resetOtp = resetOtpMatch![0];

    // Reset password with wrong OTP -> fails
    let wrongResetCaught = false;
    try {
      await authService.resetPasswordWithOtp(
        resetUserPhone,
        "111111",
        "NewPassword123!",
        "NewPassword123!"
      );
    } catch (err: any) {
      wrongResetCaught = true;
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes("Invalid verification code"));
    }
    assert.strictEqual(wrongResetCaught, true);

    // Reset password with valid OTP -> succeeds
    await authService.resetPasswordWithOtp(
      resetUserPhone,
      resetOtp,
      "NewPassword123!",
      "NewPassword123!"
    );

    // Verify password was updated
    const isNewPasswordValid = await bcrypt.compare("NewPassword123!", resetUser.password_hash);
    assert.strictEqual(isNewPasswordValid, true, "User password must be updated to new password");

    const resetOtpRecord = otpsDb.find(
      (o) => o.identifier === "+251955667788" && o.purpose === OtpPurpose.RESET_PASSWORD
    );
    assert.ok(resetOtpRecord, "Reset OTP record must exist");
    assert.ok(resetOtpRecord.usedAt !== null, "Reset OTP must be marked as used");
    assert.strictEqual(resetOtpRecord.userId, resetUser.id, "Reset OTP must link user_id");
    console.log("  ✓ Passed: Password reset verifies OTP, updates password, and marks single-use\n");

    // -------------------------------------------------------------
    // Test 10: Registration Controller Automatically Dispatches OTP and Verifies
    // -------------------------------------------------------------
    console.log("Test 10: Registration Controller Auto-Dispatches OTP and Verifies");
    const jovaniPhone = "0911002233";
    let initStatus = 0;
    let initBody: any = null;

    const mockInitRes: any = {
      status: (code: number) => {
        initStatus = code;
        return {
          json: (data: any) => {
            initBody = data;
          },
        };
      },
    };

    // Step 1: User submits registration form without OTP
    const initReq: any = {
      body: {
        full_name: "jovani user",
        email: "jiovan@gmail.com",
        phone: jovaniPhone,
        password: "Password123!",
        role: UserRole.User,
      },
    };

    await userController.create(initReq, mockInitRes, () => {});

    assert.strictEqual(initStatus, 200, "Initiating registration without OTP should return 200");
    assert.strictEqual(initBody.requiresOtp, true, "Response must indicate requiresOtp: true");
    assert.ok(
      initBody.message.includes("Verification code sent to your phone via SMS"),
      "Response message must indicate SMS dispatch"
    );

    const jovaniSms = sentSmsMessages.find((s) => s.phone === "+251911002233");
    assert.ok(jovaniSms, "SMS should have been delivered to Jovani's phone");
    const jovaniOtpMatch = jovaniSms.message.match(/\b\d{6}\b/);
    const jovaniOtp = jovaniOtpMatch![0];

    // Step 2: User completes registration with the received OTP
    let completeStatus = 0;
    let completeBody: any = null;

    const mockCompleteRes: any = {
      status: (code: number) => {
        completeStatus = code;
        return {
          json: (data: any) => {
            completeBody = data;
          },
        };
      },
    };

    const completeReq: any = {
      body: {
        full_name: "jovani user",
        email: "jiovan@gmail.com",
        phone: jovaniPhone,
        password: "Password123!",
        role: UserRole.User,
        otp: jovaniOtp,
      },
    };

    await userController.create(completeReq, mockCompleteRes, () => {});

    assert.strictEqual(completeStatus, 201, "Completing registration with valid OTP should return 201 Created");
    assert.strictEqual(completeBody.message, "User created successfully");
    assert.strictEqual(completeBody.data.fullName, "jovani user");
    assert.strictEqual(completeBody.data.email, "jiovan@gmail.com");
    assert.ok(completeBody.accessToken, "Response must include accessToken at root");
    assert.ok(completeBody.data.accessToken, "Response must include accessToken inside data");

    const jovaniOtpRecord = otpsDb.find(
      (o) => o.identifier === "+251911002233" && o.purpose === OtpPurpose.REGISTER
    );
    assert.ok(jovaniOtpRecord, "Jovani OTP record must exist in DB");
    assert.ok(jovaniOtpRecord.usedAt !== null, "Jovani OTP must be marked as used");
    assert.strictEqual(jovaniOtpRecord.userId, completeBody.data.id, "Jovani user ID must be linked");
    console.log("  ✓ Passed: Registration auto-sends SMS OTP and completes upon verification\n");

    // -------------------------------------------------------------
    // Test 11: Password Reset Workflow - Email Lookup Routes to Registered Phone via SMS
    // -------------------------------------------------------------
    console.log("Test 11: Password Reset Workflow - Email Lookup Routes to Registered Phone via SMS");
    const emailUser = mockUserRepo.create({
      id: "user-email-reset-uuid",
      full_name: "Email User",
      email: "emailuser@wase.com",
      password_hash: await bcrypt.hash("OldPass123!", 10),
      phone: "0999887766",
      status: UserStatus.ACTIVE,
      role: UserRole.User,
    });
    usersDb.push(emailUser);

    // Request password reset providing Email -> should look up user and send OTP to phone via SMS!
    const forgotRes = await authService.forgotPassword("emailuser@wase.com");
    assert.strictEqual(forgotRes.channel, "sms");
    assert.ok(forgotRes.message.includes("SMS"));

    const emailUserSms = sentSmsMessages.find((s) => s.phone === "+251999887766");
    assert.ok(emailUserSms, "SMS OTP should have been delivered to user's registered phone");
    const emailUserOtpMatch = emailUserSms.message.match(/\b\d{6}\b/);
    const emailUserOtp = emailUserOtpMatch![0];

    // Reset password using the Email (as identifier) + the SMS OTP!
    await authService.resetPasswordWithOtp(
      "emailuser@wase.com",
      emailUserOtp,
      "SuperSecret99!",
      "SuperSecret99!"
    );

    const isUpdatedPassValid = await bcrypt.compare("SuperSecret99!", emailUser.password_hash);
    assert.strictEqual(isUpdatedPassValid, true, "Password must be updated when user resets using email and SMS OTP");
    console.log("  ✓ Passed: Email lookup successfully sends OTP to registered phone via SMS and resets password\n");

    // -------------------------------------------------------------
    // Test 12: Password Reset Fallback to Email When User Has No Phone
    // -------------------------------------------------------------
    console.log("Test 12: Password Reset Fallback to Email When User Has No Phone");
    const noPhoneUser = mockUserRepo.create({
      id: "user-no-phone-uuid",
      full_name: "No Phone User",
      email: "nophone@wase.com",
      password_hash: await bcrypt.hash("OldPass123!", 10),
      phone: null as any,
      status: UserStatus.ACTIVE,
      role: UserRole.User,
    });
    usersDb.push(noPhoneUser);

    const fallbackRes = await authService.forgotPassword("nophone@wase.com");
    assert.strictEqual(fallbackRes.channel, "email");
    const fallbackEmail = sentEmailOtps.find((e) => e.to === "nophone@wase.com");
    assert.ok(fallbackEmail, "Email OTP should be dispatched as fallback when user has no phone");

    await authService.resetPasswordWithOtp(
      "nophone@wase.com",
      fallbackEmail.otp,
      "FallbackSecret99!",
      "FallbackSecret99!"
    );
    const isFallbackPassValid = await bcrypt.compare("FallbackSecret99!", noPhoneUser.password_hash);
    assert.strictEqual(isFallbackPassValid, true, "Password must be updated when verified via Email fallback");
    console.log("  ✓ Passed: Fallback to Email OTP functions correctly when user has no phone\n");

    console.log("All 12 OTP Verification Test Suites Passed Successfully! 🚀\n");
  } finally {
    (AppDataSource as any).getRepository = originalGetRepository;
    (AppDataSource as any).transaction = originalTransaction;
    (smsModule as any).sendSms = originalSendSms;
    (ethioSmsModule as any).sendEthioSms = originalSendEthioSms;
    (emailService as any).sendOtpEmail = originalSendOtpEmail;
  }
}

if (require.main === module) {
  runOtpVerificationTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
