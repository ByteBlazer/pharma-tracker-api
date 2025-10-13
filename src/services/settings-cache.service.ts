import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Setting } from "../entities/setting.entity";
import { SettingEnum } from "../enums/setting.enum";
import { GlobalConstants } from "../GlobalConstants";

@Injectable()
export class SettingsCacheService implements OnModuleInit {
  private settingsCache: Map<string, string> = new Map();

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>
  ) {}

  async onModuleInit() {
    await this.loadSettingsFromDatabase();
  }

  private async loadSettingsFromDatabase(): Promise<void> {
    try {
      const settings = await this.settingRepository.find();
      this.settingsCache.clear();

      settings.forEach((setting) => {
        this.settingsCache.set(setting.settingName, setting.settingValue);
      });

      console.log(`Loaded ${settings.length} settings into cache`);
    } catch (error) {
      console.error("Failed to load settings from database:", error);
    }
  }

  getSetting(settingName: string): string | undefined {
    return this.settingsCache.get(settingName);
  }

  getMinsBetweenLocationHeartbeats(): number {
    const value = this.getSetting(SettingEnum.MINS_BETWEEN_LOCATION_HEARTBEATS);
    if (value) {
      const parsed = parseInt(value, 10);
      return isNaN(parsed)
        ? GlobalConstants.FALLBACK_LOCATION_HEARTBEAT_FREQUENCY_IN_SECONDS / 60
        : parsed;
    }
    return (
      GlobalConstants.FALLBACK_LOCATION_HEARTBEAT_FREQUENCY_IN_SECONDS / 60
    );
  }

  getCoolOffSecondsBetweenDiffRouteScans(): number {
    const value = this.getSetting(
      SettingEnum.COOL_OFF_SECONDS_BTWN_DIFF_ROUTE_SCANS
    );
    if (value) {
      const parsed = parseInt(value, 10);
      return isNaN(parsed)
        ? GlobalConstants.FALLBACK_SCAN_ROUTE_TIMEOUT_SECONDS
        : parsed;
    }
    return GlobalConstants.FALLBACK_SCAN_ROUTE_TIMEOUT_SECONDS;
  }

  getDefaultGreeting(): string {
    const value = this.getSetting(SettingEnum.DEFAULT_GREETING);
    return value || "Hello From Pharma Tracker";
  }

  getUpdateDocStatusToErp(): boolean {
    const value = this.getSetting(SettingEnum.UPDATE_DOC_STATUS_TO_ERP);
    if (value) {
      return value.toLowerCase() === "true";
    }
    return false; // Default to false if not set
  }

  // Method to update a specific setting in cache (called when setting is updated)
  updateSettingInCache(settingName: string, settingValue: string): void {
    this.settingsCache.set(settingName, settingValue);
  }
}
