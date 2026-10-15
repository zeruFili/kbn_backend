import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
  BeforeInsert,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { Event } from "./event";
import { User } from "./User";
import { EventRegistrationStatus } from "../enums/event-registration-status.enum";

@Entity("event_registration")
@Unique("UQ_event_registration_event_user", ["eventId", "userId"])
export class EventRegistration {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  // ---------- Relations ----------

  @Index()
  @Column({ name: "event_id", type: "uuid" })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: "CASCADE" })
  @JoinColumn({ name: "event_id" })
  event: Event;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  // ---------- Status ----------

  @Index()
  @Column({
    type: "enum",
    enum: EventRegistrationStatus,
    default: EventRegistrationStatus.PENDING,
  })
  status: EventRegistrationStatus;

  // ---------- Audit ----------

  @CreateDateColumn({
    name: "created_at",
    type: "timestamptz",
    default: () => "NOW()",
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: "updated_at",
    type: "timestamptz",
    nullable: true,
  })
  updatedAt: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
    if (!this.status) {
      this.status = EventRegistrationStatus.PENDING;
    }
  }

  // ---------- CamelCase / Snake_case Compatibility Accessors ----------

  get event_id(): string {
    return this.eventId;
  }

  set event_id(value: string) {
    this.eventId = value;
  }

  get user_id(): string {
    return this.userId;
  }

  set user_id(value: string) {
    this.userId = value;
  }

  get created_at(): Date {
    return this.createdAt;
  }

  set created_at(value: Date) {
    this.createdAt = value;
  }

  get updated_at(): Date {
    return this.updatedAt;
  }

  set updated_at(value: Date) {
    this.updatedAt = value;
  }

  toJSON() {
    return {
      id: this.id,
      eventId: this.eventId,
      event_id: this.eventId,
      userId: this.userId,
      user_id: this.userId,
      status: this.status,
      createdAt: this.createdAt,
      created_at: this.createdAt,
      updatedAt: this.updatedAt,
      updated_at: this.updatedAt,
      event: this.event,
      user: this.user,
    };
  }
}
