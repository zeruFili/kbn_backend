import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class SendTelegramDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsString()
  @IsNotEmpty({ message: "Message content cannot be empty" })
  message: string;
}
