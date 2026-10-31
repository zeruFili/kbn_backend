import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthIdentityAndLocalCredential1719000000000 implements MigrationInterface {
  name = "CreateAuthIdentityAndLocalCredential1719000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Audit and update "user" table: add verification timestamps and make password_hash nullable
    await queryRunner.query(`
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone_verified_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE "user" ALTER COLUMN "password_hash" DROP NOT NULL;
    `);

    // Audit email unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_email" ON "user" ("email");
    `);

    // 2. Create "local_credentials" table for password authentication
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "local_credentials" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT "PK_local_credentials_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_local_credentials_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_local_credentials_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_local_credentials_user_id" ON "local_credentials" ("user_id");
    `);

    // 3. Create "auth_identities" table for external identity providers (Google, etc.)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_identities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "provider" varchar(50) NOT NULL,
        "provider_user_id" varchar(255) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT "PK_auth_identities_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auth_identities_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_identities_user_id" ON "auth_identities" ("user_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_auth_identities_provider_provider_user_id" ON "auth_identities" ("provider", "provider_user_id");
    `);

    // 4. Safely migrate existing user password hashes to local_credentials (preserve backwards compatibility)
    await queryRunner.query(`
      INSERT INTO "local_credentials" ("id", "user_id", "password_hash", "created_at", "updated_at")
      SELECT gen_random_uuid(), "id", "password_hash", NOW(), NOW()
      FROM "user"
      WHERE "password_hash" IS NOT NULL AND "password_hash" <> ''
      ON CONFLICT ("user_id") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_identities" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "local_credentials" CASCADE;`);
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS "phone_verified_at";
      ALTER TABLE "user" DROP COLUMN IF EXISTS "email_verified_at";
    `);
  }
}
