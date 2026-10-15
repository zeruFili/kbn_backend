import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";
import { OtpPurpose } from "../enums/otp-purpose.enum";

@Entity("otp_verifications")
@Index("IDX_otp_verifications_identifier_purpose", ["identifier", "purpose"])
export class OtpVerification {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  // Foreign key referencing user (nullable for registration before user exists)
  @Index("IDX_otp_verifications_user_id")
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "user_id" })
  user: User | null;

  @Index("IDX_otp_verifications_identifier")
  @Column({ type: "varchar", length: 255 })
  identifier: string;

  @Column({ name: "otp_hash", type: "varchar", length: 255 })
  otpHash: string;

  @Index("IDX_otp_verifications_purpose")
  @Column({
    type: "varchar",
    length: 50,
  })
  purpose: OtpPurpose;

  @Index("IDX_otp_verifications_expires_at")
  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ type: "int", default: 0 })
  attempts: number;

  @Column({ name: "used_at", type: "timestamptz", nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({
    name: "created_at",
    type: "timestamptz",
    default: () => "NOW()",
  })
  createdAt: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
