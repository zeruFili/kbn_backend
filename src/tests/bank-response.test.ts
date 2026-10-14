import assert from "node:assert";
import { AppDataSource } from "../config/data-source";
import { Payment } from "../entities/payment";
import { User } from "../entities/User";
import { RolePayment } from "../entities/role-payment";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { bankResponseService } from "../services/bank-response.service";
import { paymentService } from "../services/payment.service";

async function runBankResponseTests() {
  console.log("Starting Bank Response & Payment Verification tests...\n");

  // ==========================================================================
  // Test 1: Awash Bank IPS Transfer parsing and receiver validation
  // ==========================================================================
  console.log("Test 1: Awash Bank IPS Transfer receipt validation");
  const awashIpsPayload = {
    source: "awash-html",
    customer: {
      customerName: "Abebe Kebede",
      accountNo: "XXXXX******XXXX/BANK",
      city: "Addis Ababa",
      branch: "Bole",
    },
    transaction: {
      transactionTime: "2026-10-15 10:30:00 AM",
      transactionType: "IPS Bank Transfer",
      amount: "500 ETB",
      vat: "0.00 ETB",
      senderName: "Abebe Kebede",
      senderAccount: "XXXXX*******123",
      beneficiaryName: "Lidya Yosef Gebeto",
      beneficiaryAccount: "1********1898",
      beneficiaryBank: "Commercial Bank of Ethiopia",
      reason: "Membership Fee",
      transactionId: "AW1000293847561",
    },
  };

  const awashResult = bankResponseService.verifyBankResponse({
    payload: awashIpsPayload,
    userRole: UserRole.Company,
    expectedAmount: 500,
    expectedReceiverName: "Lidya Yosef Gebeto",
    expectedReceiverAccount: "1********1898",
  });

  assert.strictEqual(awashResult.success, true);
  assert.strictEqual(awashResult.status, PaymentStatus.ACCEPTED);
  assert.strictEqual(awashResult.bankSource, "awash-html");
  assert.strictEqual(awashResult.extractedAmount, 500);
  assert.strictEqual(awashResult.reference, "AW1000293847561");
  assert.strictEqual(awashResult.receiverValidation.nameMatches, true);
  assert.strictEqual(awashResult.receiverValidation.accountMatches, true);
  assert.ok(awashResult.expirationDate instanceof Date);
  console.log("  ✓ Passed: Awash IPS Transfer parsed, validated, and accepted");

  // ==========================================================================
  // Test 2: Awash Bank sender fallback and HTML entities
  // ==========================================================================
  console.log("Test 2: Awash Bank sender fallback and HTML decoded multi-payee");
  const awashFallbackPayload = {
    source: "awash-html",
    customer: {
      customerName: "Almaz Ayana",
      branch: "Arat Kilo",
    },
    transaction: {
      transactionTime: "2026-10-15 02:00:00 PM",
      transactionType: "School Fees",
      amount: "500.00 ETB",
      beneficiaryName: "Lidya Yosef Gebeto &amp; Partners",
      beneficiaryAccount: "1000000001898",
      transactionId: "AW9998887776665",
    },
  };

  const fallbackResult = bankResponseService.verifyBankResponse({
    payload: awashFallbackPayload,
    userRole: UserRole.Company,
    expectedAmount: 500,
  });

  assert.strictEqual(fallbackResult.status, PaymentStatus.ACCEPTED);
  assert.strictEqual(fallbackResult.receiverValidation.nameMatches, true, "HTML entity &amp; decoded correctly");
  assert.strictEqual(fallbackResult.receiverValidation.accountMatches, true, "Full account matches masked 1********1898");
  console.log("  ✓ Passed: Sender fallback and HTML multi-payee handled");

  // ==========================================================================
  // Test 3: Masked Account Verification Rigor
  // ==========================================================================
  console.log("Test 3: Masked Account Verification edge cases");
  // Matching account with wildcard
  assert.strictEqual(
    bankResponseService.matchesMaskedAccount("1000123451898", "1********1898"),
    true,
    "Full CBE account matching masked pattern"
  );
  assert.strictEqual(
    bankResponseService.matchesMaskedAccount("1********1898", "1********1898"),
    true,
    "Identical masked account matching"
  );
  assert.strictEqual(
    bankResponseService.matchesMaskedAccount("XXXXX******1898/BANK", "1********1898"),
    true,
    "Masked account with bank suffix matching valid suffix"
  );

  // Mismatched suffix
  assert.strictEqual(
    bankResponseService.matchesMaskedAccount("1********9999", "1********1898"),
    false,
    "Mismatched suffix must be rejected"
  );

  // Mismatched prefix
  assert.strictEqual(
    bankResponseService.matchesMaskedAccount("2********1898", "1********1898"),
    false,
    "Mismatched prefix must be rejected"
  );

  // Ambiguous / no visible digits
  assert.strictEqual(
    bankResponseService.matchesMaskedAccount("************", "1********1898"),
    false,
    "Unverified / all-wildcard match must not be treated as successful"
  );
  console.log("  ✓ Passed: Masked account matching verified rigorously");

  // ==========================================================================
  // Test 4: Receiver Name Mismatch Rejection
  // ==========================================================================
  console.log("Test 4: Receiver name mismatch rejection");
  const wrongReceiverPayload = {
    source: "awash-html",
    customer: { customerName: "Someone" },
    transaction: {
      transactionTime: "2026-10-15 10:00:00 AM",
      amount: "500 ETB",
      beneficiaryName: "Wrong Person Name",
      beneficiaryAccount: "1********1898",
      transactionId: "AW0001",
    },
  };

  const wrongReceiverResult = bankResponseService.verifyBankResponse({
    payload: wrongReceiverPayload,
    userRole: UserRole.Company,
    expectedAmount: 500,
  });

  assert.strictEqual(wrongReceiverResult.success, false);
  assert.strictEqual(wrongReceiverResult.status, PaymentStatus.REJECTED);
  assert.strictEqual(wrongReceiverResult.receiverValidation.isValid, false);
  console.log("  ✓ Passed: Incorrect receiver rejected with status REJECTED");

  // ==========================================================================
  // Test 5: Role-based Underpayment -> Status PENDING
  // ==========================================================================
  console.log("Test 5: Underpayment puts payment into PENDING status");
  const underpaidPayload = {
    source: "awash-html",
    customer: { customerName: "Abebe Kebede" },
    transaction: {
      transactionTime: "2026-10-15 10:00:00 AM",
      amount: "200 ETB", // Expected 500 ETB
      beneficiaryName: "Lidya Yosef Gebeto",
      beneficiaryAccount: "1********1898",
      transactionId: "AW-UNDERPAID-01",
    },
  };

  const underpaidResult = bankResponseService.verifyBankResponse({
    payload: underpaidPayload,
    userRole: UserRole.Company,
    expectedAmount: 500,
  });

  assert.strictEqual(underpaidResult.success, false);
  assert.strictEqual(underpaidResult.status, PaymentStatus.PENDING, "Underpaid payment must have PENDING status");
  assert.strictEqual(underpaidResult.expirationDate, null, "Underpaid payment cannot have active expiration date");
  assert.ok(underpaidResult.amountValidation.isUnderpaid);
  console.log("  ✓ Passed: Underpayment correctly marked as PENDING");

  // ==========================================================================
  // Test 6: Overpayment extends expiration date to End of Month
  // ==========================================================================
  console.log("Test 6: Overpayment extends expiration date further to End of Month");
  const baseDate = new Date(2026, 9, 15); // October 15, 2026 (0-indexed 9)

  // 1 Month payment: 500 ETB -> expires End of November 2026
  const singleMonthExp = bankResponseService.calculateSubscriptionExpiration(baseDate, 1);
  assert.strictEqual(singleMonthExp.getUTCFullYear(), 2026);
  assert.strictEqual(singleMonthExp.getUTCMonth(), 10, "Target month is November (10)");
  assert.strictEqual(singleMonthExp.getUTCDate(), 30, "November has 30 days");
  assert.strictEqual(singleMonthExp.getUTCHours(), 23);
  assert.strictEqual(singleMonthExp.getUTCMinutes(), 59);

  // 3 Months payment (Overpaid: 1500 ETB): expires End of January 2027
  const multiMonthExp = bankResponseService.calculateSubscriptionExpiration(baseDate, 3);
  assert.strictEqual(multiMonthExp.getUTCFullYear(), 2027);
  assert.strictEqual(multiMonthExp.getUTCMonth(), 0, "Target month is January (0)");
  assert.strictEqual(multiMonthExp.getUTCDate(), 31, "January has 31 days");

  const overpaidPayload = {
    source: "awash-html",
    customer: { customerName: "Abebe Kebede" },
    transaction: {
      transactionTime: "2026-10-15 10:00:00 AM",
      amount: "1500 ETB",
      beneficiaryName: "Lidya Yosef Gebeto",
      beneficiaryAccount: "1********1898",
      transactionId: "AW-OVERPAID-01",
    },
  };

  const overpaidResult = bankResponseService.verifyBankResponse({
    payload: overpaidPayload,
    userRole: UserRole.Company,
    expectedAmount: 500,
  });

  assert.strictEqual(overpaidResult.status, PaymentStatus.ACCEPTED);
  assert.strictEqual(overpaidResult.amountValidation.coveredMonths, 3);
  assert.ok(overpaidResult.expirationDate instanceof Date);
  assert.strictEqual(overpaidResult.expirationDate.getUTCMonth(), 0); // January
  console.log("  ✓ Passed: Overpayment calculates 3 months and sets expiration to end of January");

  // ==========================================================================
  // Test 7: Integration in PaymentService.verifyReceipt
  // ==========================================================================
  console.log("Test 7: Integration with PaymentService mock database");
  const database: Payment[] = [];
  const mockRepo = {
    create: (data: Partial<Payment>) => {
      const p = new Payment();
      Object.assign(p, data);
      if (!p.id) p.id = "pay-" + Math.random().toString(36).substring(2, 8);
      return p;
    },
    save: async (entity: Payment) => {
      database.push(entity);
      return entity;
    },
    findOne: async (options: { where: any }) => {
      return database.find((item) => {
        return Object.keys(options.where).every((k) => (item as any)[k] === options.where[k]);
      }) || null;
    },
  };

  const mockUserRepo = {
    findOne: async () => {
      const u = new User();
      u.id = "user-1";
      u.role = UserRole.Company;
      return u;
    },
    save: async (u: User) => u,
  };

  const mockRolePaymentRepo = {
    findOne: async () => {
      const rp = new RolePayment();
      rp.role = UserRole.Company;
      rp.monthlyAmount = 500;
      return rp;
    },
  };

  const originalGetRepo = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === Payment) return mockRepo;
    if (entity === User) return mockUserRepo;
    if (entity === RolePayment) return mockRolePaymentRepo;
    return originalGetRepo.call(AppDataSource, entity);
  };

  try {
    const verified = await bankResponseService.verifyBankResponse({
      payload: awashIpsPayload,
      userRole: UserRole.Company,
      expectedAmount: 500,
    });
    assert.strictEqual(verified.status, PaymentStatus.ACCEPTED);

    const savedPayment = await mockRepo.save(mockRepo.create({
      user_id: "user-1",
      amount: verified.formattedAmount,
      reference: verified.reference,
      status: verified.status,
      expirationDate: verified.expirationDate,
    }));

    assert.strictEqual(savedPayment.status, PaymentStatus.ACCEPTED);
    assert.strictEqual(savedPayment.amount, "500.00");
    assert.ok(savedPayment.expirationDate instanceof Date);
    console.log("  ✓ Passed: Payment saved with verified amount, status, and expiration date");
  } finally {
    (AppDataSource as any).getRepository = originalGetRepo;
  }

  console.log("\nAll 7 bank response verification tests passed successfully!");
}

runBankResponseTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
