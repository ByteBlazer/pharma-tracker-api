import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { AppUser } from "./app-user.entity";
import { TripStatus } from "../enums/trip-status.enum";

@Entity("trip")
export class Trip {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "created_by", type: "varchar", length: 50 })
  createdBy: string;

  @Column({ name: "driven_by", type: "varchar", length: 50 })
  drivenBy: string;

  @Column({ name: "vehicle_nbr", type: "varchar", length: 25 })
  vehicleNbr: string;

  @Column({ name: "route", type: "varchar", length: 100 })
  route: string;

  @Column({ name: "status", type: "enum", enum: TripStatus })
  status: TripStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ name: "started_at", type: "timestamp", nullable: true })
  startedAt: Date;

  @UpdateDateColumn({ name: "last_updated_at" })
  lastUpdatedAt: Date;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: "created_by" })
  creator: AppUser;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: "driven_by" })
  driver: AppUser;
}
