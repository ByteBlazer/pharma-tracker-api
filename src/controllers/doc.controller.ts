import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { RequireRoles } from "src/decorators/require-roles.decorator";
import { UserRole } from "src/enums/user-role.enum";
import { DocService } from "../services/doc.service";
import { AppService } from "../services/app.service";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { LoggedInUser } from "../decorators/logged-in-user.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

@Controller("doc")
export class DocController {
  constructor(
    private readonly docService: DocService,
    private readonly appService: AppService
  ) {}

  @Post("scan-and-add/:docId")
  @RequireRoles(UserRole.APP_ADMIN, UserRole.APP_SCANNER)
  async scanAndAdd(
    @Param("docId") docId: string,
    @LoggedInUser() loggedInUser: JwtPayload,
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.docService.scanAndAdd(docId, loggedInUser.id);

      res.status(HttpStatus.OK).json({
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

  @Get("create-mock-docs")
  @RequireRoles()
  @Throttle({ default: { limit: 5, ttl: 1 * 60 * 1000 } })
  async createMockData(@Res() res: Response): Promise<void> {
    const result = await this.docService.createMockData();

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
}
