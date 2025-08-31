import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserRole } from "../entities/user-role.entity";

@Injectable()
export class UserRoleService {
  constructor(
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>
  ) {}

  async getAllRoleNames(): Promise<string[]> {
    const roles = await this.userRoleRepository
      .createQueryBuilder("role")
      .select("role.roleName")
      .orderBy("role.orderOfListing", "ASC")
      .getMany();

    return roles.map((role) => role.roleName);
  }

  async getAllRoles(): Promise<UserRole[]> {
    return this.userRoleRepository
      .createQueryBuilder("role")
      .orderBy("role.orderOfListing", "ASC")
      .getMany();
  }
}
