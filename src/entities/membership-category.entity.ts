import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  BeforeInsert,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";

@Entity("membership_category")
export class MembershipCategory {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @Index("IDX_membership_category_code", { unique: true })
  @Column({ type: "varchar", length: 100, unique: true })
  code: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Index("IDX_membership_category_tier")
  @Column({ type: "int" })
  tier: number;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount: number | string;

  @Column({ type: "varchar", length: 10, default: "ETB" })
  currency: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ name: "formatted_price", type: "varchar", length: 50, nullable: true })
  formattedPrice?: string | null;

  @Column({ type: "boolean", default: false })
  popular: boolean;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at?: Date | null;
}
