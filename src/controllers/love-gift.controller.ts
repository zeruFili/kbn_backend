import { NextFunction, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { loveGiftService } from "../services/love-gift.service";
import { cleanupUploadedFiles, getFilePathsFromRequest } from "../utils/upload.utils";
import { validateContentDto, contentResourceId } from "../utils/content-controller.utils";
import { UpdateLoveGiftStatusDto } from "../validators/love-gift.dto";
import { UserRole } from "../enums/user-role.enum";

export class LoveGiftController {
  /**
   * Submit voluntary love gift (open to members and visitors)
   */
  async submit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedFiles = getFilePathsFromRequest(req, "love-gift");
      if (uploadedFiles.length === 0) {
        throw new AppError(400, "Payment receipt image is required");
      }

      const amountRaw = req.body.amount;
      if (!amountRaw) {
        cleanupUploadedFiles(req);
        throw new AppError(400, "Gift amount is required");
      }

      const donorName = req.body.donorName || req.body.donor_name;
      const donorEmail = req.body.donorEmail || req.body.donor_email;
      const donorPhone = req.body.donorPhone || req.body.donor_phone;
      const isAnonymous = req.body.isAnonymous || req.body.is_anonymous;
      const note = req.body.note || req.body.message;

      const result = await loveGiftService.submitGift(
        {
          amount: amountRaw,
          donorName,
          donorEmail,
          donorPhone,
          isAnonymous,
          note,
        },
        uploadedFiles[0],
        req.user?.id
      );

      if (result.duplicate) {
        res.status(409).json({
          success: false,
          duplicate: true,
          message: result.message,
          data: result.gift,
        });
        return;
      }

      res.status(result.success ? 201 : 200).json({
        success: result.success,
        duplicate: false,
        message: result.message,
        reason: result.reason,
        data: result.gift,
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  /**
   * Get logged-in user's love gift history and summary
   */
  async getUserSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const summary = await loveGiftService.getUserGiftSummary(req.user.id);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin list of all love gifts with filters and summary statistics
   */
  async adminList(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }
      if (req.user.role !== UserRole.Admin) {
        throw new AppError(403, "Forbidden: Only administrators can access love gifts management");
      }

      const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const status = req.query.status as string | undefined;
      const month = req.query.month as string | number | undefined;
      const year = req.query.year !== undefined ? Number(req.query.year) : undefined;
      const search = req.query.search as string | undefined;

      const result = await loveGiftService.getAdminGifts({
        page,
        limit,
        status,
        month,
        year,
        search,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Find a love gift by ID
   */
  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = contentResourceId(req);
      const gift = await loveGiftService.findById(id, req.user);
      res.status(200).json({
        success: true,
        data: gift,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update love gift status (Admin only)
   */
  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }
      if (req.user.role !== UserRole.Admin) {
        throw new AppError(403, "Forbidden: Only administrators can update gift status");
      }

      const id = contentResourceId(req);
      const dto = await validateContentDto(UpdateLoveGiftStatusDto, req.body);
      const updated = await loveGiftService.updateStatus(id, dto, req.user);

      res.status(200).json({
        success: true,
        message: `Love Gift marked as ${updated.status}`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const loveGiftController = new LoveGiftController();
