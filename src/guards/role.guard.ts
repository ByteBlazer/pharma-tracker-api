import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/require-roles.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { UserRole } from "../enums/user-role.enum";

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles) {
      return true; // No roles required, allow access
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    if (!user.roles) {
      throw new ForbiddenException("User has no roles assigned");
    }

    // Parse user roles from comma-separated string
    const userRoles = user.roles.split(",").map((role) => role.trim());

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some((role) =>
      userRoles.includes(role)
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(
          ", "
        )}. Your roles: ${userRoles.join(", ")}`
      );
    }

    return true;
  }
}
