import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { RequireRoles } from "src/decorators/require-roles.decorator";
import { UserRole } from "src/enums/user-role.enum";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { DocService } from "../services/doc.service";
import { SkipAuth } from "src/decorators/skip-auth.decorator";
import { MarkDeliveryDto } from "../dto/mark-delivery.dto";
import { MarkDeliveryFailedDto } from "../dto/mark-delivery-failed.dto";
import { DocTrackingResponseDto } from "../dto/doc-tracking-response.dto";

@Controller("doc")
export class DocController {
  constructor(private readonly docService: DocService) {}

  @Post("scan-and-add/:docId")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_SCANNER)
  async scanAndAdd(
    @Param("docId") docId: string,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Res() res: Response,
    @Query("unscan") unscan?: string
  ): Promise<void> {
    try {
      // unscan param is optional, default assumed to be false if missing
      const unscanBool = unscan === "true";

      const result = await this.docService.scanAndAdd(
        docId,
        loggedInUser,
        unscanBool
      );

      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        docId: result.docId,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
          docId: docId,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Internal server error",
          docId: docId,
        });
      }
    }
  }

  @Get("dispatch-queue")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_TRIP_CREATOR)
  async getDispatchQueueForUser(
    @LoggedInUser() loggedInUser: JwtPayload,
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.docService.getDispatchQueueForUser(
        loggedInUser
      );
      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        dispatchQueueList: result.dispatchQueueList,
        totalDocs: result.totalDocs,
      });
    } catch (error) {
      console.log(error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to fetch dispatch queue",
        error: error.message,
      });
    }
  }

  @Post("undo-all-scans")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_SCANNER)
  async undoAllScans(
    @LoggedInUser() loggedInUser: JwtPayload,
    @Res() res: Response
  ): Promise<void> {
    //TODO: For ones at transit hub, deleting the doc will make us lose all historical refs. This needs to be handled.
    try {
      const result = await this.docService.undoAllScans(loggedInUser);
      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        deletedDocs: result.deletedDocs,
      });
    } catch (error) {
      console.log(error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to undo scans",
        error: error.message,
      });
    }
  }

  @Get("create-mock-docs")
  @SkipAuth()
  @Throttle({ default: { limit: 30, ttl: 1 * 60 * 1000 } })
  async createMockData(
    @Query("useOneRealPhoneNumber") useOneRealPhoneNumber: string,
    @Query("useOneRealRouteId") useOneRealRouteId: string,
    @Query("useOneRealLotNbr") useOneRealLotNbr: string,
    @Query("mockOfMocks") mockOfMocks: boolean,
    @Res() res: Response
  ): Promise<void> {
    // Validate phone number if provided
    if (useOneRealPhoneNumber) {
      if (!/^\d{10}$/.test(useOneRealPhoneNumber)) {
        throw new BadRequestException(
          "useOneRealPhoneNumber must be exactly 10 digits"
        );
      }
    }

    // Validate route ID if provided
    if (
      useOneRealRouteId !== undefined &&
      (useOneRealRouteId === null || useOneRealRouteId.trim() === "")
    ) {
      throw new BadRequestException(
        "useOneRealRouteId cannot be null or blank"
      );
    }

    // Validate lot number if provided
    if (
      useOneRealLotNbr !== undefined &&
      (useOneRealLotNbr === null || useOneRealLotNbr.trim() === "")
    ) {
      throw new BadRequestException("useOneRealLotNbr cannot be null or blank");
    }

    const result = await this.docService.createMockData(
      mockOfMocks,
      useOneRealPhoneNumber,
      useOneRealRouteId,
      useOneRealLotNbr
    );

    // Set PDF headers
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="document-barcodes.pdf"',
      "Content-Length": result.pdfBuffer.length,
    });

    // Send PDF buffer
    res.send(result.pdfBuffer);
  }

  @Delete("purge-mock-data")
  @RequireRoles(UserRole.APP_ADMIN)
  async purgeMockData(@Res() res: Response): Promise<void> {
    try {
      const result = await this.docService.purgeMockData();
      res.status(HttpStatus.OK).json({
        success: true,
        message: "Mock data purged successfully",
        deletedDocs: result.deletedDocs,
        deletedCustomers: result.deletedCustomers,
      });
    } catch (error) {
      console.log(error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to purge mock data",
        error: error.message,
      });
    }
  }

  @Put("mark-delivery/:docId")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_TRIP_DRIVER)
  async markDelivery(
    @Param("docId") docId: string,
    @Body() markDeliveryDto: MarkDeliveryDto,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Query("updateCustomerLocation") updateCustomerLocation: string,
    @Res() res: Response
  ): Promise<void> {
    // Parse the query param to boolean (treat anything 'true' (case-insensitive) as true)
    let shouldUpdateCustomerLocation: boolean = true;

    if (
      typeof updateCustomerLocation === "string" &&
      updateCustomerLocation.toLowerCase() === "false "
    ) {
      shouldUpdateCustomerLocation = false;
    }

    try {
      const result = await this.docService.markDelivery(
        docId,
        markDeliveryDto,
        loggedInUser,
        shouldUpdateCustomerLocation
      );

      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        docId: result.docId,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
          docId: docId,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to mark delivery",
          error: error.message,
        });
      }
    }
  }

  @Put("mark-delivery-failed/:docId")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_TRIP_DRIVER)
  async markDeliveryFailed(
    @Param("docId") docId: string,
    @Body() markDeliveryFailedDto: MarkDeliveryFailedDto,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.docService.markDeliveryFailed(
        docId,
        markDeliveryFailedDto,
        loggedInUser
      );

      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        docId: result.docId,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
          docId: docId,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to mark delivery as failed",
          error: error.message,
        });
      }
    }
  }

  @Get("tracking")
  @SkipAuth()
  @Throttle({ default: { limit: 100, ttl: 1 * 60 * 1000 } }) // 100 requests per minute
  async trackDocument(
    @Query("token") token: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    try {
      // Extract IP address and user agent from request
      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
        req.socket.remoteAddress ||
        null;
      const userAgent = req.headers["user-agent"] || null;

      const result = await this.docService.trackDocument(
        token,
        ipAddress,
        userAgent
      );

      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      console.log(error);
      if (error instanceof Error && error.message.includes("Invalid token")) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      } else if (
        error instanceof Error &&
        error.message.includes("not found")
      ) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to track document",
          error: error.message,
        });
      }
    }
  }

  @Get("delivery-status/:docId")
  @RequireRoles(UserRole.WEB_ACCESS)
  async getDeliveryStatus(
    @Param("docId") docId: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      // Try to decode base64, if it fails, use the docId as-is
      let actualDocId = docId;
      try {
        const decoded = Buffer.from(docId, "base64").toString("utf-8");
        // Only use decoded value if it looks like a valid docId (contains F01-)

        try {
          await this.docService.getDeliveryStatus(decoded);
          //If we get here, the input was a token that translates into a docId and we can use it
          actualDocId = decoded;
        } catch (error) {
          console.log("Not a base64 encoded docId, using as-is:", docId);
        }
      } catch (decodeError) {
        // If base64 decode fails, use original docId
        console.log("Not a base64 encoded docId, using as-is:", docId);
      }

      const result = await this.docService.getDeliveryStatus(actualDocId);

      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        docId: result.docId,
        requestedDocId: docId, // Original parameter (might be base64)
        actualDocId: actualDocId, // Decoded/actual docId used
        status: result.status,
        comment: result.comment,
        signature: result.signature,
        deliveredAt: result.deliveredAt,
      });
    } catch (error) {
      console.log(error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
          docId: docId,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to get delivery status",
          error: error.message,
        });
      }
    }
  }
}
