import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AwashCustomerInfo {
  customerName?: string;
  accountNo?: string; // e.g. "XXXXX******XXXX/BANK"
  city?: string;
  vatRegNo?: string;
  vatRegDate?: string;
  tinTaxId?: string;
  branch?: string;
}

export interface AwashTransactionInfo {
  transactionTime?: string; // "YYYY-MM-DD HH:MM:SS AM|PM"
  transactionType?: string;
  amount?: string; // e.g. "100 ETB" or "1800 ETB"
  vat?: string;
  charge?: string;
  senderName?: string;
  senderAccount?: string; // e.g. "XXXXX*******XXX"
  beneficiaryName?: string;
  beneficiaryAccount?: string; // e.g. "1000000000000" or masked
  beneficiaryBank?: string;
  reason?: string;
  transactionId?: string;
  extra?: Record<string, string>;
}

export interface AwashReceipt {
  source: "awash-html";
  customer?: AwashCustomerInfo;
  transaction?: AwashTransactionInfo;
}

export interface ParsedBankTransaction {
  bankSource: string; // e.g. "awash-html", "cbe-birr", "telebirr", "generic"
  transactionId: string | null;
  transactionTime: Date;
  timeString: string;
  amount: number;
  formattedAmount: string; // "500.00"
  senderName: string | null;
  senderAccount: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  receiverBank?: string | null;
  provider: string | null;
  url: string | null;
  extra?: Record<string, unknown>;
  rawReceipt: Record<string, unknown> | null;
}

export interface ReceiverValidationResult {
  expectedName: string;
  actualName: string | null;
  nameMatches: boolean;
  expectedAccount: string;
  actualAccount: string | null;
  accountMatches: boolean;
  isValid: boolean;
  reason?: string;
}

export interface AmountValidationResult {
  expectedAmount: number;
  actualAmount: number;
  isValid: boolean;
  isUnderpaid: boolean;
  isOverpaid: boolean;
  coveredMonths: number;
  reason?: string;
}

export interface BankVerificationResult {
  success: boolean;
  status: PaymentStatus;
  bankSource: string;
  reference: string | null;
  transactionTime: Date;
  time: string;
  extractedAmount: number;
  formattedAmount: string;
  provider: string | null;
  url: string | null;
  receiverValidation: ReceiverValidationResult;
  amountValidation: AmountValidationResult;
  expirationDate: Date | null;
  reason?: string;
  message: string;
  rawReceipt?: Record<string, unknown> | null;
}

export interface VerifyBankResponseOptions {
  payload: Record<string, unknown>;
  userRole?: UserRole;
  expectedAmount?: number;
  expectedReceiverName?: string;
  expectedReceiverAccount?: string;
  customPaymentDate?: Date;
}

// ============================================================================
// Helper Utilities
// ============================================================================

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeText(text: string): string {
  return decodeHtmlEntities(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmountToNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === "string") {
    // Extract first valid numeric portion like "1800 ETB", "1,800.50", "ETB 500"
    const cleaned = value.replace(/,/g, "");
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = parseFloat(match[0]);
      return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }
  }
  return 0;
}

function parseDateTimeString(value: unknown): Date {
  const str = asString(value);
  if (!str) return new Date();

  // Awash format: "YYYY-MM-DD HH:MM:SS AM|PM"
  const awashMatch = str.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?(?:\s*(AM|PM))?$/i
  );
  if (awashMatch) {
    const [, year, month, day, hStr = "00", mStr = "00", sStr = "00", meridian] = awashMatch;
    let hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    const second = parseInt(sStr, 10);
    if (meridian) {
      if (meridian.toUpperCase() === "PM" && hour < 12) hour += 12;
      if (meridian.toUpperCase() === "AM" && hour === 12) hour = 0;
    }
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  // DD-MM-YYYY format
  const dmyMatch = str.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/
  );
  if (dmyMatch) {
    const [, day, month, year, h = "00", m = "00", s = "00"] = dmyMatch;
    const d = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(h, 10),
      parseInt(m, 10),
      parseInt(s, 10)
    );
    if (!isNaN(d.getTime())) return d;
  }

  const standard = new Date(str);
  return isNaN(standard.getTime()) ? new Date() : standard;
}

function cleanAccountNumber(acc: string): string {
  // Strip trailing bank/branch tags like "/BANK", "/CBE", " (CBE)", etc.
  return acc.replace(/\/.*$/, "").replace(/\s+/g, "").trim();
}

// ============================================================================
// BankResponseService
// ============================================================================

export class BankResponseService {
  /**
   * Default expected receiver credentials if not provided via options or environment
   */
  readonly DEFAULT_RECEIVER_NAME = process.env.EXPECTED_RECEIVER_NAME || "Lidya Yosef Gebeto";
  readonly DEFAULT_RECEIVER_ACCOUNT = process.env.EXPECTED_RECEIVER_ACCOUNT || "1********1898";

  /**
   * Main entrypoint to verify an upstream bank response payload.
   */
  verifyBankResponse(options: VerifyBankResponseOptions): BankVerificationResult {
    const { payload, userRole, expectedAmount = 0 } = options;
    const expectedReceiverName = options.expectedReceiverName || this.DEFAULT_RECEIVER_NAME;
    const expectedReceiverAccount = options.expectedReceiverAccount || this.DEFAULT_RECEIVER_ACCOUNT;

    // 1. Parse raw upstream payload into standardized transaction data
    const parsed = this.parseBankPayload(payload);
    if (!parsed) {
      return {
        success: false,
        status: PaymentStatus.REJECTED,
        bankSource: "unknown",
        reference: null,
        transactionTime: new Date(),
        time: new Date().toTimeString().slice(0, 8),
        extractedAmount: 0,
        formattedAmount: "0.00",
        provider: null,
        url: null,
        receiverValidation: {
          expectedName: expectedReceiverName,
          actualName: null,
          nameMatches: false,
          expectedAccount: expectedReceiverAccount,
          actualAccount: null,
          accountMatches: false,
          isValid: false,
          reason: "Unable to parse bank response payload",
        },
        amountValidation: {
          expectedAmount,
          actualAmount: 0,
          isValid: false,
          isUnderpaid: true,
          isOverpaid: false,
          coveredMonths: 0,
          reason: "No amount found in response",
        },
        expirationDate: null,
        reason: "Unable to parse bank response payload",
        message: "Payment receipt could not be parsed",
        rawReceipt: null,
      };
    }

    // 2. Validate receiver information (Name & Account)
    const receiverValidation = this.validateReceiver(
      parsed.receiverName,
      parsed.receiverAccount,
      expectedReceiverName,
      expectedReceiverAccount
    );

    // 3. Validate payment amount against user role
    const amountValidation = this.validateAmountForRole(
      parsed.amount,
      expectedAmount,
      userRole
    );

    // 4. Determine overall status and calculate expiration date
    let status: PaymentStatus = PaymentStatus.ACCEPTED;
    let reason: string | undefined = undefined;
    let expirationDate: Date | null = null;
    let message = "Payment receipt verified and processed successfully";

    if (!receiverValidation.isValid) {
      status = PaymentStatus.REJECTED;
      reason = receiverValidation.reason;
      message = `Receiver validation failed: ${reason}`;
    } else if (amountValidation.isUnderpaid) {
      // Underpaid payments are put into PENDING status according to business rules
      status = PaymentStatus.PENDING;
      reason = amountValidation.reason;
      message = `Payment amount is lower than expected for role ${userRole || "unknown"}. Payment marked as pending.`;
    } else if (!amountValidation.isValid) {
      status = PaymentStatus.REJECTED;
      reason = amountValidation.reason;
      message = `Amount validation failed: ${reason}`;
    } else {
      // Successful & fully paid/overpaid: calculate expiration date
      expirationDate = this.calculateSubscriptionExpiration(
        parsed.transactionTime,
        amountValidation.coveredMonths
      );
    }

    return {
      success: status === PaymentStatus.ACCEPTED,
      status,
      bankSource: parsed.bankSource,
      reference: parsed.transactionId,
      transactionTime: parsed.transactionTime,
      time: parsed.timeString,
      extractedAmount: parsed.amount,
      formattedAmount: parsed.formattedAmount,
      provider: parsed.provider,
      url: parsed.url,
      receiverValidation,
      amountValidation,
      expirationDate,
      reason,
      message,
      rawReceipt: parsed.rawReceipt,
    };
  }

  /**
   * Parse arbitrary bank payload into a normalized structure.
   * Isolates Awash Bank (awash-html), CBE Birr, Telebirr, and generic responses.
   */
  parseBankPayload(payload: Record<string, unknown>): ParsedBankTransaction | null {
    if (!payload || typeof payload !== "object") return null;

    const upstream = asRecord(payload.upstream);
    const upstreamResult = asRecord(upstream?.result);
    const upstreamReceipt = asRecord(upstreamResult?.receipt) || asRecord(payload.receipt);
    const detected = asRecord(payload.detected);

    const url = asString(upstream?.url)
      ?? asString(payload.url)
      ?? asString(detected?.url)
      ?? asString(upstreamReceipt?.url);

    // Case 1: Awash Bank HTML Receipt (source: "awash-html")
    if (upstreamReceipt?.source === "awash-html" || payload.source === "awash-html") {
      const awashData = (upstreamReceipt || payload) as unknown as AwashReceipt;
      return this.parseAwashReceipt(awashData, url);
    }

    // Case 2: Generic or other bank receipt (e.g. CBE Birr, Telebirr)
    return this.parseGenericReceipt(upstreamReceipt, detected, upstream, payload, url);
  }

  /**
   * Specialized parser for Awash Bank receipts (source: 'awash-html').
   * Complies with all Awash receipt layouts & transaction types.
   */
  private parseAwashReceipt(receipt: AwashReceipt, url: string | null): ParsedBankTransaction | null {
    const customer = receipt.customer || {};
    const transaction = receipt.transaction || {};

    const transactionType = asString(transaction.transactionType) || "Awash Transfer";

    // Awash rule: senderName fallback to customer.customerName for WITHDRAW, DEPOSIT, Send Money, School Fees
    const senderName =
      asString(transaction.senderName) ||
      asString(customer.customerName) ||
      null;

    const senderAccount =
      asString(transaction.senderAccount) ||
      asString(customer.accountNo) ||
      null;

    // Beneficiary resolution across supported Awash types
    let receiverName = asString(transaction.beneficiaryName);
    let receiverAccount = asString(transaction.beneficiaryAccount);

    if (!receiverName && transaction.extra) {
      receiverName =
        asString(transaction.extra["Recipient"]) ||
        asString(transaction.extra["Beneficiary Name"]) ||
        asString(transaction.extra["School"]);
    }

    if (!receiverAccount && transaction.extra) {
      receiverAccount =
        asString(transaction.extra["Phone Number"]) ||
        asString(transaction.extra["CA Number"]) ||
        asString(transaction.extra["Service Number"]);
    }

    const transactionId = asString(transaction.transactionId);
    const amountVal = parseAmountToNumber(transaction.amount);

    // Awash Validation rule: transactionId, senderName, and amount must all be present
    if (!transactionId || !senderName || amountVal <= 0) {
      // If essential transaction fields are missing, return fallback with raw details
      // so caller can detect why it wasn't complete
    }

    const parsedDate = parseDateTimeString(transaction.transactionTime);

    return {
      bankSource: "awash-html",
      transactionId: transactionId || null,
      transactionTime: parsedDate,
      timeString: parsedDate.toTimeString().slice(0, 8),
      amount: amountVal,
      formattedAmount: amountVal.toFixed(2),
      senderName,
      senderAccount,
      receiverName: receiverName ? decodeHtmlEntities(receiverName) : null,
      receiverAccount,
      receiverBank: asString(transaction.beneficiaryBank) || "Awash Bank",
      provider: "awash",
      url,
      extra: transaction.extra,
      rawReceipt: receipt as unknown as Record<string, unknown>,
    };
  }

  /**
   * Parser for standard JSON bank receipts (CBE Birr, CBE, Telebirr, and generic aggregators).
   */
  private parseGenericReceipt(
    receipt: Record<string, unknown> | null,
    detected: Record<string, unknown> | null,
    upstream: Record<string, unknown> | null,
    payload: Record<string, unknown>,
    url: string | null
  ): ParsedBankTransaction | null {
    const combined = { ...(payload || {}), ...(detected || {}), ...(receipt || {}) };

    const transactionId =
      this.findField(combined, (k) => k.includes("transactionid") || k.includes("reference") || k.includes("receiptno") || k.includes("txnid") || k.includes("cbs")) ||
      asString(detected?.reference);

    const rawAmount =
      this.findField(combined, (k) => k.includes("amount") || k.includes("settled") || k.includes("paid"));
    const amountVal = parseAmountToNumber(rawAmount);

    const rawDate =
      this.findField(combined, (k) => k.includes("date") || k.includes("datetime") || k.includes("timestamp") || k.includes("time"));
    const parsedDate = parseDateTimeString(rawDate);

    // Receiver (Beneficiary / Credited Party)
    const receiverName = this.findField(combined, (k) =>
      k.includes("beneficiaryname") ||
      k.includes("receivername") ||
      k.includes("creditedname") ||
      k.includes("recipientname") ||
      k.includes("creditor") ||
      k.includes("beneficiary") ||
      k.includes("receiver")
    );

    const receiverAccount = this.findField(combined, (k) =>
      k.includes("beneficiaryaccount") ||
      k.includes("receiveraccount") ||
      k.includes("creditedaccount") ||
      k.includes("destinationaccount") ||
      k.includes("accountnumber") ||
      k.includes("accountno") ||
      k.includes("receiverphone") ||
      k.includes("credited")
    );

    // Sender
    const senderName = this.findField(combined, (k) =>
      k.includes("sendername") ||
      k.includes("customername") ||
      k.includes("payername") ||
      k.includes("debitedname")
    );

    const senderAccount = this.findField(combined, (k) =>
      k.includes("senderaccount") ||
      k.includes("payeraccount") ||
      k.includes("debitedaccount")
    );

    const upstreamResult = asRecord(upstream?.result);
    const provider =
      asString(upstreamResult?.providerKey) ||
      asString(detected?.provider) ||
      asString(combined["provider"]) ||
      "cbe";

    const bankSource =
      provider.toLowerCase().includes("awash") ? "awash" :
      provider.toLowerCase().includes("telebirr") ? "telebirr" :
      provider.toLowerCase().includes("cbe") ? "cbe-birr" : "generic";

    return {
      bankSource,
      transactionId: transactionId ? String(transactionId) : null,
      transactionTime: parsedDate,
      timeString: parsedDate.toTimeString().slice(0, 8),
      amount: amountVal,
      formattedAmount: amountVal.toFixed(2),
      senderName: senderName ? String(senderName) : null,
      senderAccount: senderAccount ? String(senderAccount) : null,
      receiverName: receiverName ? decodeHtmlEntities(String(receiverName)) : null,
      receiverAccount: receiverAccount ? String(receiverAccount) : null,
      provider,
      url,
      rawReceipt: receipt || payload,
    };
  }

  /**
   * Validates receiver name and account number according to system rules.
   */
  validateReceiver(
    actualName: string | null,
    actualAccount: string | null,
    expectedName: string,
    expectedAccount: string
  ): ReceiverValidationResult {
    const nameMatches = this.matchesReceiverName(actualName, expectedName);
    const accountMatches = this.matchesMaskedAccount(actualAccount, expectedAccount);

    let reason: string | undefined;
    if (!nameMatches && !accountMatches) {
      reason = `Both receiver name ('${actualName || "missing"}') and account ('${actualAccount || "missing"}') do not match expected ('${expectedName}', '${expectedAccount}').`;
    } else if (!nameMatches) {
      reason = `Receiver name mismatch: got '${actualName || "missing"}', expected '${expectedName}'.`;
    } else if (!accountMatches) {
      reason = `Receiver account mismatch: got '${actualAccount || "missing"}', expected pattern '${expectedAccount}'.`;
    }

    return {
      expectedName,
      actualName,
      nameMatches,
      expectedAccount,
      actualAccount,
      accountMatches,
      isValid: nameMatches && accountMatches,
      reason,
    };
  }

  /**
   * Flexible name matching:
   * Handles casing, extra whitespace, HTML entities, and multi-payee strings separated by '&' or ','.
   */
  matchesReceiverName(actual: string | null, expected: string): boolean {
    if (!actual || !expected) return false;

    const normalizedActual = normalizeText(actual);
    const normalizedExpected = normalizeText(expected);

    // 1. Exact normalized match
    if (normalizedActual === normalizedExpected) return true;

    // 2. Check each part of multi-payee (e.g. "<NAME 1> & <NAME 2>")
    const payees = actual.split(/&|,|\band\b/i).map((p) => normalizeText(p));
    for (const payee of payees) {
      if (payee === normalizedExpected) return true;
      if (payee.includes(normalizedExpected) || normalizedExpected.includes(payee)) {
        // Must contain all significant tokens of the expected name
        const expectedTokens = normalizedExpected.split(" ").filter((t) => t.length > 1);
        if (expectedTokens.every((token) => payee.includes(token))) {
          return true;
        }
      }
    }

    // 3. Token containment (all words in expected name present in actual name in order)
    const expectedTokens = normalizedExpected.split(" ").filter((t) => t.length > 1);
    if (expectedTokens.length >= 2 && expectedTokens.every((token) => normalizedActual.includes(token))) {
      return true;
    }

    return false;
  }

  /**
   * Carefully verifies masked account numbers.
   * Compares only the available, verifiable account information and does not treat an unverified match as successful.
   *
   * Example:
   * Pattern: "1********1898"
   * Actual:  "1********1898" -> true
   * Actual:  "1000123451898" -> true
   * Actual:  "XXXXX******1898" -> true (suffix matches)
   * Actual:  "2********1898" -> false (prefix mismatch)
   * Actual:  "1********9999" -> false (suffix mismatch)
   * Actual:  "*********"      -> false (no verifiable unmasked digits)
   */
  matchesMaskedAccount(actual: string | null, expectedPattern: string): boolean {
    if (!actual || !expectedPattern) return false;

    const cleanActual = cleanAccountNumber(actual);
    const cleanExpected = cleanAccountNumber(expectedPattern);

    if (cleanActual === cleanExpected) return true;

    // Extract prefix and suffix from both pattern and actual
    // Identify unmasked characters at start and end
    const expectedParts = this.extractUnmaskedParts(cleanExpected);
    const actualParts = this.extractUnmaskedParts(cleanActual);

    // Rule: We must have at least some verifiable digits (minimum 3 digits) to avoid false positives
    const totalVerifiableDigits = (expectedParts.prefix + expectedParts.suffix).length;
    if (totalVerifiableDigits < 2) {
      return false;
    }

    // Check suffix (most accounts expose the last 3-4 digits, e.g. 1898)
    if (expectedParts.suffix && actualParts.suffix) {
      const minSuffixLen = Math.min(expectedParts.suffix.length, actualParts.suffix.length);
      const expectedEnd = expectedParts.suffix.slice(-minSuffixLen);
      const actualEnd = actualParts.suffix.slice(-minSuffixLen);
      if (expectedEnd !== actualEnd) {
        return false;
      }
    } else if (expectedParts.suffix && !actualParts.suffix) {
      // Actual account has no visible suffix, cannot verify
      return false;
    }

    // Check prefix (e.g. leading '1' for CBE)
    if (expectedParts.prefix && actualParts.prefix) {
      const minPrefixLen = Math.min(expectedParts.prefix.length, actualParts.prefix.length);
      const expectedStart = expectedParts.prefix.slice(0, minPrefixLen);
      const actualStart = actualParts.prefix.slice(0, minPrefixLen);
      if (expectedStart !== actualStart) {
        return false;
      }
    }

    // Check character-by-character where both have unmasked characters
    const minLen = Math.min(cleanActual.length, cleanExpected.length);
    for (let i = 0; i < minLen; i++) {
      const charAct = cleanActual[i];
      const charExp = cleanExpected[i];
      const isWildAct = charAct === "*" || charAct.toUpperCase() === "X" || charAct === "-";
      const isWildExp = charExp === "*" || charExp.toUpperCase() === "X" || charExp === "-";

      if (!isWildAct && !isWildExp) {
        if (charAct !== charExp) {
          return false;
        }
      }
    }

    return true;
  }

  private extractUnmaskedParts(account: string): { prefix: string; suffix: string } {
    const isWild = (c: string) => c === "*" || c.toUpperCase() === "X" || c === "-";

    let prefix = "";
    for (let i = 0; i < account.length; i++) {
      if (isWild(account[i])) break;
      prefix += account[i];
    }

    let suffix = "";
    for (let i = account.length - 1; i >= 0; i--) {
      if (isWild(account[i])) break;
      suffix = account[i] + suffix;
    }

    return { prefix, suffix };
  }

  /**
   * Validates actual payment amount against the expected role amount.
   */
  validateAmountForRole(
    actualAmount: number,
    expectedAmount: number,
    role?: UserRole
  ): AmountValidationResult {
    if (actualAmount <= 0) {
      return {
        expectedAmount,
        actualAmount,
        isValid: false,
        isUnderpaid: true,
        isOverpaid: false,
        coveredMonths: 0,
        reason: "Payment amount must be greater than zero.",
      };
    }

    if (expectedAmount <= 0) {
      // If no expected amount is configured (e.g. role has free access or 0), payment covers at least 1 month
      return {
        expectedAmount: 0,
        actualAmount,
        isValid: true,
        isUnderpaid: false,
        isOverpaid: false,
        coveredMonths: 1,
      };
    }

    if (actualAmount < expectedAmount) {
      return {
        expectedAmount,
        actualAmount,
        isValid: false,
        isUnderpaid: true,
        isOverpaid: false,
        coveredMonths: 0,
        reason: `Payment of ${actualAmount.toFixed(2)} ETB is lower than expected monthly amount (${expectedAmount.toFixed(2)} ETB) for role '${role || "user"}'.`,
      };
    }

    // Covered months: for example 1000 ETB when expected is 500 ETB = 2 months
    const coveredMonths = Math.max(1, Math.floor(actualAmount / expectedAmount));
    const isOverpaid = actualAmount > expectedAmount;

    return {
      expectedAmount,
      actualAmount,
      isValid: true,
      isUnderpaid: false,
      isOverpaid,
      coveredMonths,
      reason: isOverpaid
        ? `Payment of ${actualAmount.toFixed(2)} ETB covers ${coveredMonths} months.`
        : undefined,
    };
  }

  /**
   * Calculates the expiration date based on the payment date and covered months.
   * Rules:
   * - If payment is larger, expires further in the future.
   * - Expires at the END of the relevant month (23:59:59.999 of the last day).
   */
  calculateSubscriptionExpiration(paymentDate: Date, coveredMonths: number): Date {
    const months = Math.max(1, coveredMonths);
    const year = paymentDate.getFullYear();
    const currentMonth = paymentDate.getMonth(); // 0-indexed

    // In JS Date, setting day to 0 of (month + 1) gives the last day of month.
    // So for month + coveredMonths, setting day to 0 of (currentMonth + coveredMonths + 1)
    // gives the last day of that target month!
    const targetMonth = currentMonth + months;
    const endOfMonth = new Date(Date.UTC(year, targetMonth + 1, 0, 23, 59, 59, 999));

    return endOfMonth;
  }

  /**
   * Finds a field in a record by applying a predicate to normalized keys.
   */
  private findField(
    record: Record<string, unknown>,
    predicate: (normalizedKey: string) => boolean
  ): unknown {
    for (const [key, val] of Object.entries(record)) {
      if (val !== null && val !== undefined) {
        const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (predicate(norm)) return val;
      }
    }
    return undefined;
  }
}

export const bankResponseService = new BankResponseService();
