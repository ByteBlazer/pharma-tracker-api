import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ValidationPipe,
  BadRequestException,
  Req,
  Query,
} from "@nestjs/common";
import { TripService } from "../services/trip.service";
import { CreateTripDto } from "../dto/create-trip.dto";
import { TripsResponseDto } from "../dto/trips-response.dto";
import { TripDetailsOutputDto } from "../dto/trip-details-output.dto";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { UserRole } from "../enums/user-role.enum";
import { DocStatus } from "src/enums/doc-status.enum";
import { TripStatus } from "src/enums/trip-status.enum";

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
  ): Promise<TripsResponseDto> {
    return await this.tripService.getScheduledTripsFromSameLocation(
      loggedInUser
    );
  }

  @Get("scheduled-trips")
  async getAllScheduledTrips(): Promise<TripsResponseDto> {
    return await this.tripService.getAllScheduledTrips();
  }

  @Get("all-trips")
  @RequireRoles(UserRole.WEB_ACCESS)
  async getAllTrips(): Promise<TripsResponseDto> {
    return await this.tripService.getAllTrips();
  }

  @Get("scheduled-trips/driver/:driverId")
  async getAllScheduledTripsForDriver(
    @Param("driverId") driverId: string
  ): Promise<TripsResponseDto> {
    return await this.tripService.getAllScheduledTripsForDriver(driverId);
  }

  @Get("my-scheduled-trips")
  async getAllMyScheduledTrips(
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<TripsResponseDto> {
    return await this.tripService.getAllMyScheduledTrips(loggedInUser);
  }

  @Get("my-trips")
  async getMyTrips(
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<TripsResponseDto> {
    return await this.tripService.getMyTrips(loggedInUser);
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

  @Post("start/:tripId")
  async startTrip(
    @Param("tripId") tripId: string,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Req() request: any
  ): Promise<{ success: boolean; message: string; statusCode: number }> {
    const tripIdNumber = parseInt(tripId, 10);
    if (isNaN(tripIdNumber)) {
      throw new BadRequestException("Invalid trip ID. Must be a number.");
    }
    return await this.tripService.startTrip(
      tripIdNumber,
      loggedInUser,
      request
    );
  }

  @Post("end/:tripId")
  async endTrip(
    @Param("tripId") tripId: string,
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<{
    success: boolean;
    message: string;
    statusCode: number;
    pendingDocsCount?: number;
  }> {
    const tripIdNumber = parseInt(tripId, 10);
    if (isNaN(tripIdNumber)) {
      throw new BadRequestException("Invalid trip ID. Must be a number.");
    }
    return await this.tripService.endTrip(tripIdNumber, loggedInUser);
  }

  @Post("force-end/:tripId")
  @RequireRoles(UserRole.WEB_ACCESS, UserRole.APP_ADMIN)
  async forceEndTrip(
    @Param("tripId") tripId: string,
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<{
    success: boolean;
    message: string;
    statusCode: number;
    markedUndeliveredCount: number;
  }> {
    const tripIdNumber = parseInt(tripId, 10);
    if (isNaN(tripIdNumber)) {
      throw new BadRequestException("Invalid trip ID. Must be a number.");
    }
    return await this.tripService.forceEndTrip(tripIdNumber, loggedInUser);
  }

  @Post("drop-off-lot/:tripId/:lotHeading")
  async dropOffLot(
    @Param("tripId") tripId: string,
    @Param("lotHeading") lotHeading: string,
    @LoggedInUser() loggedInUser: JwtPayload
  ): Promise<{ success: boolean; message: string; statusCode: number }> {
    const tripIdNumber = parseInt(tripId, 10);
    if (isNaN(tripIdNumber)) {
      throw new BadRequestException("Invalid trip ID. Must be a number.");
    }
    if (!lotHeading || lotHeading.trim() === "") {
      throw new BadRequestException("Lot heading is required.");
    }
    return await this.tripService.dropOffLot(
      tripIdNumber,
      lotHeading.trim(),
      loggedInUser
    );
  }

  @Get(":tripId")
  async getTripDetails(
    @Param("tripId") tripId: string
  ): Promise<TripDetailsOutputDto> {
    const tripIdNumber = parseInt(tripId, 10);
    if (isNaN(tripIdNumber)) {
      throw new BadRequestException("Invalid trip ID. Must be a number.");
    }
    return await this.tripService.getTripDetails(tripIdNumber);
  }

  @Get("doc-search/:docId")
  async getDocTripInfo(@Param("docId") docId: string): Promise<{
    docId: string;
    docStatus: DocStatus;
    tripId?: number;
    tripStatus?: TripStatus;
  }> {
    if (!docId || docId.trim() === "") {
      throw new BadRequestException("Document ID is required.");
    }

    return await this.tripService.getDocTripInfo(docId.trim());
  }
}
