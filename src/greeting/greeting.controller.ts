import { Controller, Get, Request } from "@nestjs/common";
import { GreetingService } from "./greeting.service";
import { UserRoleService } from "../services/user-role.service";
import { SkipAuth } from "../auth/decorators/skip-auth.decorator";
import { Throttle } from "../common/decorators/throttle.decorator";

@Controller("greeting")
export class GreetingController {
  constructor(
    private readonly greetingService: GreetingService,
    private readonly userRoleService: UserRoleService
  ) {}

  @Get()
  @SkipAuth()
  getPublicGreeting(): string {
    return this.greetingService.getPublicGreeting();
  }

  @Get("authenticated")
  getAuthenticatedGreeting(@Request() req): string {
    const username = req.user.username;
    return this.greetingService.getAuthenticatedGreeting(username);
  }

  @Get("sensitive")
  @Throttle({ limit: 5, windowMs: 60000 }) // 5 requests per minute
  getSensitiveGreeting(@Request() req): string {
    const username = req.user.username;
    return `Hello ${username}! This is a sensitive endpoint with strict rate limiting.`;
  }

  @Get("roles")
  @SkipAuth()
  async getRoleNames(): Promise<string[]> {
    return this.userRoleService.getAllRoleNames();
  }
}
