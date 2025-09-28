import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, In, MoreThanOrEqual, Not } from "typeorm";
import { Trip } from "../entities/trip.entity";
import { Doc } from "../entities/doc.entity";
import { AppUser } from "../entities/app-user.entity";
import { AppUserXUserRole } from "../entities/app-user-x-user-role.entity";
import { Customer } from "../entities/customer.entity";
import { LocationHeartbeat } from "../entities/location-heartbeat.entity";
import { CreateTripDto } from "../dto/create-trip.dto";
import { TripOutputDto } from "../dto/trip-output.dto";
import { ScheduledTripsResponseDto } from "../dto/scheduled-trips-response.dto";
import { TripDetailsOutputDto } from "../dto/trip-details-output.dto";
import { DocGroupOutputDto } from "../dto/doc-group-output.dto";
import { DocOutputDto } from "../dto/doc-output.dto";
import { TripStatus } from "../enums/trip-status.enum";
import { DocStatus } from "../enums/doc-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { AvailableDriver } from "../interfaces/available-driver.interface";
import { GlobalConstants } from "../GlobalConstants";

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
    private dataSource: DataSource
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
  ): Promise<ScheduledTripsResponseDto> {
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

  async getAllScheduledTrips(): Promise<ScheduledTripsResponseDto> {
    return this.getScheduledTrips(
      null, // No user filtering - get all scheduled trips
      null, // No driver filtering
      "No trips have been scheduled.",
      "scheduled trip(s)"
    );
  }

  async getAllScheduledTripsForDriver(
    driverId: string
  ): Promise<ScheduledTripsResponseDto> {
    return this.getScheduledTrips(
      null, // No user filtering - get all scheduled trips for this driver
      driverId, // Filter by driver
      "No trips have been scheduled for this driver.",
      "scheduled trip(s) for this driver"
    );
  }

  async getAllMyScheduledTrips(
    loggedInUser: JwtPayload
  ): Promise<ScheduledTripsResponseDto> {
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
          }
        );
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: `Trip ${tripId} has been cancelled successfully. ${associatedDocs.length} document(s) have been moved back to READY_FOR_DISPATCH status.`,
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
    loggedInUser: JwtPayload
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
        `Cannot start trip ${tripId}.
        You already have another trip (ID: ${existingStartedTrip.id}) in STARTED status for which you are the driver.
        Please end the current trip before starting a new one.`
      );
    }

    // Check if trip has at least one associated document
    const associatedDocs = await this.docRepository.find({
      where: { tripId: tripId },
    });

    if (associatedDocs.length === 0) {
      throw new BadRequestException(
        `Trip ${tripId} has no associated documents. A trip must have at least one document to be started.`
      );
    }

    // Start transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update trip status to STARTED
      await queryRunner.manager.update(
        Trip,
        { id: tripId },
        { status: TripStatus.STARTED }
      );

      // Update all associated documents to ON_TRIP status
      await queryRunner.manager.update(
        Doc,
        { tripId: tripId },
        { status: DocStatus.ON_TRIP }
      );

      await queryRunner.commitTransaction();

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
          (doc) => doc.status === DocStatus.AT_TRANSIT_HUB
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
            customerId: doc.customerId,
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
        `Only trips in STARTED status can be ended. Current status: ${trip.status}`
      );
    }

    // Check if the logged-in user is the assigned driver
    if (loggedInUser.id !== trip.drivenBy) {
      throw new BadRequestException(
        `Only the assigned driver can end this trip. Assigned driver: ${trip.drivenBy}, Your ID: ${loggedInUser.id}`
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

    // Start transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update all documents with the specified lot to AT_TRANSIT_HUB status
      await queryRunner.manager.update(
        Doc,
        {
          tripId: tripId,
          lot: lotHeading,
        },
        { status: DocStatus.AT_TRANSIT_HUB }
      );

      await queryRunner.commitTransaction();

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
  ): Promise<ScheduledTripsResponseDto> {
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

    const response: ScheduledTripsResponseDto = {
      success: true,
      message: message,
      trips: tripsWithDetails,
      totalTrips: tripsWithDetails.length,
      statusCode: 200,
    };

    return response;
  }

  async getMyTrips(
    loggedInUser: JwtPayload
  ): Promise<ScheduledTripsResponseDto> {
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
        createdAt: "DESC",
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

    const response: ScheduledTripsResponseDto = {
      success: true,
      message: message,
      trips: tripsWithDetails,
      totalTrips: tripsWithDetails.length,
      statusCode: 200,
    };

    return response;
  }

  private async populateTripOutputDto(trip: Trip): Promise<TripOutputDto> {
    // Get route from one of the associated documents
    const associatedDoc = await this.docRepository.findOne({
      where: { tripId: trip.id },
      select: { route: true },
    });

    return {
      tripId: trip.id,
      createdBy: trip.creator.personName,
      createdById: trip.createdBy,
      driverName: trip.driver.personName,
      driverId: trip.drivenBy,
      vehicleNumber: trip.vehicleNbr,
      status: trip.status,
      route: associatedDoc?.route || "",
      createdAt: trip.createdAt,
      lastUpdatedAt: trip.lastUpdatedAt,
      creatorLocation: trip.creator.baseLocation?.name || "",
      driverLocation: trip.driver.baseLocation?.name || "",
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
}
