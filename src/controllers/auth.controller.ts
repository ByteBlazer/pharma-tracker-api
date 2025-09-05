import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthService } from "../services/auth.service";
import { SkipAuth } from "../decorators/skip-auth.decorator";
import { AuthRequestDto } from "../dto/auth-request.dto";
import { AuthResponseDto } from "../dto/auth-response.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("generate-otp")
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  async generateOtp(@Body() authRequestDto: AuthRequestDto) {
    return this.authService.generateOtp(authRequestDto);
  }

  @Post("validate-otp")
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  async validateOtp(
    @Body() authRequestDto: AuthRequestDto
  ): Promise<AuthResponseDto> {
    return this.authService.validateOtp(authRequestDto);
  }
}
