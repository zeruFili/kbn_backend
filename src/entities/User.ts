import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  BeforeInsert,
  BeforeUpdate,
  AfterLoad,
} from "typeorm";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { EventRegistration } from "./event-registration";
import { LocalCredential } from "./LocalCredential";
import { AuthIdentity } from "./AuthIdentity";

@Entity("user")
export class User {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Column({ name: "full_name", type: "varchar", length: 255 })
  full_name: string;

  name?: string;

  @Index("IDX_user_email", { unique: true })
  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ name: "password_hash", type: "varchar", length: 255, select: false, nullable: true })
  password_hash?: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone?: string | null;

  phoneNumber?: string | null;

  @Column({ name: "phone_verified_at", type: "timestamptz", nullable: true, default: null })
  phoneVerifiedAt?: Date | null;

  @Column({ name: "email_verified_at", type: "timestamptz", nullable: true, default: null })
  emailVerifiedAt?: Date | null;

  @Column({ name: "profile_image", type: "varchar", length: 255, nullable: true })
  profileImage?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  website?: string;

  @Column({ type: "text", nullable: true })
  education?: string;

  @Column({ type: "text", nullable: true })
  achievement?: string;

  @Column({ type: "text", nullable: true })
  professional_experience?: string;

  @Index("IDX_user_status")
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

  @Index("IDX_user_role")
  @Column({ type: "enum", enum: UserRole })
  role: UserRole;

  @Column({ type: "timestamptz", nullable: true })
  last_login_at?: Date | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at?: Date | null;

  @OneToOne(() => LocalCredential, (credential) => credential.user)
  localCredential?: LocalCredential;

  @OneToMany(() => AuthIdentity, (identity) => identity.user)
  authIdentities?: AuthIdentity[];

  @OneToMany(() => EventRegistration, (registration) => registration.user)
  eventRegistrations?: EventRegistration[];

  constructor() {
    Object.defineProperty(this, "name", {
      get(this: User) {
        return this.full_name;
      },
      set(this: User, val: string | undefined) {
        if (val !== undefined) this.full_name = val;
      },
      enumerable: true,
      configurable: true,
    });

    Object.defineProperty(this, "phoneNumber", {
      get(this: User) {
        return this.phone;
      },
      set(this: User, val: string | null | undefined) {
        this.phone = val;
      },
      enumerable: true,
      configurable: true,
    });
  }

  @BeforeInsert()
  @BeforeUpdate()
  @AfterLoad()
  syncAliases?() {
    if (this.full_name && !this.name) {
      this.name = this.full_name;
    } else if (this.name && !this.full_name) {
      this.full_name = this.name;
    }

    if (this.phone !== undefined && this.phoneNumber === undefined) {
      this.phoneNumber = this.phone;
    } else if (this.phoneNumber !== undefined && this.phone === undefined) {
      this.phone = this.phoneNumber;
    }
  }
}
