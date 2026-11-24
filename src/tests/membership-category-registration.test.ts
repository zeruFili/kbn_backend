import assert from "assert";
import { User } from "../entities/User";
import { Payment } from "../entities/payment";
import { MembershipCategory } from "../entities/membership-category.entity";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { pickSafeUserFields, pickAdminUserFields } from "../utils/response.utils";
import { INITIAL_MEMBERSHIP_CATEGORIES } from "../seeds/seed-membership-categories";

async function runTests() {
  console.log("Starting Membership Category & Registration tests...\n");

  // Test 1: Verify Seed Data conforms to user requirements
  console.log("Test 1: Verify Seed Data definitions");
  assert.strictEqual(INITIAL_MEMBERSHIP_CATEGORIES.length, 5);

  const [t1, t2, t3, t4, t5] = INITIAL_MEMBERSHIP_CATEGORIES;
  assert.strictEqual(t1.code, "beginner_professionals_business_owners");
  assert.strictEqual(t1.name, "Beginner Professionals & Business Owners");
  assert.strictEqual(t1.amount, 100);
  assert.strictEqual(t1.tier, 1);
  assert.strictEqual(t1.currency, "ETB");

  assert.strictEqual(t2.code, "developing_professionals_business_owners");
  assert.strictEqual(t2.name, "Developing Professionals & Business Owners");
  assert.strictEqual(t2.amount, 200);
  assert.strictEqual(t2.tier, 2);
  assert.strictEqual(t2.currency, "ETB");

  assert.strictEqual(t3.code, "established_professionals_business_owners");
  assert.strictEqual(t3.name, "Established Professionals & Business Owners");
  assert.strictEqual(t3.amount, 400);
  assert.strictEqual(t3.tier, 3);
  assert.strictEqual(t3.currency, "ETB");

  assert.strictEqual(t4.code, "senior_professionals_business_owners");
  assert.strictEqual(t4.name, "Senior Professionals & Business Owners");
  assert.strictEqual(t4.amount, 650);
  assert.strictEqual(t4.tier, 4);
  assert.strictEqual(t4.currency, "ETB");

  assert.strictEqual(t5.code, "investors_strategic_partners");
  assert.strictEqual(t5.name, "Investors & Strategic Partners");
  assert.strictEqual(t5.amount, 1000);
  assert.strictEqual(t5.tier, 5);
  assert.strictEqual(t5.currency, "ETB");
  console.log("  ✓ Passed: All 5 tiers match required codes, names, tiers, and amounts\n");

  // Test 2: User entity membership_category_id and aliases
  console.log("Test 2: User entity membership fields and alias synchronization");
  const user = new User();
  user.full_name = "Jane Doe";
  user.email = "jane@example.com";
  user.role = UserRole.User;
  user.status = UserStatus.PENDING;
  user.membership_category_id = "11111111-2222-3333-4444-555555555555";
  user.membershipCategory = "developing_professionals_business_owners";

  assert.strictEqual(user.membership_category, "developing_professionals_business_owners");
  assert.strictEqual(user.membershipCategoryId, "11111111-2222-3333-4444-555555555555");

  user.syncAliases?.();
  assert.strictEqual(user.name, "Jane Doe");
  assert.strictEqual(user.membershipCategory, "developing_professionals_business_owners");
  assert.strictEqual(user.membership_category_id, "11111111-2222-3333-4444-555555555555");
  console.log("  ✓ Passed: User entity getters, setters, and aliases stay synchronized\n");

  // Test 3: Safe user serialization includes category and label
  console.log("Test 3: Safe user serialization includes membership category and label");
  const catEntity = new MembershipCategory();
  catEntity.id = "11111111-2222-3333-4444-555555555555";
  catEntity.code = "developing_professionals_business_owners";
  catEntity.name = "Developing Professionals & Business Owners";
  catEntity.tier = 2;
  catEntity.amount = 500;
  catEntity.currency = "ETB";

  user.membershipCategoryEntity = catEntity;
  const safeOutput = pickSafeUserFields(user);
  assert(safeOutput !== null);
  assert.strictEqual(safeOutput.membershipCategory, "developing_professionals_business_owners");
  assert.strictEqual(safeOutput.membership_category, "developing_professionals_business_owners");
  assert.strictEqual(safeOutput.membershipCategoryId, "11111111-2222-3333-4444-555555555555");
  assert.strictEqual(safeOutput.membership_category_id, "11111111-2222-3333-4444-555555555555");
  assert.strictEqual(safeOutput.membershipCategoryLabel, "Developing Professionals & Business Owners");
  console.log("  ✓ Passed: Safe user fields correctly expose category code, ID, and label\n");

  // Test 4: Payment entity references category entity and serialized JSON
  console.log("Test 4: Payment entity category relation and toJSON serialization");
  const payment = new Payment();
  payment.id = "pay-uuid-9999";
  payment.user_id = user.id || "usr-uuid-1111";
  payment.status = PaymentStatus.ACCEPTED;
  payment.amount = "500.00";
  payment.date = new Date();
  payment.time = "14:30:00";
  payment.membership_category_id = catEntity.id;
  payment.membershipCategory = catEntity.code;
  payment.membershipCategoryEntity = catEntity;

  const paymentJson = payment.toJSON();
  assert.strictEqual(paymentJson.membership_category_id, catEntity.id);
  assert.strictEqual(paymentJson.membershipCategoryId, catEntity.id);
  assert.strictEqual(paymentJson.membershipCategory, "developing_professionals_business_owners");
  assert.strictEqual(paymentJson.membershipCategoryLabel, "Developing Professionals & Business Owners");
  assert.strictEqual(paymentJson.membership_category_label, "Developing Professionals & Business Owners");
  console.log("  ✓ Passed: Payment entity toJSON properly outputs category ID, code, and label\n");

  // Test 5: Verify resolveMembershipCategory resolves all 5 tiers by key or name
  console.log("Test 5: Verify resolveMembershipCategory matches tiers accurately");
  const { resolveMembershipCategory } = await import("../constants/membership-categories");
  const resolvedT1 = resolveMembershipCategory("beginner_professionals_business_owners");
  assert.strictEqual(resolvedT1?.tier, 1);
  assert.strictEqual(resolvedT1?.amount, 100);

  const resolvedT2 = resolveMembershipCategory("Developing Professionals & Business Owners");
  assert.strictEqual(resolvedT2?.tier, 2);
  assert.strictEqual(resolvedT2?.amount, 200);

  const resolvedT3 = resolveMembershipCategory("established_professionals_business_owners");
  assert.strictEqual(resolvedT3?.tier, 3);
  assert.strictEqual(resolvedT3?.amount, 400);

  const resolvedT4 = resolveMembershipCategory("Senior Professionals & Business Owners");
  assert.strictEqual(resolvedT4?.tier, 4);
  assert.strictEqual(resolvedT4?.amount, 650);

  const resolvedT5 = resolveMembershipCategory("Investors & Strategic Partners");
  assert.strictEqual(resolvedT5?.tier, 5);
  assert.strictEqual(resolvedT5?.amount, 1000);
  console.log("  ✓ Passed: All 5 tiers resolve accurately by code or formatted name\n");

  console.log("All Membership Category & Registration tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
