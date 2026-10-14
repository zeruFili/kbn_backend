import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
} from "class-validator";
import { UserRole } from "../enums/user-role.enum";
import { RolePaymentStatus } from "../enums/role-payment-status.enum";

function parseRole(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    const match = Object.values(UserRole).find(
      (r) => r.toLowerCase() === trimmed
    );
    if (match) return match;
  }
  return value;
}

function parseStatus(value: unknown, obj?: any): unknown {
  if (typeof value === "string") {
    const upper = value.trim().toUpperCase();
    if (upper === RolePaymentStatus.ACTIVE || upper === RolePaymentStatus.INACTIVE) {
      return upper as RolePaymentStatus;
    }
  }
  if (typeof value === "boolean") {
    return value ? RolePaymentStatus.ACTIVE : RolePaymentStatus.INACTIVE;
  }
  if (obj) {
    if (typeof obj.isActive === "boolean") {
      return obj.isActive ? RolePaymentStatus.ACTIVE : RolePaymentStatus.INACTIVE;
    }
    if (typeof obj.is_active === "boolean") {
      return obj.is_active ? RolePaymentStatus.ACTIVE : RolePaymentStatus.INACTIVE;
    }
  }
  return value;
}

function parseAmount(value: unknown, obj?: any): unknown {
  const raw = value !== undefined ? value : obj?.monthly_amount;
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const num = Number(raw);
  return isNaN(num) ? raw : num;
}

export class CreateRolePaymentDto {
  @IsNotEmpty({ message: "role is required" })
  @Transform(({ value }) => parseRole(value))
  @IsEnum(UserRole, {
    message: `role must be one of: ${Object.values(UserRole).join(", ")}`,
  })
  role: UserRole;

  @IsNotEmpty({ message: "monthlyAmount is required" })
  @Transform(({ value, obj }) => parseAmount(value, obj))
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "monthlyAmount must be a valid number with at most 2 decimal places" }
  )
  @Min(0, { message: "monthlyAmount must be a non-negative amount (0 or greater)" })
  monthlyAmount: number;

  @IsOptional()
  @Transform(({ value, obj }) => parseStatus(value, obj))
  @IsEnum(RolePaymentStatus, {
    message: "status must be either ACTIVE or INACTIVE",
  })
  status?: RolePaymentStatus = RolePaymentStatus.ACTIVE;
}

export class UpdateRolePaymentDto {
  @IsOptional()
  @Transform(({ value }) => parseRole(value))
  @IsEnum(UserRole, {
    message: `role must be one of: ${Object.values(UserRole).join(", ")}`,
  })
  role?: UserRole;

  @IsOptional()
  @Transform(({ value, obj }) => parseAmount(value, obj))
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "monthlyAmount must be a valid number with at most 2 decimal places" }
  )
  @Min(0, { message: "monthlyAmount must be a non-negative amount (0 or greater)" })
  monthlyAmount?: number;

  @IsOptional()
  @Transform(({ value, obj }) => parseStatus(value, obj))
  @IsEnum(RolePaymentStatus, {
    message: "status must be either ACTIVE or INACTIVE",
  })
  status?: RolePaymentStatus;
}

export class UpdateRolePaymentStatusDto {
  @IsNotEmpty({ message: "status is required" })
  @Transform(({ value, obj }) => parseStatus(value, obj))
  @IsEnum(RolePaymentStatus, {
    message: "status must be either ACTIVE or INACTIVE",
  })
  status: RolePaymentStatus;
}

export class RolePaymentQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseRole(value))
  @IsEnum(UserRole, {
    message: `role must be one of: ${Object.values(UserRole).join(", ")}`,
  })
  role?: UserRole;

  @IsOptional()
  @Transform(({ value, obj }) => parseStatus(value, obj))
  @IsEnum(RolePaymentStatus, {
    message: "status must be either ACTIVE or INACTIVE",
  })
  status?: RolePaymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
