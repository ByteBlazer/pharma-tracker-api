import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { TripService } from "../services/trip.service";
import { CreateTripDto } from "../dto/create-trip.dto";
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
}
