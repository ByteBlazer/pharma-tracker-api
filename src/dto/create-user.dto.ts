import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  Length,
  Matches,
} from "class-validator";
import { UserRole } from "../enums/user-role.enum";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Length(10, 10)
  mobile: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  personName: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  baseLocationId: string;

  @IsString()
  @IsOptional()
  @Length(0, 25)
  vehicleNbr?: string;

  @IsArray()
  @IsNotEmpty()
  roles: UserRole[];
}
