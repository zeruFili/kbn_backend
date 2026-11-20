import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaymentStatus } from "../enums/payment-status.enum";

export class UpdateLoveGiftStatusDto {
  @Transform(({ value }) => {
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (v === "active" || v === "accepted" || v === "approved" || v === "accept" || v === "approve") {
        return PaymentStatus.ACCEPTED;
      }
      if (v === "rejected" || v === "reject") return PaymentStatus.REJECTED;
      if (v === "pending" || v === "pend") return PaymentStatus.PENDING;
    }
    return value;
  })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsString()
  adminNotes?: string | null;
}

export class LoveGiftQueryDto {
  @IsOptional() @IsString() status?: PaymentStatus | string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() month?: number | string;
  @IsOptional() year?: number | string;
  @IsOptional() page?: number | string;
  @IsOptional() limit?: number | string;
}
