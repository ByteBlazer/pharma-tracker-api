/**
 * Utility functions for working with user roles
 */

/**
 * Parse comma-separated roles string into an array
 * @param rolesString - Comma-separated string of roles
 * @returns Array of role names
 */
export function parseRoles(rolesString: string): string[] {
  if (!rolesString || rolesString.trim() === "") {
    return [];
  }
  return rolesString.split(",").map((role) => role.trim());
}

/**
 * Check if user has a specific role
 * @param rolesString - Comma-separated string of roles
 * @param requiredRole - Role to check for
 * @returns True if user has the role
 */
export function hasRole(rolesString: string, requiredRole: string): boolean {
  const roles = parseRoles(rolesString);
  return roles.includes(requiredRole);
}

/**
 * Check if user has any of the specified roles
 * @param rolesString - Comma-separated string of roles
 * @param requiredRoles - Array of roles to check for
 * @returns True if user has any of the roles
 */
export function hasAnyRole(
  rolesString: string,
  requiredRoles: string[]
): boolean {
  const roles = parseRoles(rolesString);
  return requiredRoles.some((role) => roles.includes(role));
}

/**
 * Check if user has all of the specified roles
 * @param rolesString - Comma-separated string of roles
 * @param requiredRoles - Array of roles to check for
 * @returns True if user has all of the roles
 */
export function hasAllRoles(
  rolesString: string,
  requiredRoles: string[]
): boolean {
  const roles = parseRoles(rolesString);
  return requiredRoles.every((role) => roles.includes(role));
}
