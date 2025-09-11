import { Injectable } from "@nestjs/common";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { SettingsCacheService } from "./settings-cache.service";

@Injectable()
export class GreetingService {
  constructor(private readonly settingsCacheService: SettingsCacheService) {}

  getPublicGreeting(): string {
    const env = process.env.NODE_ENV || "development";
    const defaultGreeting = this.settingsCacheService.getDefaultGreeting();
    return `${defaultGreeting}!  You are currently in the ${env} environment.`;
  }

  getAuthenticatedGreeting(loggedInUser: JwtPayload): string {
    const env = process.env.NODE_ENV || "development";

    // Log user information for audit purposes
    console.log(
      `Authenticated endpoint accessed by user: ${loggedInUser.username} (${loggedInUser.id}) with roles: ${loggedInUser.roles}`
    );
    const defaultGreeting = this.settingsCacheService.getDefaultGreeting();

    return `${defaultGreeting}! ${loggedInUser.username}, you are authenticated and currently in the ${env} environment. 
    Your roles: ${loggedInUser.roles}`;
  }
}
