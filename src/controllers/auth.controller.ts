import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SkipAuth } from "../decorators/skip-auth.decorator";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { AuthRequestDto } from "../dto/auth-request.dto";
import { AuthResponseDto } from "../dto/auth-response.dto";
import { BaseLocationOutputDto } from "../dto/base-location-output.dto";
import { CreateBaseLocationDto } from "../dto/create-base-location.dto";
import { UpdateBaseLocationDto } from "../dto/update-base-location.dto";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { UserOutputDto } from "../dto/user-output.dto";
import { UserRoleOutputDto } from "../dto/user-role-output.dto";
import { UserRole } from "../enums/user-role.enum";
import { AuthService } from "../services/auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("generate-otp")
  @HttpCode(HttpStatus.OK)
  @SkipAuth()
  @Throttle({ default: { limit: 30, ttl: 1 * 60 * 1000 } })
  async generateOtp(
    @Body() authRequestDto: AuthRequestDto,
    @Query("appCode") appCode?: string
  ) {
    // You can pass appCode to service if needed, e.g. this.authService.generateOtp(authRequestDto, appCode)
    return this.authService.generateOtp(authRequestDto, appCode);
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

  @Get("users")
  @RequireRoles(UserRole.WEB_ACCESS)
  async getAllUsers(): Promise<UserOutputDto[]> {
    return this.authService.getAllUsers();
  }

  @Get("users/:id")
  @RequireRoles(UserRole.WEB_ACCESS)
  async getUserById(@Param("id") userId: string): Promise<UserOutputDto> {
    return this.authService.getUserById(userId);
  }

  @Get("user-roles")
  @RequireRoles(UserRole.WEB_ACCESS)
  async getAllUserRoles(): Promise<UserRoleOutputDto[]> {
    return this.authService.getAllUserRoles();
  }

  @Get("base-locations")
  @RequireRoles(UserRole.WEB_ACCESS)
  async getAllBaseLocations(): Promise<BaseLocationOutputDto[]> {
    return this.authService.getAllBaseLocations();
  }

  @Put("base-locations/:id")
  @RequireRoles(UserRole.WEB_ACCESS)
  async updateBaseLocation(
    @Param("id") locationId: string,
    @Body() updateBaseLocationDto: UpdateBaseLocationDto
  ): Promise<BaseLocationOutputDto> {
    return this.authService.updateBaseLocation(
      locationId,
      updateBaseLocationDto
    );
  }

  @Post("base-locations")
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles(UserRole.WEB_ACCESS)
  async createBaseLocation(
    @Body() createBaseLocationDto: CreateBaseLocationDto
  ): Promise<BaseLocationOutputDto> {
    return this.authService.createBaseLocation(createBaseLocationDto);
  }

  @Put("users/:id")
  @RequireRoles(UserRole.WEB_ACCESS)
  async updateUser(
    @Param("id") userId: string,
    @Body() updateUserDto: UpdateUserDto
  ): Promise<UserOutputDto> {
    return this.authService.updateUser(userId, updateUserDto);
  }

  @Post("users")
  @HttpCode(HttpStatus.CREATED)
  @RequireRoles(UserRole.WEB_ACCESS)
  async createUser(
    @Body() createUserDto: CreateUserDto
  ): Promise<UserOutputDto> {
    return this.authService.createUser(createUserDto);
  }
}
