import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { GreetingController } from "./controllers/greeting.controller";
import { GreetingService } from "./services/greeting.service";
import { ThrottleGuard } from "./guards/throttle.guard";
import { AppUser } from "./entities/app-user.entity";
import { UserRole } from "./entities/user-role.entity";
import { LocationHeartbeat } from "./entities/location-heartbeat.entity";
import { AppUserXUserRole } from "./entities/app-user-x-user-role.entity";
import { AuthController } from "./controllers/auth.controller";
import { AuthService } from "./services/auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { LocationController } from "./controllers/location.controller";
import { LocationService } from "./services/location.service";
import { UserRoleService } from "./services/user-role.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `env.${process.env.NODE_ENV || "staging"}`,
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [AppUser, UserRole, LocationHeartbeat, AppUserXUserRole],
      autoLoadEntities: false,
      synchronize: false,
      logging: false,
    }),
    TypeOrmModule.forFeature([
      AppUser,
      UserRole,
      LocationHeartbeat,
      AppUserXUserRole,
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
  controllers: [AuthController, LocationController, GreetingController],
  providers: [
    ThrottleGuard,
    AuthService,
    JwtAuthGuard,
    LocationService,
    GreetingService,
    UserRoleService,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AppModule {}
