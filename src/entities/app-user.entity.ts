import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { BaseLocation } from "./base-location.entity";

@Entity("app_user")
export class AppUser {
  @PrimaryColumn({ name: "id", type: "varchar", length: 50 })
  id: string;

  @Column({ name: "mobile", type: "varchar", length: 10 })
  mobile: string;

  @Column({ name: "person_name", type: "varchar", length: 50 })
  personName: string;

  @Column({ name: "base_location_id", type: "varchar", length: 50 })
  baseLocationId: string;

  @Column({ name: "vehicle_nbr", type: "varchar", length: 25 })
  vehicleNbr: string;

  @ManyToOne(() => BaseLocation)
  @JoinColumn({ name: "base_location_id" })
  baseLocation: BaseLocation;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ name: "created_at", type: "timestamp", default: () => "NOW()" })
  createdAt: Date;
}
