import { Type, Transform } from "class-transformer";
import {
  IsString,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsArray,
  Length,
  ValidateNested,
} from "class-validator";
import { VerificationStatus } from "../enums/verification-status.enum";
import { CompanyStatus } from "../enums/company-status.enum";
import { SocialPlatform } from "../enums/social-platform.enum";

export class CompanySocialMediaDto {
  @IsEnum(SocialPlatform)
  platform: SocialPlatform;

  @IsString()
  @Length(1, 255)
  link: string;
}

export class CreateCompanyDto {
  @IsString()
  @Length(1, 255)
  company_name: string;

  @IsUUID()
  business_category_id: string;

  @IsString()
  @Length(1, 255)
  owner_primary_contact: string;

  @IsEmail()
  @Length(1, 255)
  email: string;

  @IsString()
  @Length(1, 20)
  phone_number: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  website?: string;

  @IsString()
  @Length(1, 255)
  physical_address: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  company_logo?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  cover_image?: string;

  @IsString()
  description: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return value.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsString()
  @Length(1, 255)
  business_license: string;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verification_status?: VerificationStatus;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" || value === true
      ? true
      : value === "false" || value === false
      ? false
      : value
  )
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanySocialMediaDto)
  social_media?: CompanySocialMediaDto[];
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  company_name?: string;

  @IsOptional()
  @IsUUID()
  business_category_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  owner_primary_contact?: string;

  @IsOptional()
  @IsEmail()
  @Length(1, 255)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone_number?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  website?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  physical_address?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  company_logo?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  cover_image?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return value.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 255)
  business_license?: string;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verification_status?: VerificationStatus;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" || value === true
      ? true
      : value === "false" || value === false
      ? false
      : value
  )
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanySocialMediaDto)
  social_media?: CompanySocialMediaDto[];
}

export class UpdateCompanyVerificationStatusDto {
  @IsEnum(VerificationStatus)
  verification_status: VerificationStatus;
}

export class UpdateCompanyStatusDto {
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @Transform(({ value }) =>
    value === "true" || value === true
      ? true
      : value === "false" || value === false
      ? false
      : value
  )
  @IsBoolean()
  is_active?: boolean;
}
