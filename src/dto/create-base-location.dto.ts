import { IsString, IsNotEmpty, Length } from "class-validator";

export class CreateBaseLocationDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  name: string;
}
