import { AppDataSource } from "../config/data-source";
import { seedMembershipCategories } from "../seeds/seed-membership-categories";

async function run() {
  console.log("Connecting to database for seeding membership categories...");
  await AppDataSource.initialize();
  console.log("Database connected. Seeding categories...");
  const categories = await seedMembershipCategories(AppDataSource);
  console.log(`Seeding completed. Total categories: ${categories.length}`);
  await AppDataSource.destroy();
}

run().catch((err) => {
  console.error("Failed to seed membership categories:", err);
  process.exit(1);
});
