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
  pendingDirectDeliveries: number;
  totalDirectDeliveries: number;
  pendingLotDropOffs: number;
  deliveryCountStatusMsg: string;
  dropOffCountStatusMsg: string;
  // Driver's last known location
  driverLastKnownLatitude: string;
  driverLastKnownLongitude: string;
  driverLastLocationUpdateTime: Date;
}
