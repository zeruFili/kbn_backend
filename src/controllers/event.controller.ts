import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { CreateEventDto, UpdateEventDto } from "../validators/event.dto";
import { eventService } from "../services/event.service";
import {
  contentAdminId,
  contentResourceId,
  optionalStringArray,
  validateContentDto,
} from "../utils/content-controller.utils";
import { cleanupUploadedFiles, getFilePathsFromRequest } from "../utils/upload.utils";

export class EventController {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await eventService.list() }); } catch (error) { next(error); }
  }
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await eventService.findById(contentResourceId(req)) }); } catch (error) { next(error); }
  }
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedFiles = getFilePathsFromRequest(req, "event");
      const bodyImages = optionalStringArray(req.body.images);
      const dto = await validateContentDto(CreateEventDto, {
        ...req.body,
        ...(uploadedFiles.length > 0
          ? { images: uploadedFiles }
          : bodyImages !== undefined
            ? { images: bodyImages }
            : {}),
      });
      res.status(201).json({ success: true, data: await eventService.create(dto, contentAdminId(req)), message: "Event created successfully" });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedFiles = getFilePathsFromRequest(req, "event");
      const bodyImages = optionalStringArray(req.body.images);
      const dto = await validateContentDto(UpdateEventDto, {
        ...req.body,
        ...(uploadedFiles.length > 0
          ? { images: uploadedFiles }
          : bodyImages !== undefined
            ? { images: bodyImages }
            : {}),
      });
      res.status(200).json({ success: true, data: await eventService.update(contentResourceId(req), dto), message: "Event updated successfully" });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await eventService.remove(contentResourceId(req)); res.status(200).json({ success: true, message: "Event deleted successfully" }); } catch (error) { next(error); }
  }
}

export const eventController = new EventController();
