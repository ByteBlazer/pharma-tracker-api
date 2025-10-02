import { IsString, IsNotEmpty, Length } from "class-validator";

export class UpdateBaseLocationDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name: string;
}
