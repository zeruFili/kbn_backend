import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from "typeorm";
import { User } from "./User";
import { Status, EventAvailability } from "../enums/event.enum";
import { EventRegistration } from "./event-registration";

@Entity("event")
export class Event {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  title: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  slug: string;

  @Column({ type: "varchar", length: 255 })
  type: string;

  // Up to 5 image URLs — stored as a Postgres text array
  @Column({ type: "text", array: true, nullable: true, default: () => "'{}'" })
  images: string[] | null;

  @Index()
  @Column({ type: "timestamptz" })
  start_date: Date;

  @Index()
  @Column({
    type: "enum",
    enum: Status,
    default: Status.DRAFT,
  })
  status: Status;

  @Index()
  @Column({
    type: "enum",
    enum: EventAvailability,
    default: EventAvailability.PUBLIC,
  })
  availability: EventAvailability;

  @Column({ type: "varchar", length: 255 })
  location: string;

  @Column({ type: "text" })
  description: string;

  // ---------- Relations ----------

  @Index()
  @Column({ type: "uuid" })
  created_by: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by" })
  creator: User;

  @OneToMany(() => EventRegistration, (registration) => registration.event)
  registrations?: EventRegistration[];

  // ---------- Audit ----------

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;
}