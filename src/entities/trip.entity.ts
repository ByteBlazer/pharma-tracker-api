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

  @Column({ type: "varchar", length: 50 })
  createdBy: string;

  @Column({ type: "varchar", length: 50 })
  drivenBy: string;

  @Column({ type: "varchar", length: 25 })
  vehicleNbr: string;

  @Column({ type: "enum", enum: TripStatus })
  status: TripStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastUpdatedAt: Date;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: "created_by" })
  creator: AppUser;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: "driven_by" })
  driver: AppUser;
}
