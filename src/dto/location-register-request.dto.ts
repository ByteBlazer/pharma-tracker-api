import { IsString, IsNotEmpty, IsLatitude, IsLongitude } from "class-validator";

export class LocationRegisterRequestDto {
  @IsString()
  @IsNotEmpty()
  @IsLatitude()
  latitude: string;

  @IsString()
  @IsNotEmpty()
  @IsLongitude()
  longitude: string;
}
