import { TripOutputDto } from "./trip-output.dto";

export class ScheduledTripsResponseDto {
  success: boolean;
  message: string;
  trips: TripOutputDto[];
  totalTrips: number;
  statusCode: number;
}
