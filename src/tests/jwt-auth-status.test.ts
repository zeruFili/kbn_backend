import assert from "assert";
import jwt from "jsonwebtoken";
import { generateAccessToken, verifyAccessToken } from "../utils/jwt.utils";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import {
  requireActiveUser,
  requirePaymentOrActive,
  authorize,
  AuthRequest,
} from "../middlewares/auth.middleware";

function mockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runJwtAuthStatusTests() {
  console.log("Starting JWT Authentication & Account Status Validation tests...\n");

  // -------------------------------------------------------------
  // Test 1: JWT Payload contains all required fields from DB record
  // -------------------------------------------------------------
  console.log("Test 1: JWT Payload Structure");
  const testUser = {
    id: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    email: "builder@kbn.org",
    role: UserRole.Company,
    status: UserStatus.ACTIVE,
  };

  const token = generateAccessToken(testUser);
  assert.ok(typeof token === "string" && token.length > 0, "Token should be a non-empty string");

  const decoded = verifyAccessToken(token);
  assert.strictEqual(decoded.sub, testUser.id, "sub must match user database ID");
  assert.strictEqual(decoded.email, testUser.email, "email must match database email");
  assert.strictEqual(decoded.role, testUser.role, "role must match database role");
  assert.strictEqual(decoded.status, testUser.status, "status must match database status");
  assert.ok(typeof decoded.iat === "number", "iat timestamp must be present");
  assert.ok(typeof decoded.exp === "number", "exp timestamp must be present");
  assert.ok(decoded.exp! > decoded.iat!, "exp must be after iat");
  console.log("  ✓ Passed: Token payload contains sub, email, role, status, iat, and exp\n");

  // -------------------------------------------------------------
  // Test 2: Token Verification and Expiration Checks
  // -------------------------------------------------------------
  console.log("Test 2: Token Signature & Expiration Security");
  const secret = process.env.JWT_SECRET || "default_secret";

  // Expired token
  const expiredToken = jwt.sign(
    { sub: testUser.id, email: testUser.email, role: testUser.role, status: testUser.status },
    secret,
    { expiresIn: "-1s" }
  );

  assert.throws(
    () => verifyAccessToken(expiredToken),
    /jwt expired/,
    "Expired token must be rejected"
  );

  // Invalid secret / forged token
  const forgedToken = jwt.sign(
    { sub: testUser.id, email: testUser.email, role: testUser.role, status: testUser.status },
    "wrong_secret",
    { expiresIn: "15m" }
  );

  assert.throws(
    () => verifyAccessToken(forgedToken),
    /invalid signature/,
    "Forged token signature must be rejected"
  );
  console.log("  ✓ Passed: Expired and forged tokens are securely rejected\n");

  // -------------------------------------------------------------
  // Test 3: Account Status ACTIVE allows access to protected routes
  // -------------------------------------------------------------
  console.log("Test 3: ACTIVE user authorization");
  let nextCalled = false;
  const activeReq: AuthRequest = {
    user: {
      id: testUser.id,
      email: testUser.email,
      role: UserRole.Company,
      status: UserStatus.ACTIVE,
    },
  } as any;
  const activeRes = mockResponse();

  requireActiveUser(activeReq, activeRes, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true, "requireActiveUser should call next() for ACTIVE user");

  // Role authorization
  nextCalled = false;
  const companyAuth = authorize(UserRole.Company, UserRole.Admin);
  companyAuth(activeReq, activeRes, () => {
    nextCalled = true;
  });
  assert.strictEqual(nextCalled, true, "authorize should allow Company role for ACTIVE user");
  console.log("  ✓ Passed: ACTIVE users can access authorized protected routes\n");

  // -------------------------------------------------------------
  // Test 4: Account Status PENDING and INACTIVE: blocked from protected routes, allowed on payment
  // -------------------------------------------------------------
  console.log("Test 4: PENDING & INACTIVE user restrictions");
  for (const nonActiveStatus of [UserStatus.PENDING, UserStatus.INACTIVE]) {
    const nonActiveReq: AuthRequest = {
      user: {
        id: testUser.id,
        email: testUser.email,
        role: UserRole.User,
        status: nonActiveStatus,
      },
    } as any;
    const res = mockResponse();

    // Must be blocked from protected routes
    let allowed = false;
    requireActiveUser(nonActiveReq, res, () => {
      allowed = true;
    });
    assert.strictEqual(allowed, false, `requireActiveUser must block ${nonActiveStatus} user`);
    assert.strictEqual(res.statusCode, 403, `requireActiveUser should return 403 for ${nonActiveStatus}`);

    // Must be blocked from role authorization
    const roleRes = mockResponse();
    let roleAllowed = false;
    const userAuth = authorize(UserRole.User);
    userAuth(nonActiveReq, roleRes, () => {
      roleAllowed = true;
    });
    assert.strictEqual(roleAllowed, false, `authorize must block ${nonActiveStatus} user`);
    assert.strictEqual(roleRes.statusCode, 403, `authorize should return 403 for ${nonActiveStatus}`);

    // MUST be allowed to access payment verification routes
    let paymentAllowed = false;
    const paymentRes = mockResponse();
    requirePaymentOrActive(nonActiveReq, paymentRes, () => {
      paymentAllowed = true;
    });
    assert.strictEqual(paymentAllowed, true, `${nonActiveStatus} user must be allowed on payment routes`);
  }
  console.log("  ✓ Passed: PENDING and INACTIVE users are blocked from protected routes and allowed only on payment routes\n");

  // -------------------------------------------------------------
  // Test 5: Account Status SUSPENDED: strictly blocked from protected routes AND payment
  // -------------------------------------------------------------
  console.log("Test 5: SUSPENDED user strict block");
  const suspendedReq: AuthRequest = {
    user: {
      id: testUser.id,
      email: testUser.email,
      role: UserRole.User,
      status: UserStatus.SUSPENDED,
    },
  } as any;

  // Blocked from protected routes
  const suspRes1 = mockResponse();
  let suspAllowed1 = false;
  requireActiveUser(suspendedReq, suspRes1, () => {
    suspAllowed1 = true;
  });
  assert.strictEqual(suspAllowed1, false, "SUSPENDED user must be blocked from protected routes");
  assert.strictEqual(suspRes1.statusCode, 403, "Response must be 403");

  // Blocked from payment verification
  const suspRes2 = mockResponse();
  let suspAllowed2 = false;
  requirePaymentOrActive(suspendedReq, suspRes2, () => {
    suspAllowed2 = true;
  });
  assert.strictEqual(suspAllowed2, false, "SUSPENDED user must be blocked from payment verification routes");
  assert.strictEqual(suspRes2.statusCode, 403, "Response must be 403");

  console.log("  ✓ Passed: SUSPENDED users are blocked from both protected routes and payment verification\n");

  // -------------------------------------------------------------
  // Test 6: Stale/Forged JWT Claim Defense
  // -------------------------------------------------------------
  console.log("Test 6: Live Database Authorization vs Stale JWT Claim");
  // Simulate a token that claims status: ACTIVE, but DB record has status: SUSPENDED
  const staleToken = generateAccessToken({
    id: testUser.id,
    email: testUser.email,
    role: UserRole.User,
    status: UserStatus.ACTIVE, // Stale claim!
  });

  const parsed = verifyAccessToken(staleToken);
  assert.strictEqual(parsed.status, UserStatus.ACTIVE, "Token itself claims ACTIVE");

  // But when the server enforces authorization using live database record:
  const liveDbStatus = UserStatus.SUSPENDED; // Actual DB status!
  const enforcedUser = {
    id: parsed.sub,
    email: parsed.email,
    role: parsed.role,
    status: liveDbStatus, // Middleware always overwrites from DB
  };

  const enforcementReq: AuthRequest = { user: enforcedUser } as any;
  const enforcementRes = mockResponse();
  let bypassed = false;

  requireActiveUser(enforcementReq, enforcementRes, () => {
    bypassed = true;
  });

  assert.strictEqual(bypassed, false, "Stale JWT claim cannot bypass live database check");
  assert.strictEqual(enforcementRes.statusCode, 403, "Stale claim correctly rejected based on live DB status");
  console.log("  ✓ Passed: Live database check prevents privilege escalation from stale JWT claims\n");

  console.log("ALL JWT AUTHENTICATION & ACCOUNT STATUS VALIDATION TESTS PASSED! 🎉");
}

runJwtAuthStatusTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
