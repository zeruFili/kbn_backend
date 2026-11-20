import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { User } from "./User";
import { PaymentStatus } from "../enums/payment-status.enum";

@Entity("love_gift")
export class LoveGift {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  // ---------- Donor / User relation ----------

  @Index()
  @Column({ type: "uuid", nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user: User | null;

  // Donor details (captured for visitors or when user specifies custom donor name)
  @Column({ name: "donor_name", type: "varchar", length: 255, nullable: true })
  donorName: string | null;

  @Column({ name: "donor_email", type: "varchar", length: 255, nullable: true })
  donorEmail: string | null;

  @Column({ name: "donor_phone", type: "varchar", length: 50, nullable: true })
  donorPhone: string | null;

  @Column({ name: "is_anonymous", type: "boolean", default: false })
  isAnonymous: boolean;

  // ---------- Transaction Details ----------

  // Voluntary Gift Amount — numeric(12, 2)
  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount: string;

  @Column({ type: "varchar", length: 10, default: "ETB" })
  currency: string;

  @Index()
  @Column({
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  // Bank or mobile provider (e.g. "Dashen Bank", "CBE", "Telebirr", "BOA")
  @Index()
  @Column({ type: "varchar", length: 50, nullable: true })
  provider: string | null;

  // Transaction reference / transaction ID from receipt
  @Index()
  @Column({ type: "varchar", length: 255, nullable: true })
  reference: string | null;

  // External receipt URL if detected from bank QR / upstream
  @Column({ type: "text", nullable: true })
  url: string | null;

  // Path to uploaded receipt image
  @Column({ type: "text", nullable: true })
  image: string | null;

  // Payment date
  @Index()
  @Column({ type: "timestamptz" })
  date: Date;

  // Payment time (e.g. "14:30:00")
  @Column({ type: "varchar", length: 20 })
  time: string;

  // Optional blessing or voluntary note from donor
  @Column({ type: "text", nullable: true })
  note: string | null;

  // Admin notes (e.g. reason for rejection or approval remarks)
  @Column({ name: "admin_notes", type: "text", nullable: true })
  adminNotes: string | null;

  // ---------- Audit Timestamps ----------

  @Index()
  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      user: this.user
        ? {
            id: this.user.id,
            name: this.user.name,
            email: this.user.email,
            avatar: (this.user as any).avatar || (this.user as any).profileImage,
          }
        : null,
      donorName: this.donorName,
      donorEmail: this.donorEmail,
      donorPhone: this.donorPhone,
      isAnonymous: this.isAnonymous,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      provider: this.provider,
      reference: this.reference,
      url: this.url,
      image: this.image,
      date: this.date,
      time: this.time,
      note: this.note,
      adminNotes: this.adminNotes,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
