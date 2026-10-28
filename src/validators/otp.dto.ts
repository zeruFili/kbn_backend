import { IsEnum, IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { OtpPurpose } from "../enums/otp-purpose.enum";

export class SendOtpDto {
  @IsString()
  @Length(3, 255)
  identifier: string;

  @IsEnum(OtpPurpose, {
    message: "Purpose must be either REGISTER or RESET_PASSWORD",
  })
  purpose: OtpPurpose;

  @IsOptional()
  @IsIn(["sms", "email"])
  otpMethod?: "sms" | "email";
}

export class VerifyOtpDto {
  @IsString()
  @Length(3, 255)
  identifier: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: "OTP must be a 6-digit number",
  })
  otp: string;

  @IsEnum(OtpPurpose, {
    message: "Purpose must be either REGISTER or RESET_PASSWORD",
  })
  purpose: OtpPurpose;

  @IsOptional()
  @IsIn(["sms", "email"])
  otpMethod?: "sms" | "email";
}

export class ResetPasswordWithOtpDto {
  @IsString()
  @Length(3, 255)
  identifier: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: "OTP must be a 6-digit number",
  })
  otp: string;

  @IsString()
  @Length(8, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,128}$/, {
    message: "Password must include uppercase, lowercase, digit, and special character",
  })
  password: string;

  @IsString()
  @Length(8, 128)
  confirmPassword: string;
}
