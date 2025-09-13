import { Controller, Get } from "@nestjs/common";
import { RequireRoles } from "src/decorators/require-roles.decorator";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { SkipAuth } from "../decorators/skip-auth.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { GreetingService } from "../services/greeting.service";

@Controller("greeting")
export class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get()
  @SkipAuth()
  getPublicGreeting(): string {
    return this.greetingService.getPublicGreeting();
  }

  @Get("authenticated")
  @RequireRoles()
  getAuthenticatedGreeting(@LoggedInUser() loggedInUser: JwtPayload): string {
    return this.greetingService.getAuthenticatedGreeting(loggedInUser);
  }
}
