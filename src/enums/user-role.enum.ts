export enum UserRole {
  WEB_ACCESS = "web-access",
  APP_SCANNER = "app-scanner",
  APP_TRIP_CREATOR = "app-trip-creator",
  APP_ADMIN = "app-admin",
  APP_TRIP_DRIVER = "app-trip-driver",
}

/**
 * Get all available user roles as an array
 */
export const getAllUserRoles = (): UserRole[] => {
  return Object.values(UserRole);
};

/**
 * Get all available user roles as strings
 */
export const getAllUserRoleStrings = (): string[] => {
  return Object.values(UserRole);
};

/**
 * Check if a role string is a valid UserRole
 */
export const isValidUserRole = (role: string): role is UserRole => {
  return Object.values(UserRole).includes(role as UserRole);
};
