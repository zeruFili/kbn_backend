import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { CreateBlogDto, UpdateBlogDto } from "../validators/blog.dto";
import { blogService } from "../services/blog.service";
import { contentAdminId, contentResourceId, validateContentDto } from "../utils/content-controller.utils";

export class BlogController {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await blogService.list() }); } catch (error) { next(error); }
  }
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await blogService.findById(contentResourceId(req)) }); } catch (error) { next(error); }
  }
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateContentDto(CreateBlogDto, req.body);
      res.status(201).json({ success: true, data: await blogService.create(dto, contentAdminId(req)), message: "Blog created successfully" });
    } catch (error) { next(error); }
  }
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateContentDto(UpdateBlogDto, req.body);
      res.status(200).json({ success: true, data: await blogService.update(contentResourceId(req), dto), message: "Blog updated successfully" });
    } catch (error) { next(error); }
  }
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await blogService.remove(contentResourceId(req)); res.status(200).json({ success: true, message: "Blog deleted successfully" }); } catch (error) { next(error); }
  }
}

export const blogController = new BlogController();
