import fs from "fs";
import https from "https";
import path from "path";
import { URL } from "url";
import { AppDataSource } from "../config/data-source";
import { Payment } from "../entities/payment";
import { User } from "../entities/User";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { AppError } from "../middlewares/error.middleware";
import { deleteFile } from "../utils/upload.utils";
import { UpdatePaymentDto } from "../validators/payment.dto";

type VerificationPayload = Record<string, unknown>;

type VerificationData = {
  url: string;
  provider: string;
  reference: string;
  date: Date;
  time: string;
  amount: string;
  expirationDate: Date | null;
};

type VerificationResponse = {
  statusCode: number;
  body: VerificationPayload | null;
};

export type VerifyPaymentResult =
  | {
    verified: true;
    duplicate: false;
    payment: Payment;
    message: string;
  }
  | {
    verified: true;
    duplicate: true;
    message: string;
    existing_payment_id: string;
  }
  | {
    verified: false;
    payment: Payment;
    message: string;
    reason: string;
  };

export interface PaymentListOptions {
  page?: number;
  limit?: number;
  date?: string;
  day?: number;
  dateFrom?: string;
  dateTo?: string;
  month?: number | string;
  year?: number;
  userId?: string;
  userName?: string;
  status?: PaymentStatus | PaymentStatus[] | string | string[];
  expired?: boolean | string;
  expirationFrom?: string;
  expirationTo?: string;
}

export interface PaginatedPayments {
  data: Payment[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const repo = () => AppDataSource.getRepository(Payment);
const userRepo = () => AppDataSource.getRepository(User);

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseDateString(value: string): string | null {
  const trimmed = value.trim();
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s].*)?$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function currentTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

function parseReceiptDate(value: unknown): Date {
  const raw = asString(value);
  if (!raw) return new Date();

  const dayFirst = raw.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/
  );
  if (dayFirst) {
    const [, day, month, year, hour = "00", minute = "00", second = "00"] = dayFirst;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeAmount(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === "string") {
    const numeric = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (numeric) return Number(numeric[0]).toFixed(2);
  }

  return "0.00";
}

function normalizedKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function findReceiptField(
  receipt: Record<string, unknown>,
  predicate: (normalizedKey: string) => boolean
): unknown {
  const entry = Object.entries(receipt).find(([key, value]) => (
    value !== null && value !== undefined && predicate(normalizedKey(key))
  ));
  return entry?.[1];
}

function findReference(receipt: Record<string, unknown>, detected: Record<string, unknown> | null): string | null {
  const receiptReference = findReceiptField(receipt, (key) => (
    key.includes("reference") ||
    key.includes("transactionid") ||
    key.includes("transactionnumber") ||
    key.includes("receiptno") ||
    key.includes("receiptnumber")
  ));

  return asString(receiptReference) ?? asString(detected?.reference);
}

function findAmount(receipt: Record<string, unknown>): unknown {
  return findReceiptField(receipt, (key) => (
    key.includes("amount") ||
    key.includes("settled") ||
    key.includes("paid")
  ));
}

function findPaymentDate(receipt: Record<string, unknown>): unknown {
  return findReceiptField(receipt, (key) => (
    key.includes("date") || key.includes("datetime") || key.includes("timestamp")
  ));
}

function findExpirationDate(
  receipt: Record<string, unknown> | null,
  detected: Record<string, unknown> | null
): Date | null {
  const sources = [receipt, detected].filter(
    (s): s is Record<string, unknown> => s !== null && s !== undefined
  );
  for (const source of sources) {
    const raw = findReceiptField(source, (key) => (
      key.includes("expiration") ||
      key.includes("expiry") ||
      key.includes("expire") ||
      key.includes("validuntil") ||
      key.includes("validto") ||
      key.includes("duedate")
    ));
    if (raw) {
      const parsed = parseReceiptDate(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

export class PaymentService {
  calculateDefaultExpirationDate(paymentDate: Date, months: number = 1): Date {
    const exp = new Date(paymentDate.getTime());
    exp.setMonth(exp.getMonth() + months);
    return exp;
  }

  isPaymentValid(payment: Payment): boolean {
    if (payment.status !== PaymentStatus.ACCEPTED) return false;
    if (!payment.expirationDate) return true;
    return new Date() <= new Date(payment.expirationDate);
  }

  isPaymentExpired(payment: Payment): boolean {
    if (!payment.expirationDate) return false;
    return new Date() > new Date(payment.expirationDate);
  }

  async getUserPaymentValidity(
    userId: string,
    requester?: { id: string; role: UserRole }
  ): Promise<{
    userId: string;
    hasPayment: boolean;
    isValid: boolean;
    isExpired: boolean;
    expirationDate: Date | null;
    daysRemaining: number;
    latestPayment: Payment | null;
  }> {
    if (requester && requester.role !== UserRole.Admin && requester.id !== userId) {
      throw new AppError(403, "Forbidden: You can only access your own payment validity information");
    }

    const latestAcceptedPayment = await repo().findOne({
      where: { user_id: userId, status: PaymentStatus.ACCEPTED },
      order: { created_at: "DESC" },
    });

    if (!latestAcceptedPayment) {
      const latestAnyPayment = await repo().findOne({
        where: { user_id: userId },
        order: { created_at: "DESC" },
      });

      return {
        userId,
        hasPayment: Boolean(latestAnyPayment),
        isValid: false,
        isExpired: false,
        expirationDate: null,
        daysRemaining: 0,
        latestPayment: latestAnyPayment || null,
      };
    }

    const now = new Date();
    const expirationDate = latestAcceptedPayment.expirationDate
      ? new Date(latestAcceptedPayment.expirationDate)
      : null;
    const isExpired = Boolean(expirationDate && now > expirationDate);
    const isValid = Boolean(!expirationDate || now <= expirationDate);

    let daysRemaining = 0;
    if (expirationDate) {
      const diffTime = expirationDate.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    return {
      userId,
      hasPayment: true,
      isValid,
      isExpired,
      expirationDate,
      daysRemaining,
      latestPayment: latestAcceptedPayment,
    };
  }

  async findById(
    id: string,
    requester?: { id: string; role: UserRole }
  ): Promise<Payment> {
    const payment = await repo().findOne({
      where: { id },
      relations: ["user"],
    });
    if (!payment) throw new AppError(404, "Payment not found");

    if (requester && requester.role !== UserRole.Admin && payment.user_id !== requester.id) {
      throw new AppError(403, "Forbidden: You can only access your own payment information");
    }

    return payment;
  }

  async update(
    id: string,
    dto: UpdatePaymentDto,
    currentUser?: { id: string; role: UserRole }
  ): Promise<Payment> {
    if (currentUser && currentUser.role !== UserRole.Admin) {
      throw new AppError(403, "Forbidden: Only admins can update payment information");
    }

    const payment = await this.findById(id);

    if (dto.reference !== undefined && dto.reference !== null && dto.reference !== payment.reference) {
      const duplicate = await repo().findOne({ where: { reference: dto.reference } });
      if (duplicate && duplicate.id !== id) {
        throw new AppError(409, "Payment reference already exists");
      }
    }

    const previousImage = payment.image;
    Object.assign(payment, dto);

    if (dto.expirationDate !== undefined) {
      payment.expirationDate = dto.expirationDate;
    } else if (dto.expiration_date !== undefined) {
      payment.expirationDate = dto.expiration_date;
    }

    if (payment.status === PaymentStatus.ACCEPTED && !payment.expirationDate) {
      payment.expirationDate = this.calculateDefaultExpirationDate(payment.date || new Date());
    }

    const saved = await repo().save(payment);

    if (previousImage && previousImage !== saved.image) {
      deleteFile(previousImage);
    }

    if (saved.status === PaymentStatus.ACCEPTED) {
      await this.activateUserOnSuccessfulPayment(saved.user_id);
    }

    return saved;
  }

  async remove(
    id: string,
    currentUser?: { id: string; role: UserRole }
  ): Promise<void> {
    if (currentUser && currentUser.role !== UserRole.Admin) {
      throw new AppError(403, "Forbidden: Only admins can delete payment information");
    }

    const payment = await this.findById(id);
    await repo().delete(id);
    if (payment.image) {
      deleteFile(payment.image);
    }
  }

  async findAll(
    userId: string,
    role: UserRole,
    options: PaymentListOptions = {}
  ): Promise<PaginatedPayments> {
    const page = this.parsePositiveInteger(options.page, 1);
    const limit = Math.min(this.parsePositiveInteger(options.limit, 20), 100);
    const parsedDayParam = this.parseDay(options.day);
    const { exactDate, day } = this.parseExactDateOrDay(options.date, parsedDayParam);
    const dateFrom = this.parseDateFilter(options.dateFrom, "date_from");
    const dateTo = this.parseDateFilter(options.dateTo, "date_to");
    const expirationFrom = this.parseDateFilter(options.expirationFrom, "expiration_from");
    const expirationTo = this.parseDateFilter(options.expirationTo, "expiration_to");
    const month = this.parseMonth(options.month);
    const year = this.parseYear(options.year);
    const statuses = this.parseStatus(options.status);

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new AppError(400, "date_from must be before or equal to date_to");
    }

    if (expirationFrom && expirationTo && expirationFrom > expirationTo) {
      throw new AppError(400, "expiration_from must be before or equal to expiration_to");
    }

    const query = repo().createQueryBuilder("payment")
      .leftJoinAndSelect("payment.user", "user");

    if (role !== UserRole.Admin) {
      if (options.userId && options.userId.trim() !== userId) {
        throw new AppError(403, "Forbidden: You can only access your own payment information");
      }
      query.andWhere("payment.user_id = :userId", { userId });
    } else {
      if (options.userId?.trim()) {
        query.andWhere("payment.user_id = :filterUserId", {
          filterUserId: options.userId.trim(),
        });
      }
      if (options.userName?.trim()) {
        query.andWhere("user.full_name ILIKE :userName", {
          userName: `%${options.userName.trim()}%`,
        });
      }
    }

    if (statuses && statuses.length > 0) {
      if (statuses.length === 1) {
        query.andWhere("payment.status = :status", { status: statuses[0] });
      } else {
        query.andWhere("payment.status IN (:...statuses)", { statuses });
      }
    }

    if (exactDate) {
      query.andWhere("DATE(payment.created_at) = DATE(:exactDate)", { exactDate });
    }

    if (day !== undefined) {
      query.andWhere("EXTRACT(DAY FROM payment.created_at) = :day", { day });
    }

    if (month !== undefined) {
      query.andWhere("EXTRACT(MONTH FROM payment.created_at) = :month", { month });
    }

    if (year !== undefined) {
      query.andWhere("EXTRACT(YEAR FROM payment.created_at) = :year", { year });
    }

    if (dateFrom) {
      query.andWhere("payment.created_at >= :dateFrom", { dateFrom });
    }

    if (dateTo) {
      const dateToExclusive = new Date(dateTo);
      dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1);
      query.andWhere("payment.created_at < :dateToExclusive", { dateToExclusive });
    }

    if (expirationFrom) {
      query.andWhere("payment.expiration_date >= :expirationFrom", { expirationFrom });
    }

    if (expirationTo) {
      const expirationToExclusive = new Date(expirationTo);
      expirationToExclusive.setUTCDate(expirationToExclusive.getUTCDate() + 1);
      query.andWhere("payment.expiration_date < :expirationToExclusive", { expirationToExclusive });
    }

    if (options.expired !== undefined) {
      const isExpiredFilter = options.expired === true || options.expired === "true";
      if (isExpiredFilter) {
        query.andWhere("payment.expiration_date IS NOT NULL AND payment.expiration_date < NOW()");
      } else {
        query.andWhere("(payment.expiration_date IS NULL OR payment.expiration_date >= NOW())");
      }
    }

    const [data, total] = await query
      .orderBy("payment.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async verifyReceipt(userId: string, imagePath: string): Promise<VerifyPaymentResult> {
    const base64Image = this.readImageAsBase64(imagePath);

    let payload: VerificationPayload | null = null;
    let statusCode = 500;
    let reason = "Receipt could not be verified";

    try {
      const response = await this.callVerificationApi(base64Image);
      console.log("this is the response from the site .................." , response) ;
      statusCode = response.statusCode;
      if (response.body) {
        payload = response.body;
      } else {
        reason = "Receipt verification service returned an invalid response";
      }
    } catch (error) {
      reason = error instanceof Error ? error.message : "Receipt verification request failed";
    }

    const upstream = payload ? asRecord(payload.upstream) : null;
    const upstreamResult = asRecord(upstream?.result);
    const verified = Boolean(
      statusCode < 400 &&
      upstream?.attempted === true &&
      upstreamResult?.ok === true
    );
    const verifiedData = verified && payload ? this.extractVerifiedData(payload) : null;
    if (!verified && payload) {
      const upstreamReason = asString(upstream?.reason);
      if (upstreamReason) {
        reason = upstreamReason;
      }
    }
    if (verifiedData) {
      const duplicateByUrl = await repo().findOne({ where: { url: verifiedData.url } });
      if (duplicateByUrl) {
        deleteFile(imagePath);
        return {
          verified: true,
          duplicate: true,
          message: "Duplicate image: payment receipt URL already exists",
          existing_payment_id: duplicateByUrl.id,
        };
      }

      const duplicateByReference = await repo().findOne({ where: { reference: verifiedData.reference } });
      if (duplicateByReference) {
        deleteFile(imagePath);
        return {
          verified: true,
          duplicate: true,
          message: "Duplicate image: payment reference already exists",
          existing_payment_id: duplicateByReference.id,
        };
      }

      const payment = await repo().save(repo().create({
        user_id: userId,
        image: imagePath,
        url: verifiedData.url,
        provider: verifiedData.provider,
        reference: verifiedData.reference,
        status: PaymentStatus.ACCEPTED,
        date: verifiedData.date,
        time: verifiedData.time,
        amount: verifiedData.amount,
        expirationDate: verifiedData.expirationDate,
      }));

      await this.activateUserOnSuccessfulPayment(userId);

      return {
        verified: true,
        duplicate: false,
        payment,
        message: "Payment receipt verified successfully",
      };
    }

    const payment = await repo().save(repo().create({
      user_id: userId,
      image: imagePath,
      url: null,
      provider: null,
      reference: null,
      status: PaymentStatus.PENDING,
      date: new Date(),
      time: currentTime(),
      amount: "0.00",
      expirationDate: null,
    }));

    return {
      verified: false,
      payment,
      message: "Payment verification was unsuccessful",
      reason,
    };
  }

  private readImageAsBase64(imagePath: string): string {
    const cleanPath = imagePath.replace(/^\/+/, "");
    const fullPath = path.resolve(process.cwd(), cleanPath);
    const fileBuffer = fs.readFileSync(fullPath);
    return fileBuffer.toString("base64");
  }

  private parsePositiveInteger(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 1) {
      throw new AppError(400, "page and limit must be positive integers");
    }
    return value;
  }

  private parseDateFilter(value: string | undefined, fieldName: string): Date | undefined {
    if (!value) return undefined;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppError(400, `${fieldName} must be a valid date`);
    }
    return parsed;
  }

  private parseDay(value: number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      throw new AppError(400, "day must be an integer between 1 and 31");
    }
    return value;
  }

  private parseExactDateOrDay(
    dateValue: string | undefined,
    existingDay: number | undefined
  ): { exactDate?: string; day?: number } {
    if (!dateValue || !dateValue.trim()) {
      return { day: existingDay };
    }

    const trimmed = dateValue.trim();

    if (/^\d{1,2}$/.test(trimmed)) {
      const dayNum = Number(trimmed);
      if (dayNum >= 1 && dayNum <= 31) {
        if (existingDay !== undefined && existingDay !== dayNum) {
          throw new AppError(400, "Conflicting day values provided in date and day parameters");
        }
        return { day: dayNum };
      }
      throw new AppError(400, "date as day of month must be between 1 and 31");
    }

    const formatted = parseDateString(trimmed);
    if (!formatted) {
      throw new AppError(400, "date must be a valid date (e.g. YYYY-MM-DD) or day number (1-31)");
    }

    return { exactDate: formatted, day: existingDay };
  }

  private parseMonth(value: number | string | undefined): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;

    if (typeof value === "number") {
      if (!Number.isInteger(value) || value < 1 || value > 12) {
        throw new AppError(400, "month must be an integer between 1 and 12");
      }
      return value;
    }

    const str = String(value).trim().toLowerCase();
    const num = Number(str);
    if (!Number.isNaN(num) && Number.isInteger(num)) {
      if (num < 1 || num > 12) {
        throw new AppError(400, "month must be an integer between 1 and 12");
      }
      return num;
    }

    if (MONTH_NAMES[str] !== undefined) {
      return MONTH_NAMES[str];
    }

    throw new AppError(400, "month must be an integer between 1 and 12 or a valid month name");
  }

  private parseYear(value: number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (!Number.isInteger(value) || value < 1 || value > 9999) {
      throw new AppError(400, "year must be a valid integer");
    }
    return value;
  }

  private normalizeStatusValue(raw: string): PaymentStatus | null {
    const clean = raw.trim().toLowerCase();
    if (clean === "accepted" || clean === "accpeted" || clean === "accept") {
      return PaymentStatus.ACCEPTED;
    }
    if (clean === "rejected" || clean === "reject" || clean === "rejection") {
      return PaymentStatus.REJECTED;
    }
    if (clean === "pending" || clean === "pend") {
      return PaymentStatus.PENDING;
    }
    return null;
  }

  private parseStatus(
    value: PaymentStatus | PaymentStatus[] | string | string[] | undefined
  ): PaymentStatus[] | undefined {
    if (value === undefined || value === null || value === "") return undefined;

    let rawList: string[] = [];
    if (Array.isArray(value)) {
      rawList = value.map(String);
    } else if (typeof value === "string") {
      rawList = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      rawList = [String(value)];
    }

    if (rawList.length === 0) return undefined;

    const parsedStatuses: PaymentStatus[] = [];
    for (const raw of rawList) {
      const clean = raw.trim().toLowerCase();
      if (clean === "all") continue;
      const normalized = this.normalizeStatusValue(raw);
      if (!normalized) {
        throw new AppError(
          400,
          `status must be accepted, rejected, or pending (received "${raw}")`
        );
      }
      if (!parsedStatuses.includes(normalized)) {
        parsedStatuses.push(normalized);
      }
    }

    return parsedStatuses.length > 0 ? parsedStatuses : undefined;
  }

  private extractVerifiedData(payload: VerificationPayload): VerificationData | null {
    const detected = asRecord(payload.detected);
    const receipt = asRecord(payload.receipt);
    const upstream = asRecord(payload.upstream);
    const upstreamResult = asRecord(upstream?.result);
    const upstreamReceipt = asRecord(upstreamResult?.receipt);

    const url = asString(upstream?.url)
      ?? asString(payload.url)
      ?? asString(detected?.url)
      ?? asString(receipt?.url)
      ?? asString(upstreamReceipt?.url);
    const provider = asString(upstreamResult?.providerKey)
      ?? asString(detected?.provider)
      ?? asString(receipt?.provider)
      ?? asString(upstreamReceipt?.provider);
    const reference = upstreamReceipt
      ? findReference(upstreamReceipt, detected)
      : asString(detected?.reference);
    const parsedDate = parseReceiptDate(
      upstreamReceipt ? findPaymentDate(upstreamReceipt) : null
    );
    const amountValue = upstreamReceipt ? findAmount(upstreamReceipt) : null;

    if (!url || !provider || !reference) {
      return null;
    }

    const receiptRecord = (upstreamReceipt ?? receipt) as Record<string, unknown> | null;
    const explicitExpiration = findExpirationDate(receiptRecord, detected);
    const expirationDate = explicitExpiration ?? this.calculateDefaultExpirationDate(parsedDate);

    return {
      url,
      provider,
      reference,
      date: parsedDate,
      time: parsedDate.toISOString().slice(11, 19),
      amount: normalizeAmount(amountValue),
      expirationDate,
    };
  }

  private callVerificationApi(base64Image: string): Promise<VerificationResponse> {
    const apiBase = (process.env.RECEIPT_VERIFY_API_BASE || "https://links.et").replace(/\/+$/, "");
    const endpoint = process.env.RECEIPT_VERIFY_ENDPOINT || "/api/verify-image";
    const apiKey = process.env.RECEIPT_VERIFY_API_KEY;
    const timeoutMs = Number(process.env.RECEIPT_VERIFY_TIMEOUT_MS || 60000);

    if (!apiKey) {
      throw new Error("Receipt verification API key is not configured");
    }

    const targetUrl = new URL(`${apiBase}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`);
    const requestBody = JSON.stringify({ images: [{ imageBase64: base64Image }] });

    return new Promise((resolve, reject) => {
      const req = https.request(
        targetUrl,
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
            "content-length": Buffer.byteLength(requestBody).toString(),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let parsed: VerificationPayload | null = null;
            try {
              parsed = raw ? JSON.parse(raw) as VerificationPayload : null;
            } catch {
              parsed = null;
            }

            const statusCode = res.statusCode ?? 500;
            if (statusCode >= 400 && !parsed) {
              return reject(new Error(`Verification API responded with status ${statusCode}`));
            }

            resolve({ statusCode, body: parsed });
          });
        }
      );

      req.on("error", (error) => reject(error));
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("Receipt verification request timed out"));
      });
      req.write(requestBody);
      req.end();
    });
  }

  private async activateUserOnSuccessfulPayment(userId: string): Promise<void> {
    const user = await userRepo().findOne({ where: { id: userId } });
    if (!user) return;

    if (user.status !== UserStatus.SUSPENDED) {
      user.status = UserStatus.ACTIVE;
      user.is_active = true;
      user.updated_at = new Date();
      await userRepo().save(user);
    }
  }
}

export const paymentService = new PaymentService();
