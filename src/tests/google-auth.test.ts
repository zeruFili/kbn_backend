import assert from "node:assert";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { LocalCredential } from "../entities/LocalCredential";
import { AuthIdentity } from "../entities/AuthIdentity";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { authService } from "../services/auth.service";
import { otpService } from "../services/otp.service";
import { googleAuthService, VerifiedGoogleProfile } from "../services/google-auth.service";
import { authController } from "../controllers/auth.controller";
import { emailService } from "../services/email.service";
import { verifyAccessToken } from "../utils/jwt.utils";
import { requireActiveUser } from "../middlewares/auth.middleware";

export async function runGoogleAuthTests() {
  console.log("=================================================");
  console.log("Starting Google Sign-In & Auth Architecture Tests...");
  console.log("=================================================\n");

  const usersDb: User[] = [];
  const localCredsDb: LocalCredential[] = [];
  const authIdentitiesDb: AuthIdentity[] = [];

  // Mock email service
  const originalSendWelcomeEmail = emailService.sendWelcomeEmail;
  (emailService as any).sendWelcomeEmail = async () => {};

  // Mock User repository
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
      if (idx >= 0) usersDb[idx] = entity;
      else usersDb.push(entity);
      return entity;
    },
    findOne: async (options: { where: any; relations?: string[] }) => {
      const user = usersDb.find((item) => {
        return Object.keys(options.where).every(
          (key) => (item as any)[key] === options.where[key]
        );
      });
      return user ? Object.assign(new User(), user) : null;
    },
    createQueryBuilder: () => {
      let filtered = [...usersDb];
      const qb: any = {
        addSelect: () => qb,
        where: (condition: string, params: any) => {
          if (params.email) {
            filtered = filtered.filter((u) => u.email === params.email);
          }
          if (params.userId) {
            filtered = filtered.filter((u) => u.id === params.userId);
          }
          return qb;
        },
        getOne: async () => (filtered[0] ? Object.assign(new User(), filtered[0]) : null),
      };
      return qb;
    },
  };

  // Mock LocalCredential repository
  const mockLocalCredRepo: any = {
    create: (data: Partial<LocalCredential>) => {
      const cred = new LocalCredential();
      Object.assign(cred, data);
      if (!cred.id) cred.id = "cred-" + Math.random().toString(36).substring(2, 9);
      if (!cred.createdAt) cred.createdAt = new Date();
      return cred;
    },
    save: async (entity: LocalCredential) => {
      const idx = localCredsDb.findIndex((c) => c.userId === entity.userId);
      if (idx >= 0) localCredsDb[idx] = entity;
      else localCredsDb.push(entity);
      return entity;
    },
    findOne: async (options: { where: any }) => {
      const cred = localCredsDb.find((item) => {
        return Object.keys(options.where).every(
          (key) => (item as any)[key] === options.where[key]
        );
      });
      return cred ? Object.assign(new LocalCredential(), cred) : null;
    },
    createQueryBuilder: () => {
      let filtered = [...localCredsDb];
      const qb: any = {
        addSelect: () => qb,
        where: (condition: string, params: any) => {
          if (params.userId) {
            filtered = filtered.filter((c) => c.userId === params.userId);
          }
          return qb;
        },
        getOne: async () => (filtered[0] ? Object.assign(new LocalCredential(), filtered[0]) : null),
      };
      return qb;
    },
  };

  // Mock AuthIdentity repository
  const mockAuthIdentityRepo: any = {
    create: (data: Partial<AuthIdentity>) => {
      const identity = new AuthIdentity();
      Object.assign(identity, data);
      if (!identity.id) identity.id = "identity-" + Math.random().toString(36).substring(2, 9);
      if (!identity.createdAt) identity.createdAt = new Date();
      return identity;
    },
    save: async (entity: AuthIdentity) => {
      // Compound index unique constraint check: { provider: 1, providerUserId: 1 }
      const existing = authIdentitiesDb.find(
        (i) => i.provider === entity.provider && i.providerUserId === entity.providerUserId && i.id !== entity.id
      );
      if (existing) {
        const error: any = new Error("duplicate key value violates unique constraint \"IDX_auth_identities_provider_provider_user_id\"");
        error.code = "23505";
        throw error;
      }
      const idx = authIdentitiesDb.findIndex((i) => i.id === entity.id);
      if (idx >= 0) authIdentitiesDb[idx] = entity;
      else authIdentitiesDb.push(entity);
      return entity;
    },
    findOne: async (options: { where: any; relations?: string[] }) => {
      const identity = authIdentitiesDb.find((item) => {
        return Object.keys(options.where).every(
          (key) => (item as any)[key] === options.where[key]
        );
      });
      if (!identity) return null;
      const res = Object.assign(new AuthIdentity(), identity);
      if (options.relations?.includes("user")) {
        const user = usersDb.find((u) => u.id === identity.userId);
        res.user = user ? Object.assign(new User(), user) : undefined;
      }
      return res;
    },
  };

  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === User) return mockUserRepo;
    if (entity === LocalCredential) return mockLocalCredRepo;
    if (entity === AuthIdentity) return mockAuthIdentityRepo;
    return originalGetRepository.call(AppDataSource, entity);
  };

  const originalTransaction = AppDataSource.transaction;
  (AppDataSource as any).transaction = async (cb: (em: any) => Promise<any>) => {
    const mockManager: any = {
      getRepository: (entity: any) => {
        if (entity === User) return mockUserRepo;
        if (entity === LocalCredential) return mockLocalCredRepo;
        if (entity === AuthIdentity) return mockAuthIdentityRepo;
        return originalGetRepository.call(AppDataSource, entity);
      },
    };
    return cb(mockManager);
  };

  // Mock googleAuthService.verifyToken for controlled tests
  const originalVerifyToken = googleAuthService.verifyToken;
  let mockTokenProfiles: Record<string, VerifiedGoogleProfile | Error> = {};

  (googleAuthService as any).verifyToken = async (idToken: string): Promise<VerifiedGoogleProfile> => {
    if (!idToken || !idToken.trim()) {
      return originalVerifyToken.call(googleAuthService, idToken);
    }
    const mocked = mockTokenProfiles[idToken];
    if (mocked instanceof Error) {
      throw mocked;
    }
    if (mocked) {
      return mocked;
    }
    return originalVerifyToken.call(googleAuthService, idToken);
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Google Registration creates active User and AuthIdentity
    // -------------------------------------------------------------
    console.log("Test 1: Google Registration Flow");
    const newGoogleSub = "google-sub-10001";
    const newGoogleEmail = "newbuilder@gmail.com";
    const newGoogleToken = "valid-token-newbuilder";

    mockTokenProfiles[newGoogleToken] = {
      sub: newGoogleSub,
      email: newGoogleEmail,
      emailVerified: true,
      name: "New Google Builder",
      picture: "https://lh3.googleusercontent.com/a/avatar-newbuilder",
    };

    const regResult = await authService.googleLogin(newGoogleToken);
    assert.ok(regResult.accessToken, "Registration must return access token");
    assert.strictEqual(regResult.user.email, newGoogleEmail);
    assert.strictEqual(regResult.user.full_name, "New Google Builder");
    assert.strictEqual(regResult.user.status, UserStatus.PENDING, "Google user status must default to pending");
    assert.strictEqual(regResult.user.profileImage, "https://lh3.googleusercontent.com/a/avatar-newbuilder");

    // Verify User record in DB
    const savedUser = usersDb.find((u) => u.email === newGoogleEmail);
    assert.ok(savedUser, "User record must exist in DB");
    assert.strictEqual(savedUser.status, UserStatus.PENDING);
    assert.strictEqual(savedUser.is_active, false);
    assert.strictEqual(savedUser.phone, null, "Phone is optional for Google users");
    assert.strictEqual(savedUser.password_hash, null, "Google users do not require local password");
    assert.strictEqual(savedUser.phoneVerifiedAt, null);
    assert.ok(savedUser.emailVerifiedAt instanceof Date, "emailVerifiedAt must be set for verified Google email");

    // Verify AuthIdentity record in DB
    const savedIdentity = authIdentitiesDb.find(
      (i) => i.provider === "google" && i.providerUserId === newGoogleSub
    );
    assert.ok(savedIdentity, "AuthIdentity record must exist");
    assert.strictEqual(savedIdentity.userId, savedUser.id);
    assert.strictEqual(savedIdentity.provider, "google");
    assert.strictEqual(savedIdentity.providerUserId, newGoogleSub);

    // Verify token validity
    const decodedJwt = verifyAccessToken(regResult.accessToken);
    assert.strictEqual(decodedJwt.sub, savedUser.id);
    assert.strictEqual(decodedJwt.email, newGoogleEmail);
    assert.strictEqual(decodedJwt.status, UserStatus.PENDING);
    console.log("  ✓ Passed: Google registration creates pending user, AuthIdentity, and valid JWT without OTP/password\n");

    // -------------------------------------------------------------
    // Test 2: Google Login via provider subject ID (sub claim)
    // -------------------------------------------------------------
    console.log("Test 2: Google Login via Verified Subject ID");
    const loginResult = await authService.googleLogin(newGoogleToken);
    assert.strictEqual(loginResult.user.id, savedUser.id);
    assert.strictEqual(loginResult.user.email, savedUser.email);
    assert.ok(loginResult.accessToken);

    // Ensure last_login_at was updated
    assert.ok(savedUser.last_login_at !== null && savedUser.last_login_at !== undefined);
    console.log("  ✓ Passed: Existing Google identity logs in using provider sub ID and updates last_login_at\n");

    // -------------------------------------------------------------
    // Test 3: Token Validation (Signatures, Issuers, Expiration, Required Claims)
    // -------------------------------------------------------------
    console.log("Test 3: Token Signature & Claims Validation");
    const origClientId = googleAuthService.getClientId();
    const testAudience = origClientId || "client-id";

    // Missing sub claim
    assert.throws(
      () =>
        googleAuthService.validatePayload({
          iss: "https://accounts.google.com",
          aud: testAudience,
          sub: "",
          email: "test@gmail.com",
          email_verified: true,
        } as any),
      (err: any) => err.statusCode === 401 && err.message.includes("missing required subject claim")
    );

    // Invalid issuer
    assert.throws(
      () =>
        googleAuthService.validatePayload({
          iss: "https://evil-attacker.com",
          aud: testAudience,
          sub: "sub-123",
          email: "test@gmail.com",
          email_verified: true,
        } as any),
      (err: any) => err.statusCode === 401 && err.message.includes("Invalid Google ID token issuer")
    );

    // Expired token
    const pastExp = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
    assert.throws(
      () =>
        googleAuthService.validatePayload({
          iss: "accounts.google.com",
          aud: testAudience,
          sub: "sub-123",
          exp: pastExp,
          email: "test@gmail.com",
          email_verified: true,
        } as any),
      (err: any) => err.statusCode === 401 && err.message.includes("expired")
    );

    // Unverified email
    assert.throws(
      () =>
        googleAuthService.validatePayload({
          iss: "https://accounts.google.com",
          aud: testAudience,
          sub: "sub-123",
          exp: Math.floor(Date.now() / 1000) + 300,
          email: "unverified@gmail.com",
          email_verified: false,
        } as any),
      (err: any) => err.statusCode === 400 && err.message.includes("not verified")
    );

    // Audience mismatch when GOOGLE_CLIENT_ID is configured
    googleAuthService.setAllowedClientId("expected-google-client-id");
    assert.throws(
      () =>
        googleAuthService.validatePayload({
          iss: "https://accounts.google.com",
          aud: "different-client-id",
          sub: "sub-123",
          exp: Math.floor(Date.now() / 1000) + 300,
          email: "valid@gmail.com",
          email_verified: true,
        } as any),
      (err: any) => err.statusCode === 401 && err.message.includes("client ID mismatch")
    );
    googleAuthService.setAllowedClientId(origClientId); // Reset
    console.log("  ✓ Passed: Token validator enforces sub, issuer, expiration, email_verified, and audience\n");

    // -------------------------------------------------------------
    // Test 4: Existing-Account Conflict (No Auto-Merge) & Secure Account Linking
    // -------------------------------------------------------------
    console.log("Test 4: Account Conflict Prevention & Secure Linking Flow");
    const conflictEmail = "existinguser@domain.com";
    const existingPassword = "SecurePassword123!";
    const passwordHash = await bcrypt.hash(existingPassword, 4);

    // Existing phone/password user
    const existingLocalUser = mockUserRepo.create({
      id: "user-local-conflict",
      full_name: "Existing Local User",
      email: conflictEmail,
      phone: "+251911223344",
      status: UserStatus.ACTIVE,
      role: UserRole.User,
      password_hash: passwordHash,
      phoneVerifiedAt: new Date(),
    });
    usersDb.push(existingLocalUser);

    const existingCred = mockLocalCredRepo.create({
      userId: existingLocalUser.id,
      passwordHash,
    });
    localCredsDb.push(existingCred);

    // Google user attempts sign in with conflictEmail but new Google sub ID
    const conflictGoogleSub = "google-sub-conflict-999";
    const conflictToken = "token-conflict-user";
    mockTokenProfiles[conflictToken] = {
      sub: conflictGoogleSub,
      email: conflictEmail,
      emailVerified: true,
      name: "Google Conflict User",
      picture: null,
    };

    // Should FAIL with 409 Conflict: DO NOT auto-merge!
    let conflictCaught = false;
    try {
      await authService.googleLogin(conflictToken);
    } catch (err: any) {
      conflictCaught = true;
      assert.strictEqual(err.statusCode, 409);
      assert.ok(err.message.includes("already exists"));
    }
    assert.strictEqual(conflictCaught, true, "Sign in must reject auto-merge when email conflicts");

    // Verify no AuthIdentity was prematurely created
    const unlinkedIdentity = authIdentitiesDb.find((i) => i.providerUserId === conflictGoogleSub);
    assert.strictEqual(unlinkedIdentity, undefined, "No identity should be linked without verification");

    // Secure Account Linking with WRONG password -> fails
    let wrongPassCaught = false;
    try {
      await authService.linkGoogleAccount(conflictToken, "WrongPassword!");
    } catch (err: any) {
      wrongPassCaught = true;
      assert.strictEqual(err.statusCode, 401);
      assert.ok(err.message.includes("Invalid password"));
    }
    assert.strictEqual(wrongPassCaught, true);

    // Secure Account Linking with CORRECT password -> succeeds
    const linkResult = await authService.linkGoogleAccount(conflictToken, existingPassword);
    assert.strictEqual(linkResult.user.id, existingLocalUser.id);
    assert.strictEqual(linkResult.user.email, conflictEmail);
    assert.ok(linkResult.accessToken);

    // AuthIdentity must now exist and link to existing user
    const linkedIdentity = authIdentitiesDb.find(
      (i) => i.provider === "google" && i.providerUserId === conflictGoogleSub
    );
    assert.ok(linkedIdentity, "AuthIdentity must be persisted after link verification");
    assert.strictEqual(linkedIdentity.userId, existingLocalUser.id);

    // Subsequent Google login now succeeds directly!
    const postLinkLogin = await authService.googleLogin(conflictToken);
    assert.strictEqual(postLinkLogin.user.id, existingLocalUser.id);
    console.log("  ✓ Passed: Conflicting emails strictly reject auto-merge and require password-verified linking\n");

    // -------------------------------------------------------------
    // Test 5: Suspended Users are strictly blocked
    // -------------------------------------------------------------
    console.log("Test 5: Suspended User Access Control");
    const suspendedSub = "google-sub-suspended-555";
    const suspendedToken = "token-suspended-user";
    const suspendedEmail = "suspended@domain.com";

    const suspendedUser = mockUserRepo.create({
      id: "user-suspended-uuid",
      full_name: "Suspended User",
      email: suspendedEmail,
      status: UserStatus.SUSPENDED,
      role: UserRole.User,
    });
    usersDb.push(suspendedUser);

    const suspendedIdentity = mockAuthIdentityRepo.create({
      userId: suspendedUser.id,
      provider: "google",
      providerUserId: suspendedSub,
    });
    authIdentitiesDb.push(suspendedIdentity);

    mockTokenProfiles[suspendedToken] = {
      sub: suspendedSub,
      email: suspendedEmail,
      emailVerified: true,
      name: "Suspended User",
      picture: null,
    };

    let suspendedCaught = false;
    try {
      await authService.googleLogin(suspendedToken);
    } catch (err: any) {
      suspendedCaught = true;
      assert.strictEqual(err.statusCode, 403);
      assert.ok(err.message.includes("suspended"));
    }
    assert.strictEqual(suspendedCaught, true, "Suspended user must be rejected with 403");
    console.log("  ✓ Passed: Suspended Google users are blocked with 403 Forbidden\n");

    // -------------------------------------------------------------
    // Test 6: Pending Users prevent unrestricted access
    // -------------------------------------------------------------
    console.log("Test 6: Pending User Authorization Control");
    const pendingSub = "google-sub-pending-777";
    const pendingToken = "token-pending-user";
    const pendingEmail = "pending@domain.com";

    const pendingUser = mockUserRepo.create({
      id: "user-pending-uuid",
      full_name: "Pending Approval User",
      email: pendingEmail,
      status: UserStatus.PENDING,
      role: UserRole.User,
    });
    usersDb.push(pendingUser);

    const pendingIdentity = mockAuthIdentityRepo.create({
      userId: pendingUser.id,
      provider: "google",
      providerUserId: pendingSub,
    });
    authIdentitiesDb.push(pendingIdentity);

    mockTokenProfiles[pendingToken] = {
      sub: pendingSub,
      email: pendingEmail,
      emailVerified: true,
      name: "Pending Approval User",
      picture: null,
    };

    const pendingResult = await authService.googleLogin(pendingToken);
    assert.strictEqual(pendingResult.user.status, UserStatus.PENDING);

    // Verify requireActiveUser middleware strictly blocks pending user
    let middlewareBlocked = false;
    const mockPendingReq: any = { user: { id: pendingUser.id, status: UserStatus.PENDING, role: UserRole.User } };
    const mockPendingRes: any = {
      status: (code: number) => {
        if (code === 403) middlewareBlocked = true;
        return { json: () => {} };
      },
    };
    requireActiveUser(mockPendingReq, mockPendingRes, () => {});
    assert.strictEqual(middlewareBlocked, true, "requireActiveUser must block pending accounts");
    console.log("  ✓ Passed: Pending accounts are prevented from receiving unrestricted resource access\n");

    // -------------------------------------------------------------
    // Test 7: Duplicate Identities Prevented by Compound Index
    // -------------------------------------------------------------
    console.log("Test 7: Duplicate Identity Prevention ({ provider, providerUserId } unique)");
    const duplicateIdentitySub = "google-sub-duplicate-test";
    const userA = mockUserRepo.create({ id: "user-a", full_name: "User A", email: "a@domain.com", status: UserStatus.ACTIVE, role: UserRole.User });
    const userB = mockUserRepo.create({ id: "user-b", full_name: "User B", email: "b@domain.com", status: UserStatus.ACTIVE, role: UserRole.User });
    usersDb.push(userA, userB);

    // User A links this identity
    await mockAuthIdentityRepo.save(
      mockAuthIdentityRepo.create({
        userId: userA.id,
        provider: "google",
        providerUserId: duplicateIdentitySub,
      })
    );

    // Attempting to link the same identity to User B must throw duplicate key violation
    let dupCaught = false;
    try {
      await mockAuthIdentityRepo.save(
        mockAuthIdentityRepo.create({
          userId: userB.id,
          provider: "google",
          providerUserId: duplicateIdentitySub,
        })
      );
    } catch (err: any) {
      dupCaught = true;
      assert.strictEqual(err.code, "23505");
    }
    assert.strictEqual(dupCaught, true, "Compound unique index prevents associating same Google identity with multiple users");
    console.log("  ✓ Passed: Duplicate Google identity association strictly rejected by unique compound index\n");

    // -------------------------------------------------------------
    // Test 8: Multiple external identities allowed for a single user
    // -------------------------------------------------------------
    console.log("Test 8: Multiple Identities for a Single User");
    const multiIdentityUser = mockUserRepo.create({
      id: "user-multi",
      full_name: "Multi Identity User",
      email: "multi@domain.com",
      status: UserStatus.ACTIVE,
      role: UserRole.User,
    });
    usersDb.push(multiIdentityUser);

    const id1 = mockAuthIdentityRepo.create({ userId: multiIdentityUser.id, provider: "google", providerUserId: "google-sub-1" });
    const id2 = mockAuthIdentityRepo.create({ userId: multiIdentityUser.id, provider: "google", providerUserId: "google-sub-2" });
    await mockAuthIdentityRepo.save(id1);
    await mockAuthIdentityRepo.save(id2);

    const userIdentities = authIdentitiesDb.filter((i) => i.userId === multiIdentityUser.id);
    assert.strictEqual(userIdentities.length, 2, "A user may have multiple external identities");
    console.log("  ✓ Passed: Single user can safely hold multiple external authentication identities\n");

    // -------------------------------------------------------------
    // Test 9: Phone/Password Registration and LocalCredential Migration
    // -------------------------------------------------------------
    console.log("Test 9: Phone/Password Registration and LocalCredential Migration");
    const localUserEmail = "localcred@test.com";
    const localUserPass = "LocalPassword123!";

    const originalVerifyOtp = (otpService as any).verifyOtp;
    const originalLinkUser = (otpService as any).linkUser;
    (otpService as any).verifyOtp = async () => ({ record: { id: "otp-phone-reg-1" } });
    (otpService as any).linkUser = async () => {};

    const createdResult = await authService.register({
      full_name: "Local Cred User",
      email: localUserEmail,
      password: localUserPass,
      phone: "+251922334455",
      otp: "123456",
      otpMethod: "sms",
      role: UserRole.User,
    });

    (otpService as any).verifyOtp = originalVerifyOtp;
    (otpService as any).linkUser = originalLinkUser;

    assert.ok(createdResult.user.id);
    const createdCred = localCredsDb.find((c) => c.userId === createdResult.user.id);
    assert.ok(createdCred, "LocalCredential record must be created for password registration");

    // Verify phoneVerifiedAt is marked upon server-side OTP verification
    const createdUserRecord = usersDb.find((u) => u.id === createdResult.user.id);
    assert.ok(createdUserRecord?.phoneVerifiedAt instanceof Date, "phoneVerifiedAt must be marked after server OTP verification");

    // Test password verification against LocalCredential
    const isLocalPassValid = await bcrypt.compare(localUserPass, createdCred.passwordHash);
    assert.strictEqual(isLocalPassValid, true, "LocalCredential passwordHash must match registered password");
    console.log("  ✓ Passed: Phone OTP registration creates LocalCredential and sets phoneVerifiedAt\n");

    // -------------------------------------------------------------
    // Test 10: AuthController Endpoints & HTTP Response Codes
    // -------------------------------------------------------------
    console.log("Test 10: AuthController Google Endpoints Integration");
    // 1. Successful Google Login endpoint
    let controllerStatus = 0;
    let controllerBody: any = null;
    const mockRes: any = {
      status(code: number) {
        controllerStatus = code;
        return this;
      },
      json(body: any) {
        controllerBody = body;
        return this;
      },
    };

    await authController.googleAuth(
      { body: { idToken: newGoogleToken } } as any,
      mockRes
    );
    assert.strictEqual(controllerStatus, 200);
    assert.strictEqual(controllerBody.success, true);
    assert.ok(controllerBody.accessToken);
    assert.strictEqual(controllerBody.data.email, newGoogleEmail);

    // 2. Conflict response status 409 and code ACCOUNT_EXISTS_LINK_REQUIRED
    const conflictReqToken = "conflict-ctrl-token";
    mockTokenProfiles[conflictReqToken] = {
      sub: "conflict-sub-ctrl",
      email: localUserEmail, // conflicts with local user registered in Test 9
      emailVerified: true,
      name: "Conflict Test",
      picture: null,
    };

    await authController.googleAuth(
      { body: { idToken: conflictReqToken } } as any,
      mockRes
    );
    assert.strictEqual(controllerStatus, 409);
    assert.strictEqual(controllerBody.success, false);
    assert.strictEqual(controllerBody.conflict, true);
    assert.strictEqual(controllerBody.code, "ACCOUNT_EXISTS_LINK_REQUIRED");

    // 3. Link account via endpoint
    await authController.linkGoogleAccount(
      { body: { idToken: conflictReqToken, password: localUserPass } } as any,
      mockRes
    );
    assert.strictEqual(controllerStatus, 200);
    assert.strictEqual(controllerBody.success, true);
    assert.ok(controllerBody.accessToken);
    console.log("  ✓ Passed: AuthController correctly maps 200 OK, 409 Conflict, and account linking\n");

    // -------------------------------------------------------------
    // Test 11: Set Password for Google User and Enable Dual Login
    // -------------------------------------------------------------
    console.log("Test 11: Set Password for Google User and Dual-Login Support");
    const googleUser = usersDb.find((u) => u.email === newGoogleEmail)!;
    assert.ok(googleUser, "Google user from Test 1 must exist");

    // Verify user cannot log in with password initially
    let noPassCaught = false;
    try {
      await authService.login(newGoogleEmail, "SomeRandomPass123!");
    } catch (err: any) {
      noPassCaught = true;
      assert.strictEqual(err.statusCode, 401);
      assert.ok(err.message.includes("does not have a local password"));
    }
    assert.ok(noPassCaught, "Passwordless Google user must be rejected with helpful message");

    // Google user sets local password for the first time (no currentPassword needed)
    const setPassResult = await authService.setPassword(googleUser.id, {
      password: "MySecurePassword123!",
      confirmPassword: "MySecurePassword123!",
    });
    assert.strictEqual(setPassResult.hasPassword, true);
    assert.ok(setPassResult.message.includes("Password set successfully"));

    // Google user can now log in using email and the new password!
    const localLoginResult = await authService.login(newGoogleEmail, "MySecurePassword123!");
    assert.ok(localLoginResult.accessToken);
    assert.strictEqual(localLoginResult.user.email, newGoogleEmail);

    // Changing password now requires current password
    let missingCurrentCaught = false;
    try {
      await authService.setPassword(googleUser.id, {
        password: "NewPassword456!",
        confirmPassword: "NewPassword456!",
      });
    } catch (err: any) {
      missingCurrentCaught = true;
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes("Current password is required"));
    }
    assert.ok(missingCurrentCaught, "Existing password change must require current password");

    // Changing password with wrong current password is rejected
    let wrongCurrentCaught = false;
    try {
      await authService.setPassword(googleUser.id, {
        currentPassword: "WrongCurrentPassword123!",
        password: "NewPassword456!",
        confirmPassword: "NewPassword456!",
      });
    } catch (err: any) {
      wrongCurrentCaught = true;
      assert.strictEqual(err.statusCode, 401);
      assert.ok(err.message.includes("Current password is incorrect"));
    }
    assert.ok(wrongCurrentCaught, "Incorrect current password must be rejected");

    // Changing password with correct current password succeeds via controller
    let setPassCtrlStatus = 0;
    let setPassCtrlBody: any = null;
    const mockSetPassRes: any = {
      status(code: number) {
        setPassCtrlStatus = code;
        return this;
      },
      json(body: any) {
        setPassCtrlBody = body;
        return this;
      },
    };

    await authController.setPassword(
      {
        user: { id: googleUser.id, status: googleUser.status, role: googleUser.role },
        body: {
          currentPassword: "MySecurePassword123!",
          password: "NewUpdatedPassword456!",
          confirmPassword: "NewUpdatedPassword456!",
        },
      } as any,
      mockSetPassRes
    );
    assert.strictEqual(setPassCtrlStatus, 200);
    assert.strictEqual(setPassCtrlBody.success, true);
    assert.strictEqual(setPassCtrlBody.data.hasPassword, true);

    // Verify login with updated password
    const updatedLoginResult = await authService.login(newGoogleEmail, "NewUpdatedPassword456!");
    assert.ok(updatedLoginResult.accessToken);
    console.log("  ✓ Passed: Google user successfully sets password and logs in via both Google and email/password\n");

    console.log("All 11 Google Authentication & Architecture Tests Passed Successfully! 🚀\n");
  } finally {
    AppDataSource.getRepository = originalGetRepository;
    AppDataSource.transaction = originalTransaction;
    googleAuthService.verifyToken = originalVerifyToken;
    (emailService as any).sendWelcomeEmail = originalSendWelcomeEmail;
  }
}

if (require.main === module) {
  runGoogleAuthTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
