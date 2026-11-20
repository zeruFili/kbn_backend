import assert from "node:assert";
import { LoveGift } from "../entities/love-gift";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { LoveGiftService } from "../services/love-gift.service";
import { AppDataSource } from "../config/data-source";

async function runTests() {
  console.log("Starting Love Gift End-to-End Functionality tests...\n");

  const database: LoveGift[] = [];

  const mockLoveGiftRepo = {
    create: (data: Partial<LoveGift>) => {
      const entity = new LoveGift();
      Object.assign(entity, data);
      if (!entity.id) entity.id = "test-uuid-" + Math.random().toString(36).substring(2, 9);
      if (!entity.created_at) entity.created_at = new Date();
      return entity;
    },
    save: async (entity: LoveGift) => {
      const index = database.findIndex((item) => item.id === entity.id);
      if (index >= 0) {
        database[index] = entity;
      } else {
        database.push(entity);
      }
      return entity;
    },
    findOne: async (options: { where: any }) => {
      return (
        database.find((item) => {
          return Object.keys(options.where).every(
            (key) => (item as any)[key] === options.where[key]
          );
        }) || null
      );
    },
    find: async (options?: { where?: any; order?: any }) => {
      let results = [...database];
      if (options?.where) {
        results = results.filter((item) => {
          return Object.keys(options.where).every(
            (key) => (item as any)[key] === options.where[key]
          );
        });
      }
      return results;
    },
    count: async (options?: { where?: any }) => {
      if (!options?.where) return database.length;
      return database.filter((item) => {
        return Object.keys(options.where).every(
          (key) => (item as any)[key] === options.where[key]
        );
      }).length;
    },
    createQueryBuilder: () => {
      let filtered = [...database];
      const qb: any = {
        leftJoinAndSelect: () => qb,
        where: () => qb,
        andWhere: (condition: string, params: any) => {
          if (params?.status) {
            filtered = filtered.filter((i) => i.status === params.status);
          }
          if (params?.accStatus) {
            filtered = filtered.filter((i) => i.status === params.accStatus);
          }
          return qb;
        },
        orderBy: () => qb,
        skip: (offset: number) => {
          filtered = filtered.slice(offset);
          return qb;
        },
        take: (limit: number) => {
          filtered = filtered.slice(0, limit);
          return qb;
        },
        getManyAndCount: async () => [filtered, database.length],
        getRawOne: async () => {
          const sum = database
            .filter((i) => i.status === PaymentStatus.ACCEPTED)
            .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
          return { sum: sum.toString() };
        },
        select: () => qb,
      };
      return qb;
    },
  };

  // Mock AppDataSource.getRepository for LoveGift
  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (target: any) => {
    if (target === LoveGift || target.name === "LoveGift") {
      return mockLoveGiftRepo;
    }
    return originalGetRepository.call(AppDataSource, target);
  };

  const service = new LoveGiftService();

  // Test 1: User summary calculation (only approved gifts counted towards total contributed)
  console.log("Test 1: User summary strictly calculates approved gifts for total contributed...");
  const userId = "user-1234-uuid";

  // Add 1 approved gift (5,000 ETB), 1 pending gift (2,500 ETB), 1 rejected gift (1,000 ETB)
  await mockLoveGiftRepo.save(
    mockLoveGiftRepo.create({
      id: "gift-1",
      user_id: userId,
      amount: "5000.00",
      status: PaymentStatus.ACCEPTED,
      donorName: "Hannah",
      date: new Date(),
      time: "10:00:00",
    })
  );

  await mockLoveGiftRepo.save(
    mockLoveGiftRepo.create({
      id: "gift-2",
      user_id: userId,
      amount: "2500.00",
      status: PaymentStatus.PENDING,
      donorName: "Hannah",
      date: new Date(),
      time: "11:00:00",
    })
  );

  await mockLoveGiftRepo.save(
    mockLoveGiftRepo.create({
      id: "gift-3",
      user_id: userId,
      amount: "1000.00",
      status: PaymentStatus.REJECTED,
      donorName: "Hannah",
      date: new Date(),
      time: "12:00:00",
    })
  );

  const summary = await service.getUserGiftSummary(userId);
  assert.strictEqual(summary.totalContributed, 5000, "Total contributed must strictly equal 5000 (approved only)");
  assert.strictEqual(summary.totalGiftsCount, 3, "Total gifts count must be 3");
  assert.strictEqual(summary.approvedGiftsCount, 1, "Approved count must be 1");
  assert.strictEqual(summary.pendingGiftsCount, 1, "Pending count must be 1");
  console.log("✓ Test 1 Passed: User total contributed is strictly 5000 ETB from approved gift.\n");

  // Test 2: Admin list and statistics calculation
  console.log("Test 2: Admin statistics calculates total approved amount across all gifts...");
  // Add another gift from visitor
  await mockLoveGiftRepo.save(
    mockLoveGiftRepo.create({
      id: "gift-4",
      user_id: null,
      donorName: "Guest Visitor",
      amount: "3000.00",
      status: PaymentStatus.ACCEPTED,
      date: new Date(),
      time: "13:00:00",
    })
  );

  const adminList = await service.getAdminGifts({ page: 1, limit: 10 });
  assert.strictEqual(adminList.statistics.totalCount, 4, "Total submissions must be 4");
  assert.strictEqual(adminList.statistics.acceptedCount, 2, "Accepted count must be 2");
  assert.strictEqual(adminList.statistics.totalApprovedAmount, 8000, "Total approved amount must be 8000 (5000 + 3000)");
  console.log("✓ Test 2 Passed: Admin total approved amount is 8000 ETB.\n");

  // Test 3: Admin status update (approving pending gift)
  console.log("Test 3: Admin approves a pending gift...");
  const adminUser = { id: "admin-id", role: UserRole.Admin };
  const updatedGift = await service.updateStatus(
    "gift-2",
    { status: PaymentStatus.ACCEPTED, adminNotes: "Receipt checked and verified manually" },
    adminUser
  );

  assert.strictEqual(updatedGift.status, PaymentStatus.ACCEPTED, "Gift status must be updated to ACCEPTED");
  assert.strictEqual(updatedGift.adminNotes, "Receipt checked and verified manually");

  // Recalculate user summary
  const updatedUserSummary = await service.getUserGiftSummary(userId);
  assert.strictEqual(
    updatedUserSummary.totalContributed,
    7500,
    "After admin approval, user total contributed must increase to 7500 (5000 + 2500)"
  );
  assert.strictEqual(updatedUserSummary.approvedGiftsCount, 2);
  assert.strictEqual(updatedUserSummary.pendingGiftsCount, 0);
  console.log("✓ Test 3 Passed: User contribution correctly reflects newly approved gift (7500 ETB).\n");

  // Restore original repository
  (AppDataSource as any).getRepository = originalGetRepository;

  console.log("All Love Gift tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
