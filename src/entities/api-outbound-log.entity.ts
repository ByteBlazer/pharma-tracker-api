import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("api_outbound_logs")
export class ApiOutboundLog {
  @PrimaryGeneratedColumn({ name: "id", type: "bigint" })
  id: number;

  @CreateDateColumn({ name: "fired_at", type: "timestamptz" })
  firedAt: Date;

  @Column({ name: "endpoint", type: "text" })
  endpoint: string;

  @Column({ name: "method", type: "varchar", length: 10 })
  method: string;

  @Column({ name: "http_status", type: "int", nullable: true })
  httpStatus: number | null;

  @Column({ name: "response_time_ms", type: "int", nullable: true })
  responseTimeMs: number | null;

  @Column({ name: "request_body", type: "jsonb", nullable: true })
  requestBody: any;

  @Column({ name: "response_body", type: "jsonb", nullable: true })
  responseBody: any;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ name: "success", type: "boolean", default: false })
  success: boolean;
}
