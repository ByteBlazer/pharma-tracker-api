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
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { RequireRoles } from "src/decorators/require-roles.decorator";
import { UserRole } from "src/enums/user-role.enum";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { DocService } from "../services/doc.service";
import { SkipAuth } from "src/decorators/skip-auth.decorator";
import { MarkDeliveryDto } from "../dto/mark-delivery.dto";
import { MarkDeliveryFailedDto } from "../dto/mark-delivery-failed.dto";

@Controller("doc")
export class DocController {
  constructor(private readonly docService: DocService) {}

  @Post("scan-and-add/:docId")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_SCANNER)
  async scanAndAdd(
    @Param("docId") docId: string,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.docService.scanAndAdd(docId, loggedInUser);

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
  @Throttle({ default: { limit: 5, ttl: 1 * 60 * 1000 } })
  async createMockData(
    @Query("useOneRealPhoneNumber") useOneRealPhoneNumber: string,
    @Query("useOneRealRouteId") useOneRealRouteId: string,
    @Query("useOneRealLotNbr") useOneRealLotNbr: string,
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
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.docService.markDelivery(docId, markDeliveryDto);

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
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.docService.markDeliveryFailed(
        docId,
        markDeliveryFailedDto
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
}
