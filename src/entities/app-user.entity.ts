import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("app_user")
export class AppUser {
  @PrimaryColumn({ name: "mobile", type: "varchar", length: 10 })
  mobile: string;

  @Column({ name: "person_name", type: "varchar", length: 50 })
  personName: string;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ name: "created_at", type: "timestamp", default: () => "NOW()" })
  createdAt: Date;
}
