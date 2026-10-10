import { Type } from "class-transformer";
import { IsDate, IsEnum, IsOptional, IsString, Length } from "class-validator";
import { Status } from "../enums/event.enum";

export class CreateBlogDto {
  @IsString() @Length(1, 255) title: string;
  @IsString() @Length(1, 255) topic: string;
  @IsOptional() @IsString() @Length(1, 255) featured_image?: string;
  @Type(() => Date) @IsDate() publication_date: Date;
  @IsEnum(Status) status: Status;
  @IsString() excerpt: string;
}

export class UpdateBlogDto {
  @IsOptional() @IsString() @Length(1, 255) title?: string;
  @IsOptional() @IsString() @Length(1, 255) topic?: string;
  @IsOptional() @IsString() @Length(1, 255) featured_image?: string;
  @IsOptional() @Type(() => Date) @IsDate() publication_date?: Date;
  @IsOptional() @IsEnum(Status) status?: Status;
  @IsOptional() @IsString() excerpt?: string;
}
