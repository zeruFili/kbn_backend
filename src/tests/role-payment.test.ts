import assert from "node:assert";
import { AppDataSource } from "../config/data-source";
import { RolePayment } from "../entities/role-payment";
import { RolePaymentStatus } from "../enums/role-payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { rolePaymentService } from "../services/role-payment.service";
import { CreateRolePaymentDto, UpdateRolePaymentDto } from "../validators/role-payment.dto";
import { validateContentDto } from "../utils/content-controller.utils";
import { requireExactRole, AuthRequest } from "../middlewares/auth.middleware";

async function runTests() {
  console.log("Starting Role Payment Management tests...\n");

  const database: RolePayment[] = [];

  const mockRepo = {
    create: (data: Partial<RolePayment>) => {
      const entity = new RolePayment();
      Object.assign(entity, data);
      if (!entity.id) entity.generateId();
      if (!entity.createdAt) entity.createdAt = new Date();
      if (!entity.updatedAt) entity.updatedAt = new Date();
      return entity;
    },
    save: async (entity: RolePayment) => {
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
    delete: async (id: string) => {
      const idx = database.findIndex((i) => i.id === id);
      if (idx >= 0) database.splice(idx, 1);
      return { affected: 1 };
    },
    createQueryBuilder: () => {
      let filtered = [...database];
      const qb: any = {
        andWhere: (condition: string, params: any) => {
          if (params.role) {
            filtered = filtered.filter((item) => item.role === params.role);
          }
          if (params.status) {
            filtered = filtered.filter((item) => item.status === params.status);
          }
          return qb;
        },
        orderBy: () => qb,
        getCount: async () => filtered.length,
        skip: () => qb,
        take: () => qb,
        getMany: async () => filtered,
      };
      return qb;
    },
  };

  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === RolePayment) {
      return mockRepo;
    }
    return originalGetRepository.call(AppDataSource, entity);
  };

  try {
    // -------------------------------------------------------------
    // 1. Validation: Negative monthly amount rejected
    // -------------------------------------------------------------
    console.log("Test 1: Validate negative monthly payment amount rejection");
    let caughtValidationError = false;
    try {
      await validateContentDto(CreateRolePaymentDto, {
        role: UserRole.Company,
        monthlyAmount: -100,
      });
    } catch (e: any) {
      caughtValidationError = true;
      assert(e.statusCode === 400);
      assert(e.message.includes("monthlyAmount must be a non-negative amount"));
    }
    assert(caughtValidationError, "Expected validation error for negative amount");
    console.log("  ✓ Passed: Negative monthly amount rejected by DTO validation");

    // -------------------------------------------------------------
    // 2. Validation: Invalid role rejected
    // -------------------------------------------------------------
    console.log("Test 2: Validate invalid role rejection");
    let caughtInvalidRole = false;
    try {
      await validateContentDto(CreateRolePaymentDto, {
        role: "super_ninja",
        monthlyAmount: 250,
      });
    } catch (e: any) {
      caughtInvalidRole = true;
      assert(e.statusCode === 400);
      assert(e.message.includes("role must be one of"));
    }
    assert(caughtInvalidRole, "Expected validation error for invalid role");
    console.log("  ✓ Passed: Invalid role rejected by DTO validation");

    // -------------------------------------------------------------
    // 3. Create role payment configuration (Admin)
    // -------------------------------------------------------------
    console.log("Test 3: Admin successfully creates role payment configuration");
    const dto1 = await validateContentDto(CreateRolePaymentDto, {
      role: UserRole.Company,
      monthlyAmount: 500.5,
      status: "ACTIVE",
    });
    const created1 = await rolePaymentService.create(dto1);
    assert.strictEqual(created1.role, UserRole.Company);
    assert.strictEqual(created1.monthlyAmount, 500.5);
    assert.strictEqual(created1.status, RolePaymentStatus.ACTIVE);
    assert(created1.id);
    console.log("  ✓ Passed: Role payment created with correct fields");

    // -------------------------------------------------------------
    // 4. Duplicate prevention for same role
    // -------------------------------------------------------------
    console.log("Test 4: Prevent duplicate payment configuration for the same role");
    let caughtDuplicate = false;
    try {
      const duplicateDto = await validateContentDto(CreateRolePaymentDto, {
        role: UserRole.Company,
        monthlyAmount: 600,
      });
      await rolePaymentService.create(duplicateDto);
    } catch (e: any) {
      caughtDuplicate = true;
      assert.strictEqual(e.statusCode, 409);
      assert(e.message.includes("already exists"));
    }
    assert(caughtDuplicate, "Expected 409 conflict when creating duplicate role configuration");
    console.log("  ✓ Passed: Duplicate role payment configuration strictly prevented with 409 Conflict");

    // -------------------------------------------------------------
    // 5. Create configuration for another role (Church)
    // -------------------------------------------------------------
    console.log("Test 5: Create configuration for another role (Church)");
    const dto2 = await validateContentDto(CreateRolePaymentDto, {
      role: UserRole.Church,
      monthly_amount: 300,
    });
    const created2 = await rolePaymentService.create(dto2);
    assert.strictEqual(created2.role, UserRole.Church);
    assert.strictEqual(created2.monthlyAmount, 300);
    assert.strictEqual(created2.status, RolePaymentStatus.ACTIVE);
    console.log("  ✓ Passed: Multiple roles can each have distinct configurations");

    // -------------------------------------------------------------
    // 6. Update monthly payment amount
    // -------------------------------------------------------------
    console.log("Test 6: Update monthly payment amount");
    const updateDto = await validateContentDto(UpdateRolePaymentDto, {
      monthlyAmount: 750,
    });
    const updated = await rolePaymentService.update(created1.id, updateDto);
    assert.strictEqual(updated.monthlyAmount, 750);
    console.log("  ✓ Passed: Monthly amount successfully updated to 750");

    // -------------------------------------------------------------
    // 7. Deactivate and activate role payment configuration
    // -------------------------------------------------------------
    console.log("Test 7: Deactivate role payment configuration");
    const deactivated = await rolePaymentService.deactivate(created1.id);
    assert.strictEqual(deactivated.status, RolePaymentStatus.INACTIVE);
    console.log("  ✓ Passed: Configuration successfully deactivated");

    console.log("Test 8: Activate role payment configuration");
    const activated = await rolePaymentService.activate(created1.id);
    assert.strictEqual(activated.status, RolePaymentStatus.ACTIVE);
    console.log("  ✓ Passed: Configuration successfully activated");

    // -------------------------------------------------------------
    // 9. Authorization: Non-admin access restricted
    // -------------------------------------------------------------
    console.log("Test 9: Verify authorization middleware blocks non-admin users");
    const adminCheck = requireExactRole(UserRole.Admin, "Only admins allowed");

    // User without auth token
    let unauthenticatedBlocked = false;
    const req1: any = { user: undefined };
    const res1: any = {
      status: (code: number) => {
        assert.strictEqual(code, 401);
        return {
          json: (body: any) => {
            unauthenticatedBlocked = true;
          },
        };
      },
    };
    adminCheck(req1 as AuthRequest, res1, () => {});
    assert(unauthenticatedBlocked, "Unauthenticated request should receive 401");

    // User with non-admin role (e.g. UserRole.User)
    let nonAdminBlocked = false;
    const req2: any = { user: { id: "user-1", role: UserRole.User } };
    const res2: any = {
      status: (code: number) => {
        assert.strictEqual(code, 403);
        return {
          json: (body: any) => {
            nonAdminBlocked = true;
          },
        };
      },
    };
    adminCheck(req2 as AuthRequest, res2, () => {});
    assert(nonAdminBlocked, "Non-admin request should receive 403");

    // User with Admin role
    let adminPassed = false;
    const req3: any = { user: { id: "admin-1", role: UserRole.Admin } };
    const res3: any = {};
    adminCheck(req3 as AuthRequest, res3, () => {
      adminPassed = true;
    });
    assert(adminPassed, "Admin request should pass authorization");
    console.log("  ✓ Passed: Strict admin authorization middleware verified (401 for unauthenticated, 403 for non-admin, 200/next for admin)");

    console.log("\nAll 9 tests passed successfully! ✨\n");
  } finally {
    (AppDataSource as any).getRepository = originalGetRepository;
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
