import { IsString, IsOptional, IsNumber, Min, Max } from "class-validator";

export class MarkDeliveryDto {
  @IsString()
  @IsOptional()
  signature?: string; // Base64 encoded signature bytes (required for successful delivery)

  @IsString()
  @IsOptional()
  deliveryComment?: string;

  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  deliveryLatitude?: number;

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  deliveryLongitude?: number;
}
