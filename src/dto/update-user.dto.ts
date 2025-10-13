import {
  IsString,
  IsOptional,
  Length,
  Matches,
  IsArray,
} from "class-validator";
import { UserRole } from "../enums/user-role.enum";

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @Length(10, 10)
  mobile?: string;

  @IsString()
  @IsOptional()
  @Length(1, 50)
  personName?: string;

  @IsString()
  @IsOptional()
  @Length(1, 50)
  baseLocationId?: string;

  @IsString()
  @IsOptional()
  @Length(0, 25)
  vehicleNbr?: string;

  @IsArray()
  @IsOptional()
  roles?: UserRole[];

  @IsOptional()
  isActive?: boolean;
}
