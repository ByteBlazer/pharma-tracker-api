import { Injectable } from "@nestjs/common";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class GreetingService {
  getPublicGreeting(): string {
    const env = process.env.NODE_ENV || "development";
    return `Hello! Welcome to Pharma Tracker API! You are currently in the ${env} environment.`;
  }

  getAuthenticatedGreeting(loggedInUser: JwtPayload): string {
    const env = process.env.NODE_ENV || "development";

    // Log user information for audit purposes
    console.log(
      `Authenticated endpoint accessed by user: ${loggedInUser.username} (${loggedInUser.id}) with roles: ${loggedInUser.roles}`
    );

    return `Hello ${loggedInUser.username}! Welcome to the authenticated area of Pharma Tracker API! You are currently in the ${env} environment. Your roles: ${loggedInUser.roles}`;
  }
}
