import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn,
} from "typeorm";

@Entity("category")
export class Category {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  icon: string;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;

  
}