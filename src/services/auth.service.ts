import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthRequestDto } from "../dto/auth-request.dto";
import { AuthResponseDto } from "../dto/auth-response.dto";
import { GlobalConstants } from "../GlobalConstants";
import { AppUser } from "../entities/app-user.entity";
import { AppUserXUserRole } from "../entities/app-user-x-user-role.entity";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import axios from "axios";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(AppUser)
    private appUserRepository: Repository<AppUser>,
    @InjectRepository(AppUserXUserRole)
    private appUserXUserRoleRepository: Repository<AppUserXUserRole>
  ) {}

  async generateOtp(authRequestDto: AuthRequestDto) {
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

    const generateOtpUrl = GlobalConstants.SMS_GENERATE_OTP_TEMPLATE.replace(
      "{apikey}",
      process.env.SMS_API_KEY
    )
      .replace("{mobilePhone}", authRequestDto.mobile)
      .replace("{otpTemplateName}", GlobalConstants.SMS_OTP_TEMPLATE);

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
        process.env.SMS_API_KEY
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
    });

    // Fetch user roles
    const userRoles = await this.appUserXUserRoleRepository.find({
      where: { appUserId: user.id },
      relations: ["userRole"],
    });

    // Create comma-separated string of role names
    const rolesString = userRoles
      .map((userRole) => userRole.roleName)
      .join(",");

    // Create JWT payload
    const payload: JwtPayload = {
      id: user.id,
      username: user.personName,
      mobile: user.mobile,
      roles: rolesString,
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
}
