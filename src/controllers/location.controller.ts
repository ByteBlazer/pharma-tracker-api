import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Param,
} from "@nestjs/common";
import { LocationRegisterRequestDto } from "../dto/location-register-request.dto";
import { LocationRegisterResponseDto } from "../dto/location-register-response.dto";
import { UserLocationResponseDto } from "../dto/user-location-response.dto";
import { LocationService } from "../services/location.service";
import { Throttle } from "@nestjs/throttler";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { RoleGuard } from "../guards/role.guard";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { UserRole } from "../enums/user-role.enum";

@Controller("location")
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get("user/:userId")
  @RequireRoles(UserRole.WEB_ACCESS, UserRole.APP_ADMIN)
  async getUserLocations(
    @Param("userId") userId: string,
    @Query("start") start: string,
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<UserLocationResponseDto> {
    return this.locationService.getUserLocations(userId, start, loggedInUser);
  }

  @Post("register")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_TRIP_DRIVER)
  @Throttle({ default: { limit: 200, ttl: 1 * 60 * 1000 } })
  async registerUserLocation(
    @Body() locationRegisterRequestDto: LocationRegisterRequestDto,
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<LocationRegisterResponseDto> {
    return this.locationService.registerUserLocation(
      locationRegisterRequestDto,
      loggedInUser
    );
  }
}
