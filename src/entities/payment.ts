import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { User } from "./User";
import { MembershipCategory } from "./membership-category.entity";
import { PaymentStatus } from "../enums/payment-status.enum";
import { getMembershipCategoryLabel } from "../constants/membership-categories";

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

  @Index()
  @Column({ name: "membership_category_id", type: "uuid", nullable: true })
  membership_category_id: string | null;

  @ManyToOne(() => MembershipCategory, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "membership_category_id" })
  membershipCategoryEntity?: MembershipCategory | null;

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

  // ---------- Provider / gateway ----------

  // Payment provider/gateway (e.g. "stripe", "paypal", "chapa", "telebirr")
  @Index()
  @Column({ type: "varchar", length: 50, nullable: true })
  provider: string | null;

  // Provider transaction reference / external ID (e.g. Stripe charge id, tx ref)
  @Index()
  @Column({ type: "varchar", length: 255, nullable: true, unique: true })
  reference: string | null;

  // URL to the payment page (for redirect-based flows) or receipt URL
  @Column({ type: "text", nullable: true })
  url: string | null;

  @Column({ type: "text", nullable: true })
  image: string | null;

  // Expiration date (when the payment / membership access expires)
  @Index()
  @Column({ name: "expiration_date", type: "timestamptz", nullable: true })
  expirationDate: Date | null;

  // Membership package / category (e.g. "beginner_professionals_business_owners")
  @Index()
  @Column({ name: "membership_category", type: "varchar", length: 100, nullable: true })
  membershipCategory: string | null;

  get membership_category(): string | null {
    return this.membershipCategory;
  }

  set membership_category(value: string | null) {
    this.membershipCategory = value;
  }

  // Expected package amount (e.g. 250.00, 500.00, 750.00, 1000.00)
  @Column({ name: "expected_amount", type: "numeric", precision: 12, scale: 2, nullable: true })
  expectedAmount: string | null;

  get expected_amount(): string | null {
    return this.expectedAmount;
  }

  set expected_amount(value: string | null) {
    this.expectedAmount = value;
  }

  get expiration_date(): Date | null {
    return this.expirationDate;
  }

  set expiration_date(value: Date | null) {
    this.expirationDate = value;
  }

  get isExpired(): boolean {
    if (!this.expirationDate) return false;
    return new Date() > new Date(this.expirationDate);
  }

  get is_expired(): boolean {
    return this.isExpired;
  }

  get isValid(): boolean {
    if (this.status !== PaymentStatus.ACCEPTED) return false;
    if (!this.expirationDate) return true;
    return new Date() <= new Date(this.expirationDate);
  }

  get is_valid(): boolean {
    return this.isValid;
  }

  // ---------- Audit ----------

  @Index()
  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      user: this.user,
      date: this.date,
      time: this.time,
      amount: this.amount,
      status: this.status,
      provider: this.provider,
      reference: this.reference,
      url: this.url,
      image: this.image,
      membershipCategory: this.membershipCategory,
      membership_category: this.membershipCategory,
      membership_category_id: this.membership_category_id,
      membershipCategoryId: this.membership_category_id,
      membershipCategoryEntity: this.membershipCategoryEntity,
      membershipCategoryLabel:
        this.membershipCategoryEntity?.name || getMembershipCategoryLabel(this.membershipCategory),
      membership_category_label:
        this.membershipCategoryEntity?.name || getMembershipCategoryLabel(this.membershipCategory),
      expectedAmount: this.expectedAmount,
      expected_amount: this.expectedAmount,
      expirationDate: this.expirationDate,
      expiration_date: this.expirationDate,
      isExpired: this.isExpired,
      is_expired: this.isExpired,
      isValid: this.isValid,
      is_valid: this.isValid,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}