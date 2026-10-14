import { Type } from "class-transformer";
import { IsDate, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PaymentStatus } from "../enums/payment-status.enum";

export class UpdatePaymentDto {
  @IsOptional() @IsUUID() user_id?: string;
  @IsOptional() @Type(() => Date) @IsDate() date?: Date;
  @IsOptional() @IsString() @Length(1, 8) time?: string;
  @IsOptional() @IsString() @Length(1, 50) provider?: string | null;
  @IsOptional() @IsString() @Length(1, 255) reference?: string | null;
  @IsOptional() @IsString() url?: string | null;
  @IsOptional() @IsString() image?: string | null;
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsString() amount?: string;
  @IsOptional() @Type(() => Date) @IsDate() expirationDate?: Date | null;
  @IsOptional() @Type(() => Date) @IsDate() expiration_date?: Date | null;
}

export class PaymentQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() userName?: string;
  @IsOptional() status?: PaymentStatus | string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() expirationFrom?: string;
  @IsOptional() @IsString() expirationTo?: string;
  @IsOptional() expired?: boolean | string;
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
}
