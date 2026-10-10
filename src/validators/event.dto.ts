import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsDate, IsEnum, IsOptional, IsString, Length,
} from "class-validator";
import { EventAvailability, Status } from "../enums/event.enum";

export class CreateEventDto {
  @IsString() @Length(1, 255) title: string;
  @IsString() @Length(1, 255) slug: string;
  @IsString() @Length(1, 255) type: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(5) images: string[];
  @Type(() => Date) @IsDate() start_date: Date;
  @IsEnum(Status) status: Status;
  @IsEnum(EventAvailability) availability: EventAvailability;
  @IsString() @Length(1, 255) location: string;
  @IsString() description: string;
}

export class UpdateEventDto {
  @IsOptional() @IsString() @Length(1, 255) title?: string;
  @IsOptional() @IsString() @Length(1, 255) slug?: string;
  @IsOptional() @IsString() @Length(1, 255) type?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(5) images?: string[];
  @IsOptional() @Type(() => Date) @IsDate() start_date?: Date;
  @IsOptional() @IsEnum(Status) status?: Status;
  @IsOptional() @IsEnum(EventAvailability) availability?: EventAvailability;
  @IsOptional() @IsString() @Length(1, 255) location?: string;
  @IsOptional() @IsString() description?: string;
}
