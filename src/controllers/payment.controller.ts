import { NextFunction, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { paymentService } from "../services/payment.service";
import { cleanupUploadedFiles, getFilePathsFromRequest } from "../utils/upload.utils";

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
      const dateFrom = req.query.date_from as string | undefined;
      const dateTo = req.query.date_to as string | undefined;

      const result = await paymentService.findAll(req.user.id, req.user.role, {
        page,
        limit,
        dateFrom,
        dateTo,
      });

      res.status(200).json({ success: true, ...result });
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
}

export const paymentController = new PaymentController();
