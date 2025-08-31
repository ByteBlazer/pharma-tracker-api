import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { GreetingModule } from "./greeting/greeting.module";
import { ThrottleGuard } from "./common/guards/throttle.guard";

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
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== "production", // Only sync in non-production
      logging: process.env.NODE_ENV !== "production",
    }),
    AuthModule,
    GreetingModule,
  ],
  providers: [ThrottleGuard],
})
export class AppModule {}
