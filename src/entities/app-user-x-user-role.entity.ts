import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from "typeorm";
import { AppUser } from "./app-user.entity";
import { UserRole } from "./user-role.entity";

@Entity("app_user_x_user_role")
export class AppUserXUserRole {
  @PrimaryColumn({ name: "app_user_id", type: "varchar", length: 50 })
  appUserId: string;

  @PrimaryColumn({ name: "role_name", type: "varchar", length: 25 })
  roleName: string;

  @ManyToOne(() => AppUser, { onDelete: "CASCADE" })
  @JoinColumn({ name: "app_user_id" })
  appUser: AppUser;

  @ManyToOne(() => UserRole, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_name" })
  userRole: UserRole;
}
