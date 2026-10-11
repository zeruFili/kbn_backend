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
}
