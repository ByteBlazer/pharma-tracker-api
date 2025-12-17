import {
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class DeliveryReportQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  docId?: string;

  @IsOptional()
  @IsString()
  customerCity?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tripId?: number;

  @IsOptional()
  @IsString()
  driverUserId?: string;

  @IsOptional()
  @IsString()
  originWarehouse?: string;

  @IsOptional()
  @IsString()
  tripStartLocation?: string;
}
