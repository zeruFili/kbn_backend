import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { User } from "./User";
import { SocialPlatform } from "../enums/social-platform.enum";

@Entity("user_social_media")
@Index(["user_id", "platform"], { unique: true })
export class UserSocialMedia {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Index()
  @Column({ type: "uuid" })
  user_id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ type: "enum", enum: SocialPlatform })
  platform: SocialPlatform;

  @Column({ type: "varchar", length: 255 })
  link: string;

 

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;

  @Column({ type: "uuid", nullable: true })
  created_by?: string;
}