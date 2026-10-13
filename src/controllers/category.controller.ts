import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { CategoryType } from "../enums/category-type.enum";
import { categoryService } from "../services/category.service";
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from "../validators/category.dto";
import {
  contentResourceId,
  validateContentDto,
} from "../utils/content-controller.utils";
import {
  cleanupUploadedFiles,
  getUploadedFilePath,
} from "../utils/upload.utils";

export class CategoryController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const search = req.query.search as string | undefined;
      const type = req.query.type as CategoryType | undefined;
      const isActiveParam = req.query.is_active as string | undefined;
      const is_active =
        isActiveParam !== undefined ? isActiveParam === "true" : undefined;
      const sort_by = req.query.sort_by as
        | "name"
        | "created_at"
        | "type"
        | undefined;
      const sort_order =
        (req.query.sort_order as string)?.toUpperCase() === "DESC"
          ? "DESC"
          : "ASC";

      if (type && !Object.values(CategoryType).includes(type)) {
        res.status(400).json({
          success: false,
          message: `Invalid category type: ${type}`,
        });
        return;
      }

      const result = await categoryService.findAll({
        page,
        limit,
        search,
        type,
        is_active,
        sort_by,
        sort_order,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = contentResourceId(req);
      const category = await categoryService.findById(id);
      res.status(200).json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const iconPath =
        getUploadedFilePath(req, "icon", "categories") ||
        getUploadedFilePath(req, "attachmentFiles", "categories") ||
        req.body.icon;

      const payload = {
        ...req.body,
        ...(iconPath ? { icon: iconPath } : {}),
      };

      const dto = await validateContentDto(CreateCategoryDto, payload);
      const category = await categoryService.create(dto);

      res.status(201).json({
        success: true,
        data: category,
        message: "Category created successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = contentResourceId(req);
      const iconPath =
        getUploadedFilePath(req, "icon", "categories") ||
        getUploadedFilePath(req, "attachmentFiles", "categories") ||
        req.body.icon;

      const payload = {
        ...req.body,
        ...(iconPath ? { icon: iconPath } : {}),
      };

      const dto = await validateContentDto(UpdateCategoryDto, payload);
      const category = await categoryService.update(id, dto);

      res.status(200).json({
        success: true,
        data: category,
        message: "Category updated successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async updateStatus(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = contentResourceId(req);
      const dto = await validateContentDto(UpdateCategoryStatusDto, req.body);
      const category = await categoryService.updateStatus(id, dto.is_active);

      res.status(200).json({
        success: true,
        data: category,
        message: "Category status updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = contentResourceId(req);
      await categoryService.remove(id);

      res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const categoryController = new CategoryController();
