import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "../services/auth.service";
import { SkipAuth } from "../decorators/skip-auth.decorator";
import { AuthRequestDto } from "../dto/auth-request.dto";
import { AuthResponseDto } from "../dto/auth-response.dto";
import { Throttle } from "../decorators/throttle.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("generate-otp")
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  @Throttle({ limit: 3, windowMs: 1000 })
  async generateOtp(@Body() authRequestDto: AuthRequestDto) {
    return this.authService.generateOtp(authRequestDto);
  }

  @Post("validate-otp")
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  @Throttle({ limit: 3, windowMs: 1000 })
  async validateOtp(
    @Body() authRequestDto: AuthRequestDto
  ): Promise<AuthResponseDto> {
    return this.authService.validateOtp(authRequestDto);
  }
}
