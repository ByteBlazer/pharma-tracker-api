import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "../services/auth.service";
import { SkipAuth } from "../decorators/skip-auth.decorator";
import { AuthRequestDto } from "../dto/auth-request.dto";
import { AuthResponseDto } from "../dto/auth-response.dto";
import { Throttle } from "@nestjs/throttler";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("generate-otp")
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  @Throttle({ default: { limit: 30, ttl: 1 * 60 * 1000 } })
  async generateOtp(@Body() authRequestDto: AuthRequestDto) {
    return this.authService.generateOtp(authRequestDto);
  }

  @Post("validate-otp")
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  @Throttle({ default: { limit: 30, ttl: 1 * 60 * 1000 } })
  async validateOtp(
    @Body() authRequestDto: AuthRequestDto
  ): Promise<AuthResponseDto> {
    return this.authService.validateOtp(authRequestDto);
  }
}
