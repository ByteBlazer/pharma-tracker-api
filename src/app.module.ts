import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { GreetingModule } from "./greeting/greeting.module";
import { ThrottleGuard } from "./common/guards/throttle.guard";
import { AppUser } from "./entities/app-user.entity";
import { UserRole } from "./entities/user-role.entity";

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
      entities: [AppUser, UserRole],
      autoLoadEntities: false,
      synchronize: false,
      logging: false,
    }),
    AuthModule,
    GreetingModule,
  ],
  providers: [ThrottleGuard],
})
export class AppModule {}
