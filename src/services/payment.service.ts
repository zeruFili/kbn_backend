import fs from "fs";
import https from "https";
import path from "path";
import { URL } from "url";
import { AppDataSource } from "../config/data-source";
import { Payment } from "../entities/payment";
import { PaymentStatus } from "../enums/payment-status.enum";
import { deleteFile } from "../utils/upload.utils";

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
