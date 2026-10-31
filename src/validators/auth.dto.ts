import { IsEmail, IsString, Length, Matches, IsOptional, IsIn, ValidateIf } from "class-validator";
import { UserRole } from "../enums/user-role.enum";

export class LoginDto {
  @IsEmail()
  @Length(1, 255)
  email: string;

  @IsString()
  @Length(6, 128)
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(8, 128)
  password: string;

  @IsString()
  @Length(8, 128)
  confirmPassword: string;
}

export class RegisterDto {
  @IsString()
  @Length(1, 255)
  full_name: string;

  @IsEmail()
  @Length(1, 255)
  email: string;

  @IsString()
  @Length(8, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,128}$/, {
    message: "Password must include uppercase, lowercase, digit, and special character",
  })
  password: string;

  @IsOptional()
  @IsIn([UserRole.Church, UserRole.Company, UserRole.User, UserRole.Ministry], {
    message: "Admin role cannot be assigned during registration",
  })
  role?: UserRole;

  @IsOptional()
  @ValidateIf((_obj, value) => !!value)
  @IsString()
  @Matches(/^(\+?[1-9]\d{1,14}|0[79]\d{8}|[79]\d{8})$/, {
    message: "Invalid phone number format",
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  business?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  website?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  @Length(1, 255)
  profileImage?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, {
    message: "OTP must be a 6-digit number",
  })
  otp?: string;

  @IsOptional()
  @IsIn(["sms", "email"], {
    message: "OTP method must be either 'sms' or 'email'",
  })
  otpMethod?: "sms" | "email";
}

export class GoogleAuthDto {
  @IsString()
  @Length(10, 8192)
  idToken: string;
}

export class GoogleLinkDto {
  @IsString()
  @Length(10, 8192)
  idToken: string;

  @IsString()
  @Length(6, 128)
  password: string;
}
