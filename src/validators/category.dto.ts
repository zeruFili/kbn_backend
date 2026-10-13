import { Transform } from "class-transformer";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  Length,
} from "class-validator";
import { CategoryType } from "../enums/category-type.enum";

export class CreateCategoryDto {
  @IsString()
  @Length(1, 255)
  name: string;

  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  icon?: string;

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

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  icon?: string;

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

export class UpdateCategoryStatusDto {
  @Transform(({ value }) =>
    value === "true" || value === true
      ? true
      : value === "false" || value === false
      ? false
      : value
  )
  @IsBoolean()
  is_active: boolean;
}
