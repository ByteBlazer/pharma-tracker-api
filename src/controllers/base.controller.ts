import {
  Controller,
  Get,
  Query,
  BadRequestException,
  Req,
  NotFoundException,
} from "@nestjs/common";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { SkipAuth } from "src/decorators/skip-auth.decorator";
import { DocStatus } from "src/enums/doc-status.enum";
import { DocService } from "../services/doc.service";
import { TripService } from "../services/trip.service";
import { CustomerService } from "../services/customer.service";
import { TripStatus } from "src/enums/trip-status.enum";

@Controller("")
export class BaseController {
  constructor(
    private readonly docService: DocService,
    private readonly tripService: TripService,
    private readonly customerService: CustomerService
  ) {}

  /**
  This endpoint is used by the ERP system to hit us and get a tracking URL for a document.
  */
  @Get("trackingLink")
  @SkipAuth()
  async getTrackingLink(
    @Query("docId") docId: string,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Req() req: Request
  ): Promise<{ status: DocStatus; trackingURL: string; docId: string }> {
    if (!docId) {
      throw new BadRequestException("docId query parameter is required");
    }

    // Fetch document status from database
    const docStatus = await this.docService.getDocumentStatus(docId);
    if (!docStatus) {
      throw new BadRequestException(
        "The provided docId is not among scanned documents in Pharma Tracker."
      );
    }

    // Generate tracking URL with base64 encoded docId
    const trackingToken = Buffer.from(docId).toString("base64");

    // Get host from request headers instead of loggedInUser, fallback to empty string
    const reqHost =
      req.headers["x-forwarded-host"] || req.headers["host"] || "";
    const host = reqHost;
    const baseUrl = host
      ? host.startsWith("https://")
        ? host
        : `https://${host}`
      : "";
    let trackingURL = `${baseUrl}/track?t=${trackingToken}`;
    if (
      docStatus === DocStatus.READY_FOR_DISPATCH ||
      docStatus === DocStatus.TRIP_SCHEDULED
    ) {
      throw new BadRequestException(
        "The provided docId was scanned in Pharma Tracker, but not on a trip yet."
      );
    }

    return {
      status: docStatus,
      trackingURL: trackingURL,
      docId: docId,
    };
  }

  /**
   * Get all trip information for the specified number of days
   */
  @Get("trips")
  @SkipAuth()
  async getAllTrips(
    @LoggedInUser() loggedInUser: JwtPayload,
    @Req() req: Request,
    @Query("days") days?: string
  ): Promise<{
    trips: Array<{
      tripId: string;
      tripStartTime: string;
      tripEndTime?: string;
      personName: string;
      driverName: string;
      vehicleNbr: string;
      docList: Array<{
        docId: string;
        status: string;
        actualDeliveryLocationLat?: string;
        actualDeliveryLocationLng?: string;
        deliveryTime?: string;
        comment?: string;
        trackingURL?: string;
      }>;
    }>;
  }> {
    // Parse days parameter with validation
    let daysToFetch = 2; // Default value
    if (days) {
      const parsedDays = parseInt(days);
      if (!isNaN(parsedDays)) {
        daysToFetch = Math.min(Math.max(parsedDays, 1), 10); // Clamp between 1 and 10
      }
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - daysToFetch);

    // Get trips from trip service
    const trips = await this.tripService.getTripsByDateRange(
      startDate,
      endDate
    );

    // Transform trips to the required format
    const transformedTrips = await Promise.all(
      trips.map(async (trip) => {
        // Get documents for this trip
        const docs = await this.docService.getDocumentsByTripId(trip.id);

        // Transform documents to the required format
        const docList = await Promise.all(
          docs.map(async (doc) => {
            const docInfo: any = {
              docId: doc.id,
              status: doc.status,
            };

            // Add delivery location and time for DELIVERED documents
            if (doc.status === DocStatus.DELIVERED) {
              // Get delivery information from signature table
              const deliveryInfo = await this.docService.getDeliveryInfo(
                doc.id
              );
              if (deliveryInfo) {
                docInfo.actualDeliveryLocationLat = deliveryInfo.latitude;
                docInfo.actualDeliveryLocationLng = deliveryInfo.longitude;
                docInfo.deliveryTime = deliveryInfo.deliveredAt;
                docInfo.comment = deliveryInfo.comment;
              }
            }

            try {
              const trackingInfo = await this.getTrackingLink(
                doc.id,
                loggedInUser,
                req
              );
              const trackingURL = trackingInfo.trackingURL;
              docInfo.trackingURL = trackingURL || undefined;
            } catch (error) {
              docInfo.trackingURL = undefined;
            }

            return docInfo;
          })
        );

        return {
          tripId: trip.id.toString(),
          tripStartTime:
            trip.startedAt?.toISOString() || trip.createdAt.toISOString(),
          tripEndTime:
            trip.status === TripStatus.ENDED ||
            trip.status === TripStatus.CANCELLED
              ? trip.lastUpdatedAt.toISOString()
              : undefined,
          personName: trip.driver?.personName || "",
          driverName: trip.driver?.personName || "",
          vehicleNbr: trip.vehicleNbr || "",
          docList: docList,
        };
      })
    );

    return {
      trips: transformedTrips,
    };
  }

  /**
   * Get customer master data for filter dropdowns
   */
  @Get("customers")
  async getCustomerMasterData(
    @Query("lightweight") lightweight?: string
  ): Promise<any[]> {
    const isLightweight = lightweight === "true";
    return await this.customerService.getCustomerMasterData(isLightweight);
  }

  /**
   * Get route master data for filter dropdowns
   * Returns distinct routes from the last 2 months of doc records
   */
  @Get("routes")
  async getRouteMasterData(): Promise<string[]> {
    return await this.docService.getRouteMasterData();
  }

  /**
   * Get origin warehouse master data for filter dropdowns
   * Returns distinct origin warehouses from the last 2 months of doc records
   */
  @Get("origin-warehouses")
  async getOriginWarehouseMasterData(): Promise<string[]> {
    return await this.docService.getOriginWarehouseMasterData();
  }
}
