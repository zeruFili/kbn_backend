import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { UserRole } from "../enums/user-role.enum";
import { RolePaymentStatus } from "../enums/role-payment-status.enum";

const numericTransformer = {
  to: (value: number | string | null | undefined): string | null | undefined => {
    if (value === null || value === undefined) return value;
    return typeof value === "number" ? value.toFixed(2) : String(value);
  },
  from: (value: string | number | null | undefined): number | null | undefined => {
    if (value === null || value === undefined) return value;
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
  },
};

@Entity("role_payment")
export class RolePayment {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Index({ unique: true })
  @Column({
    type: "enum",
    enum: UserRole,
    unique: true,
  })
  role: UserRole;

  @Column({
    name: "monthly_amount",
    type: "numeric",
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  monthlyAmount: number;

  @Index()
  @Column({
    type: "enum",
    enum: RolePaymentStatus,
    default: RolePaymentStatus.ACTIVE,
  })
  status: RolePaymentStatus;

  @CreateDateColumn({
    name: "created_at",
    type: "timestamptz",
    default: () => "NOW()",
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: "updated_at",
    type: "timestamptz",
    nullable: true,
  })
  updatedAt: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  get monthly_amount(): number {
    return this.monthlyAmount;
  }

  set monthly_amount(value: number) {
    this.monthlyAmount = value;
  }

  get created_at(): Date {
    return this.createdAt;
  }

  set created_at(value: Date) {
    this.createdAt = value;
  }

  get updated_at(): Date {
    return this.updatedAt;
  }

  set updated_at(value: Date) {
    this.updatedAt = value;
  }

  toJSON() {
    return {
      id: this.id,
      role: this.role,
      monthlyAmount: Number(this.monthlyAmount),
      monthly_amount: Number(this.monthlyAmount),
      status: this.status,
      createdAt: this.createdAt,
      created_at: this.createdAt,
      updatedAt: this.updatedAt,
      updated_at: this.updatedAt,
    };
  }
}
