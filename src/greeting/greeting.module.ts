import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GreetingController } from "./greeting.controller";
import { GreetingService } from "./greeting.service";
import { UserRoleService } from "../services/user-role.service";
import { UserRole } from "../entities/user-role.entity";

@Module({
  imports: [TypeOrmModule.forFeature([UserRole])],
  controllers: [GreetingController],
  providers: [GreetingService, UserRoleService],
})
export class GreetingModule {}
