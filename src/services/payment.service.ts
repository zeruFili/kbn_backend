import fs from "fs";
import https from "https";
import path from "path";
import { URL } from "url";
import { AppDataSource } from "../config/data-source";
import { Payment } from "../entities/payment";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
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
  dateFrom?: string;
  dateTo?: string;
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

export class PaymentService {
  async findById(id: string): Promise<Payment> {
    const payment = await repo().findOne({ where: { id } });
    if (!payment) throw new AppError(404, "Payment not found");
    return payment;
  }

  async update(id: string, dto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.findById(id);

    if (dto.reference !== undefined && dto.reference !== null && dto.reference !== payment.reference) {
      const duplicate = await repo().findOne({ where: { reference: dto.reference } });
      if (duplicate && duplicate.id !== id) {
        throw new AppError(409, "Payment reference already exists");
      }
    }

    const previousImage = payment.image;
    Object.assign(payment, dto);
    const saved = await repo().save(payment);

    if (previousImage && previousImage !== saved.image) {
      deleteFile(previousImage);
    }

    return saved;
  }

  async remove(id: string): Promise<void> {
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
    const dateFrom = this.parseDateFilter(options.dateFrom, "date_from");
    const dateTo = this.parseDateFilter(options.dateTo, "date_to");

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new AppError(400, "date_from must be before or equal to date_to");
    }

    const query = repo().createQueryBuilder("payment");

    if (role !== UserRole.Admin) {
      query.andWhere("payment.user_id = :userId", { userId });
    }

    if (dateFrom) {
      query.andWhere("payment.date >= :dateFrom", { dateFrom });
    }

    if (dateTo) {
      const dateToExclusive = new Date(dateTo);
      dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1);
      query.andWhere("payment.date < :dateToExclusive", { dateToExclusive });
    }

    const [data, total] = await query
      .orderBy("payment.date", "DESC")
      .addOrderBy("payment.created_at", "DESC")
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
      }));

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

    return {
      url,
      provider,
      reference,
      date: parsedDate,
      time: parsedDate.toISOString().slice(11, 19),
      amount: normalizeAmount(amountValue),
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
}

export const paymentService = new PaymentService();
