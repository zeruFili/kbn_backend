import fs from "fs";
import https from "https";
import path from "path";
import { URL } from "url";
import { AppDataSource } from "../config/data-source";
import { LoveGift } from "../entities/love-gift";
import { User } from "../entities/User";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { deleteFile } from "../utils/upload.utils";
import { UpdateLoveGiftStatusDto } from "../validators/love-gift.dto";
import { bankResponseService, BankVerificationResult } from "./bank-response.service";

export interface SubmitLoveGiftInput {
  amount: number | string;
  donorName?: string | null;
  donorEmail?: string | null;
  donorPhone?: string | null;
  isAnonymous?: boolean | string;
  note?: string | null;
}

export interface LoveGiftListOptions {
  page?: number;
  limit?: number;
  status?: PaymentStatus | string;
  month?: number | string;
  year?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedLoveGifts {
  data: LoveGift[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  statistics: {
    totalApprovedAmount: number;
    totalCount: number;
    acceptedCount: number;
    pendingCount: number;
    rejectedCount: number;
  };
}

export interface UserLoveGiftSummary {
  totalContributed: number;
  totalGiftsCount: number;
  approvedGiftsCount: number;
  pendingGiftsCount: number;
  gifts: LoveGift[];
}

export type SubmitLoveGiftResult = {
  success: boolean;
  duplicate: boolean;
  message: string;
  reason?: string;
  gift: LoveGift;
};

const repo = () => AppDataSource.getRepository(LoveGift);
const userRepo = () => AppDataSource.getRepository(User);

function currentTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export class LoveGiftService {
  /**
   * Submit a voluntary love gift with receipt verification.
   */
  async submitGift(
    input: SubmitLoveGiftInput,
    imagePath: string,
    authenticatedUserId?: string
  ): Promise<SubmitLoveGiftResult> {
    const rawAmount = Number(input.amount);
    if (isNaN(rawAmount) || rawAmount <= 0) {
      deleteFile(imagePath);
      throw new AppError(400, "Please enter a valid gift amount greater than 0");
    }

    const isAnon = input.isAnonymous === true || input.isAnonymous === "true";
    let donorName = input.donorName?.trim() || null;
    let donorEmail = input.donorEmail?.trim() || null;
    let donorPhone = input.donorPhone?.trim() || null;

    // If authenticated, associate user and default donor info if not provided
    let user: User | null = null;
    if (authenticatedUserId) {
      user = await userRepo().findOne({ where: { id: authenticatedUserId } });
      if (user && !donorName && !isAnon) {
        donorName = user.name || null;
      }
      if (user && !donorEmail && !isAnon) {
        donorEmail = user.email || null;
      }
    }

    // Call OCR / verification service if configured
    let base64Image = "";
    try {
      base64Image = this.readImageAsBase64(imagePath);
    } catch {
      // If image reading fails, continue with fallback
    }

    let payload: Record<string, unknown> | null = null;
    let statusCode = 500;
    let verificationReason = "";

    if (base64Image) {
      try {
        const response = await this.callVerificationApi(base64Image);
        statusCode = response.statusCode;
        payload = response.body;
      } catch (err: any) {
        verificationReason = err?.message || "Verification API error";
      }
    }

    const upstream = payload ? asRecord(payload.upstream) : null;
    const upstreamResult = asRecord(upstream?.result);
    const verified = Boolean(
      statusCode < 400 &&
      upstream?.attempted === true &&
      upstreamResult?.ok === true
    );

    // Call bank response verification service to validate receiver credentials
    let bankResult: BankVerificationResult | null = null;
    if (payload && (verified || payload.source === "awash-html" || upstream?.attempted === true)) {
      bankResult = bankResponseService.verifyBankResponse({
        payload,
        expectedAmount: rawAmount,
        verifyCategoryAmount: false,
      });
    }

    // Check duplicate reference in love gifts
    if (bankResult?.reference) {
      const duplicateRef = await repo().findOne({ where: { reference: bankResult.reference } });
      if (duplicateRef) {
        deleteFile(imagePath);
        return {
          success: false,
          duplicate: true,
          message: "Duplicate receipt: A love gift with this transaction reference has already been submitted.",
          gift: duplicateRef,
        };
      }
    }

    // Determine final status and details
    let finalStatus = PaymentStatus.PENDING;
    let transactionDate = new Date();
    let transactionTimeStr = currentTime();
    let provider = bankResult?.provider || null;
    let reference = bankResult?.reference || null;
    let receiptUrl = bankResult?.url || null;
    let statusMessage = "Your love gift has been submitted successfully and is pending administrator review. Thank you for your generosity and for supporting our ministry! May God bless you abundantly. ❤️";

    if (bankResult) {
      transactionDate = bankResult.transactionTime || new Date();
      transactionTimeStr = bankResult.time || currentTime();

      if (bankResult.status === PaymentStatus.ACCEPTED) {
        finalStatus = PaymentStatus.ACCEPTED;
        statusMessage = "Thank you! Your Love Gift has been verified and accepted successfully.";
      } else if (bankResult.status === PaymentStatus.REJECTED) {
        finalStatus = PaymentStatus.REJECTED;
        statusMessage = bankResult.message || "Receipt details did not match our official receiver credentials.";
      } else {
        finalStatus = PaymentStatus.PENDING;
        statusMessage = bankResult.message || "Receipt submitted and is under verification.";
      }
    }

    const gift = repo().create({
      user_id: authenticatedUserId || null,
      donorName: isAnon ? "Anonymous Donor" : donorName,
      donorEmail: isAnon ? null : donorEmail,
      donorPhone: isAnon ? null : donorPhone,
      isAnonymous: isAnon,
      amount: rawAmount.toFixed(2),
      currency: "ETB",
      status: finalStatus,
      provider,
      reference,
      url: receiptUrl,
      image: imagePath,
      date: transactionDate,
      time: transactionTimeStr,
      note: input.note?.trim() || null,
      adminNotes: verificationReason ? `Auto-verification note: ${verificationReason}` : null,
    });

    const savedGift = await repo().save(gift);

    return {
      success: finalStatus === PaymentStatus.ACCEPTED,
      duplicate: false,
      message: statusMessage,
      reason: bankResult?.reason || verificationReason || undefined,
      gift: savedGift,
    };
  }

  /**
   * Get user summary: total contributed (approved only), total count, and individual transactions.
   */
  async getUserGiftSummary(userId: string): Promise<UserLoveGiftSummary> {
    const gifts = await repo().find({
      where: { user_id: userId },
      order: { created_at: "DESC" },
    });

    let totalContributed = 0;
    let approvedCount = 0;
    let pendingCount = 0;

    for (const g of gifts) {
      if (g.status === PaymentStatus.ACCEPTED) {
        totalContributed += Number(g.amount) || 0;
        approvedCount++;
      } else if (g.status === PaymentStatus.PENDING) {
        pendingCount++;
      }
    }

    return {
      totalContributed,
      totalGiftsCount: gifts.length,
      approvedGiftsCount: approvedCount,
      pendingGiftsCount: pendingCount,
      gifts,
    };
  }

  /**
   * Admin list of gifts with filters and statistics.
   */
  async getAdminGifts(options: LoveGiftListOptions): Promise<PaginatedLoveGifts> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = repo().createQueryBuilder("lg")
      .leftJoinAndSelect("lg.user", "user")
      .orderBy("lg.created_at", "DESC");

    if (options.status && options.status !== "all") {
      qb.andWhere("lg.status = :status", { status: options.status });
    }

    if (options.month !== undefined && options.month !== "") {
      const m = Number(options.month);
      if (!isNaN(m) && m >= 1 && m <= 12) {
        qb.andWhere("EXTRACT(MONTH FROM lg.date) = :month", { month: m });
      }
    }

    if (options.year) {
      const y = Number(options.year);
      if (!isNaN(y)) {
        qb.andWhere("EXTRACT(YEAR FROM lg.date) = :year", { year: y });
      }
    }

    if (options.search?.trim()) {
      const term = `%${options.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(lg.donor_name) LIKE :term OR LOWER(lg.donor_email) LIKE :term OR LOWER(lg.reference) LIKE :term OR LOWER(lg.provider) LIKE :term OR LOWER(user.name) LIKE :term OR LOWER(user.email) LIKE :term)",
        { term }
      );
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    // Compute overall statistics across all love gifts
    const statsQb = repo().createQueryBuilder("lg");
    const approvedSumRes = await statsQb
      .select("SUM(lg.amount)", "sum")
      .where("lg.status = :accStatus", { accStatus: PaymentStatus.ACCEPTED })
      .getRawOne();
    const totalApprovedAmount = Number(approvedSumRes?.sum || 0);

    const totalCount = await repo().count();
    const acceptedCount = await repo().count({ where: { status: PaymentStatus.ACCEPTED } });
    const pendingCount = await repo().count({ where: { status: PaymentStatus.PENDING } });
    const rejectedCount = await repo().count({ where: { status: PaymentStatus.REJECTED } });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      statistics: {
        totalApprovedAmount,
        totalCount,
        acceptedCount,
        pendingCount,
        rejectedCount,
      },
    };
  }

  /**
   * Find a love gift by ID with authorization checks.
   */
  async findById(id: string, currentUser?: { id: string; role: UserRole }): Promise<LoveGift> {
    const gift = await repo().findOne({
      where: { id },
      relations: ["user"],
    });

    if (!gift) {
      throw new AppError(404, "Love Gift record not found");
    }

    if (currentUser && currentUser.role !== UserRole.Admin) {
      if (gift.user_id !== currentUser.id) {
        throw new AppError(403, "Forbidden: You do not have permission to view this Love Gift");
      }
    }

    return gift;
  }

  /**
   * Update love gift status (Admin only).
   */
  async updateStatus(
    id: string,
    dto: UpdateLoveGiftStatusDto,
    adminUser: { id: string; role: UserRole }
  ): Promise<LoveGift> {
    if (adminUser.role !== UserRole.Admin) {
      throw new AppError(403, "Forbidden: Only administrators can update gift status");
    }

    const gift = await repo().findOne({
      where: { id },
      relations: ["user"],
    });

    if (!gift) {
      throw new AppError(404, "Love Gift record not found");
    }

    gift.status = dto.status;
    if (dto.adminNotes !== undefined) {
      gift.adminNotes = dto.adminNotes;
    }
    gift.updated_at = new Date();

    return repo().save(gift);
  }

  private readImageAsBase64(imagePath: string): string {
    const cleanPath = imagePath.replace(/^\/+/, "");
    const fullPath = path.resolve(process.cwd(), cleanPath);
    if (!fs.existsSync(fullPath)) return "";
    const fileBuffer = fs.readFileSync(fullPath);
    return fileBuffer.toString("base64");
  }

  private callVerificationApi(base64Image: string): Promise<{ statusCode: number; body: any }> {
    const apiBase = (process.env.RECEIPT_VERIFY_API_BASE || "https://links.et").replace(/\/+$/, "");
    const endpoint = process.env.RECEIPT_VERIFY_ENDPOINT || "/api/verify-image";
    const apiKey = process.env.RECEIPT_VERIFY_API_KEY;
    const timeoutMs = Number(process.env.RECEIPT_VERIFY_TIMEOUT_MS || 60000);

    if (!apiKey) {
      return Promise.reject(new Error("Receipt verification API key is not configured"));
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
            let parsed = null;
            try {
              parsed = raw ? JSON.parse(raw) : null;
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

export const loveGiftService = new LoveGiftService();
