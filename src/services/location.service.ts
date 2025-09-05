import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LocationRegisterRequestDto } from "../dto/location-register-request.dto";
import { AppUser } from "../entities/app-user.entity";
import { LocationHeartbeat } from "../entities/location-heartbeat.entity";

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(LocationHeartbeat)
    private locationHeartbeatRepository: Repository<LocationHeartbeat>,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>
  ) {}

  async registerLocation(
    locationRegisterRequestDto: LocationRegisterRequestDto,
    userId: string
  ) {
    try {
      // Validate that the user exists
      const user = await this.appUserRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new BadRequestException("User not found");
      }

      if (!user.isActive) {
        throw new BadRequestException("User account is inactive");
      }

      // Validate latitude and longitude format
      const latitude = parseFloat(locationRegisterRequestDto.latitude);
      const longitude = parseFloat(locationRegisterRequestDto.longitude);

      if (isNaN(latitude) || isNaN(longitude)) {
        throw new BadRequestException("Invalid latitude or longitude format");
      }

      if (latitude < -90 || latitude > 90) {
        throw new BadRequestException("Latitude must be between -90 and 90");
      }

      if (longitude < -180 || longitude > 180) {
        throw new BadRequestException("Longitude must be between -180 and 180");
      }

      // Create location heartbeat record
      const locationHeartbeat = this.locationHeartbeatRepository.create({
        appUserId: userId,
        geoLatitude: locationRegisterRequestDto.latitude,
        geoLongitude: locationRegisterRequestDto.longitude,
      });

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
}
