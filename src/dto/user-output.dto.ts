import { UserRoleOutputDto } from "./user-role-output.dto";

export class UserOutputDto {
  id: string;
  mobile: string;
  personName: string;
  baseLocationId: string;
  baseLocationName?: string;
  vehicleNbr?: string;
  isActive: boolean;
  createdAt: Date;
  roles: UserRoleOutputDto[];
}
