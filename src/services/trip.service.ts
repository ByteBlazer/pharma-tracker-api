import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, In } from "typeorm";
import { Trip } from "../entities/trip.entity";
import { Doc } from "../entities/doc.entity";
import { AppUser } from "../entities/app-user.entity";
import { AppUserXUserRole } from "../entities/app-user-x-user-role.entity";
import { CreateTripDto } from "../dto/create-trip.dto";
import { TripStatus } from "../enums/trip-status.enum";
import { DocStatus } from "../enums/doc-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { AvailableDriver } from "../interfaces/available-driver.interface";

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
