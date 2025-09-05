import { IsString, IsNotEmpty } from "class-validator";

export class LocationRegisterRequestDto {
  @IsString()
  @IsNotEmpty()
  latitude: string;

  @IsString()
  @IsNotEmpty()
  longitude: string;
}
