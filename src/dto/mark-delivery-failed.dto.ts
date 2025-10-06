import { IsString, IsNotEmpty } from "class-validator";

export class MarkDeliveryFailedDto {
  @IsString()
  @IsNotEmpty()
  failureComment: string;
}
