import { AppDataSource } from "../config/data-source";
import { EventRegistration } from "../entities/event-registration";
import { Event } from "../entities/event";
import { User } from "../entities/User";
import { EventRegistrationStatus } from "../enums/event-registration-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";

export interface EventRegistrationListOptions {
  page?: number;
  limit?: number;
  eventId?: string;
  userId?: string;
  status?: EventRegistrationStatus | string;
}

export interface PaginatedEventRegistrations {
  data: EventRegistration[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const regRepo = () => AppDataSource.getRepository(EventRegistration);
const eventRepo = () => AppDataSource.getRepository(Event);
const userRepo = () => AppDataSource.getRepository(User);

export class EventRegistrationService {
  /**
   * Register a user for an event.
   * - Validates that the referenced event exists.
   * - Validates that the referenced user exists.
   * - Sets initial status to PENDING.
   * - Prevents duplicate registrations, including handling concurrent race conditions.
   * - Automatically populates createdAt and updatedAt.
   */
  async register(
    targetUserId: string,
    eventId: string,
    currentUser: { id: string; role: UserRole }
  ): Promise<EventRegistration> {
    // 1. Authorization: Non-admins can only register themselves
    const effectiveUserId =
      currentUser.role === UserRole.Admin && targetUserId
        ? targetUserId
        : currentUser.id;

    // 2. Validate that the referenced event exists
    const event = await eventRepo().findOne({ where: { id: eventId } });
    if (!event) {
      throw new AppError(404, "Event not found");
    }

    // 3. Validate that the referenced user exists
    const user = await userRepo().findOne({ where: { id: effectiveUserId } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    // 4. Check for existing duplicate registration
    const existing = await regRepo().findOne({
      where: { eventId, userId: effectiveUserId },
    });
    if (existing) {
      throw new AppError(409, "User is already registered for this event");
    }

    // 5. Create new registration with default PENDING status
    const registration = regRepo().create({
      eventId,
      userId: effectiveUserId,
      status: EventRegistrationStatus.PENDING,
    });

    try {
      const saved = await regRepo().save(registration);
      // Return with loaded relations
      return (await this.findById(saved.id, currentUser)) || saved;
    } catch (error: any) {
      // 6. Handle concurrent duplicate request (Postgres unique constraint violation)
      if (
        error?.code === "23505" ||
        error?.message?.includes("UQ_event_registration_event_user") ||
        error?.message?.includes("duplicate key")
      ) {
        throw new AppError(409, "User is already registered for this event");
      }
      throw error;
    }
  }

  /**
   * List event registrations.
   * - Non-admin users can ONLY view their own event registrations.
   * - Admins can view all registrations and filter by eventId, userId, status.
   */
  async list(
    currentUser: { id: string; role: UserRole },
    options: EventRegistrationListOptions = {}
  ): Promise<PaginatedEventRegistrations> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));

    const query = regRepo()
      .createQueryBuilder("reg")
      .leftJoinAndSelect("reg.event", "event")
      .leftJoinAndSelect("reg.user", "user");

    // Enforce user visibility isolation
    if (currentUser.role !== UserRole.Admin) {
      if (options.userId && options.userId !== currentUser.id) {
        throw new AppError(
          403,
          "Forbidden: You can only access your own registrations"
        );
      }
      query.andWhere("reg.user_id = :userId", { userId: currentUser.id });
    } else {
      if (options.userId) {
        query.andWhere("reg.user_id = :filterUserId", {
          filterUserId: options.userId,
        });
      }
    }

    if (options.eventId) {
      query.andWhere("reg.event_id = :eventId", { eventId: options.eventId });
    }

    if (options.status) {
      const normalizedStatus = String(options.status).trim().toUpperCase();
      query.andWhere("reg.status = :status", { status: normalizedStatus });
    }

    const [data, total] = await query
      .orderBy("reg.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Users can view their own event registrations and their current status.
   */
  async listMyRegistrations(
    userId: string,
    options: EventRegistrationListOptions = {}
  ): Promise<PaginatedEventRegistrations> {
    return this.list(
      { id: userId, role: UserRole.User },
      { ...options, userId }
    );
  }

  /**
   * Admins can view registrations for a specific event.
   */
  async listByEvent(
    eventId: string,
    currentUser: { id: string; role: UserRole },
    options: EventRegistrationListOptions = {}
  ): Promise<PaginatedEventRegistrations> {
    const event = await eventRepo().findOne({ where: { id: eventId } });
    if (!event) {
      throw new AppError(404, "Event not found");
    }

    return this.list(currentUser, { ...options, eventId });
  }

  /**
   * Find a single registration by id.
   * Access is permitted if requester is Admin or owner of the registration.
   */
  async findById(
    id: string,
    currentUser?: { id: string; role: UserRole }
  ): Promise<EventRegistration> {
    const registration = await regRepo().findOne({
      where: { id },
      relations: ["event", "user"],
    });

    if (!registration) {
      throw new AppError(404, "Event registration not found");
    }

    if (
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      registration.userId !== currentUser.id
    ) {
      throw new AppError(
        403,
        "Forbidden: You can only access your own registrations"
      );
    }

    return registration;
  }

  /**
   * Only authorized admins can change a registration's status.
   * Supports PENDING, ACCEPTED, REJECTED.
   * Automatically updates updatedAt timestamp.
   */
  async updateStatus(
    id: string,
    status: EventRegistrationStatus,
    currentUser: { id: string; role: UserRole }
  ): Promise<EventRegistration> {
    if (currentUser.role !== UserRole.Admin) {
      throw new AppError(
        403,
        "Forbidden: Only authorized admins can change a registration status"
      );
    }

    const registration = await regRepo().findOne({
      where: { id },
      relations: ["event", "user"],
    });

    if (!registration) {
      throw new AppError(404, "Event registration not found");
    }

    const validStatuses = Object.values(EventRegistrationStatus);
    if (!validStatuses.includes(status)) {
      throw new AppError(
        400,
        `Invalid status. Status must be one of: ${validStatuses.join(", ")}`
      );
    }

    registration.status = status;
    registration.updatedAt = new Date();

    const saved = await regRepo().save(registration);
    return saved;
  }

  /**
   * Delete or cancel a registration.
   * Owners can cancel their own registrations, admins can delete any.
   */
  async remove(
    id: string,
    currentUser: { id: string; role: UserRole }
  ): Promise<void> {
    const registration = await regRepo().findOne({ where: { id } });
    if (!registration) {
      throw new AppError(404, "Event registration not found");
    }

    if (
      currentUser.role !== UserRole.Admin &&
      registration.userId !== currentUser.id
    ) {
      throw new AppError(
        403,
        "Forbidden: You can only cancel your own registrations"
      );
    }

    await regRepo().delete(id);
  }
}

export const eventRegistrationService = new EventRegistrationService();
