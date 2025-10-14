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
  enrouteCustomersServiceTime?: number; // in minutes
  numEnrouteCustomers?: number; // Number of customers nearer than current customer
  eta?: number; // Estimated time of arrival in minutes
}
