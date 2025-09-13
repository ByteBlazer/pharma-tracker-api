import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { AppUser } from "./app-user.entity";

@Entity("location_heartbeat")
export class LocationHeartbeat {
  @PrimaryColumn({ name: "id", type: "varchar", length: 100 })
  id: string;

  @Column({ name: "app_user_id", type: "varchar", length: 50 })
  appUserId: string;

  @Column({ name: "geo_latitude", type: "varchar", length: 20 })
  geoLatitude: string;

  @Column({ name: "geo_longitude", type: "varchar", length: 20 })
  geoLongitude: string;

  @Column({ name: "received_at", type: "timestamp", default: () => "NOW()" })
  receivedAt: Date;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: "app_user_id" })
  appUser: AppUser;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
