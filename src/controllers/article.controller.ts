import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { CreateArticleDto, UpdateArticleDto } from "../validators/article.dto";
import { articleService } from "../services/article.service";
import { contentAdminId, contentResourceId, validateContentDto } from "../utils/content-controller.utils";

export class ArticleController {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await articleService.list() }); } catch (error) { next(error); }
  }
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await articleService.findById(contentResourceId(req)) }); } catch (error) { next(error); }
  }
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateContentDto(CreateArticleDto, req.body);
      res.status(201).json({ success: true, data: await articleService.create(dto, contentAdminId(req)), message: "Article created successfully" });
    } catch (error) { next(error); }
  }
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = await validateContentDto(UpdateArticleDto, req.body);
      res.status(200).json({ success: true, data: await articleService.update(contentResourceId(req), dto), message: "Article updated successfully" });
    } catch (error) { next(error); }
  }
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await articleService.remove(contentResourceId(req)); res.status(200).json({ success: true, message: "Article deleted successfully" }); } catch (error) { next(error); }
  }
}

export const articleController = new ArticleController();
