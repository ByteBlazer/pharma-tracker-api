import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { LocationItemDto } from "../dto/location-item.dto";
import { LocationRegisterRequestDto } from "../dto/location-register-request.dto";
import { UserLocationResponseDto } from "../dto/user-location-response.dto";
import { AppUser } from "../entities/app-user.entity";
import { LocationHeartbeat } from "../entities/location-heartbeat.entity";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(LocationHeartbeat)
    private locationHeartbeatRepository: Repository<LocationHeartbeat>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>
  ) {}

  async registerUserLocation(
    locationRegisterRequestDto: LocationRegisterRequestDto,
    loggedInUser: JwtPayload
  ) {
    try {
      // Create location heartbeat record
      const locationHeartbeat = this.locationHeartbeatRepository.create({
        appUserId: loggedInUser.id,
        geoLatitude: locationRegisterRequestDto.latitude,
        geoLongitude: locationRegisterRequestDto.longitude,
      });

      // Log user information for audit purposes
      console.log(
        `Location registered for user: ${loggedInUser.username} (${loggedInUser.id}) with roles: ${loggedInUser.roles}`
      );

      const savedLocation = await this.locationHeartbeatRepository.save(
        locationHeartbeat
      );

      return {
        success: true,
        message: "Location registered successfully",
        locationId: savedLocation.id,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      console.error("Error registering location:", error);
      throw new InternalServerErrorException("Failed to register location");
    }
  }

  async getUserLocations(
    userId: string,
    start: string | undefined,
    loggedInUser: JwtPayload
  ): Promise<UserLocationResponseDto> {
    try {
      // Check if the target user exists
      const targetUser = await this.appUserRepository.findOne({
        where: { id: userId },
      });

      if (!targetUser) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Calculate the start time
      let startTime: Date;
      if (start) {
        // Validate that start is a valid number string
        if (!/^\d+$/.test(start)) {
          throw new BadRequestException(
            "start must be a valid epoch timestamp (numbers only)"
          );
        }

        // Convert to number and validate range
        const startTimestamp = parseInt(start, 10);
        const minTimestamp = new Date("2000-01-01").getTime();
        const maxTimestamp = new Date("2100-01-01").getTime();

        if (startTimestamp < minTimestamp || startTimestamp > maxTimestamp) {
          throw new BadRequestException(
            "start must be a valid epoch timestamp (between year 2000 and 2100)"
          );
        }

        // Use provided epoch time
        startTime = new Date(startTimestamp);

        // Validate that the epoch time is valid
        if (isNaN(startTime.getTime())) {
          throw new BadRequestException("Invalid start time format");
        }
      } else {
        // Default to last 48 hours
        startTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      }

      // Fetch locations from the database
      const locations = await this.locationHeartbeatRepository.find({
        where: {
          appUserId: userId,
          receivedAt: MoreThan(startTime),
        },
        order: {
          receivedAt: "DESC",
        },
      });

      // Transform to response format
      const locationItems: LocationItemDto[] = locations.map((location) => ({
        id: location.id,
        latitude: location.geoLatitude,
        longitude: location.geoLongitude,
        receivedAt: location.receivedAt,
      }));

      // Log user information for audit purposes
      console.log(
        `Location query by ${loggedInUser.username} (${loggedInUser.id}) for user ${userId} - Found ${locationItems.length} locations`
      );

      return {
        success: true,
        message: `Found ${locationItems.length} location(s) for user ${targetUser.personName}`,
        locations: locationItems,
        totalCount: locationItems.length,
        targetUser: {
          id: targetUser.id,
          name: targetUser.personName,
        },
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error("Error fetching user locations:", error);
      throw new InternalServerErrorException("Failed to fetch user locations");
    }
  }
}
