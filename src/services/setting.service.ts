import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SettingOutputDto } from "../dto/setting-output.dto";
import { UpdateSettingDto } from "../dto/update-setting.dto";
import { Setting } from "../entities/setting.entity";
import { SettingEnum } from "../enums/setting.enum";
import { SettingsCacheService } from "./settings-cache.service";

@Injectable()
export class SettingService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly settingsCacheService: SettingsCacheService
  ) {}

  async getSetting(settingName: string): Promise<SettingOutputDto> {
    // Check if setting exists
    const setting = await this.settingRepository.findOne({
      where: { settingName },
    });

    if (!setting) {
      throw new NotFoundException(`Setting '${settingName}' not found`);
    }

    return {
      settingName: setting.settingName,
      settingValue: setting.settingValue,
    };
  }

  async updateSetting(updateSettingDto: UpdateSettingDto): Promise<{
    success: boolean;
    message: string;
    settingName: string;
    oldValue: string;
    newValue: string;
    statusCode: number;
  }> {
    const { settingName, settingValue } = updateSettingDto;

    // Check if setting exists
    const existingSetting = await this.settingRepository.findOne({
      where: { settingName },
    });

    if (!existingSetting) {
      throw new NotFoundException(`Setting '${settingName}' not found`);
    }

    // Validate the setting value based on setting name
    this.validateSettingValue(settingName, settingValue);

    // Update the setting
    const oldValue = existingSetting.settingValue;
    existingSetting.settingValue = settingValue;
    await this.settingRepository.save(existingSetting);

    // Update the cache with the new value
    this.settingsCacheService.updateSettingInCache(settingName, settingValue);

    return {
      success: true,
      message: `Setting '${settingName}' updated successfully`,
      settingName: settingName,
      oldValue: oldValue,
      newValue: settingValue,
      statusCode: 200,
    };
  }

  private validateSettingValue(
    settingName: string,
    settingValue: string
  ): void {
    switch (settingName) {
      case SettingEnum.MINS_BETWEEN_LOCATION_HEARTBEATS:
        this.validateMinsBetweenLocationHeartbeats(settingName, settingValue);
        break;
      case SettingEnum.COOL_OFF_SECONDS_BTWN_DIFF_ROUTE_SCANS:
        this.validateCoolOffSeconds(settingName, settingValue);
        break;
      case SettingEnum.DEFAULT_GREETING:
        this.validateDefaultGreeting(settingName, settingValue);
        break;
      case SettingEnum.UPDATE_DOC_STATUS_TO_ERP:
        this.validateBooleanSetting(settingName, settingValue);
        break;
      default:
        throw new BadRequestException(`Unknown setting name: ${settingName}`);
    }
  }

  private validateMinsBetweenLocationHeartbeats(
    settingName: string,
    value: string
  ): void {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1 || numValue > 20) {
      throw new BadRequestException(
        `${settingName} must be a number between 1 and 20`
      );
    }
  }

  private validateCoolOffSeconds(settingName: string, value: string): void {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 5 || numValue > 600) {
      throw new BadRequestException(
        `${settingName} must be a number between 5 and 600`
      );
    }
  }

  private validateDefaultGreeting(settingName: string, value: string): void {
    if (typeof value !== "string" || value.length < 5) {
      throw new BadRequestException(
        `${settingName} must be a string with at least 5 characters`
      );
    }
  }

  private validateBooleanSetting(settingName: string, value: string): void {
    const lowerValue = value.toLowerCase();
    if (lowerValue !== "true" && lowerValue !== "false") {
      throw new BadRequestException(
        `${settingName} must be either 'true' or 'false'`
      );
    }
  }
}
