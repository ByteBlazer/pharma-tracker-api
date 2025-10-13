import { ScannedUserSummary } from "./scanned-user-summary.interface";

export interface RouteSummary {
  route: string;
  userSummaryList: ScannedUserSummary[];
}
