import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./controllers/auth.controller";
import { DocController } from "./controllers/doc.controller";
import { GreetingController } from "./controllers/greeting.controller";
import { LocationController } from "./controllers/location.controller";
import { SettingController } from "./controllers/setting.controller";
import { AppUserXUserRole } from "./entities/app-user-x-user-role.entity";
import { AppUser } from "./entities/app-user.entity";
import { BaseLocation } from "./entities/base-location.entity";
import { Customer } from "./entities/customer.entity";
import { Doc } from "./entities/doc.entity";
import { LocationHeartbeat } from "./entities/location-heartbeat.entity";
import { Setting } from "./entities/setting.entity";
import { UserRole } from "./entities/user-role.entity";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthService } from "./services/auth.service";
import { DocService } from "./services/doc.service";
import { GreetingService } from "./services/greeting.service";
import { LocationService } from "./services/location.service";
import { SettingService } from "./services/setting.service";
import { SettingsCacheService } from "./services/settings-cache.service";
import { AppService } from "./services/app.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `env.${process.env.NODE_ENV || "staging"}`,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 1 * 60 * 1000, // 1 minute in milliseconds
        limit: 500, // 500 requests per minute
      },
    ]),
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [
        AppUser,
        BaseLocation,
        UserRole,
        LocationHeartbeat,
        AppUserXUserRole,
        Customer,
        Doc,
        Setting,
      ],
      autoLoadEntities: false,
      synchronize: false,
      logging: false,
    }),
    TypeOrmModule.forFeature([
      AppUser,
      BaseLocation,
      UserRole,
      LocationHeartbeat,
      AppUserXUserRole,
      Customer,
      Doc,
      Setting,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN") || "8h",
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AuthController,
    DocController,
    LocationController,
    GreetingController,
    SettingController,
  ],
  providers: [
    {
      provide: "APP_GUARD",
      useClass: ThrottlerGuard,
    },
    AuthService,
    DocService,
    JwtAuthGuard,
    LocationService,
    GreetingService,
    SettingService,
    SettingsCacheService,
    AppService,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AppModule {}
