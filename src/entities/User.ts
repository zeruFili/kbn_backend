import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, OneToMany,
} from "typeorm";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { EventRegistration } from "./event-registration";

@Entity("user")
export class User {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ type: "varchar", length: 255 })
  full_name: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ type: "varchar", length: 255, select: false })
  password_hash: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string;

  @Column({ name: "profile_image", type: "varchar", length: 255, nullable: true })
  profileImage?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  website: string;

  @Column({ type: "text", nullable: true })
  education: string;

  @Column({ type: "text", nullable: true })
  achievement: string;

  @Column({ type: "text", nullable: true })
  professional_experience: string;

  @Index()
  @Column({
    type: "enum",
    enum: UserStatus,
    default: UserStatus.PENDING,
  })
  status: UserStatus;

  @Column({ type: "boolean", default: true })
  is_active: boolean;

  @Column({ type: "smallint", default: 1 })
  rank: number; // 1 - 10

  @Index()
  @Column({ type: "enum", enum: UserRole })
  role: UserRole;

  @Column({ type: "timestamptz", nullable: true })
  last_login_at: Date;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;

  @OneToMany(() => EventRegistration, (registration) => registration.user)
  eventRegistrations?: EventRegistration[];
}