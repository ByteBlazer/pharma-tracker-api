import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { UpdateSettingDto } from "../dto/update-setting.dto";
import { UserRole } from "../enums/user-role.enum";
import { SettingService } from "../services/setting.service";

@Controller("setting")
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

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
}
