import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("signature")
export class Signature {
  @PrimaryColumn({ name: "doc_id", type: "varchar", length: 50 })
  docId: string;

  @Column({ name: "signature", type: "bytea" })
  signature: Buffer;
}
