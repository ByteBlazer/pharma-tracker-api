export class DocOutputDto {
  id: string;
  status: string;
  lastScannedBy: string;
  originWarehouse: string;
  tripId: number;
  docDate: Date;
  docAmount: number;
  route: string;
  lot: string;
  customerId: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  // Customer fields
  customerFirmName: string;
  customerAddress: string;
  customerCity: string;
  customerPincode: string;
  customerPhone: string;
  customerGeoLatitude: string;
  customerGeoLongitude: string;
}
