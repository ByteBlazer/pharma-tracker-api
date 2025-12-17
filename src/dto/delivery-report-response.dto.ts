export class DeliveryReportItemDto {
  // From doc table
  docId: string;
  status: string;
  originWarehouse: string;
  docDate: Date;
  tripId: number;
  comment: string;
  customerId: string;
  lastUpdatedAt: Date;

  // From customer table
  firmName: string;
  address: string;
  city: string;
  pincode: string;

  // From trip table
  createdBy: string; // user id
  createdByPersonName: string;
  createdByLocation: string;
  drivenBy: string; // user id (driver)
  driverName: string;
  vehicleNbr: string;
  route: string;
  tripStatus: string;
}

export class DeliveryReportResponseDto {
  success: boolean;
  message: string;
  data: DeliveryReportItemDto[];
  totalRecords: number;
  statusCode: number;
}
