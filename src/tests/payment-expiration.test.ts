import assert from "node:assert";
import { AppDataSource } from "../config/data-source";
import { Payment } from "../entities/payment";
import { PaymentStatus } from "../enums/payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { paymentService } from "../services/payment.service";
import { UpdatePaymentDto } from "../validators/payment.dto";
import { validateContentDto } from "../utils/content-controller.utils";

async function runPaymentExpirationTests() {
  console.log("Starting Payment Expiration & Validity tests...\n");

  // In-memory mock database for Payment
  const database: Payment[] = [];

  const mockRepo = {
    create: (data: Partial<Payment>) => {
      const entity = new Payment();
      Object.assign(entity, data);
      if (!entity.id) entity.id = "mock-payment-" + Math.random().toString(36).substring(2, 9);
      if (!entity.created_at) entity.created_at = new Date();
      return entity;
    },
    save: async (entity: Payment) => {
      const index = database.findIndex((item) => item.id === entity.id);
      if (index >= 0) {
        database[index] = entity;
      } else {
        database.push(entity);
      }
      return entity;
    },
    findOne: async (options: { where: any; relations?: string[]; order?: any }) => {
      let filtered = database.filter((item) => {
        return Object.keys(options.where).every((key) => {
          return (item as any)[key] === options.where[key];
        });
      });

      if (options.order?.created_at === "DESC") {
        filtered = filtered.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      return filtered[0] || null;
    },
    delete: async (id: string) => {
      const idx = database.findIndex((i) => i.id === id);
      if (idx >= 0) database.splice(idx, 1);
      return { affected: 1 };
    },
    createQueryBuilder: () => {
      let filtered = [...database];
      const qb: any = {
        leftJoinAndSelect: () => qb,
        andWhere: (condition: string, params: any) => {
          if (condition.includes("payment.user_id = :userId")) {
            filtered = filtered.filter((item) => item.user_id === params.userId);
          }
          if (condition.includes("payment.status = :status")) {
            filtered = filtered.filter((item) => item.status === params.status);
          }
          if (condition.includes("payment.expiration_date < NOW()")) {
            const now = new Date();
            filtered = filtered.filter(
              (item) => item.expirationDate !== null && new Date(item.expirationDate) < now
            );
          }
          if (condition.includes("payment.expiration_date >= NOW()")) {
            const now = new Date();
            filtered = filtered.filter(
              (item) => item.expirationDate === null || new Date(item.expirationDate) >= now
            );
          }
          if (condition.includes("payment.expiration_date >= :expirationFrom")) {
            filtered = filtered.filter(
              (item) => item.expirationDate && new Date(item.expirationDate) >= params.expirationFrom
            );
          }
          return qb;
        },
        orderBy: () => qb,
        skip: () => qb,
        take: () => qb,
        getManyAndCount: async () => [filtered, filtered.length],
      };
      return qb;
    },
  };

  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === Payment) {
      return mockRepo;
    }
    return originalGetRepository.call(AppDataSource, entity);
  };

  try {
    // -------------------------------------------------------------
    // 1. Entity: Expiration & Validity Logic
    // -------------------------------------------------------------
    console.log("Test 1: Payment entity expiration and validity computed properties");
    const activePayment = new Payment();
    activePayment.status = PaymentStatus.ACCEPTED;
    activePayment.expirationDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days ahead

    assert.strictEqual(activePayment.isExpired, false, "Active future payment should not be expired");
    assert.strictEqual(activePayment.isValid, true, "Active accepted payment should be valid");

    const expiredPayment = new Payment();
    expiredPayment.status = PaymentStatus.ACCEPTED;
    expiredPayment.expirationDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5); // 5 days ago

    assert.strictEqual(expiredPayment.isExpired, true, "Past payment should be expired");
    assert.strictEqual(expiredPayment.isValid, false, "Expired payment should not be valid");

    const pendingPayment = new Payment();
    pendingPayment.status = PaymentStatus.PENDING;
    pendingPayment.expirationDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    assert.strictEqual(pendingPayment.isValid, false, "Pending payment cannot be valid");
    console.log("  ✓ Passed: Entity computed properties work as expected");

    // -------------------------------------------------------------
    // 2. Entity: Snake-case and Camel-case getter/setter compatibility
    // -------------------------------------------------------------
    console.log("Test 2: Expiration date getter and setter compatibility");
    const testDate = new Date("2026-12-31T23:59:59Z");
    activePayment.expiration_date = testDate;
    assert.strictEqual(activePayment.expirationDate?.toISOString(), testDate.toISOString());
    assert.strictEqual(activePayment.expiration_date?.toISOString(), testDate.toISOString());

    const jsonOutput = activePayment.toJSON();
    assert.ok(jsonOutput.expirationDate !== undefined, "toJSON should include expirationDate");
    assert.ok(jsonOutput.expiration_date !== undefined, "toJSON should include expiration_date");
    assert.ok(jsonOutput.isExpired !== undefined, "toJSON should include isExpired");
    assert.ok(jsonOutput.isValid !== undefined, "toJSON should include isValid");
    console.log("  ✓ Passed: Snake_case, camelCase, and toJSON serialization verified");

    // -------------------------------------------------------------
    // 3. Validation: DTO validates expiration date correctly
    // -------------------------------------------------------------
    console.log("Test 3: UpdatePaymentDto validates expiration date");
    const validDto = await validateContentDto(UpdatePaymentDto, {
      expirationDate: "2026-11-15T00:00:00.000Z",
    });
    assert.ok(validDto.expirationDate instanceof Date, "expirationDate should be transformed to Date");

    let rejectedInvalidDate = false;
    try {
      await validateContentDto(UpdatePaymentDto, {
        expirationDate: "not-a-valid-date",
      });
    } catch {
      rejectedInvalidDate = true;
    }
    assert.strictEqual(rejectedInvalidDate, true, "Invalid date format should fail validation");
    console.log("  ✓ Passed: Expiration date validated properly in DTO");

    // -------------------------------------------------------------
    // 4. Service: calculateDefaultExpirationDate
    // -------------------------------------------------------------
    console.log("Test 4: Service calculateDefaultExpirationDate");
    const baseDate = new Date("2026-01-15T10:00:00Z");
    const defaultExp = paymentService.calculateDefaultExpirationDate(baseDate, 1);
    assert.strictEqual(defaultExp.getMonth(), 1, "Default 1 month should advance to next month");
    console.log("  ✓ Passed: Default expiration calculation accurate");

    // -------------------------------------------------------------
    // 5. Service: getUserPaymentValidity for user without payments
    // -------------------------------------------------------------
    console.log("Test 5: Payment validity for user with no payments");
    const noPaymentResult = await paymentService.getUserPaymentValidity("user-without-payment");
    assert.strictEqual(noPaymentResult.hasPayment, false);
    assert.strictEqual(noPaymentResult.isValid, false);
    assert.strictEqual(noPaymentResult.isExpired, false);
    assert.strictEqual(noPaymentResult.daysRemaining, 0);
    console.log("  ✓ Passed: User without payment returns valid=false");

    // -------------------------------------------------------------
    // 6. Service: getUserPaymentValidity for user with active payment
    // -------------------------------------------------------------
    console.log("Test 6: Payment validity for user with active payment");
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 20); // 20 days remaining
    const validUserPayment = mockRepo.create({
      id: "pay-101",
      user_id: "user-with-active-payment",
      status: PaymentStatus.ACCEPTED,
      date: new Date(),
      time: "12:00:00",
      amount: "500.00",
      expirationDate: futureDate,
      created_at: new Date(),
    });
    await mockRepo.save(validUserPayment);

    const activeResult = await paymentService.getUserPaymentValidity("user-with-active-payment");
    assert.strictEqual(activeResult.hasPayment, true);
    assert.strictEqual(activeResult.isValid, true);
    assert.strictEqual(activeResult.isExpired, false);
    assert.ok(activeResult.daysRemaining >= 19 && activeResult.daysRemaining <= 21);
    console.log("  ✓ Passed: Active user returns valid=true with remaining days");

    // -------------------------------------------------------------
    // 7. Service: getUserPaymentValidity for user with expired payment
    // -------------------------------------------------------------
    console.log("Test 7: Payment validity for user with expired payment");
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10); // 10 days ago
    const expiredUserPayment = mockRepo.create({
      id: "pay-102",
      user_id: "user-with-expired-payment",
      status: PaymentStatus.ACCEPTED,
      date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40),
      time: "12:00:00",
      amount: "500.00",
      expirationDate: pastDate,
      created_at: new Date(),
    });
    await mockRepo.save(expiredUserPayment);

    const expiredResult = await paymentService.getUserPaymentValidity("user-with-expired-payment");
    assert.strictEqual(expiredResult.hasPayment, true);
    assert.strictEqual(expiredResult.isValid, false);
    assert.strictEqual(expiredResult.isExpired, true);
    assert.strictEqual(expiredResult.daysRemaining, 0);
    console.log("  ✓ Passed: Expired user returns valid=false, isExpired=true");

    // -------------------------------------------------------------
    // 8. Service: update payment with expirationDate
    // -------------------------------------------------------------
    console.log("Test 8: Admin updates expiration date on payment");
    const newExpiration = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60); // extend by 60 days
    const updated = await paymentService.update(
      "pay-102",
      { expirationDate: newExpiration },
      { id: "admin-1", role: UserRole.Admin }
    );
    assert.strictEqual(updated.expirationDate?.getTime(), newExpiration.getTime());
    console.log("  ✓ Passed: Payment expiration date updated successfully");

    // -------------------------------------------------------------
    // 9. Service: findAll filters by expiration
    // -------------------------------------------------------------
    console.log("Test 9: findAll filters by expired status");
    const activeList = await paymentService.findAll("admin-1", UserRole.Admin, {
      expired: false,
    });
    assert.ok(activeList.data.every((p) => !p.expirationDate || new Date(p.expirationDate) >= new Date()));

    console.log("  ✓ Passed: Expiration filtering works correctly");

    console.log("\nAll 9 payment expiration tests completed successfully!");
  } finally {
    (AppDataSource as any).getRepository = originalGetRepository;
  }
}

runPaymentExpirationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
