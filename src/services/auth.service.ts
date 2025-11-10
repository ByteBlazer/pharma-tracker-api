import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";
import { AuthRequestDto } from "../dto/auth-request.dto";
import { AuthResponseDto } from "../dto/auth-response.dto";
import { BaseLocationOutputDto } from "../dto/base-location-output.dto";
import { CreateBaseLocationDto } from "../dto/create-base-location.dto";
import { UpdateBaseLocationDto } from "../dto/update-base-location.dto";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { UserOutputDto } from "../dto/user-output.dto";
import { UserRoleOutputDto } from "../dto/user-role-output.dto";
import { AppUserXUserRole } from "../entities/app-user-x-user-role.entity";
import { AppUser } from "../entities/app-user.entity";
import { BaseLocation } from "../entities/base-location.entity";
import { UserRole as UserRoleEntity } from "../entities/user-role.entity";
import { UserRole } from "../enums/user-role.enum";
import { GlobalConstants } from "../GlobalConstants";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { SettingsCacheService } from "./settings-cache.service";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(AppUserXUserRole)
    private appUserXUserRoleRepository: Repository<AppUserXUserRole>,
    @InjectRepository(BaseLocation)
    private baseLocationRepository: Repository<BaseLocation>,
    @InjectRepository(UserRoleEntity)
    private userRoleRepository: Repository<UserRoleEntity>,
    private readonly settingsCacheService: SettingsCacheService
  ) {}

  async generateOtp(authRequestDto: AuthRequestDto, appCode?: string) {
    // Validate user exists and is active
    await this.checkUser(authRequestDto.mobile);

    // If running on Windows, skip SMS generation and return
    if (process.platform === "win32") {
      console.log(
        `Windows environment: Skipping SMS generation for mobile ${authRequestDto.mobile}`
      );
      return;
    }

    // In India, valid mobile numbers start with 6, 7, 8, 9
    // For all else, lets not waste money on sending failed SMSes
    if (
      authRequestDto.mobile.length == 10 &&
      ["1", "2", "3", "4", "5"].includes(authRequestDto.mobile[0])
    ) {
      return;
    }
    const encodedAppCode = appCode ? encodeURIComponent(appCode) : "";

    const generateOtpUrl =
      GlobalConstants.SMS_GENERATE_OTP_TEMPLATE.replace(
        "{apikey}",
        GlobalConstants.SMS_API_KEY
      )
        .replace("{mobilePhone}", authRequestDto.mobile)
        .replace("{otpTemplateName}", GlobalConstants.SMS_OTP_TEMPLATE) +
      (encodedAppCode ? `?var1=${encodedAppCode}` : "");

    let generateOtpResponse;

    try {
      generateOtpResponse = await axios.get(generateOtpUrl, {
        timeout: 8000,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });
      console.log(
        `OTP generated successfully for valid user with mobile phone: ${authRequestDto.mobile}`
      );
    } catch (error) {
      console.log(
        `Internal server error while trying to generate OTP for mobile phone: ${authRequestDto.mobile}`
      );
      throw new InternalServerErrorException("Failed to generate OTP");
    }
  }

  async validateOtp(authRequestDto: AuthRequestDto): Promise<AuthResponseDto> {
    // Validate user exists and is active
    await this.checkUser(authRequestDto.mobile);

    let skip = false;

    // If running on Windows, skip OTP validation and return a JWT token
    if (process.platform === "win32") {
      console.log(
        `Windows environment: Skipping OTP validation for mobile ${authRequestDto.mobile}`
      );
      skip = true;
    }

    const magicNumber = "112233";
    // In India, valid mobile numbers start with 6, 7, 8, 9
    // For all else, we will let someone in if he knows our magic number
    if (
      authRequestDto.mobile.length == 10 &&
      ["1", "2", "3", "4", "5"].includes(authRequestDto.mobile[0]) &&
      authRequestDto.otp == magicNumber
    ) {
      skip = true;
    }

    if (!skip) {
      const validateOtpUrl = GlobalConstants.SMS_VALIDATE_OTP_TEMPLATE.replace(
        "{apikey}",
        GlobalConstants.SMS_API_KEY
      )
        .replace("{mobilePhone}", authRequestDto.mobile)
        .replace("{otp}", authRequestDto.otp);

      let validateOtpResponse;

      try {
        validateOtpResponse = await axios.get(validateOtpUrl, {
          timeout: 8000,
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });
      } catch (error) {
        console.log(
          `Internal server error while trying to validate OTP for mobile phone: ${authRequestDto.mobile}`
        );
        throw new InternalServerErrorException("Failed to validate OTP");
      }

      if (
        validateOtpResponse.status != 200 ||
        validateOtpResponse.data.Status != "Success"
      ) {
        console.log(
          `OTP validation failed for user with mobile phone: ${authRequestDto.mobile}`
        );
        throw new UnauthorizedException("Invalid OTP");
      }
    }

    const user = await this.appUserRepository.findOne({
      where: { mobile: authRequestDto.mobile },
      relations: {
        baseLocation: true,
      },
    });

    // Fetch user roles
    const userRoles = await this.appUserXUserRoleRepository.find({
      where: { appUserId: user.id },
      relations: {
        userRole: true,
      },
    });

    // Create comma-separated string of role names
    const rolesString = userRoles
      .map((userRole) => userRole.roleName)
      .join(",");

    // Get location heartbeat frequency from cache
    const locationHeartBeatFrequencyInMinutes =
      this.settingsCacheService.getMinsBetweenLocationHeartbeats();
    const locationHeartBeatFrequencyInSeconds =
      locationHeartBeatFrequencyInMinutes * 60; // Convert minutes to seconds

    // Create JWT payload
    const payload: JwtPayload = {
      id: user.id,
      username: user.personName,
      mobile: user.mobile,
      roles: rolesString,
      locationHeartBeatFrequencyInSeconds: locationHeartBeatFrequencyInSeconds,
      baseLocationId: user.baseLocationId,
      baseLocationName: user.baseLocation?.name || "",
    };

    // Generate JWT token with 8 hour expiry
    const token = this.jwtService.sign(payload, {
      expiresIn: "8h",
    });

    return {
      access_token: token,
    };
  }

  private async checkUser(mobile: string): Promise<AppUser> {
    const user = await this.appUserRepository.findOne({
      where: { mobile },
    });

    if (!user) {
      console.log(`Trying to access with unregistered mobile phone: ${mobile}`);
      throw new BadRequestException(
        "Mobile phone not registered with PharmaTracker"
      );
    }

    if (!user.isActive) {
      console.log(`Trying to access with inactive user account: ${mobile}`);
      throw new BadRequestException(
        "User account linked to this mobile phone has been marked as inactive"
      );
    }

    return user;
  }

  async validateToken(token: string): Promise<any> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException("Invalid token");
    }
  }

  async getAllUsers(): Promise<UserOutputDto[]> {
    const users = await this.appUserRepository.find({
      relations: {
        baseLocation: true,
      },
    });

    // Sort by numeric ID value in descending order
    users.sort((a, b) => {
      const idA = parseInt(a.id) || 0;
      const idB = parseInt(b.id) || 0;
      return idB - idA; // Descending order
    });

    const userOutputs: UserOutputDto[] = [];

    for (const user of users) {
      // Fetch user roles with full role details
      const userRoles = await this.appUserXUserRoleRepository.find({
        where: { appUserId: user.id },
        relations: {
          userRole: true,
        },
      });

      const roles: UserRoleOutputDto[] = userRoles.map((userRole) => ({
        roleName: userRole.roleName,
        description: userRole.userRole.description,
      }));

      const userOutput: UserOutputDto = {
        id: user.id,
        mobile: user.mobile,
        personName: user.personName,
        baseLocationId: user.baseLocationId,
        baseLocationName: user.baseLocation?.name,
        vehicleNbr: user.vehicleNbr,
        isActive: user.isActive,
        createdAt: user.createdAt,
        roles: roles,
      };

      userOutputs.push(userOutput);
    }

    return userOutputs;
  }

  async createUser(createUserDto: CreateUserDto): Promise<UserOutputDto> {
    // Check if user already exists
    const existingUser = await this.appUserRepository.findOne({
      where: { mobile: createUserDto.mobile },
    });

    if (existingUser) {
      throw new BadRequestException(
        "User with this mobile number already exists"
      );
    }

    // Validate base location exists
    const baseLocation = await this.baseLocationRepository.findOne({
      where: { id: createUserDto.baseLocationId },
    });

    if (!baseLocation) {
      throw new BadRequestException(
        "Base location with the provided ID does not exist"
      );
    }

    // Validate roles exist in the database
    await this.validateRoles(createUserDto.roles);

    // Generate a unique ID for the user - one greater than the greatest existing numeric user ID
    const allUsers = await this.appUserRepository.find({
      select: ["id"],
    });

    // Extract numeric IDs from existing users (assuming they are numeric or contain numbers)
    const numericIds = allUsers
      .map((user) => {
        // Try to extract any number from the ID
        const match = user.id.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      })
      .filter((id) => id > 0);

    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    const nextId = maxId + 1;
    const userId = nextId.toString();

    // Create user and assign roles in a single transaction
    let createdUserId: string;

    await this.appUserRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Create the user
        const newUser = transactionalEntityManager.create(AppUser, {
          id: userId,
          mobile: createUserDto.mobile,
          personName: createUserDto.personName,
          baseLocationId: createUserDto.baseLocationId,
          vehicleNbr: createUserDto.vehicleNbr || "",
          isActive: true,
        });

        const savedUser = await transactionalEntityManager.save(
          AppUser,
          newUser
        );
        createdUserId = savedUser.id;

        // Create user roles
        const userRoles = createUserDto.roles.map((role) =>
          transactionalEntityManager.create(AppUserXUserRole, {
            appUserId: savedUser.id,
            roleName: role,
          })
        );

        await transactionalEntityManager.save(AppUserXUserRole, userRoles);
      }
    );

    // Return the created user using the existing getUserById method
    return this.getUserById(createdUserId);
  }

  async getUserById(userId: string): Promise<UserOutputDto> {
    const user = await this.appUserRepository.findOne({
      where: { id: userId },
      relations: {
        baseLocation: true,
      },
    });

    if (!user) {
      throw new BadRequestException("User not found");
    }

    // Fetch user roles with full role details
    const userRoles = await this.appUserXUserRoleRepository.find({
      where: { appUserId: userId },
      relations: {
        userRole: true,
      },
    });

    const roles: UserRoleOutputDto[] = userRoles.map((userRole) => ({
      roleName: userRole.roleName,
      description: userRole.userRole.description,
    }));

    const userOutput: UserOutputDto = {
      id: user.id,
      mobile: user.mobile,
      personName: user.personName,
      baseLocationId: user.baseLocationId,
      baseLocationName: user.baseLocation?.name,
      vehicleNbr: user.vehicleNbr,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: roles,
    };

    return userOutput;
  }

  async getAllUserRoles(): Promise<UserRoleOutputDto[]> {
    const roles = await this.userRoleRepository.find({
      order: {
        roleName: "ASC",
      },
    });

    const roleOutputs: UserRoleOutputDto[] = roles.map((role) => ({
      roleName: role.roleName,
      description: role.description,
    }));

    return roleOutputs;
  }

  async getAllBaseLocations(): Promise<BaseLocationOutputDto[]> {
    const baseLocations = await this.baseLocationRepository.find({
      order: {
        name: "ASC",
      },
    });

    const baseLocationOutputs: BaseLocationOutputDto[] = baseLocations.map(
      (location) => ({
        id: location.id,
        name: location.name,
      })
    );

    return baseLocationOutputs;
  }

  async createBaseLocation(
    createBaseLocationDto: CreateBaseLocationDto
  ): Promise<BaseLocationOutputDto> {
    // Generate a unique ID for the base location - one greater than the greatest existing numeric ID
    const allBaseLocations = await this.baseLocationRepository.find({
      select: ["id"],
    });

    // Extract numeric IDs from existing base locations (assuming they are numeric or contain numbers)
    const numericIds = allBaseLocations
      .map((location) => {
        // Try to extract any number from the ID
        const match = location.id.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      })
      .filter((id) => id > 0);

    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    const nextId = maxId + 1;
    const locationId = nextId.toString();

    // Create the base location
    const newBaseLocation = this.baseLocationRepository.create({
      id: locationId,
      name: createBaseLocationDto.name,
    });

    const savedLocation = await this.baseLocationRepository.save(
      newBaseLocation
    );

    const locationOutput: BaseLocationOutputDto = {
      id: savedLocation.id,
      name: savedLocation.name,
    };

    return locationOutput;
  }

  async updateBaseLocation(
    locationId: string,
    updateBaseLocationDto: UpdateBaseLocationDto
  ): Promise<BaseLocationOutputDto> {
    // Check if base location exists
    const existingLocation = await this.baseLocationRepository.findOne({
      where: { id: locationId },
    });

    if (!existingLocation) {
      throw new BadRequestException("Base location not found");
    }

    // Update base location
    await this.baseLocationRepository.update(locationId, {
      name: updateBaseLocationDto.name,
    });

    // Return the updated location
    const updatedLocation = await this.baseLocationRepository.findOne({
      where: { id: locationId },
    });

    const locationOutput: BaseLocationOutputDto = {
      id: updatedLocation.id,
      name: updatedLocation.name,
    };

    return locationOutput;
  }

  private async validateRoles(roles: UserRole[]): Promise<void> {
    // Validate all roles exist in the database
    const validRoles = await this.userRoleRepository.find({
      select: ["roleName"],
    });
    const validRoleNames = validRoles.map((role) => role.roleName);

    const invalidRoles = roles.filter((role) => !validRoleNames.includes(role));

    if (invalidRoles.length > 0) {
      throw new BadRequestException(
        `Invalid roles: ${invalidRoles.join(
          ", "
        )}. Valid roles are: ${validRoleNames.join(", ")}`
      );
    }
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto
  ): Promise<UserOutputDto> {
    // Check if user exists
    const existingUser = await this.appUserRepository.findOne({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new BadRequestException("User not found");
    }

    // Validate mobile number is not used by any other user (including inactive users)
    if (updateUserDto.mobile) {
      const userWithSameMobile = await this.appUserRepository.findOne({
        where: { mobile: updateUserDto.mobile },
      });

      if (userWithSameMobile && userWithSameMobile.id !== userId) {
        throw new BadRequestException(
          "Mobile number is already in use by another user"
        );
      }
    }

    // Validate base location exists if provided
    if (updateUserDto.baseLocationId) {
      const baseLocation = await this.baseLocationRepository.findOne({
        where: { id: updateUserDto.baseLocationId },
      });

      if (!baseLocation) {
        throw new BadRequestException(
          "Base location with the provided ID does not exist"
        );
      }
    }

    // Validate roles if provided
    if (updateUserDto.roles) {
      await this.validateRoles(updateUserDto.roles);
    }

    // Update user fields and roles in a single transaction
    const { roles, ...updateData } = updateUserDto;

    await this.appUserRepository.manager.transaction(
      async (transactionalEntityManager) => {
        // Apply user updates if there are any changes
        if (Object.keys(updateData).length > 0) {
          await transactionalEntityManager.update(AppUser, userId, updateData);
        }

        // Update user roles if provided
        if (updateUserDto.roles) {
          // Remove existing roles
          await transactionalEntityManager.delete(AppUserXUserRole, {
            appUserId: userId,
          });

          // Add new roles
          const userRoles = updateUserDto.roles.map((role) =>
            transactionalEntityManager.create(AppUserXUserRole, {
              appUserId: userId,
              roleName: role,
            })
          );

          await transactionalEntityManager.save(AppUserXUserRole, userRoles);
        }
      }
    );

    // Return the updated user using the existing getUserById method
    return this.getUserById(userId);
  }
}
