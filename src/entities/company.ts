import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from "typeorm";
import { Category } from "./category";
import { VerificationStatus } from "../enums/verification-status.enum";
import { CompanySocialMedia } from "./company-social-media";

@Entity("company")
export class Company {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  // ---------- Basic Company Information ----------

  @Column({ type: "varchar", length: 255 })
  company_name: string;

  @Index()
  @Column({ type: "uuid" })
  business_category_id: string;

  @ManyToOne(() => Category, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "business_category_id" })
  business_category: Category;

  @Column({ type: "varchar", length: 255 })
  owner_primary_contact: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ type: "varchar", length: 20 })
  phone_number: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  website: string;

  @Column({ type: "varchar", length: 255 })
  physical_address: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  company_logo?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  cover_image?: string | null;

  // ---------- Company Details ----------

  @Column({ type: "text" })
  description: string;

  // Government-issued business license or registration document (URL / path)
  @Column({ type: "varchar", length: 255 })
  business_license: string;

  @Index()
  @Column({
    type: "enum",
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  verification_status: VerificationStatus;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  // ---------- Social Media ----------

  @OneToMany(() => CompanySocialMedia, (sm) => sm.company)
  social_media: CompanySocialMedia[];

  // ---------- Audit ----------

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;

  @Column({ type: "uuid", nullable: true })
  created_by?: string;
}