import assert from "node:assert";
import { featuredService } from "../services/featured.service";
import { AppError } from "../middlewares/error.middleware";

async function runFeaturedTests() {
  console.log("Starting Featured Members & Companies validation tests...\n");

  // 1. Members count validation < 5
  console.log("Test 1: Rejecting fewer than 5 members");
  try {
    await featuredService.setFeaturedMembers(["id-1", "id-2", "id-3"]);
    assert.fail("Should have thrown AppError for < 5 members");
  } catch (err: any) {
    assert.strictEqual(err instanceof AppError, true);
    assert.strictEqual(err.statusCode, 400);
    assert.ok(err.message.includes("between 5 and 7"));
    console.log("✓ Correctly rejected 3 members with 400 error");
  }

  // 2. Members count validation > 7
  console.log("Test 2: Rejecting more than 7 members");
  try {
    await featuredService.setFeaturedMembers([
      "id-1",
      "id-2",
      "id-3",
      "id-4",
      "id-5",
      "id-6",
      "id-7",
      "id-8",
    ]);
    assert.fail("Should have thrown AppError for > 7 members");
  } catch (err: any) {
    assert.strictEqual(err instanceof AppError, true);
    assert.strictEqual(err.statusCode, 400);
    assert.ok(err.message.includes("between 5 and 7"));
    console.log("✓ Correctly rejected 8 members with 400 error");
  }

  // 3. Duplicate members validation
  console.log("Test 3: Rejecting duplicate members");
  try {
    await featuredService.setFeaturedMembers([
      "id-1",
      "id-2",
      "id-3",
      "id-4",
      "id-1",
    ]);
    assert.fail("Should have thrown AppError for duplicate members");
  } catch (err: any) {
    assert.strictEqual(err instanceof AppError, true);
    assert.strictEqual(err.statusCode, 400);
    assert.ok(err.message.includes("Duplicate members are not allowed"));
    console.log("✓ Correctly rejected duplicate member IDs with 400 error");
  }

  // 4. Companies count validation < 5
  console.log("Test 4: Rejecting fewer than 5 companies");
  try {
    await featuredService.setFeaturedCompanies(["id-1", "id-2", "id-3", "id-4"]);
    assert.fail("Should have thrown AppError for < 5 companies");
  } catch (err: any) {
    assert.strictEqual(err instanceof AppError, true);
    assert.strictEqual(err.statusCode, 400);
    assert.ok(err.message.includes("between 5 and 7"));
    console.log("✓ Correctly rejected 4 companies with 400 error");
  }

  // 5. Companies count validation > 7
  console.log("Test 5: Rejecting more than 7 companies");
  try {
    await featuredService.setFeaturedCompanies([
      "id-1",
      "id-2",
      "id-3",
      "id-4",
      "id-5",
      "id-6",
      "id-7",
      "id-8",
    ]);
    assert.fail("Should have thrown AppError for > 7 companies");
  } catch (err: any) {
    assert.strictEqual(err instanceof AppError, true);
    assert.strictEqual(err.statusCode, 400);
    assert.ok(err.message.includes("between 5 and 7"));
    console.log("✓ Correctly rejected 8 companies with 400 error");
  }

  // 6. Duplicate companies validation
  console.log("Test 6: Rejecting duplicate companies");
  try {
    await featuredService.setFeaturedCompanies([
      "id-1",
      "id-2",
      "id-3",
      "id-4",
      "id-2",
    ]);
    assert.fail("Should have thrown AppError for duplicate companies");
  } catch (err: any) {
    assert.strictEqual(err instanceof AppError, true);
    assert.strictEqual(err.statusCode, 400);
    assert.ok(err.message.includes("Duplicate companies are not allowed"));
    console.log("✓ Correctly rejected duplicate company IDs with 400 error");
  }

  console.log("\nAll featured validation tests passed successfully! 🎉");
}

runFeaturedTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
