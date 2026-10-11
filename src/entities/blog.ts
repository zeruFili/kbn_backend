import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  Index, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Status } from "../enums/event.enum";

@Entity("blog")
export class Blog {
  @PrimaryColumn({ type: "uuid", default: () => "gen_random_uuid()" })
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  title: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  slug: string;

  @Index()
  @Column({ type: "varchar", length: 255 })
  topic: string;

  // Up to 5 image URLs — stored as a Postgres text array
  @Column({ type: "text", array: true, nullable: true, default: () => "'{}'" })
  featured_image: string[] | null;

  @Index()
  @Column({ type: "timestamptz" })
  publication_date: Date;

  @Index()
  @Column({
    type: "enum",
    enum: Status,
    default: Status.DRAFT,
  })
  status: Status;

  @Column({ type: "text" })
  excerpt: string;

  // ---------- Relations ----------

  @Index()
  @Column({ type: "uuid" })
  author_id: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_id" })
  author: User;

  // ---------- Audit ----------

  @CreateDateColumn({ type: "timestamptz", default: () => "NOW()" })
  created_at: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true })
  updated_at: Date;
}