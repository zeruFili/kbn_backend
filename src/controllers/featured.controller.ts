import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { featuredService } from "../services/featured.service";
import { AppError } from "../middlewares/error.middleware";

export class FeaturedController {
  async getCombined(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await featuredService.getFeaturedCombined();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getFeaturedMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const members = await featuredService.getFeaturedMembers();
      res.status(200).json({
        success: true,
        data: members,
      });
    } catch (err) {
      next(err);
    }
  }

  async setFeaturedMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userIds =
        req.body.userIds ||
        req.body.user_ids ||
        req.body.memberIds ||
        req.body.member_ids;

      if (!userIds || !Array.isArray(userIds)) {
        throw new AppError(400, "userIds array is required.");
      }

      const updated = await featuredService.setFeaturedMembers(userIds);
      res.status(200).json({
        success: true,
        message: "Featured members updated successfully.",
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async getFeaturedCompanies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companies = await featuredService.getFeaturedCompanies();
      res.status(200).json({
        success: true,
        data: companies,
      });
    } catch (err) {
      next(err);
    }
  }

  async setFeaturedCompanies(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyIds =
        req.body.companyIds ||
        req.body.company_ids;

      if (!companyIds || !Array.isArray(companyIds)) {
        throw new AppError(400, "companyIds array is required.");
      }

      const updated = await featuredService.setFeaturedCompanies(companyIds);
      res.status(200).json({
        success: true,
        message: "Featured companies updated successfully.",
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const featuredController = new FeaturedController();
