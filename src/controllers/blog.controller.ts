import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { CreateBlogDto, UpdateBlogDto } from "../validators/blog.dto";
import { blogService } from "../services/blog.service";
import {
  contentAdminId,
  contentResourceId,
  optionalStringArray,
  validateContentDto,
} from "../utils/content-controller.utils";
import { cleanupUploadedFiles, getFilePathsFromRequest } from "../utils/upload.utils";
import { Status } from "../enums/event.enum";

export class BlogController {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await blogService.list() });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await blogService.findById(contentResourceId(req)) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedFiles = getFilePathsFromRequest(req, "blog");
      let featured_image: string[] = [];

      if (uploadedFiles.length > 0) {
        featured_image = Array.from(new Set(uploadedFiles));
      } else if (req.body.image && typeof req.body.image === "string" && req.body.image.trim()) {
        featured_image = [req.body.image.trim()];
      } else if (req.body.featured_image) {
        const bodyImages = optionalStringArray(req.body.featured_image);
        if (bodyImages) featured_image = Array.from(new Set(bodyImages));
      }

      const rawDate = req.body.publication_date || req.body.publicationDate || req.body.date;
      const publicationDate = rawDate ? new Date(rawDate) : new Date();

      const rawStatus = (req.body.status || "draft").toString().toLowerCase();
      const status = rawStatus === "published" ? Status.PUBLISHED : Status.DRAFT;

      const payload = {
        title: req.body.title?.trim() || "",
        topic: req.body.topic?.trim() || "General",
        publication_date: publicationDate,
        status,
        excerpt: (req.body.excerpt || req.body.description || req.body.content || "").trim(),
        ...(featured_image.length > 0 ? { featured_image } : {}),
      };

      const dto = await validateContentDto(CreateBlogDto, payload);
      const data = await blogService.create(dto, contentAdminId(req));

      res.status(201).json({
        success: true,
        data,
        message: "Blog created successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedFiles = getFilePathsFromRequest(req, "blog");
      let featured_image: string[] | null | undefined = undefined;

      if (uploadedFiles.length > 0) {
        featured_image = Array.from(new Set(uploadedFiles));
      } else if (req.body.removeImage === "true" || req.body.removeImage === true) {
        featured_image = [];
      } else if (req.body.image && typeof req.body.image === "string" && req.body.image.trim()) {
        featured_image = [req.body.image.trim()];
      } else if (req.body.featured_image !== undefined) {
        const parsed = optionalStringArray(req.body.featured_image);
        featured_image = parsed ? Array.from(new Set(parsed)) : parsed;
      }

      const rawDate = req.body.publication_date || req.body.publicationDate || req.body.date;
      const publicationDate = rawDate ? new Date(rawDate) : undefined;

      const rawStatus = req.body.status !== undefined ? req.body.status.toString().toLowerCase() : undefined;
      const status = rawStatus !== undefined ? (rawStatus === "published" ? Status.PUBLISHED : Status.DRAFT) : undefined;

      const payload = {
        ...(req.body.title !== undefined ? { title: req.body.title.trim() } : {}),
        ...(req.body.topic !== undefined ? { topic: req.body.topic.trim() } : {}),
        ...(req.body.excerpt !== undefined || req.body.description !== undefined
          ? { excerpt: (req.body.excerpt || req.body.description || "").trim() }
          : {}),
        ...(publicationDate !== undefined ? { publication_date: publicationDate } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(featured_image !== undefined ? { featured_image } : {}),
      };

      const dto = await validateContentDto(UpdateBlogDto, payload);
      const data = await blogService.update(contentResourceId(req), dto);

      res.status(200).json({
        success: true,
        data,
        message: "Blog updated successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await blogService.remove(contentResourceId(req));
      res.status(200).json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const blogController = new BlogController();
