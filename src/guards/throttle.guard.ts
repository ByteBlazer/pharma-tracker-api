import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { THROTTLE_KEY } from "../decorators/throttle.decorator";

export interface ThrottleOptions {
  limit: number;
  windowMs: number;
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  private requestCounts = new Map<
    string,
    { count: number; resetTime: number }
  >();
  private defaultOptions: ThrottleOptions | null = null;

  constructor(private reflector: Reflector) {}

  setDefaultOptions(options: ThrottleOptions): void {
    this.defaultOptions = options;
  }

  isConfigured(): boolean {
    return this.defaultOptions !== null;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Use user ID if authenticated, otherwise use IP
    const identifier = request.user?.id || this.getClientIp(request);

    // Get custom decorator options or use default
    const customThrottle = this.reflector.get<ThrottleOptions>(
      THROTTLE_KEY,
      context.getHandler()
    );

    // If no custom throttle and no default options set, skip throttling
    if (!customThrottle && !this.defaultOptions) {
      return true;
    }

    const throttleOptions = customThrottle || this.defaultOptions!;

    if (this.isThrottled(identifier, throttleOptions)) {
      throw new HttpException(
        "Too many requests, please try again later.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    this.incrementRequestCount(identifier, throttleOptions);
    return true;
  }

  private getClientIp(request: any): string {
    // Try to get real IP from various headers
    return (
      request.headers["x-forwarded-for"]?.split(",")[0] ||
      request.headers["x-real-ip"] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      "unknown"
    );
  }

  private isThrottled(identifier: string, options: ThrottleOptions): boolean {
    const now = Date.now();
    const clientData = this.requestCounts.get(identifier);

    if (!clientData) {
      return false;
    }

    // Reset if window has passed
    if (now > clientData.resetTime) {
      this.requestCounts.delete(identifier);
      return false;
    }

    return clientData.count >= options.limit;
  }

  private incrementRequestCount(
    identifier: string,
    options: ThrottleOptions
  ): void {
    const now = Date.now();
    const clientData = this.requestCounts.get(identifier);

    if (!clientData) {
      this.requestCounts.set(identifier, {
        count: 1,
        resetTime: now + options.windowMs,
      });
    } else {
      clientData.count++;
    }

    // Clean up old entries periodically
    this.cleanup();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [identifier, data] of this.requestCounts.entries()) {
      if (now > data.resetTime) {
        this.requestCounts.delete(identifier);
      }
    }
  }
}
