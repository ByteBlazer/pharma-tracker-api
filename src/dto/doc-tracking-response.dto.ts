export class DocTrackingResponseDto {
  success: boolean;
  message: string;
  status?: string;
  comment?: string;
  deliveryTimestamp?: Date;
  customerLocation?: {
    latitude: string;
    longitude: string;
  };
  driverLastKnownLocation?: {
    latitude: string;
    longitude: string;
    receivedAt: Date;
  };
  otherCustomersServiceTime?: number; // in minutes
}
