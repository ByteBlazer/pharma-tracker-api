import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("base_location")
export class BaseLocation {
  @PrimaryColumn({ name: "id", type: "varchar", length: 50 })
  id: string;

  @Column({ name: "name", type: "varchar", length: 100 })
  name: string;
}
