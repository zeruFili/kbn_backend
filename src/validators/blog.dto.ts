import { Type } from "class-transformer";
import { IsArray, IsDate, IsEnum, IsOptional, IsString, ArrayMaxSize, Length } from "class-validator";
import { Status } from "../enums/event.enum";

export class CreateBlogDto {
  @IsString() @Length(1, 255) title: string;
  @IsString() @Length(1, 255) topic: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @Length(1, 255, { each: true }) featured_image?: string[] | null;
  @Type(() => Date) @IsDate() publication_date: Date;
  @IsEnum(Status) status: Status;
  @IsString() excerpt: string;
}

export class UpdateBlogDto {
  @IsOptional() @IsString() @Length(1, 255) title?: string;
  @IsOptional() @IsString() @Length(1, 255) topic?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @Length(1, 255, { each: true }) featured_image?: string[] | null;
  @IsOptional() @Type(() => Date) @IsDate() publication_date?: Date;
  @IsOptional() @IsEnum(Status) status?: Status;
  @IsOptional() @IsString() excerpt?: string;
}
