import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOtpVerifications1718000000000 implements MigrationInterface {
  name = "CreateOtpVerifications1718000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create otp_verifications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "otp_verifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid,
        "identifier" varchar(255) NOT NULL,
        "otp_hash" varchar(255) NOT NULL,
        "purpose" varchar(50) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_otp_verifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_otp_verifications_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    // 2. Create indexes for fast lookup and filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_otp_verifications_user_id" ON "otp_verifications" ("user_id");
      CREATE INDEX IF NOT EXISTS "IDX_otp_verifications_identifier" ON "otp_verifications" ("identifier");
      CREATE INDEX IF NOT EXISTS "IDX_otp_verifications_purpose" ON "otp_verifications" ("purpose");
      CREATE INDEX IF NOT EXISTS "IDX_otp_verifications_identifier_purpose" ON "otp_verifications" ("identifier", "purpose");
      CREATE INDEX IF NOT EXISTS "IDX_otp_verifications_expires_at" ON "otp_verifications" ("expires_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_verifications" CASCADE;`);
  }
}
