import assert from "node:assert";
import { AppDataSource } from "../config/data-source";
import { EventRegistration } from "../entities/event-registration";
import { Event } from "../entities/event";
import { User } from "../entities/User";
import { EventRegistrationStatus } from "../enums/event-registration-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { eventRegistrationService } from "../services/event-registration.service";
import {
  CreateEventRegistrationDto,
  UpdateEventRegistrationStatusDto,
} from "../validators/event-registration.dto";
import { validateContentDto } from "../utils/content-controller.utils";
import { authorize, AuthRequest } from "../middlewares/auth.middleware";

export async function runEventRegistrationTests() {
  console.log("Starting Event Registration Feature tests...\n");

  const registrationsDb: EventRegistration[] = [];
  const eventsDb: Event[] = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      title: "Tech Conference 2026",
      slug: "tech-conference-2026",
      type: "Conference",
      images: [],
      start_date: new Date(),
      status: "published" as any,
      availability: "public" as any,
      location: "Addis Ababa",
      description: "Annual Tech Conference",
      created_by: "admin-uuid",
      creator: null as any,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      title: "Design Workshop 2026",
      slug: "design-workshop-2026",
      type: "Workshop",
      images: [],
      start_date: new Date(),
      status: "published" as any,
      availability: "public" as any,
      location: "Hawassa",
      description: "Creative Design Workshop",
      created_by: "admin-uuid",
      creator: null as any,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const usersDb: User[] = [
    {
      id: "33333333-3333-3333-3333-333333333333",
      full_name: "Alice Participant",
      email: "alice@example.com",
      password_hash: "hash",
      phone: "0911000000",
      website: "",
      education: "",
      achievement: "",
      professional_experience: "",
      status: "active" as any,
      is_active: true,
      rank: 1,
      role: UserRole.User,
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      full_name: "Bob Participant",
      email: "bob@example.com",
      password_hash: "hash",
      phone: "0912000000",
      website: "",
      education: "",
      achievement: "",
      professional_experience: "",
      status: "active" as any,
      is_active: true,
      rank: 1,
      role: UserRole.User,
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "55555555-5555-5555-5555-555555555555",
      full_name: "Admin User",
      email: "admin@example.com",
      password_hash: "hash",
      phone: "0913000000",
      website: "",
      education: "",
      achievement: "",
      professional_experience: "",
      status: "active" as any,
      is_active: true,
      rank: 10,
      role: UserRole.Admin,
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const mockRegRepo = {
    create: (data: Partial<EventRegistration>) => {
      const reg = new EventRegistration();
      Object.assign(reg, data);
      if (!reg.id) reg.generateId();
      if (!reg.status) reg.status = EventRegistrationStatus.PENDING;
      if (!reg.createdAt) reg.createdAt = new Date();
      if (!reg.updatedAt) reg.updatedAt = new Date();
      return reg;
    },
    save: async (entity: EventRegistration) => {
      // Simulate unique constraint check on (eventId, userId)
      const duplicate = registrationsDb.find(
        (r) => r.id !== entity.id && r.eventId === entity.eventId && r.userId === entity.userId
      );
      if (duplicate) {
        const error: any = new Error("duplicate key value violates unique constraint \"UQ_event_registration_event_user\"");
        error.code = "23505";
        throw error;
      }

      const idx = registrationsDb.findIndex((r) => r.id === entity.id);
      if (idx >= 0) {
        registrationsDb[idx] = entity;
      } else {
        registrationsDb.push(entity);
      }
      return entity;
    },
    findOne: async (options: { where: any; relations?: string[] }) => {
      const found = registrationsDb.find((item) => {
        return Object.keys(options.where).every(
          (key) => (item as any)[key] === options.where[key]
        );
      });
      if (!found) return null;
      if (options.relations?.includes("event")) {
        found.event = eventsDb.find((e) => e.id === found.eventId)!;
      }
      if (options.relations?.includes("user")) {
        found.user = usersDb.find((u) => u.id === found.userId)!;
      }
      return found;
    },
    delete: async (id: string) => {
      const idx = registrationsDb.findIndex((r) => r.id === id);
      if (idx >= 0) registrationsDb.splice(idx, 1);
      return { affected: 1 };
    },
    createQueryBuilder: () => {
      let filtered = [...registrationsDb];
      const qb: any = {
        leftJoinAndSelect: (relation: string, alias: string) => {
          filtered = filtered.map((r) => {
            if (relation === "reg.event") r.event = eventsDb.find((e) => e.id === r.eventId)!;
            if (relation === "reg.user") r.user = usersDb.find((u) => u.id === r.userId)!;
            return r;
          });
          return qb;
        },
        andWhere: (condition: string, params: any) => {
          if (params.userId) {
            filtered = filtered.filter((r) => r.userId === params.userId);
          }
          if (params.filterUserId) {
            filtered = filtered.filter((r) => r.userId === params.filterUserId);
          }
          if (params.eventId) {
            filtered = filtered.filter((r) => r.eventId === params.eventId);
          }
          if (params.status) {
            filtered = filtered.filter((r) => r.status === params.status);
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

  const mockEventRepo = {
    findOne: async (options: { where: { id: string } }) => {
      return eventsDb.find((e) => e.id === options.where.id) || null;
    },
  };

  const mockUserRepo = {
    findOne: async (options: { where: { id: string } }) => {
      return usersDb.find((u) => u.id === options.where.id) || null;
    },
  };

  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === EventRegistration) return mockRegRepo;
    if (entity === Event) return mockEventRepo;
    if (entity === User) return mockUserRepo;
    return originalGetRepository.call(AppDataSource, entity);
  };

  try {
    const userAlice = { id: usersDb[0].id, role: UserRole.User };
    const userBob = { id: usersDb[1].id, role: UserRole.User };
    const adminUser = { id: usersDb[2].id, role: UserRole.Admin };
    const event1 = eventsDb[0].id;
    const event2 = eventsDb[1].id;

    // -------------------------------------------------------------
    // Test 1: User registers for an event -> defaults to PENDING
    // -------------------------------------------------------------
    console.log("Test 1: User registers for an event with default PENDING status");
    const reg1 = await eventRegistrationService.register(userAlice.id, event1, userAlice);
    assert.strictEqual(reg1.eventId, event1);
    assert.strictEqual(reg1.userId, userAlice.id);
    assert.strictEqual(reg1.status, EventRegistrationStatus.PENDING);
    assert(reg1.createdAt, "createdAt should be automatically populated");
    assert(reg1.id, "id should be automatically populated");
    console.log("  ✓ Passed: Registration created with default PENDING status and auto timestamps");

    // -------------------------------------------------------------
    // Test 2: Prevent duplicate registrations for same user and event
    // -------------------------------------------------------------
    console.log("Test 2: Prevent duplicate registrations for the same user and event");
    let caughtDuplicate = false;
    try {
      await eventRegistrationService.register(userAlice.id, event1, userAlice);
    } catch (e: any) {
      caughtDuplicate = true;
      assert.strictEqual(e.statusCode, 409);
      assert(e.message.includes("already registered"));
    }
    assert(caughtDuplicate, "Expected 409 error on duplicate registration attempt");
    console.log("  ✓ Passed: Duplicate registration properly blocked with 409 Conflict");

    // -------------------------------------------------------------
    // Test 3: Validate referenced event exists (404 on invalid event)
    // -------------------------------------------------------------
    console.log("Test 3: Reject registration if referenced event does not exist");
    let caughtNonExistentEvent = false;
    try {
      await eventRegistrationService.register(userAlice.id, "00000000-0000-0000-0000-000000000000", userAlice);
    } catch (e: any) {
      caughtNonExistentEvent = true;
      assert.strictEqual(e.statusCode, 404);
      assert(e.message.includes("Event not found"));
    }
    assert(caughtNonExistentEvent, "Expected 404 error when event does not exist");
    console.log("  ✓ Passed: 404 returned when event is not found");

    // -------------------------------------------------------------
    // Test 4: Validate referenced user exists (404 on invalid user)
    // -------------------------------------------------------------
    console.log("Test 4: Reject registration if referenced user does not exist");
    let caughtNonExistentUser = false;
    try {
      await eventRegistrationService.register("00000000-0000-0000-0000-000000000000", event1, adminUser);
    } catch (e: any) {
      caughtNonExistentUser = true;
      assert.strictEqual(e.statusCode, 404);
      assert(e.message.includes("User not found"));
    }
    assert(caughtNonExistentUser, "Expected 404 error when user does not exist");
    console.log("  ✓ Passed: 404 returned when user is not found");

    // -------------------------------------------------------------
    // Test 5: A user can register for multiple events
    // -------------------------------------------------------------
    console.log("Test 5: User can register for multiple different events");
    const reg2 = await eventRegistrationService.register(userAlice.id, event2, userAlice);
    assert.strictEqual(reg2.eventId, event2);
    assert.strictEqual(reg2.userId, userAlice.id);
    assert.strictEqual(reg2.status, EventRegistrationStatus.PENDING);
    console.log("  ✓ Passed: Alice successfully registered for a second event");

    // -------------------------------------------------------------
    // Test 6: An event can have multiple registrations
    // -------------------------------------------------------------
    console.log("Test 6: Multiple users can register for the same event");
    const reg3 = await eventRegistrationService.register(userBob.id, event1, userBob);
    assert.strictEqual(reg3.eventId, event1);
    assert.strictEqual(reg3.userId, userBob.id);
    console.log("  ✓ Passed: Bob successfully registered for Event 1 (which Alice also joined)");

    // -------------------------------------------------------------
    // Test 7: Non-admin users can view only their own registrations
    // -------------------------------------------------------------
    console.log("Test 7: Users can view their own registrations");
    const aliceRegistrations = await eventRegistrationService.list(userAlice);
    assert.strictEqual(aliceRegistrations.data.length, 2);
    assert(aliceRegistrations.data.every((r) => r.userId === userAlice.id));

    let forbiddenCaught = false;
    try {
      // Alice tries to request Bob's registrations
      await eventRegistrationService.list(userAlice, { userId: userBob.id });
    } catch (e: any) {
      forbiddenCaught = true;
      assert.strictEqual(e.statusCode, 403);
    }
    assert(forbiddenCaught, "Expected 403 when user attempts to query another user's registrations");
    console.log("  ✓ Passed: Non-admin users strictly isolated to their own registrations");

    // -------------------------------------------------------------
    // Test 8: Admin can view all registrations and filter by event
    // -------------------------------------------------------------
    console.log("Test 8: Admin can view all registrations and filter by event");
    const allRegistrations = await eventRegistrationService.list(adminUser);
    assert.strictEqual(allRegistrations.data.length, 3);

    const event1Registrations = await eventRegistrationService.listByEvent(event1, adminUser);
    assert.strictEqual(event1Registrations.data.length, 2);
    console.log("  ✓ Passed: Admin can view and filter registrations across all events and users");

    // -------------------------------------------------------------
    // Test 9: Non-admin cannot change registration status (403 Forbidden)
    // -------------------------------------------------------------
    console.log("Test 9: Non-admin cannot update registration status");
    let nonAdminStatusBlock = false;
    try {
      await eventRegistrationService.updateStatus(reg1.id, EventRegistrationStatus.ACCEPTED, userAlice);
    } catch (e: any) {
      nonAdminStatusBlock = true;
      assert.strictEqual(e.statusCode, 403);
      assert(e.message.includes("Only authorized admins"));
    }
    assert(nonAdminStatusBlock, "Expected 403 when non-admin attempts status update");
    console.log("  ✓ Passed: Non-admin status update blocked with 403 Forbidden");

    // -------------------------------------------------------------
    // Test 10: Admin can approve and reject registrations
    // -------------------------------------------------------------
    console.log("Test 10: Admin approves and rejects registrations");
    const approved = await eventRegistrationService.updateStatus(reg1.id, EventRegistrationStatus.ACCEPTED, adminUser);
    assert.strictEqual(approved.status, EventRegistrationStatus.ACCEPTED);
    assert(approved.updatedAt, "updatedAt should be updated upon status change");

    const rejected = await eventRegistrationService.updateStatus(reg3.id, EventRegistrationStatus.REJECTED, adminUser);
    assert.strictEqual(rejected.status, EventRegistrationStatus.REJECTED);
    console.log("  ✓ Passed: Admin successfully approved reg1 and rejected reg3");

    // -------------------------------------------------------------
    // Test 11: DTO validation for Create and UpdateStatus
    // -------------------------------------------------------------
    console.log("Test 11: DTO validation rejects invalid inputs");
    let invalidStatusCaught = false;
    try {
      await validateContentDto(UpdateEventRegistrationStatusDto, {
        status: "INVALID_STATUS",
      });
    } catch (e: any) {
      invalidStatusCaught = true;
      assert.strictEqual(e.statusCode, 400);
      assert(e.message.includes("status must be one of"));
    }
    assert(invalidStatusCaught, "Expected 400 validation error for invalid status");

    let invalidEventIdCaught = false;
    try {
      await validateContentDto(CreateEventRegistrationDto, {
        eventId: "not-a-uuid",
      });
    } catch (e: any) {
      invalidEventIdCaught = true;
      assert.strictEqual(e.statusCode, 400);
      assert(e.message.includes("eventId must be a valid UUID"));
    }
    assert(invalidEventIdCaught, "Expected 400 validation error for invalid eventId UUID");
    console.log("  ✓ Passed: DTO validations enforce valid UUIDs and status enum values");

    // -------------------------------------------------------------
    // Test 12: Route authorization middleware restricts non-admins
    // -------------------------------------------------------------
    console.log("Test 12: Route authorization middleware restricts non-admins");
    const adminAuthCheck = authorize(UserRole.Admin);

    let authMiddlewareBlocked = false;
    const mockReq: any = { user: userAlice };
    const mockRes: any = {
      status: (code: number) => {
        assert.strictEqual(code, 403);
        return { json: () => { authMiddlewareBlocked = true; } };
      },
    };
    adminAuthCheck(mockReq as AuthRequest, mockRes, () => {});
    assert(authMiddlewareBlocked, "Expected route middleware to reject non-admin with 403");

    let adminPassed = false;
    const adminReq: any = { user: adminUser };
    adminAuthCheck(adminReq as AuthRequest, mockRes, () => {
      adminPassed = true;
    });
    assert(adminPassed, "Admin user should pass route authorization");
    console.log("  ✓ Passed: Route authorization middleware verified");

    console.log("\nAll 12 Event Registration tests passed successfully! ✨\n");
  } finally {
    (AppDataSource as any).getRepository = originalGetRepository;
  }
}

// Execute tests if run directly
if (require.main === module) {
  runEventRegistrationTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
