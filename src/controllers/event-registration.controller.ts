import { NextFunction, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { eventRegistrationService } from "../services/event-registration.service";
import {
  CreateEventRegistrationDto,
  UpdateEventRegistrationStatusDto,
} from "../validators/event-registration.dto";
import {
  contentResourceId,
  validateContentDto,
} from "../utils/content-controller.utils";
import { EventRegistrationStatus } from "../enums/event-registration-status.enum";

export class EventRegistrationController {
  /**
   * Register authenticated user for an event.
   */
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const rawEventId =
        req.body?.eventId ??
        req.body?.event_id ??
        req.params?.eventId ??
        req.params?.id;

      const rawUserId =
        req.body?.userId ??
        req.body?.user_id ??
        req.user.id;

      const payload = {
        eventId: rawEventId,
        userId: rawUserId,
      };

      const dto = await validateContentDto(CreateEventRegistrationDto, payload);
      const data = await eventRegistrationService.register(
        dto.userId || req.user.id,
        dto.eventId,
        req.user
      );

      res.status(201).json({
        success: true,
        message: "Registered for event successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List event registrations.
   * Standard users receive only their own registrations.
   * Admins can view all registrations and filter.
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;

      const rawEventId =
        req.query.eventId ??
        req.query.event_id ??
        req.params.eventId;
      const eventId = typeof rawEventId === "string" ? rawEventId : undefined;

      const rawUserId =
        req.query.userId ??
        req.query.user_id ??
        req.params.userId;
      const userId = typeof rawUserId === "string" ? rawUserId : undefined;

      const status = req.query.status as EventRegistrationStatus | undefined;

      const result = await eventRegistrationService.list(req.user, {
        page,
        limit,
        eventId,
        userId,
        status,
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
   * Authenticated users can view their own event registrations and status.
   */
  async listMy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const eventId = (req.query.eventId ?? req.query.event_id) as string | undefined;
      const status = req.query.status as EventRegistrationStatus | undefined;

      const result = await eventRegistrationService.listMyRegistrations(req.user.id, {
        page,
        limit,
        eventId,
        status,
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
   * View registrations for a specific event.
   */
  async listByEvent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const rawEventId = req.params.eventId || req.params.id;
      const eventId =
        typeof rawEventId === "string"
          ? rawEventId
          : Array.isArray(rawEventId)
            ? rawEventId[0]
            : "";
      if (!eventId) {
        throw new AppError(400, "Event ID is required");
      }

      const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const status = req.query.status as EventRegistrationStatus | undefined;

      const result = await eventRegistrationService.listByEvent(eventId, req.user, {
        page,
        limit,
        status,
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
   * Find a specific registration by ID.
   */
  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const id = contentResourceId(req);
      const data = await eventRegistrationService.findById(id, req.user);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update status of an event registration (Admin only).
   */
  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const id = contentResourceId(req);
      const dto = await validateContentDto(UpdateEventRegistrationStatusDto, req.body);
      const data = await eventRegistrationService.updateStatus(id, dto.status, req.user);

      res.status(200).json({
        success: true,
        message: "Registration status updated successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete / Cancel a registration.
   */
  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const id = contentResourceId(req);
      await eventRegistrationService.remove(id, req.user);

      res.status(200).json({
        success: true,
        message: "Registration deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const eventRegistrationController = new EventRegistrationController();
