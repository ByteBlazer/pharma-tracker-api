import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { UpdateSettingDto } from "../dto/update-setting.dto";
import { UserRole } from "../enums/user-role.enum";
import { SettingService } from "../services/setting.service";
import { BackupService } from "../services/backup.service";

@Controller("setting")
export class SettingController {
  constructor(
    private readonly settingService: SettingService,
    private readonly backupService: BackupService
  ) {}

  @Get(":settingName")
  @RequireRoles(UserRole.WEB_ACCESS, UserRole.APP_ADMIN)
  async getSetting(
    @Param("settingName") settingName: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.settingService.getSetting(settingName);
      res.status(HttpStatus.OK).json(result);
    } catch (error) {
      console.log("Error getting setting:", error);
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
          settingName: settingName,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to get setting",
          settingName: settingName,
        });
      }
    }
  }

  @Put("")
  @RequireRoles(UserRole.WEB_ACCESS)
  async updateSetting(
    @Body() updateSettingDto: UpdateSettingDto,
    @Res() res: Response
  ): Promise<void> {
    try {
      const result = await this.settingService.updateSetting(updateSettingDto);
      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        settingName: result.settingName,
        oldValue: result.oldValue,
        newValue: result.newValue,
      });
    } catch (error) {
      console.log("Error updating setting:", error);
      if (error instanceof NotFoundException) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: error.message,
          settingName: updateSettingDto.settingName,
        });
      } else if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
          settingName: updateSettingDto.settingName,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to update setting",
          settingName: updateSettingDto.settingName,
        });
      }
    }
  }

  @Post("backup")
  @RequireRoles(UserRole.WEB_ACCESS)
  async createBackup(@Res() res: Response): Promise<void> {
    try {
      const result = await this.backupService.createBackup();
      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
        filename: result.filename,
      });
    } catch (error) {
      console.log("Error creating backup:", error);
      if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to create backup",
          error: error.message,
        });
      }
    }
  }

  @Get("backups")
  @RequireRoles(UserRole.WEB_ACCESS)
  async listBackups(@Res() res: Response): Promise<void> {
    try {
      const result = await this.backupService.listBackups();
      res.status(result.statusCode).json({
        success: result.success,
        backups: result.backups,
        count: result.count,
      });
    } catch (error) {
      console.log("Error listing backups:", error);
      if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to list backups",
          error: error.message,
        });
      }
    }
  }

  @Post("restore")
  @RequireRoles(UserRole.WEB_ACCESS)
  async restoreBackup(
    @Body("filename") filename: string,
    @Body("passkey") passkey: string,
    @Res() res: Response
  ): Promise<void> {
    try {
      if (!filename) {
        throw new BadRequestException("Backup filename is required");
      }
      if (!passkey) {
        throw new BadRequestException("Restore passkey is required");
      }

      const result = await this.backupService.restoreBackup(filename, passkey);
      res.status(result.statusCode).json({
        success: result.success,
        message: result.message,
      });
    } catch (error) {
      console.log("Error restoring backup:", error);
      if (error instanceof BadRequestException) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: "Failed to restore backup",
          error: error.message,
        });
      }
    }
  }
}
