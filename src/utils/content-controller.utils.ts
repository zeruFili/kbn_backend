import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Request } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";

export async function validateContentDto<T extends object>(
  dtoClass: new () => T,
  body: object
): Promise<T> {
  const dto = plainToInstance(dtoClass, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  if (errors.length > 0) {
    const messages = errors.map((error) => Object.values(error.constraints || {})).flat().join(", ");
    throw new AppError(400, messages);
  }
  return dto;
}

export function contentAdminId(req: AuthRequest): string {
  if (!req.user) throw new AppError(401, "Unauthorized");
  return req.user.id;
}

export function contentResourceId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== "string" || id.length === 0) {
    throw new AppError(400, "Invalid resource ID");
  }
  return id;
}

export function optionalStringArray(value: unknown): string[] | null | undefined {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      // Treat a non-JSON string as a single form value.
    }
    return [value];
  }

  return undefined;
}
