import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { rolePaymentService } from "../services/role-payment.service";
import {
  CreateRolePaymentDto,
  UpdateRolePaymentDto,
  UpdateRolePaymentStatusDto,
} from "../validators/role-payment.dto";
import { validateContentDto } from "../utils/content-controller.utils";
import { UserRole } from "../enums/user-role.enum";
import { RolePaymentStatus } from "../enums/role-payment-status.enum";

export class RolePaymentController {
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateContentDto(CreateRolePaymentDto, req.body);
      const data = await rolePaymentService.create(dto);
      res.status(201).json({
        success: true,
        message: "Role payment configuration created successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      let role: UserRole | undefined;
      if (req.query.role) {
        const roleStr = (req.query.role as string).trim().toLowerCase();
        const matched = Object.values(UserRole).find(
          (r) => r.toLowerCase() === roleStr
        );
        if (!matched) {
          throw new AppError(
            400,
            `Invalid role: ${req.query.role}. Valid roles are: ${Object.values(UserRole).join(", ")}`
          );
        }
        role = matched;
      }

      let status: RolePaymentStatus | undefined;
      if (req.query.status) {
        const statusUpper = (req.query.status as string).trim().toUpperCase();
        if (
          statusUpper === RolePaymentStatus.ACTIVE ||
          statusUpper === RolePaymentStatus.INACTIVE
        ) {
          status = statusUpper as RolePaymentStatus;
        } else {
          throw new AppError(
            400,
            `Invalid status: ${req.query.status}. Status must be ACTIVE or INACTIVE`
          );
        }
      }

      const sortBy = req.query.sort_by as any;
      const sortOrder =
        (req.query.sort_order as string)?.toUpperCase() === "DESC"
          ? "DESC"
          : "ASC";

      const result = await rolePaymentService.findAll({
        page,
        limit,
        role,
        status,
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError(400, "Configuration ID is required");
      }
      const data = await rolePaymentService.findById(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async findByRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const roleParam = req.params.role?.trim().toLowerCase();
      const matched = Object.values(UserRole).find(
        (r) => r.toLowerCase() === roleParam
      );
      if (!matched) {
        throw new AppError(
          400,
          `Invalid role: ${req.params.role}. Valid roles are: ${Object.values(UserRole).join(", ")}`
        );
      }
      const data = await rolePaymentService.findByRole(matched);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError(400, "Configuration ID is required");
      }
      const dto = await validateContentDto(UpdateRolePaymentDto, req.body);
      const data = await rolePaymentService.update(id, dto);
      res.status(200).json({
        success: true,
        message: "Role payment configuration updated successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError(400, "Configuration ID is required");
      }
      const dto = await validateContentDto(UpdateRolePaymentStatusDto, req.body);
      const data = await rolePaymentService.updateStatus(id, dto.status);
      res.status(200).json({
        success: true,
        message: `Role payment configuration status updated to ${dto.status}`,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async activate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError(400, "Configuration ID is required");
      }
      const data = await rolePaymentService.activate(id);
      res.status(200).json({
        success: true,
        message: "Role payment configuration activated successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async deactivate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError(400, "Configuration ID is required");
      }
      const data = await rolePaymentService.deactivate(id);
      res.status(200).json({
        success: true,
        message: "Role payment configuration deactivated successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError(400, "Configuration ID is required");
      }
      await rolePaymentService.remove(id);
      res.status(200).json({
        success: true,
        message: "Role payment configuration deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rolePaymentController = new RolePaymentController();
