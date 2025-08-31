import { Injectable } from "@nestjs/common";

@Injectable()
export class GreetingService {
  getPublicGreeting(): string {
    return "Hello! Welcome to Pharma Tracker API!";
  }

  getAuthenticatedGreeting(username: string): string {
    return `Hello ${username}! Welcome to the authenticated area of Pharma Tracker API!`;
  }
}
