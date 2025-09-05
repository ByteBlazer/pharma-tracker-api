import { Injectable } from "@nestjs/common";

@Injectable()
export class GreetingService {
  getPublicGreeting(): string {
    const env = process.env.NODE_ENV || "development";
    return `Hello! Welcome to Pharma Tracker API! You are currently in the ${env} environment.`;
  }

  getAuthenticatedGreeting(username: string): string {
    const env = process.env.NODE_ENV || "development";
    return `Hello ${username}! Welcome to the authenticated area of Pharma Tracker API! You are currently in the ${env} environment.`;
  }
}
