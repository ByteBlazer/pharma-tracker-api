import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, IsNull, Between, Like, Repository } from "typeorm";
import { Doc } from "../entities/doc.entity";
import { DocStatus } from "../enums/doc-status.enum";
import { GlobalConstants } from "../GlobalConstants";
import { DeliveryReportResponseDto } from "../dto/delivery-report-response.dto";
import { DeliveryReportQueryDto } from "../dto/delivery-report-query.dto";

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Doc)
    private readonly docRepository: Repository<Doc>
  ) {}

  async getDeliveryReportData(
    queryDto: DeliveryReportQueryDto
  ): Promise<DeliveryReportResponseDto> {
    // Calculate date range
    let startDate: Date;
    let endDate: Date;

    if (queryDto.fromDate && queryDto.toDate) {
      startDate = new Date(queryDto.fromDate);
      endDate = new Date(queryDto.toDate);
      // Set endDate to end of day
      endDate.setHours(23, 59, 59, 999);

      // Validate date range doesn't exceed max days
      const daysDiff =
        Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;
      if (daysDiff > GlobalConstants.MAX_DELIVERY_REPORT_DAYS) {
        throw new BadRequestException(`Date range cannot exceed 1 month.`);
      }
    } else {
      // Default to last 30 days
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date();
      startDate.setDate(
        endDate.getDate() - GlobalConstants.MAX_DELIVERY_REPORT_DAYS
      );
      startDate.setHours(0, 0, 0, 0);
    }

    // Build where conditions using entity properties
    const whereConditions: any = {
      tripId: Not(IsNull()),
      status: In([DocStatus.DELIVERED, DocStatus.UNDELIVERED]),
      docDate: Between(startDate, endDate),
    };

    // Add optional filters using entity properties
    if (queryDto.customerId) {
      whereConditions.customerId = queryDto.customerId;
    }
    if (queryDto.docId) {
      whereConditions.id = Like(`%${queryDto.docId}%`);
    }
    if (queryDto.route) {
      whereConditions.route = queryDto.route;
    }
    if (queryDto.tripId) {
      whereConditions.tripId = queryDto.tripId;
    }
    if (queryDto.originWarehouse) {
      whereConditions.originWarehouse = queryDto.originWarehouse;
    }

    // Fetch docs using find API with customer and trip relations (including trip creator, baseLocation, and driver)
    let docs = await this.docRepository.find({
      where: whereConditions,
      relations: {
        customer: true,
        trip: { creator: { baseLocation: true }, driver: true },
      },
      order: { tripId: "DESC", customerId: "ASC" },
    });

    // Apply customer city filter if provided (since it's on related entity)
    // Support multiple cities as comma-separated values
    if (queryDto.customerCity) {
      const cities = queryDto.customerCity
        .split(",")
        .map((city) => city.trim())
        .filter((city) => city.length > 0);
      docs = docs.filter(
        (doc) => doc.customer?.city && cities.includes(doc.customer.city)
      );
    }

    // Apply driver filter if provided (using trip relation)
    if (queryDto.driverUserId) {
      docs = docs.filter((doc) => doc.trip?.drivenBy === queryDto.driverUserId);
    }

    // Apply trip start location filter if provided (baseLocationId of trip creator)
    if (queryDto.tripStartLocation) {
      docs = docs.filter(
        (doc) =>
          doc.trip?.creator?.baseLocationId === queryDto.tripStartLocation
      );
    }

    // Sort by tripId descending, then by customerId ascending
    docs.sort((a, b) => {
      // Primary sort: tripId descending
      if (b.tripId !== a.tripId) {
        return (b.tripId || 0) - (a.tripId || 0);
      }
      // Secondary sort: customerId ascending
      return (a.customerId || "").localeCompare(b.customerId || "");
    });

    // Transform results using entity properties
    const reportData = docs.map((doc) => {
      // Adjust lastUpdatedAt from UTC to IST (UTC+5:30)
      // TypeORM reads timestamps as UTC, but database stores them in IST
      // Add 5 hours 30 minutes (5.5 * 60 * 60 * 1000 milliseconds) to convert to IST
      const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
      const lastUpdatedAtIST = doc.lastUpdatedAt
        ? new Date(doc.lastUpdatedAt.getTime() + istOffset)
        : doc.lastUpdatedAt;

      return {
        docId: doc.id,
        status: doc.status,
        originWarehouse: doc.originWarehouse || "",
        docDate: doc.docDate,
        tripId: doc.tripId,
        comment: doc.comment || "",
        customerId: doc.customerId,
        lastUpdatedAt: lastUpdatedAtIST,
        firmName: doc.customer?.firmName || "",
        address: doc.customer?.address || "",
        city: doc.customer?.city || "",
        pincode: doc.customer?.pincode || "",
        createdBy: doc.trip?.createdBy || "",
        createdByPersonName: doc.trip?.creator?.personName || "",
        createdByLocation: doc.trip?.creator?.baseLocation?.name || "",
        drivenBy: doc.trip?.drivenBy || "",
        driverName: doc.trip?.driver?.personName || "",
        vehicleNbr: doc.trip?.vehicleNbr || "",
        route: doc.trip?.route || doc.route || "",
        tripStatus: doc.trip?.status || "",
      };
    });

    return {
      success: true,
      message: `Retrieved ${reportData.length} delivery report records`,
      data: reportData,
      totalRecords: reportData.length,
      statusCode: 200,
    };
  }
}
