import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Customer } from "./customer.entity";

@Entity("doc")
export class Doc {
  @PrimaryColumn({ name: "id", type: "varchar", length: 50 })
  id: string;

  @Column({ name: "status", type: "varchar", length: 50 })
  status: string;

  @Column({ name: "last_scanned_by", type: "varchar", length: 10 })
  lastScannedBy: string;

  @Column({
    name: "origin_warehouse",
    type: "varchar",
    length: 100,
    nullable: true,
  })
  originWarehouse: string;

  @Column({ name: "trip_id", type: "bigint", nullable: true })
  tripId: number;

  @Column({ name: "doc_date", type: "timestamp" })
  docDate: Date;

  @Column({ name: "doc_amount", type: "numeric", precision: 15, scale: 2 })
  docAmount: number;

  @Column({ name: "route", type: "varchar", length: 100 })
  route: string;

  @Column({ name: "lot", type: "varchar", length: 100, nullable: true })
  lot: string;

  @Column({ name: "comment", type: "varchar", length: 100, nullable: true })
  comment: string;

  @Column({ name: "customer_id", type: "varchar", length: 50 })
  customerId: string;

  @Column({
    name: "transit_hub_latitude",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  transitHubLatitude: string;

  @Column({
    name: "transit_hub_longitude",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  transitHubLongitude: string;

  @Column({ name: "created_at", type: "timestamp", default: () => "NOW()" })
  createdAt: Date;

  @Column({
    name: "last_updated_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  lastUpdatedAt: Date;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: "customer_id" })
  customer: Customer;
}
