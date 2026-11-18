import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMembershipCategoryToPayment1721000000000 implements MigrationInterface {
  name = "AddMembershipCategoryToPayment1721000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'payment' AND column_name = 'membership_category'
        ) THEN
          ALTER TABLE "payment" ADD COLUMN "membership_category" character varying(100);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'payment' AND column_name = 'expected_amount'
        ) THEN
          ALTER TABLE "payment" ADD COLUMN "expected_amount" numeric(12, 2);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE tablename = 'payment' AND indexname = 'IDX_payment_membership_category'
        ) THEN
          CREATE INDEX "IDX_payment_membership_category" ON "payment" ("membership_category");
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'user' AND column_name = 'membership_category'
        ) THEN
          ALTER TABLE "user" ADD COLUMN "membership_category" character varying(100);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_payment_membership_category";
      ALTER TABLE "payment" DROP COLUMN IF EXISTS "membership_category";
      ALTER TABLE "payment" DROP COLUMN IF EXISTS "expected_amount";
      ALTER TABLE "user" DROP COLUMN IF EXISTS "membership_category";
    `);
  }
}
