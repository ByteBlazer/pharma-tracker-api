import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("doc_tracking_access")
export class DocTrackingAccess {
  @PrimaryGeneratedColumn({ name: "id", type: "bigint" })
  id: number;

  @Column({ name: "doc_id", type: "varchar", length: 50 })
  docId: string;

  @Column({ name: "customer_id", type: "varchar", length: 50 })
  customerId: string;

  @Column({ name: "accessed_at", type: "timestamp", default: () => "NOW()" })
  accessedAt: Date;

  @Column({ name: "ip_address", type: "varchar", length: 50, nullable: true })
  ipAddress: string;

  @Column({ name: "user_agent", type: "varchar", length: 500, nullable: true })
  userAgent: string;
}
