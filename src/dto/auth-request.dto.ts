import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class AuthRequestDto {
  @IsString()
  @IsNotEmpty()
  mobile: string;

  @IsOptional()
  @IsString()
  otp: string;
}
