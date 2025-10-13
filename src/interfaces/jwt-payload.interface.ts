export interface JwtPayload {
  id: string;
  username: string;
  mobile: string;
  roles: string; // Comma-separated string of role names
  locationHeartBeatFrequencyInSeconds: number;
  baseLocationId: string;
  baseLocationName: string;
}
