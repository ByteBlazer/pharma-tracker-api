import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("customer")
export class Customer {
  @PrimaryColumn({ name: "id", type: "varchar", length: 50 })
  id: string;

  @Column({ name: "firm_name", type: "varchar", length: 255 })
  firmName: string;

  @Column({ name: "address", type: "text", nullable: true })
  address: string;

  @Column({ name: "city", type: "varchar", length: 100, nullable: true })
  city: string;

  @Column({ name: "pincode", type: "varchar", length: 20, nullable: true })
  pincode: string;

  @Column({ name: "geo_latitude", type: "varchar", length: 20, nullable: true })
  geoLatitude: string;

  @Column({
    name: "geo_longitude",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  geoLongitude: string;

  @Column({ name: "created_at", type: "timestamp", default: () => "NOW()" })
  createdAt: Date;

  @Column({
    name: "last_updated_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  lastUpdatedAt: Date;
}
