import {
  Controller,
  Put,
  Body,
  Res,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import { SettingService } from "../services/setting.service";
import { UpdateSettingDto } from "../dto/update-setting.dto";
import { RequireRoles } from "../decorators/require-roles.decorator";
import { UserRole } from "../enums/user-role.enum";

@Controller("setting")
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Put("")
  @RequireRoles(UserRole.APP_ADMIN)
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
