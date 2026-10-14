import assert from "node:assert";
import { AppDataSource } from "../config/data-source";
import { Company } from "../entities/company";
import { CompanyStatus } from "../enums/company-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { companyService } from "../services/company.service";
import { companyController } from "../controllers/company.controller";
import { AuthRequest } from "../middlewares/auth.middleware";

async function runCompanyFilterTests() {
  console.log("Running company filtering tests...\n");

  let capturedWhereClauses: { query: string; parameters?: any }[] = [];

  const mockQueryBuilder = {
    leftJoinAndSelect() {
      return this;
    },
    andWhere(query: string, parameters?: any) {
      capturedWhereClauses.push({ query, parameters });
      return this;
    },
    orderBy() {
      return this;
    },
    skip() {
      return this;
    },
    take() {
      return this;
    },
    async getCount() {
      return 1;
    },
    async getMany() {
      return [];
    },
  };

  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === Company) {
      return {
        createQueryBuilder: () => mockQueryBuilder,
      };
    }
    return originalGetRepository.call(AppDataSource, entity);
  };

  try {
    // -------------------------------------------------------------
    // 1. Non-admin user requests companies without status param
    // -------------------------------------------------------------
    console.log("Test 1: Non-admin without status param gets only active companies");
    capturedWhereClauses = [];
    await companyService.findAll({}, { id: "user-1", role: UserRole.User });

    const hasActiveStatus = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.status = :activeStatus") &&
        w.parameters?.activeStatus === CompanyStatus.ACTIVE
    );
    const hasIsActive = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.is_active = :isActive") &&
        w.parameters?.isActive === true
    );
    assert.strictEqual(hasActiveStatus, true);
    assert.strictEqual(hasIsActive, true);
    console.log("  ✓ Passed: Non-admin query enforces company.status=ACTIVE and company.is_active=true");

    // -------------------------------------------------------------
    // 2. Non-admin user attaching status='pending'
    // -------------------------------------------------------------
    console.log("Test 2: Non-admin attaching status='pending' still strictly gets only active companies");
    capturedWhereClauses = [];
    await companyService.findAll(
      { status: CompanyStatus.PENDING },
      { id: "user-1", role: UserRole.User }
    );

    const hasActiveStatusPendingAttempt = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.status = :activeStatus") &&
        w.parameters?.activeStatus === CompanyStatus.ACTIVE
    );
    const hasIsActivePendingAttempt = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.is_active = :isActive") &&
        w.parameters?.isActive === true
    );
    const hasPendingStatus = capturedWhereClauses.some(
      (w) => w.parameters?.status === CompanyStatus.PENDING
    );

    assert.strictEqual(hasActiveStatusPendingAttempt, true);
    assert.strictEqual(hasIsActivePendingAttempt, true);
    assert.strictEqual(hasPendingStatus, false);
    console.log("  ✓ Passed: Non-admin cannot override active company filter with status='pending'");

    // -------------------------------------------------------------
    // 3. Non-admin user attaching status='suspended' and is_active=false
    // -------------------------------------------------------------
    console.log("Test 3: Non-admin attaching status='suspended' and is_active=false");
    capturedWhereClauses = [];
    await companyService.findAll(
      { status: CompanyStatus.SUSPENDED, is_active: false },
      { id: "church-1", role: UserRole.Church }
    );

    const hasActiveStatusSuspendedAttempt = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.status = :activeStatus") &&
        w.parameters?.activeStatus === CompanyStatus.ACTIVE
    );
    const hasIsActiveFalseAttempt = capturedWhereClauses.some(
      (w) => w.parameters?.isActive === false
    );

    assert.strictEqual(hasActiveStatusSuspendedAttempt, true);
    assert.strictEqual(hasIsActiveFalseAttempt, false);
    console.log("  ✓ Passed: Non-admin is strictly constrained to active companies");

    // -------------------------------------------------------------
    // 4. Admin user without status param
    // -------------------------------------------------------------
    console.log("Test 4: Admin user without status param can retrieve companies of any status");
    capturedWhereClauses = [];
    await companyService.findAll({}, { id: "admin-1", role: UserRole.Admin });

    const adminHasActiveStatusConstraint = capturedWhereClauses.some(
      (w) => w.query.includes("company.status = :activeStatus")
    );
    const adminHasIsActiveConstraint = capturedWhereClauses.some(
      (w) => w.query.includes("company.is_active = :isActive")
    );

    assert.strictEqual(adminHasActiveStatusConstraint, false);
    assert.strictEqual(adminHasIsActiveConstraint, false);
    console.log("  ✓ Passed: Admin query has no status restriction when status param is omitted");

    // -------------------------------------------------------------
    // 5. Admin user explicitly filtering by status
    // -------------------------------------------------------------
    console.log("Test 5: Admin user explicitly requesting status='pending'");
    capturedWhereClauses = [];
    await companyService.findAll(
      { status: CompanyStatus.PENDING },
      { id: "admin-1", role: UserRole.Admin }
    );

    const adminPendingMatch = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.status = :status") &&
        w.parameters?.status === CompanyStatus.PENDING
    );
    assert.strictEqual(adminPendingMatch, true);
    console.log("  ✓ Passed: Admin can filter by status='pending'");

    // -------------------------------------------------------------
    // 6. Admin user explicitly filtering by is_active=false
    // -------------------------------------------------------------
    console.log("Test 6: Admin user explicitly requesting is_active=false");
    capturedWhereClauses = [];
    await companyService.findAll(
      { is_active: false },
      { id: "admin-1", role: UserRole.Admin }
    );

    const adminIsActiveFalseMatch = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.is_active = :isActive") &&
        w.parameters?.isActive === false
    );
    assert.strictEqual(adminIsActiveFalseMatch, true);
    console.log("  ✓ Passed: Admin can filter by is_active=false");

    // -------------------------------------------------------------
    // 7. Controller forwards currentUser to companyService.findAll
    // -------------------------------------------------------------
    console.log("Test 7: CompanyController forwards authenticated user to companyService");
    capturedWhereClauses = [];
    let responseStatus = 200;
    let responseJson: any = null;
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
        id: "member-456",
        role: UserRole.User,
      },
    };

    await companyController.findAll(mockReq as any, mockRes, () => {});
    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseJson.success, true);
    const controllerActiveMatch = capturedWhereClauses.some(
      (w) =>
        w.query.includes("company.status = :activeStatus") &&
        w.parameters?.activeStatus === CompanyStatus.ACTIVE
    );
    assert.strictEqual(controllerActiveMatch, true);
    console.log("  ✓ Passed: Controller properly forwarded non-admin user and enforced active filtering");

    console.log("\nALL COMPANY FILTER TESTS PASSED SUCCESSFULLY! ✓");
  } finally {
    AppDataSource.getRepository = originalGetRepository;
  }
}

runCompanyFilterTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
