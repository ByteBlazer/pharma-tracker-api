export class TripOutputDto {
  tripId: number;
  createdBy: string;
  createdById: string;
  driverName: string;
  driverId: string;
  vehicleNumber: string;
  status: string;
  route: string;
  createdAt: Date;
  startedAt: Date;
  lastUpdatedAt: Date;
  creatorLocation: string;
  driverLocation: string;
  // Driver's last known location
  driverLastKnownLatitude: string;
  driverLastKnownLongitude: string;
  driverLastLocationUpdateTime: Date;
}
