import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn,
} from "typeorm";
import { CategoryType } from "../enums/category-type.enum";

@Entity("category")
@Index(["name", "type"], { unique: true })
export class Category {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Index()
  @Column({
    type: "enum",
    enum: CategoryType,
    default: CategoryType.COMPANY,
  })
  type: CategoryType;

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