import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfileImageToUser1716000000000 implements MigrationInterface {
  name = "AddProfileImageToUser1716000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'user' AND column_name = 'profile_image'
        ) THEN
          ALTER TABLE "user" ADD COLUMN "profile_image" character varying(255);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user" DROP COLUMN IF EXISTS "profile_image";
    `);
  }
}
