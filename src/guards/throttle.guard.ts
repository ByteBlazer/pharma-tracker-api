import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

interface ThrottleOptions {
  limit: number;
  windowMs: number;
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  private requestCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly defaultOptions: ThrottleOptions = {
    limit: 100, // 100 requests per window
    windowMs: 15 * 60 * 1000, // 15 minutes
  };

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const clientIp = this.getClientIp(request);
    
    // Check if endpoint has custom throttle options
    const throttleOptions = this.reflector.get<ThrottleOptions>('throttle', context.getHandler()) || this.defaultOptions;
    
    if (this.isThrottled(clientIp, throttleOptions)) {
      throw new HttpException(
        'Too many requests, please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    this.incrementRequestCount(clientIp, throttleOptions);
    return true;
  }

  private getClientIp(request: any): string {
    // Try to get real IP from various headers
    return (
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }

  private isThrottled(clientIp: string, options: ThrottleOptions): boolean {
    const now = Date.now();
    const clientData = this.requestCounts.get(clientIp);

    if (!clientData) {
      return false;
    }

    // Reset if window has passed
    if (now > clientData.resetTime) {
      this.requestCounts.delete(clientIp);
      return false;
    }

    return clientData.count >= options.limit;
  }

  private incrementRequestCount(clientIp: string, options: ThrottleOptions): void {
    const now = Date.now();
    const clientData = this.requestCounts.get(clientIp);

    if (!clientData) {
      this.requestCounts.set(clientIp, {
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
    for (const [ip, data] of this.requestCounts.entries()) {
      if (now > data.resetTime) {
        this.requestCounts.delete(ip);
      }
    }
  }
}
