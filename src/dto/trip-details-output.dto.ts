import { TripOutputDto } from "./trip-output.dto";
import { DocGroupOutputDto } from "./doc-group-output.dto";

export class TripDetailsOutputDto extends TripOutputDto {
  docGroups: DocGroupOutputDto[];
}
