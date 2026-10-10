import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { User } from "./User";
import { PaymentStatus } from "../enums/payment-status.enum";

@Entity("payment")
export class Payment {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  // ---------- Relations ----------

  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // ---------- Payment details ----------

  // Payment date
  @Index()
  @Column({ type: "timestamptz" })
  date: Date;

  // Payment time (e.g. "14:30:00")
  @Column({ type: "time" })
  time: string;

  // Amount — use numeric(precision, scale), NEVER float for money
  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount: string;

  @Index()
  @Column({
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  // ---------- Audit ----------

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;
}