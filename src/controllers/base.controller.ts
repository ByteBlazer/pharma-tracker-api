import {
  Controller,
  Get,
  Query,
  BadRequestException,
  Req,
} from "@nestjs/common";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { SkipAuth } from "src/decorators/skip-auth.decorator";

@Controller("")
export class BaseController {
  /**
  This endpoint is used by the ERP system to hit us and get a tracking URL for a document.
  */
  @Get("trackingLink")
  @SkipAuth()
  async getTrackingLink(
    @Query("docId") docId: string,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Req() req: Request
  ): Promise<{ success: boolean; trackingUrl: string; message: string }> {
    if (!docId) {
      throw new BadRequestException("docId query parameter is required");
    }

    // Generate tracking URL with base64 encoded docId
    const trackingToken = Buffer.from(docId).toString("base64");

    // Get host from request headers instead of loggedInUser, fallback to empty string
    const reqHost =
      req.headers["x-forwarded-host"] || req.headers["host"] || "";
    const host = reqHost;
    const baseUrl = host
      ? host.startsWith("https://")
        ? host
        : `https://${host}`
      : "";
    const trackingUrl = `${baseUrl}/track?t=${trackingToken}`;

    return {
      success: true,
      trackingUrl: trackingUrl,
      message: `Tracking URL generated for document ${docId}`,
    };
  }
}
