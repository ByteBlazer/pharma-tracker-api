import { Body, Controller, Post, Request } from "@nestjs/common";
import { LocationRegisterRequestDto } from "../dto/location-register-request.dto";
import { LocationRegisterResponseDto } from "../dto/location-register-response.dto";
import { LocationService } from "../services/location.service";
import { Throttle } from "../decorators/throttle.decorator";

@Controller("location")
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post("register")
  @Throttle({ limit: 1, windowMs: 1000 }) // Max 1 call per second
  async registerLocation(
    @Body() locationRegisterRequestDto: LocationRegisterRequestDto,
    @Request() req: any
  ): Promise<LocationRegisterResponseDto> {
    // Extract user ID from JWT token (set by JwtAuthGuard)
    const userId = req.user.id;

    return this.locationService.registerLocation(
      locationRegisterRequestDto,
      userId
    );
  }
}
