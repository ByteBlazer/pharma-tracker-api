import { DocOutputDto } from "./doc-output.dto";

export class DocGroupOutputDto {
  heading: string;
  droppable: boolean;
  dropOffCompleted: boolean;
  showDropOffButton: boolean;
  expandGroupByDefault: boolean;
  docs: DocOutputDto[];
}
