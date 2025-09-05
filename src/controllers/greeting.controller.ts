import { Controller, Get } from "@nestjs/common";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { SkipAuth } from "../decorators/skip-auth.decorator";
import { GreetingService } from "../services/greeting.service";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

@Controller("greeting")
export class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get()
  @SkipAuth()
  getPublicGreeting(): string {
    return this.greetingService.getPublicGreeting();
  }

  @Get("authenticated")
  getAuthenticatedGreeting(@LoggedInUser() loggedInUser: JwtPayload): string {
    return this.greetingService.getAuthenticatedGreeting(loggedInUser);
  }
}
