import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import {
  DataSource,
  In,
  IsNull,
  Like,
  MoreThanOrEqual,
  Not,
  Repository,
} from "typeorm";
import { CreateTripDto } from "../dto/create-trip.dto";
import { DocGroupOutputDto } from "../dto/doc-group-output.dto";
import { DocOutputDto } from "../dto/doc-output.dto";
import { TripsResponseDto } from "../dto/trips-response.dto";
import { TripDetailsOutputDto } from "../dto/trip-details-output.dto";
import { TripOutputDto } from "../dto/trip-output.dto";
import { AppUserXUserRole } from "../entities/app-user-x-user-role.entity";
import { AppUser } from "../entities/app-user.entity";
import { Customer } from "../entities/customer.entity";
import { Doc } from "../entities/doc.entity";
import { LocationHeartbeat } from "../entities/location-heartbeat.entity";
import { Trip } from "../entities/trip.entity";
import { DocStatus } from "../enums/doc-status.enum";
import { TripStatus } from "../enums/trip-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { GlobalConstants } from "../GlobalConstants";
import {
  getErpBaseUrl,
  getErpApiHeaders,
  getErpApiStatusUpdateHookUrl,
} from "../utils/erp-api.utils";
import { AvailableDriver } from "../interfaces/available-driver.interface";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { SettingsCacheService } from "./settings-cache.service";

@Injectable()
export class TripService {
  constructor(
    @InjectRepository(Trip)
    private tripRepository: Repository<Trip>,
    @InjectRepository(Doc)
    private docRepository: Repository<Doc>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(AppUserXUserRole)
    private appUserXUserRoleRepository: Repository<AppUserXUserRole>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(LocationHeartbeat)
    private locationHeartbeatRepository: Repository<LocationHeartbeat>,
    private dataSource: DataSource,
    private readonly settingsCacheService: SettingsCacheService
  ) {}

  async createTrip(createTripDto: CreateTripDto, loggedInUser: JwtPayload) {
    const {
      route,
      userIds,
      driverId,
      vehicleNbr: vehicleNumber,
    } = createTripDto;

    // Validate that all userIds exist and have documents in READY_FOR_DISPATCH status for the given route
    const documentsToLoad = await this.docRepository.find({
      where: {
        route: route,
        lastScannedBy: In(userIds),
        status: DocStatus.READY_FOR_DISPATCH,
      },
    });

    if (documentsToLoad.length === 0) {
      throw new BadRequestException(
        `No documents found for the specified route '${route}' and user IDs in READY_FOR_DISPATCH status.`
      );
    }

    // Validate that the driver exists
    const driver = await this.appUserRepository.findOne({
      where: { id: driverId },
    });

    if (!driver) {
      throw new BadRequestException(`Driver with ID '${driverId}' not found.`);
    }

    // Validate that the creator exists
    const creator = await this.appUserRepository.findOne({
      where: { id: loggedInUser.id },
    });

    if (!creator) {
      throw new BadRequestException(
        `Creator with ID '${loggedInUser.id}' not found.`
      );
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create the trip record
      const trip = queryRunner.manager.create(Trip, {
        createdBy: loggedInUser.id,
        drivenBy: driverId,
        vehicleNbr: vehicleNumber,
        route: route,
        status: TripStatus.SCHEDULED,
      });

      const savedTrip = await queryRunner.manager.save(trip);

      // Update all documents to TRIP_SCHEDULED status and assign trip ID
      await queryRunner.manager.update(
        Doc,
        {
          id: In(documentsToLoad.map((doc) => doc.id)),
        },
        {
          status: DocStatus.TRIP_SCHEDULED,
          tripId: savedTrip.id,
        }
      );

      await queryRunner.commitTransaction();

      // Update ERP with TRIP_SCHEDULED status for all documents (non-blocking)
      if (
        documentsToLoad.length > 0 &&
        this.settingsCacheService.getUpdateDocStatusToErp()
      ) {
        void Promise.all(
          documentsToLoad.map((doc) =>
            axios
              .post(
                `${getErpApiStatusUpdateHookUrl()}`,
                {
                  docId: doc.id,
                  status: DocStatus.TRIP_SCHEDULED,
                  userId: loggedInUser.id,
                },
                { headers: getErpApiHeaders() }
              )
              .catch((e) => {
                console.error(
                  `Failed to update doc ${doc.id} with status ${DocStatus.TRIP_SCHEDULED} at ERP API:`,
                  e
                );
              })
          )
        );
      }

      return {
        success: true,
        message: `Trip created successfully with ${documentsToLoad.length} documents loaded.`,
        tripId: savedTrip.id,
        documentsLoaded: documentsToLoad.length,
        route: route,
        driverId: driverId,
        vehicleNumber: vehicleNumber,
        statusCode: 201,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Failed to create trip: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async getAvailableDrivers(loggedInUser: JwtPayload) {
    // Get all users with APP_TRIP_DRIVER role from junction table
    const driverRoleMappings = await this.appUserXUserRoleRepository.find({
      where: { roleName: UserRole.APP_TRIP_DRIVER },
      select: { appUserId: true }, // Only select the user ID we need
    });

    // Extract unique user IDs
    const driverUserIds = [
      ...new Set(driverRoleMappings.map((mapping) => mapping.appUserId)),
    ];

    // Get user details for drivers using entity properties
    const drivers = await this.getUsersByIds(driverUserIds);

    // Transform to AvailableDriver format
    const availableDrivers: AvailableDriver[] = drivers.map((driver) => {
      const isSelf = driver.id === loggedInUser.id;
      const isSameLocation =
        driver.baseLocationId === loggedInUser.baseLocationId;

      let driverName = driver.personName;

      // Add [SELF] prefix if driver is self
      if (isSelf) {
        driverName = `[SELF] ${driverName}`;
      }
      // Add base location suffix if driver is from different location
      else if (!isSameLocation && driver.baseLocation?.name) {
        driverName = `${driverName} (${driver.baseLocation.name})`;
      }

      return {
        userId: driver.id,
        driverName: driverName,
        vehicleNumber: driver.vehicleNbr,
        baseLocationName: driver.baseLocation?.name || "",
        sameLocation: isSameLocation,
        self: isSelf,
      };
    });

    // Sort the drivers list according to priority:
    // 1. Self driver first
    // 2. Same location drivers second
    // 3. Different location drivers last
    availableDrivers.sort((a, b) => {
      // Self driver always comes first
      if (a.self && !b.self) return -1;
      if (!a.self && b.self) return 1;

      // If both are self or both are not self, sort by location
      if (a.sameLocation && !b.sameLocation) return -1;
      if (!a.sameLocation && b.sameLocation) return 1;

      // If same priority level, sort alphabetically by driver name
      return a.driverName.localeCompare(b.driverName);
    });

    return {
      success: true,
      message: `Found ${availableDrivers.length} available drivers`,
      drivers: availableDrivers,
      statusCode: 200,
    };
  }

  async getScheduledTripsFromSameLocation(
    loggedInUser: JwtPayload
  ): Promise<TripsResponseDto> {
    // Get the logged-in user's location ID
    const userLocationId = loggedInUser.baseLocationId;

    // Find all users who share the same location
    const usersInSameLocation = await this.appUserRepository.find({
      where: { baseLocationId: userLocationId },
      select: { id: true },
    });

    const userIdsInSameLocation = usersInSameLocation.map((user) => user.id);

    return this.getScheduledTrips(
      userIdsInSameLocation,
      null, // No driver filtering
      "No trips have been scheduled from your location.",
      "scheduled trip(s) from your location"
    );
  }

  async getAllScheduledTrips(): Promise<TripsResponseDto> {
    return this.getScheduledTrips(
      null, // No user filtering - get all scheduled trips
      null, // No driver filtering
      "No trips have been scheduled.",
      "scheduled trip(s)"
    );
  }

  async getAllTrips(): Promise<TripsResponseDto> {
    // Calculate 48 hours ago for ENDED trips filter
    const fortyEightHoursAgo = new Date();
    fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

    // Find trips with SCHEDULED, STARTED, or ENDED (within last 48 hours) status
    const allTrips = await this.tripRepository.find({
      where: [
        {
          status: TripStatus.SCHEDULED,
        },
        {
          status: TripStatus.STARTED,
        },
        {
          status: TripStatus.ENDED,
          lastUpdatedAt: MoreThanOrEqual(fortyEightHoursAgo),
        },
      ],
      relations: {
        creator: {
          baseLocation: true,
        },
        driver: {
          baseLocation: true,
        },
      },
      order: {
        lastUpdatedAt: "DESC",
      },
    });

    // Populate trip details using shared method
    const tripsWithDetails: TripOutputDto[] = await Promise.all(
      allTrips.map((trip) => this.populateTripOutputDto(trip))
    );

    const message =
      tripsWithDetails.length === 0
        ? "No trips found."
        : `Found ${tripsWithDetails.length} trip(s) (scheduled, started, or ended within last 48 hours).`;

    const response: TripsResponseDto = {
      success: true,
      message: message,
      trips: tripsWithDetails,
      totalTrips: tripsWithDetails.length,
      statusCode: 200,
    };

    return response;
  }

  async getAllScheduledTripsForDriver(
    driverId: string
  ): Promise<TripsResponseDto> {
    return this.getScheduledTrips(
      null, // No user filtering - get all scheduled trips for this driver
      driverId, // Filter by driver
      "No trips have been scheduled for this driver.",
      "scheduled trip(s) for this driver"
    );
  }

  async getAllMyScheduledTrips(
    loggedInUser: JwtPayload
  ): Promise<TripsResponseDto> {
    return this.getAllScheduledTripsForDriver(loggedInUser.id);
  }

  async cancelTrip(
    tripId: number,
    loggedInUser: JwtPayload
  ): Promise<{ success: boolean; message: string; statusCode: number }> {
    // Find the trip to validate it exists and check its status
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: {
        creator: {
          baseLocation: true,
        },
      },
    });

    if (!trip) {
      throw new BadRequestException(`Trip with ID '${tripId}' not found.`);
    }

    // Check if trip is in SCHEDULED status
    if (trip.status !== TripStatus.SCHEDULED) {
      throw new BadRequestException(
        `Only trips in SCHEDULED status can be cancelled. Current status: ${trip.status}`
      );
    }

    // Check if the logged-in user is from the same location as the trip creator
    if (loggedInUser.baseLocationId !== trip.creator.baseLocationId) {
      throw new BadRequestException(
        `Only users from the same location as the trip creator can cancel this trip. Trip creator location: ${
          trip.creator.baseLocation?.name || "Unknown"
        }, Your location: ${loggedInUser.baseLocationId}`
      );
    }

    // Start transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update trip status to CANCELLED
      await queryRunner.manager.update(
        Trip,
        { id: tripId },
        { status: TripStatus.CANCELLED }
      );

      // Find all documents associated with this trip
      const associatedDocs = await queryRunner.manager.find(Doc, {
        where: { tripId: tripId },
      });

      // Update all associated documents back to READY_FOR_DISPATCH status and remove trip association
      if (associatedDocs.length > 0) {
        await queryRunner.manager.update(
          Doc,
          { tripId: tripId },
          {
            status: DocStatus.READY_FOR_DISPATCH,
            tripId: null,
            transitHubLatitude: null,
            transitHubLongitude: null,
          }
        );
      }

      await queryRunner.commitTransaction();

      // Update ERP with READY_FOR_DISPATCH status for all cancelled documents (non-blocking)
      if (
        associatedDocs.length > 0 &&
        this.settingsCacheService.getUpdateDocStatusToErp()
      ) {
        void Promise.all(
          associatedDocs.map((doc) =>
            axios
              .post(
                `${getErpApiStatusUpdateHookUrl()}`,
                {
                  docId: doc.id,
                  status: DocStatus.READY_FOR_DISPATCH,
                  userId: loggedInUser.id,
                },
                { headers: getErpApiHeaders() }
              )
              .catch((e) => {
                console.error(
                  `Failed to update doc ${doc.id} with status ${DocStatus.READY_FOR_DISPATCH} at ERP API:`,
                  e
                );
              })
          )
        );
      }

      return {
        success: true,
        message: `Trip ${tripId} has been cancelled successfully. ${associatedDocs.length} document(s) moved back to READY_FOR_DISPATCH status.`,
        statusCode: 200,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Failed to cancel trip: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async startTrip(
    tripId: number,
    loggedInUser: JwtPayload,
    request?: any
  ): Promise<{ success: boolean; message: string; statusCode: number }> {
    // Find the trip to validate it exists and check its status
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
    });

    if (!trip) {
      throw new BadRequestException(`Trip with ID '${tripId}' not found.`);
    }

    // Check if trip is in SCHEDULED status
    if (trip.status !== TripStatus.SCHEDULED) {
      throw new BadRequestException(
        `Only trips in SCHEDULED status can be started. Current status: ${trip.status}`
      );
    }

    // Check if the logged-in user is the assigned driver
    if (loggedInUser.id !== trip.drivenBy) {
      throw new BadRequestException(
        `Only the assigned driver can start this trip. Assigned driver: ${trip.drivenBy}, Your ID: ${loggedInUser.id}`
      );
    }

    // Check if driver has any other trips in STARTED status
    const existingStartedTrip = await this.tripRepository.findOne({
      where: {
        drivenBy: loggedInUser.id,
        status: TripStatus.STARTED,
        id: Not(tripId), // Exclude the current trip
      },
    });

    if (existingStartedTrip) {
      throw new BadRequestException(
        `Cannot start trip #${tripId}. Another trip (#${existingStartedTrip.id}) is already ongoing for you. Please end that trip first.`
      );
    }

    // Check if trip has at least one associated document
    const associatedDocs = await this.docRepository.find({
      where: { tripId: tripId },
    });

    if (associatedDocs.length === 0) {
      throw new BadRequestException(
        `Trip #${tripId} has no associated documents. A trip must have at least one document to be started.`
      );
    }

    // Start transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update trip status to STARTED and set started_at timestamp
      await queryRunner.manager.update(
        Trip,
        { id: tripId },
        {
          status: TripStatus.STARTED,
          startedAt: new Date(),
        }
      );

      // Update all associated documents to ON_TRIP status
      await queryRunner.manager.update(
        Doc,
        { tripId: tripId },
        { status: DocStatus.ON_TRIP }
      );

      await queryRunner.commitTransaction();

      // Update ERP with ON_TRIP status for all associated documents (non-blocking)
      if (
        associatedDocs.length > 0 &&
        this.settingsCacheService.getUpdateDocStatusToErp()
      ) {
        void Promise.all(
          associatedDocs.map((doc) =>
            axios
              .post(
                `${getErpApiStatusUpdateHookUrl()}`,
                {
                  docId: doc.id,
                  status: DocStatus.ON_TRIP,
                  userId: loggedInUser.id,
                },
                { headers: getErpApiHeaders() }
              )
              .catch((e) => {
                console.error(
                  `Failed to update doc ${doc.id} with status ${DocStatus.ON_TRIP} at ERP API:`,
                  e
                );
              })
          )
        );
      }

      // Send SMS to customers for all documents that moved to ON_TRIP (non-blocking)
      if (associatedDocs.length > 0) {
        void Promise.all(
          associatedDocs.map(async (doc) => {
            try {
              // Get customer details
              const customer = await this.customerRepository.findOne({
                where: { id: doc.customerId },
              });

              // Check if tracking SMS is enabled via setting
              const sendTrackingSms =
                this.settingsCacheService.getSendTrackingSms();

              if (!sendTrackingSms) {
                console.log(
                  `Tracking SMS disabled via setting: Skipping tracking SMS for doc ${doc.id}`
                );
                return;
              }

              // Skip SMS in local Windows environment unless explicitly enabled
              if (
                process.platform === "win32" &&
                !GlobalConstants.ENABLE_TRACKING_SMS_IN_LOCAL
              ) {
                console.log(
                  `Windows environment: Skipping tracking SMS for doc ${doc.id} (set ENABLE_TRACKING_SMS_IN_LOCAL=true to test)`
                );
                return;
              }

              // Determine recipient phone number based on environment
              const isProduction = process.env.NODE_ENV === "production";
              const recipientPhone = isProduction
                ? customer.phone
                : loggedInUser.mobile;
              const recipientType = isProduction
                ? "customer"
                : "logged-in user";

              if (recipientPhone) {
                // Prepare SMS variables
                const variableMap = new Map();
                variableMap.set("VAR1", doc.id);

                variableMap.set(
                  "VAR2",
                  `${Buffer.from(doc.id).toString("base64")}`
                );

                // Build URL parameters from variables
                let urlParams = "";
                variableMap.forEach((value, key) => {
                  urlParams =
                    urlParams +
                    "&" +
                    key.toLowerCase() +
                    "=" +
                    encodeURIComponent(value);
                });

                // Send SMS using 2factor.in API
                const smsTemplateName = process.env.TRACK_SMS_TEMPLATE;
                const smsUrl =
                  GlobalConstants.SEND_SMS_URL_TEMPLATE.replace(
                    "{apikey}",
                    GlobalConstants.SMS_API_KEY
                  )
                    .replace("{recipientMobileNumber}", recipientPhone)
                    .replace("{smsTemplateName}", smsTemplateName) + urlParams;

                await axios.get(smsUrl, {
                  timeout: 10000,
                  headers: {
                    "User-Agent": "Mozilla/5.0",
                  },
                });

                console.log(
                  `SMS with URL ${smsUrl} sent successfully to ${recipientType} ${
                    isProduction ? customer.id : loggedInUser.id
                  } (${recipientPhone}) for doc ${doc.id}${
                    !isProduction
                      ? " [NON-PRODUCTION: redirected to logged-in user]"
                      : " [PRODUCTION: sent to customer]"
                  }`
                );
              } else {
                console.log(
                  `Skipping SMS for doc ${doc.id} - customer ${doc.customerId} has no phone number`
                );
              }
            } catch (error) {
              console.error(
                `Failed to send SMS for doc ${doc.id} to customer ${doc.customerId}`
              );
            }
          })
        );
      }

      return {
        success: true,
        message: `Trip ${tripId} has been started successfully. ${associatedDocs.length} document(s) are now ON_TRIP.`,
        statusCode: 200,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Failed to start trip: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async getTripDetails(tripId: number): Promise<TripDetailsOutputDto> {
    // Find the trip with all relations
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
      relations: {
        creator: {
          baseLocation: true,
        },
        driver: {
          baseLocation: true,
        },
      },
    });

    if (!trip) {
      throw new BadRequestException(`Trip with ID '${tripId}' not found.`);
    }

    // Get all documents associated with this trip with customer information
    const docs = await this.docRepository.find({
      where: { tripId: tripId },
      relations: { customer: true },
      order: { lot: "ASC", id: "ASC" },
    });

    // Get driver's recent location (within last 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const driverLocation = await this.locationHeartbeatRepository.findOne({
      where: {
        appUserId: trip.drivenBy,
        receivedAt: MoreThanOrEqual(oneHourAgo),
      },
      order: { receivedAt: "DESC" },
    });

    // Group documents by lot with distance sorting
    const docGroups = this.groupDocumentsByLot(docs, driverLocation);

    // Create the base trip details using shared method
    const baseTripDetails = await this.populateTripOutputDto(trip);

    // Create the trip details response with document groups
    const tripDetails: TripDetailsOutputDto = {
      ...baseTripDetails,
      docGroups: docGroups,
    };

    return tripDetails;
  }

  private groupDocumentsByLot(
    docs: Doc[],
    driverLocation?: LocationHeartbeat
  ): DocGroupOutputDto[] {
    const groupedDocs = new Map<string, Doc[]>();

    // Group documents by lot
    docs.forEach((doc) => {
      const lotKey = doc.lot || GlobalConstants.DIRECT_DELIVERIES_GROUP_HEADING;
      if (!groupedDocs.has(lotKey)) {
        groupedDocs.set(lotKey, []);
      }
      groupedDocs.get(lotKey)!.push(doc);
    });

    // Convert to DocGroupOutputDto array
    const docGroups: DocGroupOutputDto[] = Array.from(
      groupedDocs.entries()
    ).map(([lot, docsInGroup]) => {
      const isDirectDelivery =
        lot === GlobalConstants.DIRECT_DELIVERIES_GROUP_HEADING;

      // Sort documents within the group by distance if driver location is available
      const sortedDocs = this.sortDocsByDistance(docsInGroup, driverLocation);

      // Calculate dropOffCompleted for lot groups
      let dropOffCompleted = false;
      if (!isDirectDelivery) {
        // For lot groups, check if all docs are in AT_TRANSIT_HUB status

        dropOffCompleted = docsInGroup.every(
          (doc) =>
            doc.status === DocStatus.AT_TRANSIT_HUB ||
            doc.status === DocStatus.DELIVERED ||
            doc.status === DocStatus.UNDELIVERED
        );
      }
      // For Direct Deliveries, dropOffCompleted is always false

      // Calculate showDropOffButton
      let showDropOffButton = false;
      if (!isDirectDelivery && !dropOffCompleted) {
        // For lot groups, show button if not completed
        showDropOffButton = true;
      }

      return {
        heading: lot,
        droppable: !isDirectDelivery, // true for lot groups, false for direct deliveries
        dropOffCompleted: dropOffCompleted,
        showDropOffButton: showDropOffButton,
        expandGroupByDefault: isDirectDelivery, // true for direct deliveries, false for lot groups
        docs: sortedDocs.map(
          (doc): DocOutputDto => ({
            id: doc.id,
            status: doc.status,
            lastScannedBy: doc.lastScannedBy,
            originWarehouse: doc.originWarehouse,
            tripId: doc.tripId,
            docDate: doc.docDate,
            docAmount: doc.docAmount,
            route: doc.route,
            lot: doc.lot,
            comment: doc.comment || "",
            customerId: doc.customerId,
            transitHubLatitude: doc.transitHubLatitude || "",
            transitHubLongitude: doc.transitHubLongitude || "",
            createdAt: doc.createdAt,
            lastUpdatedAt: doc.lastUpdatedAt,
            // Customer fields
            customerFirmName: doc.customer?.firmName || "",
            customerAddress: doc.customer?.address || "",
            customerCity: doc.customer?.city || "",
            customerPincode: doc.customer?.pincode || "",
            customerPhone: doc.customer?.phone || "",
            customerGeoLatitude: doc.customer?.geoLatitude || "",
            customerGeoLongitude: doc.customer?.geoLongitude || "",
          })
        ),
      };
    });

    // Sort groups: lot groups alphabetically first, then Direct Deliveries last
    docGroups.sort((a, b) => {
      if (a.heading === GlobalConstants.DIRECT_DELIVERIES_GROUP_HEADING)
        return 1;
      if (b.heading === GlobalConstants.DIRECT_DELIVERIES_GROUP_HEADING)
        return -1;
      return a.heading.localeCompare(b.heading);
    });

    return docGroups;
  }

  private sortDocsByDistance(
    docs: Doc[],
    driverLocation?: LocationHeartbeat
  ): Doc[] {
    // If no driver location available, return docs as-is
    if (!driverLocation) {
      return docs;
    }

    // Parse driver location
    const driverLat = parseFloat(driverLocation.geoLatitude);
    const driverLng = parseFloat(driverLocation.geoLongitude);

    // If driver location is invalid, return docs as-is
    if (isNaN(driverLat) || isNaN(driverLng)) {
      return docs;
    }

    // Sort docs by distance, putting docs without customer location at the end
    return docs.sort((a, b) => {
      const aHasLocation = a.customer?.geoLatitude && a.customer?.geoLongitude;
      const bHasLocation = b.customer?.geoLatitude && b.customer?.geoLongitude;

      // If both have location data, sort by distance
      if (aHasLocation && bHasLocation) {
        const aLat = parseFloat(a.customer!.geoLatitude!);
        const aLng = parseFloat(a.customer!.geoLongitude!);
        const bLat = parseFloat(b.customer!.geoLatitude!);
        const bLng = parseFloat(b.customer!.geoLongitude!);

        if (!isNaN(aLat) && !isNaN(aLng) && !isNaN(bLat) && !isNaN(bLng)) {
          const distanceA = this.calculateDistance(
            driverLat,
            driverLng,
            aLat,
            aLng
          );
          const distanceB = this.calculateDistance(
            driverLat,
            driverLng,
            bLat,
            bLng
          );
          return distanceA - distanceB;
        }
      }

      // If only one has location data, put the one without location at the end
      if (aHasLocation && !bHasLocation) return -1;
      if (!aHasLocation && bHasLocation) return 1;

      // If neither has location data, maintain original order
      return 0;
    });
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    // Haversine formula to calculate distance between two points
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  async endTrip(
    tripId: number,
    loggedInUser: JwtPayload
  ): Promise<{
    success: boolean;
    message: string;
    statusCode: number;
    pendingDocsCount?: number;
  }> {
    // Find the trip to validate it exists and check its status
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
    });

    if (!trip) {
      throw new BadRequestException(`Trip with ID '${tripId}' not found.`);
    }

    // Check if trip is in STARTED status
    if (trip.status !== TripStatus.STARTED) {
      throw new BadRequestException(
        `Only trips in STARTED status can be ended. Current status: ${trip.status}`
      );
    }

    // Check if the logged-in user is the assigned driver
    if (loggedInUser.id !== trip.drivenBy) {
      throw new BadRequestException(
        `Only the assigned driver can end this trip. Assigned driver: ${trip.drivenBy}, Your ID: ${loggedInUser.id}`
      );
    }

    // Check all direct delivery documents in the trip to ensure they are either delivered or undelivered
    // Only consider direct deliveries (lot === null), exclude lot-based documents
    const pendingDocs = await this.docRepository.find({
      where: {
        tripId: tripId,
        lot: IsNull(), // lot is null or an empty string
        status: Not(In([DocStatus.DELIVERED, DocStatus.UNDELIVERED])),
      },
    });

    if (pendingDocs.length > 0) {
      throw new BadRequestException(
        `Cannot end trip. ${pendingDocs.length} deliveries still pending. Please mark all direct delivery documents as delivered or failed delivery before ending the trip.`
      );
    }

    // Check if any lot-based documents still need to be dropped off
    const pendingLotDocs = await this.docRepository.find({
      where: {
        tripId: tripId,
        lot: Not(IsNull()),
      },
    });

    if (pendingLotDocs.length > 0) {
      throw new BadRequestException(
        `Cannot end trip. Some lots still need to be dropped off.`
      );
    }

    // Start transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update trip status to ENDED
      await queryRunner.manager.update(
        Trip,
        { id: tripId },
        { status: TripStatus.ENDED }
      );

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `Trip ${tripId} has been successfully ended.`,
        statusCode: 200,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Failed to end trip: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async forceEndTrip(
    tripId: number,
    loggedInUser: JwtPayload
  ): Promise<{
    success: boolean;
    message: string;
    statusCode: number;
    markedUndeliveredCount: number;
  }> {
    // Find the trip to validate it exists and check its status
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
    });

    if (!trip) {
      throw new BadRequestException(`Trip with ID '${tripId}' not found.`);
    }

    // Check if trip is in STARTED status
    if (trip.status !== TripStatus.STARTED) {
      throw new BadRequestException(
        `Only trips in STARTED status can be force ended. Current status: ${trip.status}`
      );
    }

    // Get user details for the comment
    const user = await this.appUserRepository.findOne({
      where: { id: loggedInUser.id },
    });

    const userName = user ? user.personName : loggedInUser.id;

    // Find all documents that need to be marked as undelivered
    // Exclude documents from lots that have been dropped off (AT_TRANSIT_HUB status)
    const docsToMarkUndelivered = await this.docRepository.find({
      where: {
        tripId: tripId,
        status: Not(
          In([
            DocStatus.DELIVERED,
            DocStatus.UNDELIVERED,
            DocStatus.AT_TRANSIT_HUB,
          ])
        ),
      },
    });

    // Start transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Mark all remaining documents as undelivered
      if (docsToMarkUndelivered.length > 0) {
        await queryRunner.manager.update(
          Doc,
          {
            tripId: tripId,
            status: Not(
              In([
                DocStatus.DELIVERED,
                DocStatus.UNDELIVERED,
                DocStatus.AT_TRANSIT_HUB,
              ])
            ),
          },
          {
            status: DocStatus.UNDELIVERED,
            comment: `Trip force ended by user ${userName}`,
            lastUpdatedAt: new Date(),
          }
        );
      }

      // Update trip status to ENDED
      await queryRunner.manager.update(
        Trip,
        { id: tripId },
        { status: TripStatus.ENDED }
      );

      await queryRunner.commitTransaction();

      // The ERP API only accepts a single docId, so send the request one by one for each doc.
      // Fire off all ERP API requests in parallel; don't await for each to finish
      if (
        docsToMarkUndelivered.length > 0 &&
        this.settingsCacheService.getUpdateDocStatusToErp()
      ) {
        void Promise.all(
          docsToMarkUndelivered.map((doc) =>
            axios
              .post(
                `${getErpApiStatusUpdateHookUrl()}`,
                {
                  docId: doc.id,
                  status: DocStatus.UNDELIVERED,
                  userId: loggedInUser.id,
                },
                { headers: getErpApiHeaders() }
              )
              .catch((e) => {
                console.error(
                  `Failed to update doc ${doc.id} with status ${DocStatus.UNDELIVERED} at ERP API:`,
                  e
                );
              })
          )
        );
      }

      return {
        success: true,
        message: `Trip ${tripId} has been force ended successfully. ${docsToMarkUndelivered.length} document(s) marked as undelivered.`,
        statusCode: 200,
        markedUndeliveredCount: docsToMarkUndelivered.length,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Failed to force end trip: ${error.message}`
      );
    } finally {
      await queryRunner.release();
    }
  }

  async dropOffLot(
    tripId: number,
    lotHeading: string,
    loggedInUser: JwtPayload
  ): Promise<{ success: boolean; message: string; statusCode: number }> {
    // Find the trip to validate it exists and check its status
    const trip = await this.tripRepository.findOne({
      where: { id: tripId },
    });

    if (!trip) {
      throw new BadRequestException(`Trip with ID '${tripId}' not found.`);
    }

    // Check if trip is in STARTED status
    if (trip.status !== TripStatus.STARTED) {
      throw new BadRequestException(
        `Only trips in STARTED status can drop off lots. Current status: ${trip.status}`
      );
    }

    // Check if the logged-in user is the assigned driver
    if (loggedInUser.id !== trip.drivenBy) {
      throw new BadRequestException(
        `Only the assigned driver can drop off lots for this trip. Assigned driver: ${trip.drivenBy}, Your ID: ${loggedInUser.id}`
      );
    }

    // Validate that the lot heading is not "Direct Deliveries"
    if (lotHeading === GlobalConstants.DIRECT_DELIVERIES_GROUP_HEADING) {
      throw new BadRequestException(
        `Cannot drop off '${lotHeading}' group. Direct deliveries must be delivered individually.`
      );
    }

    // Find all documents in the trip with the specified lot heading
    const docsToUpdate = await this.docRepository.find({
      where: {
        tripId: tripId,
        lot: lotHeading,
      },
    });

    if (docsToUpdate.length === 0) {
      throw new BadRequestException(
        `No documents found with lot heading '${lotHeading}' in trip ${tripId}.`
      );
    }

    // Get driver's last known location
    const driverLastLocation = await this.locationHeartbeatRepository.findOne({
      where: { appUserId: trip.drivenBy },
      order: { receivedAt: "DESC" },
    });

    // Start transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Prepare update data - populate coordinates if available
      const updateData: any = {
        status: DocStatus.AT_TRANSIT_HUB,
        tripId: null,
      };

      // Add driver's location if available
      if (driverLastLocation) {
        updateData.transitHubLatitude = driverLastLocation.geoLatitude;
        updateData.transitHubLongitude = driverLastLocation.geoLongitude;
      }

      // Update all documents with the specified lot to AT_TRANSIT_HUB status
      // Only update if current status is ON_TRIP
      // Remove tripId as document is no longer part of active trip
      await queryRunner.manager.update(
        Doc,
        {
          tripId: tripId,
          lot: lotHeading,
          status: DocStatus.ON_TRIP,
        },
        updateData
      );

      await queryRunner.commitTransaction();

      // The ERP API only accepts a single docId, so send the request one by one for each doc.
      // Fire off all ERP API requests in parallel; don't await for each to finish
      if (this.settingsCacheService.getUpdateDocStatusToErp()) {
        void Promise.all(
          docsToUpdate.map((doc) =>
            axios
              .post(
                `${getErpApiStatusUpdateHookUrl()}`,
                {
                  docId: doc.id,
                  status: DocStatus.AT_TRANSIT_HUB,
                  userId: loggedInUser.id,
                },
                { headers: getErpApiHeaders() }
              )
              .catch((e) => {
                // Optionally log error here; errors won't block main flow
                console.error(
                  `Failed to update doc ${doc.id} with status ${DocStatus.AT_TRANSIT_HUB} at ERP API:`,
                  e
                );
              })
          )
        );
      }

      return {
        success: true,
        message: `Successfully dropped off ${docsToUpdate.length} document(s) from lot '${lotHeading}' at transit hub.`,
        statusCode: 200,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Failed to drop off lot: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  private async getScheduledTrips(
    userIds: string[] | null,
    driverId: string | null,
    noTripsMessage: string,
    foundTripsMessage: string
  ): Promise<TripsResponseDto> {
    // Build the where condition
    const whereCondition: any = {
      status: TripStatus.SCHEDULED,
    };

    // Add user filtering if userIds is provided
    if (userIds && userIds.length > 0) {
      whereCondition.createdBy = In(userIds);
    }

    // Add driver filtering if driverId is provided
    if (driverId) {
      whereCondition.drivenBy = driverId;
    }

    // Find scheduled trips
    const scheduledTrips = await this.tripRepository.find({
      where: whereCondition,
      relations: {
        creator: {
          baseLocation: true,
        },
        driver: {
          baseLocation: true,
        },
      },
      order: {
        createdAt: "DESC",
      },
    });

    // Populate trip details using shared method
    const tripsWithDetails: TripOutputDto[] = await Promise.all(
      scheduledTrips.map((trip) => this.populateTripOutputDto(trip))
    );

    const message =
      tripsWithDetails.length === 0
        ? noTripsMessage
        : `Found ${tripsWithDetails.length} ${foundTripsMessage}.`;

    const response: TripsResponseDto = {
      success: true,
      message: message,
      trips: tripsWithDetails,
      totalTrips: tripsWithDetails.length,
      statusCode: 200,
    };

    return response;
  }

  async getMyTrips(loggedInUser: JwtPayload): Promise<TripsResponseDto> {
    // Build the where condition for SCHEDULED or STARTED trips
    const whereCondition: any = {
      drivenBy: loggedInUser.id,
      status: In([TripStatus.SCHEDULED, TripStatus.STARTED]),
    };

    // Find trips with SCHEDULED or STARTED status for the driver
    const trips = await this.tripRepository.find({
      where: whereCondition,
      relations: {
        creator: {
          baseLocation: true,
        },
        driver: {
          baseLocation: true,
        },
      },
      order: {
        status: "DESC", // STARTED comes before SCHEDULED (alphabetically DESC)
        createdAt: "DESC", // Within each status, newest first
      },
    });

    // Populate trip details using shared method
    const tripsWithDetails: TripOutputDto[] = await Promise.all(
      trips.map((trip) => this.populateTripOutputDto(trip))
    );

    const message =
      tripsWithDetails.length === 0
        ? "No trips found for you."
        : `Found ${tripsWithDetails.length} trip(s) found for you.`;

    const response: TripsResponseDto = {
      success: true,
      message: message,
      trips: tripsWithDetails,
      totalTrips: tripsWithDetails.length,
      statusCode: 200,
    };

    return response;
  }

  private async populateTripOutputDto(trip: Trip): Promise<TripOutputDto> {
    let driverLastLocation = null;
    let driverLastKnownLatitude = "";
    let driverLastKnownLongitude = "";
    let driverLastLocationUpdateTime = null;

    // Only populate driver location for STARTED trips
    if (trip.status === TripStatus.STARTED && trip.startedAt) {
      // Get driver's location heartbeat that occurred after trip start time minus 1 minute
      const oneMinuteBeforeStart = new Date(
        trip.startedAt.getTime() - 60 * 1000
      );

      driverLastLocation = await this.locationHeartbeatRepository.findOne({
        where: {
          appUserId: trip.drivenBy,
          receivedAt: MoreThanOrEqual(oneMinuteBeforeStart),
        },
        order: { receivedAt: "DESC" },
      });

      if (driverLastLocation) {
        driverLastKnownLatitude = driverLastLocation.geoLatitude || "";
        driverLastKnownLongitude = driverLastLocation.geoLongitude || "";
        driverLastLocationUpdateTime = driverLastLocation.receivedAt;
      }
    }

    // Fetch all documents for this trip to calculate the new attributes
    const docs = await this.docRepository.find({
      where: { tripId: trip.id },
    });
    if (trip.id == 57) {
      console.log(docs);
    }

    // Calculate pendingDirectDeliveries: docs with null lot (direct deliveries) that are NOT DELIVERED/UNDELIVERED
    const directDeliveryDocs = docs.filter((doc) => doc.lot === null);
    const pendingDirectDeliveries = directDeliveryDocs.filter(
      (doc) =>
        doc.status !== DocStatus.DELIVERED &&
        doc.status !== DocStatus.UNDELIVERED
    ).length;

    // Calculate totalDirectDeliveries: all docs with null lot (direct deliveries) - ignore status
    const totalDirectDeliveries = directDeliveryDocs.length;

    // Calculate pendingLotDropOffs: number of unique lot groups (docs with populated lot)
    const lotGroups = new Set(
      docs.map((doc) => doc.lot).filter((lot) => lot !== null)
    );
    const pendingLotDropOffs = lotGroups.size;

    let deliveryCountStatusMsg = "";
    let dropoffCountStatusMsg = "";
    const getDirectDeliveryStatusMsg = () => {
      if (totalDirectDeliveries === 0) return "No Direct Deliveries";
      if (trip.status === TripStatus.SCHEDULED)
        return `Direct Deliveries: ${totalDirectDeliveries}`;
      if (pendingDirectDeliveries === 0) return "No Pending Deliveries";
      return `Deliveries: ${pendingDirectDeliveries} pending out of ${totalDirectDeliveries}`;
    };

    const getLotDropOffStatusMsg = () => {
      if (pendingLotDropOffs === 0) return "No Lots To Be Dropped Off";
      return `Lots To Be Dropped Off: ${pendingLotDropOffs}`;
    };

    deliveryCountStatusMsg = getDirectDeliveryStatusMsg();
    dropoffCountStatusMsg = getLotDropOffStatusMsg();

    return {
      tripId: trip.id,
      createdBy: trip.creator.personName,
      createdById: trip.createdBy,
      driverName: trip.driver.personName,
      driverId: trip.drivenBy,
      driverPhoneNumber: trip.driver.mobile || "",
      vehicleNumber: trip.vehicleNbr,
      status: trip.status,
      route: trip.route,
      createdAt: trip.createdAt,
      startedAt: trip.startedAt,
      lastUpdatedAt: trip.lastUpdatedAt,
      creatorLocation: trip.creator.baseLocation?.name || "",
      driverLocation: trip.driver.baseLocation?.name || "",
      // Driver's last known location (only for STARTED trips)
      driverLastKnownLatitude: driverLastKnownLatitude,
      driverLastKnownLongitude: driverLastKnownLongitude,
      driverLastLocationUpdateTime: driverLastLocationUpdateTime,
      // New attributes
      pendingDirectDeliveries: pendingDirectDeliveries,
      totalDirectDeliveries: totalDirectDeliveries,
      deliveryCountStatusMsg: deliveryCountStatusMsg,
      pendingLotDropOffs: pendingLotDropOffs,
      dropOffCountStatusMsg: dropoffCountStatusMsg,
    };
  }

  private async getUsersByIds(userIds: string[]) {
    // Use entity property names directly - TypeORM will handle the column mapping
    return await this.appUserRepository.find({
      where: { id: In(userIds) },
      select: {
        id: true,
        personName: true,
        baseLocationId: true,
        vehicleNbr: true,
      },
      relations: {
        baseLocation: true,
      },
    });
  }

  async getTripsByDateRange(startDate: Date, endDate: Date): Promise<Trip[]> {
    return await this.tripRepository.find({
      where: {
        createdAt: MoreThanOrEqual(startDate),
      },
      relations: {
        creator: {
          baseLocation: true,
        },
        driver: {
          baseLocation: true,
        },
      },
      order: {
        createdAt: "DESC",
      },
    });
  }

  async getDocTripInfo(docId: string): Promise<{
    docId: string;
    docStatus: DocStatus;
    tripId?: number;
    tripStatus?: TripStatus;
  }> {
    // Find the document
    // Do a contains search for docId substring
    const docs = await this.docRepository.find({
      where: { id: In([docId]) }, // fallback if needed
    });

    // Use contains search instead of exact match
    // Use find with LIKE (TypeORM)
    const foundDocs = await this.docRepository.find({
      where: { id: Like(`%${docId}%`) },
    });

    let doc = null;
    if (foundDocs.length === 1) {
      doc = foundDocs[0];
    }
    // If 0 or multiple results, consider it as no match (leave doc as null)

    if (!doc) {
      throw new BadRequestException(`Document with ID '${docId}' not found.`);
    }

    // If document is not part of any trip
    if (!doc.tripId) {
      return {
        docId: doc.id,
        docStatus: doc.status as DocStatus,
      };
    }

    // Find the trip information
    const trip = await this.tripRepository.findOne({
      where: { id: doc.tripId },
    });

    if (!trip) {
      // Document has tripId but trip doesn't exist (data inconsistency)
      return {
        docId: doc.id,
        docStatus: doc.status as DocStatus,
      };
    }

    return {
      docId: doc.id,
      docStatus: doc.status as DocStatus,
      tripId: trip.id,
      tripStatus: trip.status,
    };
  }
}
