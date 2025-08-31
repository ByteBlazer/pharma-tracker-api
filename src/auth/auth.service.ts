import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto, AuthResponseDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async authenticate(loginDto: LoginDto): Promise<AuthResponseDto> {
    // Hardcoded password validation as requested
    if (loginDto.password !== '12345') {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Create JWT payload
    const payload = { username: loginDto.username };
    
    // Generate JWT token with 8 hour expiry
    const token = this.jwtService.sign(payload, {
      expiresIn: '8h',
    });

    return {
      access_token: token,
      username: loginDto.username,
      expires_in: '8h',
    };
  }

  async validateToken(token: string): Promise<any> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
