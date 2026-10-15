import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServicesToCompany1717000000000 implements MigrationInterface {
  name = "AddServicesToCompany1717000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'company' AND column_name = 'services'
        ) THEN
          ALTER TABLE "company" ADD COLUMN "services" text[] NOT NULL DEFAULT '{}';
        ELSE
          UPDATE "company" SET "services" = '{}' WHERE "services" IS NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "company" DROP COLUMN IF EXISTS "services";
    `);
  }
}
