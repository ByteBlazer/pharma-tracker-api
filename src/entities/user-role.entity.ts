import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("user_role")
export class UserRole {
  @PrimaryColumn({ name: "role_name", type: "varchar", length: 25 })
  roleName: string;

  @Column({ name: "order_of_listing", type: "int" })
  orderOfListing: number;

  @Column({ name: "description", type: "text", nullable: true })
  description: string;
}
