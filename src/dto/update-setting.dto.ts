import { IsString, IsNotEmpty } from "class-validator";

export class UpdateSettingDto {
  @IsString()
  @IsNotEmpty()
  settingName: string;

  @IsString()
  @IsNotEmpty()
  settingValue: string;
}
