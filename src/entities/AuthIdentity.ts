import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  BeforeInsert,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { User } from "./User";

@Entity("auth_identities")
@Index("IDX_auth_identities_provider_provider_user_id", ["provider", "providerUserId"], { unique: true })
export class AuthIdentity {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Index("IDX_auth_identities_user_id")
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => User, (user) => user.authIdentities, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ type: "varchar", length: 50 })
  provider: string; // Initially supporting 'google'

  @Column({ name: "provider_user_id", type: "varchar", length: 255 })
  providerUserId: string; // The verified Google ID token's sub claim

  @CreateDateColumn({ name: "created_at", type: "timestamptz", default: () => "NOW()" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz", nullable: true })
  updatedAt?: Date | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }
}
