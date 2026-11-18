import { MigrationInterface, QueryRunner } from "typeorm";

export class MakeCompanyEmailNonUnique1720000000000 implements MigrationInterface {
  name = "MakeCompanyEmailNonUnique1720000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_rec RECORD;
        index_rec RECORD;
      BEGIN
        -- Drop any unique constraints on company(email)
        FOR constraint_rec IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
          WHERE rel.relname = 'company'
            AND con.contype = 'u'
            AND att.attname = 'email'
        LOOP
          EXECUTE format('ALTER TABLE "company" DROP CONSTRAINT IF EXISTS %I', constraint_rec.conname);
        END LOOP;

        -- Drop any standalone unique indexes on company(email)
        FOR index_rec IN
          SELECT i.relname AS index_name
          FROM pg_index ix
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
          WHERE t.relname = 'company'
            AND ix.indisunique = true
            AND ix.indisprimary = false
            AND a.attname = 'email'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', index_rec.index_name);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_company_email" ON "company" ("email");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_company_email";`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_company_email_unique" ON "company" ("email");
    `);
  }
}
