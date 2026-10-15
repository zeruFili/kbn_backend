import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { paymentService } from "../services/payment.service";
import { UpdatePaymentDto } from "../validators/payment.dto";
import { contentResourceId, validateContentDto } from "../utils/content-controller.utils";
import { cleanupUploadedFiles, getFilePathsFromRequest } from "../utils/upload.utils";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";

export class PaymentController {
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const page = req.query.page === undefined
        ? undefined
        : Number(req.query.page);
      const limit = req.query.limit === undefined
        ? undefined
        : Number(req.query.limit);

      const date = (
        req.query.date ??
        req.query.created_at ??
        req.query.created_date ??
        req.query.payment_date
      ) as string | undefined;
      const day = (req.query.day ?? req.query.payment_day) === undefined
        ? undefined
        : Number(req.query.day ?? req.query.payment_day);
      const dateFrom = (req.query.date_from ?? req.query.dateFrom ?? req.query.start_date ?? req.query.startDate) as string | undefined;
      const dateTo = (req.query.date_to ?? req.query.dateTo ?? req.query.end_date ?? req.query.endDate) as string | undefined;

      const monthRaw = req.query.month ?? req.query.monthe ?? req.query.payment_month;
      const month = monthRaw === undefined
        ? undefined
        : (typeof monthRaw === "string" && !isNaN(Number(monthRaw)) ? Number(monthRaw) : monthRaw as string);

      const yearRaw = req.query.year ?? req.query.payment_year;
      const year = yearRaw === undefined
        ? undefined
        : Number(yearRaw);

      const rawUserId = (
        req.params.userId ??
        req.query.user_id ??
        req.query.userId
      );
      const userId: string | undefined = typeof rawUserId === "string" ? rawUserId : Array.isArray(rawUserId) ? String(rawUserId[0]) : undefined;

      const rawUserName = (
        req.query.user_name ??
        req.query.userName ??
        req.query.name ??
        req.query.user
      );
      const userName: string | undefined = typeof rawUserName === "string" ? rawUserName : Array.isArray(rawUserName) ? String(rawUserName[0]) : undefined;

      const status = (req.query.status ?? req.query.payment_status) as PaymentStatus | PaymentStatus[] | string | string[] | undefined;

      const expired = (req.query.expired ?? req.query.is_expired) as boolean | string | undefined;
      const expirationFrom = (
        req.query.expiration_from ??
        req.query.expirationFrom ??
        req.query.expiration_date_from
      ) as string | undefined;
      const expirationTo = (
        req.query.expiration_to ??
        req.query.expirationTo ??
        req.query.expiration_date_to
      ) as string | undefined;

      const result = await paymentService.findAll(req.user.id, req.user.role, {
        page,
        limit,
        date,
        day,
        dateFrom,
        dateTo,
        month,
        year,
        userId,
        userName,
        status,
        expired,
        expirationFrom,
        expirationTo,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const payment = await paymentService.findById(contentResourceId(req), req.user);
      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyReceipt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const uploadedFiles = getFilePathsFromRequest(req, "payment");
      if (uploadedFiles.length === 0) {
        throw new AppError(400, "Payment receipt image is required");
      }

      const result = await paymentService.verifyReceipt(req.user.id, uploadedFiles[0]);

      if (result.verified && result.duplicate) {
        res.status(409).json({
          success: false,
          duplicate: true,
          message: result.message,
          existing_payment_id: result.existing_payment_id,
        });
        return;
      }

      if (result.verified) {
        res.status(201).json({
          success: true,
          duplicate: false,
          message: result.message,
          data: result.payment,
        });
        return;
      }

      res.status(200).json({
        success: false,
        duplicate: false,
        message: result.message,
        reason: result.reason,
        data: result.payment,
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }
      if (req.user.role !== UserRole.Admin) {
        throw new AppError(403, "Forbidden: Only admins can update payment information");
      }

      const dto = await validateContentDto(UpdatePaymentDto, req.body);
      const payment = await paymentService.update(contentResourceId(req), dto, req.user);
      res.status(200).json({
        success: true,
        data: payment,
        message: "Payment updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }
      if (req.user.role !== UserRole.Admin) {
        throw new AppError(403, "Forbidden: Only admins can delete payment information");
      }

      await paymentService.remove(contentResourceId(req), req.user);
      res.status(200).json({
        success: true,
        message: "Payment deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getValidityStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const paramUserId = req.params.userId;
      const targetUserId: string = (Array.isArray(paramUserId) ? paramUserId[0] : paramUserId) || req.user.id;
      const validity = await paymentService.getUserPaymentValidity(targetUserId, req.user);

      res.status(200).json({
        success: true,
        data: validity,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUserPaymentStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }
      if (req.user.role !== UserRole.Admin) {
        throw new AppError(403, "Forbidden: Only admins can update payment information");
      }

      const paramUserId = req.params.userId;
      const targetUserId: string = (Array.isArray(paramUserId) ? paramUserId[0] : paramUserId);
      if (!targetUserId) {
        throw new AppError(400, "User ID is required");
      }

      const dto = await validateContentDto(UpdatePaymentDto, req.body);
      const payment = await paymentService.updateUserPaymentStatus(targetUserId, dto, req.user);
      res.status(200).json({
        success: true,
        data: payment,
        message: "User payment status updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const paymentController = new PaymentController();
