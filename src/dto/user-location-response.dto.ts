import { LocationItemDto } from "./location-item.dto";

export class UserLocationResponseDto {
  success: boolean;
  message: string;
  locations: LocationItemDto[];
  totalCount: number;
  targetUser?: {
    id: string;
    name: string;
  };
}
