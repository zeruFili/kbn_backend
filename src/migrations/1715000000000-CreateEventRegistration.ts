import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEventRegistration1715000000000 implements MigrationInterface {
  name = "CreateEventRegistration1715000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum type if it does not already exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_registration_status_enum') THEN
          CREATE TYPE "event_registration_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
        END IF;
      END $$;
    `);

    // 2. Create event_registration table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_registration" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "event_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "status" "event_registration_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_event_registration_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_registration_event_user" UNIQUE ("event_id", "user_id"),
        CONSTRAINT "FK_event_registration_event" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_event_registration_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    // 3. Create helpful indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_event_registration_event_id" ON "event_registration" ("event_id");
      CREATE INDEX IF NOT EXISTS "IDX_event_registration_user_id" ON "event_registration" ("user_id");
      CREATE INDEX IF NOT EXISTS "IDX_event_registration_status" ON "event_registration" ("status");
      CREATE INDEX IF NOT EXISTS "IDX_event_registration_created_at" ON "event_registration" ("created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "event_registration" CASCADE;`);
    await queryRunner.query(`DROP TYPE IF EXISTS "event_registration_status_enum";`);
  }
}
