import { Body, Controller, Post, Request } from "@nestjs/common";
import { LocationRegisterRequestDto } from "../dto/location-register-request.dto";
import { LocationService } from "../services/location.service";

@Controller("location")
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post("register")
  async registerLocation(
    @Body() locationRegisterRequestDto: LocationRegisterRequestDto,
    @Request() req: any
  ) {
    // Extract user ID from JWT token (set by JwtAuthGuard)
    const userId = req.user.id;

    return this.locationService.registerLocation(
      locationRegisterRequestDto,
      userId
    );
  }
}
