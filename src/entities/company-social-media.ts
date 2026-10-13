import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { Company } from "./company";
import { SocialPlatform } from "../enums/social-platform.enum";

@Entity("company_social_media")
@Index(["company_id", "platform"], { unique: true })
export class CompanySocialMedia {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Index()
  @Column({ type: "uuid" })
  company_id: string;

  @ManyToOne(() => Company, (company) => company.social_media, { onDelete: "CASCADE" })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column({ type: "enum", enum: SocialPlatform })
  platform: SocialPlatform;

  @Column({ type: "varchar", length: 255 })
  link: string;

  // ---------- Audit ----------

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;

  @Column({ type: "uuid", nullable: true })
  created_by?: string;
}