import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, AuthResponseDto } from './dto/auth.dto';
import { SkipAuth } from './decorators/skip-auth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  async authenticate(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.authenticate(loginDto);
  }
}
