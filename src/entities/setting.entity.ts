import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("setting")
export class Setting {
  @PrimaryColumn({ name: "id", type: "varchar", length: 50 })
  id: string;

  @Column({ name: "setting_name", type: "varchar", length: 100 })
  settingName: string;

  @Column({ name: "setting_value", type: "varchar", length: 100 })
  settingValue: string;
}
