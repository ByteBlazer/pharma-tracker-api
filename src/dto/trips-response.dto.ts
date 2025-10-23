import { TripOutputDto } from "./trip-output.dto";

export class TripsResponseDto {
  success: boolean;
  message: string;
  trips: TripOutputDto[];
  totalTrips: number;
  statusCode: number;
}
