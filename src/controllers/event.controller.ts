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
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      const currentUser = authReq.user
        ? { id: authReq.user.id, role: authReq.user.role }
        : undefined;
      res.status(200).json({ success: true, data: await eventService.list(currentUser) });
    } catch (error) { next(error); }
  }
  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await eventService.findById(contentResourceId(req)) }); } catch (error) { next(error); }
  }
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedFiles = getFilePathsFromRequest(req, "event");
      let images: string[] = [];

      if (uploadedFiles.length > 0) {
        images = Array.from(new Set(uploadedFiles));
      } else if (req.body.image && typeof req.body.image === "string" && req.body.image.trim()) {
        images = [req.body.image.trim()];
      } else if (req.body.images) {
        const bodyImages = optionalStringArray(req.body.images);
        if (bodyImages) images = Array.from(new Set(bodyImages));
      }

      const rawDate = req.body.start_date || req.body.startDate || req.body.date;
      const startDate = rawDate ? new Date(rawDate) : new Date();

      const rawStatus = (req.body.status || "draft").toString().toLowerCase();
      const status = rawStatus === "published" ? "published" : "draft";

      const rawAvailability = (req.body.availability || "public").toString().toLowerCase();
      const availability = rawAvailability === "private" ? "private" : "public";

      const payload = {
        title: req.body.title,
        type: req.body.type || req.body.eventType || "General",
        location: req.body.location || "Addis Ababa",
        description: req.body.description || "",
        start_date: startDate,
        status,
        availability,
        ...(images.length > 0 ? { images } : {}),
      };

      const dto = await validateContentDto(CreateEventDto, payload);
      const data = await eventService.create(dto, contentAdminId(req));
      res.status(201).json({
        success: true,
        data,
        message: "Event created successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadedFiles = getFilePathsFromRequest(req, "event");
      let images: string[] | null | undefined = undefined;

      if (uploadedFiles.length > 0) {
        images = Array.from(new Set(uploadedFiles));
      } else if (req.body.removeImage === "true" || req.body.removeImage === true) {
        images = [];
      } else if (req.body.image && typeof req.body.image === "string" && req.body.image.trim()) {
        images = [req.body.image.trim()];
      } else if (req.body.images !== undefined) {
        const parsed = optionalStringArray(req.body.images);
        images = parsed ? Array.from(new Set(parsed)) : parsed;
      }

      const rawDate = req.body.start_date || req.body.startDate || req.body.date;
      const startDate = rawDate ? new Date(rawDate) : undefined;

      const rawStatus = req.body.status !== undefined ? req.body.status.toString().toLowerCase() : undefined;
      const status = rawStatus !== undefined ? (rawStatus === "published" ? "published" : "draft") : undefined;

      const rawAvailability = req.body.availability !== undefined ? req.body.availability.toString().toLowerCase() : undefined;
      const availability = rawAvailability !== undefined ? (rawAvailability === "private" ? "private" : "public") : undefined;

      const payload = {
        ...(req.body.title !== undefined ? { title: req.body.title } : {}),
        ...(req.body.type || req.body.eventType ? { type: req.body.type || req.body.eventType } : {}),
        ...(req.body.location !== undefined ? { location: req.body.location } : {}),
        ...(req.body.description !== undefined ? { description: req.body.description } : {}),
        ...(startDate !== undefined ? { start_date: startDate } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(availability !== undefined ? { availability } : {}),
        ...(images !== undefined ? { images } : {}),
      };

      const dto = await validateContentDto(UpdateEventDto, payload);
      const data = await eventService.update(contentResourceId(req), dto);
      res.status(200).json({
        success: true,
        data,
        message: "Event updated successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await eventService.remove(contentResourceId(req));
      res.status(200).json({ success: true, message: "Event deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

export const eventController = new EventController();
