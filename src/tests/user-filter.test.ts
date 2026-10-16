import assert from "node:assert";
import { Not } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { userService } from "../services/user.service";
import { userController } from "../controllers/user.controller";
import { AuthRequest } from "../middlewares/auth.middleware";

async function runTests() {
  console.log("Running user filtering tests...\n");

  let capturedFindOptions: any = null;

  const mockUsers: Partial<User>[] = [
    {
      id: "u-1",
      full_name: "Active Member",
      email: "active@example.com",
      role: UserRole.User,
      status: UserStatus.ACTIVE,
      is_active: true,
      created_at: new Date(),
    },
    {
      id: "u-2",
      full_name: "Pending Member",
      email: "pending@example.com",
      role: UserRole.User,
      status: UserStatus.PENDING,
      is_active: false,
      created_at: new Date(),
    },
    {
      id: "u-3",
      full_name: "Suspended Member",
      email: "suspended@example.com",
      role: UserRole.Company,
      status: UserStatus.SUSPENDED,
      is_active: false,
      created_at: new Date(),
    },
    {
      id: "u-4",
      full_name: "Inactive Member",
      email: "inactive@example.com",
      role: UserRole.Church,
      status: UserStatus.INACTIVE,
      is_active: false,
      created_at: new Date(),
    },
  ];

  // Mock AppDataSource.getRepository
  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === User) {
      return {
        findAndCount: async (options: any) => {
          capturedFindOptions = options;
          return [mockUsers, mockUsers.length];
        },
      };
    }
    return originalGetRepository.call(AppDataSource, entity);
  };

  try {
    // -------------------------------------------------------------
    // 1. Non-admin user requests users without status param
    // -------------------------------------------------------------
    console.log("Test 1: Non-admin user without status param retrieves only active users");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, undefined, undefined, {
      id: "non-admin-id",
      role: UserRole.User,
    });
    assert.strictEqual(capturedFindOptions.where.length, 1);
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.ACTIVE);
    assert.strictEqual(capturedFindOptions.where[0].is_active, true);
    assert.deepStrictEqual(capturedFindOptions.where[0].role, Not(UserRole.Admin));
    console.log("  ✓ Passed: Non-admin where clause correctly enforces status=ACTIVE, is_active=true, and excludes admin");

    // -------------------------------------------------------------
    // 2. Non-admin user attaching status='pending'
    // -------------------------------------------------------------
    console.log("Test 2: Non-admin attaching status='pending' still strictly gets only active users");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, undefined, UserStatus.PENDING, {
      id: "non-admin-id",
      role: UserRole.User,
    });
    assert.strictEqual(capturedFindOptions.where.length, 1);
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.ACTIVE);
    assert.strictEqual(capturedFindOptions.where[0].is_active, true);
    console.log("  ✓ Passed: Non-admin cannot override active filtering by passing status='pending'");

    // -------------------------------------------------------------
    // 3. Non-admin user attaching status='inactive' / 'suspended' / is_active=false
    // -------------------------------------------------------------
    console.log("Test 3: Non-admin attaching status='suspended' and is_active=false");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, false, undefined, UserStatus.SUSPENDED, {
      id: "non-admin-id",
      role: UserRole.Church,
    });
    assert.strictEqual(capturedFindOptions.where.length, 1);
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.ACTIVE);
    assert.strictEqual(capturedFindOptions.where[0].is_active, true);
    console.log("  ✓ Passed: Non-admin is strictly constrained to active users");

    // -------------------------------------------------------------
    // 4. Non-admin user with search
    // -------------------------------------------------------------
    console.log("Test 4: Non-admin user with search term");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, "test", undefined, {
      id: "non-admin-id",
      role: UserRole.Company,
    });
    assert.strictEqual(capturedFindOptions.where.length, 2);
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.ACTIVE);
    assert.strictEqual(capturedFindOptions.where[0].is_active, true);
    assert.strictEqual(capturedFindOptions.where[1].status, UserStatus.ACTIVE);
    assert.strictEqual(capturedFindOptions.where[1].is_active, true);
    console.log("  ✓ Passed: Search branches maintain status=ACTIVE and is_active=true for non-admin");

    // -------------------------------------------------------------
    // 5. Non-admin user with role filter
    // -------------------------------------------------------------
    console.log("Test 5: Non-admin user with role filter");
    capturedFindOptions = null;
    await userService.findAll(1, 20, UserRole.Ministry, undefined, undefined, undefined, {
      id: "non-admin-id",
      role: UserRole.User,
    });
    assert.strictEqual(capturedFindOptions.where[0].role, UserRole.Ministry);
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.ACTIVE);
    assert.strictEqual(capturedFindOptions.where[0].is_active, true);
    console.log("  ✓ Passed: Non-admin role filtering maintains active-only constraint");

    // -------------------------------------------------------------
    // 6. Admin user without status param retrieves all statuses
    // -------------------------------------------------------------
    console.log("Test 6: Admin user without status param can retrieve users of any status");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, undefined, undefined, {
      id: "admin-id",
      role: UserRole.Admin,
    });
    assert.strictEqual(capturedFindOptions.where.length, 1);
    assert.strictEqual(capturedFindOptions.where[0].status, undefined);
    assert.strictEqual(capturedFindOptions.where[0].is_active, undefined);
    assert.deepStrictEqual(capturedFindOptions.where[0].role, Not(UserRole.Admin));
    console.log("  ✓ Passed: Admin query has no status restriction when status param is omitted and excludes admin");

    // -------------------------------------------------------------
    // 7. Admin user filtering by specific status (pending, suspended, inactive)
    // -------------------------------------------------------------
    console.log("Test 7: Admin user explicitly requesting status='pending'");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, undefined, UserStatus.PENDING, {
      id: "admin-id",
      role: UserRole.Admin,
    });
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.PENDING);
    console.log("  ✓ Passed: Admin can filter by status='pending'");

    console.log("Test 8: Admin user explicitly requesting status='suspended'");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, undefined, UserStatus.SUSPENDED, {
      id: "admin-id",
      role: UserRole.Admin,
    });
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.SUSPENDED);
    console.log("  ✓ Passed: Admin can filter by status='suspended'");

    // -------------------------------------------------------------
    // 8. Admin user filtering by role without status filter
    // -------------------------------------------------------------
    console.log("Test 9: Admin user filtering by role does not force is_active=true");
    capturedFindOptions = null;
    await userService.findAll(1, 20, UserRole.Company, undefined, undefined, undefined, {
      id: "admin-id",
      role: UserRole.Admin,
    });
    assert.strictEqual(capturedFindOptions.where[0].role, UserRole.Company);
    assert.strictEqual(capturedFindOptions.where[0].is_active, undefined);
    assert.strictEqual(capturedFindOptions.where[0].status, undefined);
    console.log("  ✓ Passed: Admin can retrieve company users across all statuses");

    // -------------------------------------------------------------
    // 9. Admin user with search
    // -------------------------------------------------------------
    console.log("Test 10: Admin user with search term");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, "test", undefined, {
      id: "admin-id",
      role: UserRole.Admin,
    });
    assert.strictEqual(capturedFindOptions.where.length, 2);
    assert.strictEqual(capturedFindOptions.where[0].status, undefined);
    assert.strictEqual(capturedFindOptions.where[1].status, undefined);
    console.log("  ✓ Passed: Admin search does not restrict status");

    // -------------------------------------------------------------
    // 10. Controller forwards currentUser to userService.findAll
    // -------------------------------------------------------------
    console.log("Test 11: UserController forwards authenticated user to userService");
    let responseJson: any = null;
    let responseStatus: number = 200;
    const mockRes: any = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      },
    };

    const mockReq: Partial<AuthRequest> = {
      query: { status: "pending" },
      user: {
        id: "member-123",
        role: UserRole.User,
        status: UserStatus.ACTIVE,
      },
    };

    capturedFindOptions = null;
    await userController.findAll(mockReq as AuthRequest, mockRes, () => {});
    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseJson.success, true);
    // As a non-admin, the captured query should be active despite req.query.status='pending'
    assert.strictEqual(capturedFindOptions.where[0].status, UserStatus.ACTIVE);
    assert.strictEqual(capturedFindOptions.where[0].is_active, true);
    assert.deepStrictEqual(capturedFindOptions.where[0].role, Not(UserRole.Admin));
    console.log("  ✓ Passed: UserController correctly passed currentUser, enforced active filter, and excluded admin");

    // -------------------------------------------------------------
    // 12. Fetching all users explicitly excludes admin user accounts
    // -------------------------------------------------------------
    console.log("Test 12: Fetching all users excludes admin user accounts for both non-admin and admin callers");
    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, undefined, undefined, undefined);
    assert.deepStrictEqual(capturedFindOptions.where[0].role, Not(UserRole.Admin));
    console.log("  ✓ Passed: Unauthenticated / public query excludes admin user accounts");

    capturedFindOptions = null;
    await userService.findAll(1, 20, undefined, undefined, "test-search", undefined, undefined);
    assert.deepStrictEqual(capturedFindOptions.where[0].role, Not(UserRole.Admin));
    assert.deepStrictEqual(capturedFindOptions.where[1].role, Not(UserRole.Admin));
    console.log("  ✓ Passed: Search query branches both exclude admin user accounts");

    console.log("\nALL TESTS PASSED SUCCESSFULLY! ✓");
  } finally {
    AppDataSource.getRepository = originalGetRepository;
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
