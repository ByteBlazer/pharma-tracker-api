import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  BadRequestException,
} from "@nestjs/common";
import { TripService } from "../services/trip.service";
import { CreateTripDto } from "../dto/create-trip.dto";
import { ScheduledTripsResponseDto } from "../dto/scheduled-trips-response.dto";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

@Controller("trip")
@UseGuards(JwtAuthGuard)
@RequireRoles()
export class TripController {
  constructor(private readonly tripService: TripService) {}

  @Post()
  async createTrip(
    @Body(ValidationPipe) createTripDto: CreateTripDto,
    @LoggedInUser() loggedInUser: JwtPayload
  ) {
    return await this.tripService.createTrip(createTripDto, loggedInUser);
  }

  @Get("available-drivers")
  async getAvailableDrivers(@LoggedInUser() loggedInUser: JwtPayload) {
    return await this.tripService.getAvailableDrivers(loggedInUser);
  }

  @Get("scheduled-trips-same-location")
  async getScheduledTripsFromSameLocation(
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<ScheduledTripsResponseDto> {
    return await this.tripService.getScheduledTripsFromSameLocation(
      loggedInUser
    );
  }

  @Get("scheduled-trips")
  async getAllScheduledTrips(): Promise<ScheduledTripsResponseDto> {
    return await this.tripService.getAllScheduledTrips();
  }

  @Get("scheduled-trips/driver/:driverId")
  async getAllScheduledTripsForDriver(
    @Param("driverId") driverId: string
  ): Promise<ScheduledTripsResponseDto> {
    return await this.tripService.getAllScheduledTripsForDriver(driverId);
  }

  @Get("my-scheduled-trips")
  async getAllMyScheduledTrips(
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<ScheduledTripsResponseDto> {
    return await this.tripService.getAllMyScheduledTrips(loggedInUser);
  }

  @Post("cancel/:tripId")
  async cancelTrip(
    @Param("tripId") tripId: string,
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<{ success: boolean; message: string; statusCode: number }> {
    const tripIdNumber = parseInt(tripId, 10);
    if (isNaN(tripIdNumber)) {
      throw new BadRequestException("Invalid trip ID. Must be a number.");
    }
    return await this.tripService.cancelTrip(tripIdNumber, loggedInUser);
  }
}
