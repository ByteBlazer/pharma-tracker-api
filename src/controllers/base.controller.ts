import {
  Controller,
  Get,
  Query,
  BadRequestException,
  Req,
  NotFoundException,
} from "@nestjs/common";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { SkipAuth } from "src/decorators/skip-auth.decorator";
import { DocStatus } from "src/enums/doc-status.enum";
import { DocService } from "../services/doc.service";

@Controller("")
export class BaseController {
  constructor(private readonly docService: DocService) {}

  /**
  This endpoint is used by the ERP system to hit us and get a tracking URL for a document.
  */
  @Get("trackingLink")
  @SkipAuth()
  async getTrackingLink(
    @Query("docId") docId: string,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Req() req: Request
  ): Promise<{ status: DocStatus; trackingURL: string; docId: string }> {
    if (!docId) {
      throw new BadRequestException("docId query parameter is required");
    }

    // Fetch document status from database
    const docStatus = await this.docService.getDocumentStatus(docId);
    if (!docStatus) {
      throw new BadRequestException(
        "The provided docId is not among scanned documents in Pharma Tracker."
      );
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
    let trackingURL = `${baseUrl}/track?t=${trackingToken}`;
    if (
      docStatus === DocStatus.READY_FOR_DISPATCH ||
      docStatus === DocStatus.TRIP_SCHEDULED
    ) {
      throw new BadRequestException(
        "The provided docId was scanned in Pharma Tracker, but not on a trip yet."
      );
    }

    return {
      status: docStatus,
      trackingURL: trackingURL,
      docId: docId,
    };
  }
}
