import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { EventRegistrationStatus } from "../enums/event-registration-status.enum";

function parseEventRegistrationStatus(value: unknown, obj?: any): unknown {
  const raw = value !== undefined ? value : obj?.status;
  if (typeof raw === "string") {
    const upper = raw.trim().toUpperCase();
    if (
      upper === EventRegistrationStatus.PENDING ||
      upper === EventRegistrationStatus.ACCEPTED ||
      upper === EventRegistrationStatus.REJECTED
    ) {
      return upper as EventRegistrationStatus;
    }
  }
  return value;
}

function parseUuid(value: unknown, fallback?: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  if (typeof fallback === "string") {
    const trimmed = fallback.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return value;
}

export class CreateEventRegistrationDto {
  @IsNotEmpty({ message: "eventId is required" })
  @Transform(({ value, obj }) => parseUuid(value, obj?.event_id))
  @IsUUID("all", { message: "eventId must be a valid UUID" })
  eventId: string;

  @IsOptional()
  @Transform(({ value, obj }) => parseUuid(value, obj?.user_id))
  @IsUUID("all", { message: "userId must be a valid UUID" })
  userId?: string;
}

export class UpdateEventRegistrationStatusDto {
  @IsNotEmpty({ message: "status is required" })
  @Transform(({ value, obj }) => parseEventRegistrationStatus(value, obj))
  @IsEnum(EventRegistrationStatus, {
    message: `status must be one of: ${Object.values(EventRegistrationStatus).join(", ")}`,
  })
  status: EventRegistrationStatus;
}

export class EventRegistrationQueryDto {
  @IsOptional()
  @Transform(({ value, obj }) => parseUuid(value, obj?.event_id))
  @IsUUID("all", { message: "eventId must be a valid UUID" })
  eventId?: string;

  @IsOptional()
  @Transform(({ value, obj }) => parseUuid(value, obj?.user_id))
  @IsUUID("all", { message: "userId must be a valid UUID" })
  userId?: string;

  @IsOptional()
  @Transform(({ value, obj }) => parseEventRegistrationStatus(value, obj))
  @IsEnum(EventRegistrationStatus, {
    message: `status must be one of: ${Object.values(EventRegistrationStatus).join(", ")}`,
  })
  status?: EventRegistrationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page must be an integer" })
  @Min(1, { message: "page must be greater than or equal to 1" })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit must be an integer" })
  @Min(1, { message: "limit must be greater than or equal to 1" })
  @Max(100, { message: "limit cannot exceed 100" })
  limit?: number = 20;
}
