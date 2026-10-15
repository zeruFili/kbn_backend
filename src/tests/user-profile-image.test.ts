import assert from "node:assert";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { userService } from "../services/user.service";
import { userController } from "../controllers/user.controller";
import { AuthRequest } from "../middlewares/auth.middleware";
import { pickSafeUserFields, pickAdminUserFields } from "../utils/response.utils";
import * as uploadUtils from "../utils/upload.utils";

async function runUserProfileImageTests() {
  console.log("Running user profile image tests...\n");

  const deletedFiles: string[] = [];
  (uploadUtils as any).deleteFile = (path: string) => {
    deletedFiles.push(path);
    return true;
  };

  let mockUsers: User[] = [
    {
      id: "user-1",
      full_name: "Abebe Bikila",
      email: "abebe@example.com",
      password_hash: "hash123",
      role: UserRole.User,
      status: UserStatus.ACTIVE,
      is_active: true,
      rank: 1,
      phone: "+251911111111",
      website: "https://abebe.et",
      education: "University",
      achievement: "Marathon Champion",
      professional_experience: "Athlete",
      profileImage: "/uploads/users/abebe-old.jpg",
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    } as User,
    {
      id: "user-2",
      full_name: "Almaz Ayana",
      email: "almaz@example.com",
      password_hash: "hash456",
      role: UserRole.User,
      status: UserStatus.ACTIVE,
      is_active: true,
      rank: 1,
      phone: "+251922222222",
      website: "https://almaz.et",
      education: "University",
      achievement: "Olympic Champion",
      professional_experience: "Athlete",
      profileImage: null,
      last_login_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    } as User,
  ];

  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).getRepository = (entity: any) => {
    if (entity === User) {
      return {
        findOne: async (options: any) => {
          if (options?.where?.id) {
            return mockUsers.find((u) => u.id === options.where.id) || null;
          }
          if (options?.where?.email) {
            return mockUsers.find((u) => u.email === options.where.email) || null;
          }
          return null;
        },
        create: (data: any) => {
          return { id: "new-user-id", ...data } as User;
        },
        save: async (user: User) => {
          const index = mockUsers.findIndex((u) => u.id === user.id);
          if (index >= 0) {
            mockUsers[index] = { ...mockUsers[index], ...user };
            return mockUsers[index];
          } else {
            mockUsers.push(user);
            return user;
          }
        },
      };
    }
    return originalGetRepository.call(AppDataSource, entity);
  };

  try {
    // -------------------------------------------------------------
    // 1. Serialization includes profileImage
    // -------------------------------------------------------------
    console.log("Test 1: Safe and Admin user outputs include profileImage");
    const safeOutput = pickSafeUserFields(mockUsers[0]);
    assert.strictEqual(safeOutput?.profileImage, "/uploads/users/abebe-old.jpg");

    const adminOutput = pickAdminUserFields(mockUsers[0]);
    assert.strictEqual(adminOutput?.profileImage, "/uploads/users/abebe-old.jpg");

    const safeNull = pickSafeUserFields(mockUsers[1]);
    assert.strictEqual(safeNull?.profileImage, null);
    console.log("  ✓ Passed: Response serializers include profileImage properly");

    // -------------------------------------------------------------
    // 2. User creation with profileImage
    // -------------------------------------------------------------
    console.log("Test 2: Creating a user with profileImage");
    const created = await userService.create({
      full_name: "Derartu Tulu",
      email: "derartu@example.com",
      password: "Password123!",
      role: UserRole.User,
      profileImage: "/uploads/users/derartu.jpg",
    });
    assert.strictEqual(created.fullName, "Derartu Tulu");
    assert.strictEqual(created.profileImage, "/uploads/users/derartu.jpg");
    console.log("  ✓ Passed: New user created with profileImage");

    const createdWithNull = await userService.create({
      full_name: "Kenenisa Bekele",
      email: "kenenisa@example.com",
      password: "Password123!",
      role: UserRole.User,
      profileImage: null,
    });
    assert.strictEqual(createdWithNull.profileImage, null);
    console.log("  ✓ Passed: New user created with null profileImage");

    // -------------------------------------------------------------
    // 3. User updates their own profile image (replaces previous image)
    // -------------------------------------------------------------
    console.log("Test 3: User replacing their existing profile image triggers file deletion of old photo");
    deletedFiles.length = 0;
    const updated = await userService.update(
      "user-1",
      { profileImage: "/uploads/users/abebe-new.jpg" },
      { id: "user-1", role: UserRole.User }
    );
    assert.strictEqual(updated.profileImage, "/uploads/users/abebe-new.jpg");
    assert.ok(deletedFiles.includes("/uploads/users/abebe-old.jpg"), "Old image must be deleted from storage");
    console.log("  ✓ Passed: Previous image deleted and replaced with new image");

    // -------------------------------------------------------------
    // 4. User removes profile image
    // -------------------------------------------------------------
    console.log("Test 4: User removing their profile image sets field to null and deletes old photo");
    deletedFiles.length = 0;
    const removed = await userService.update(
      "user-1",
      { profileImage: null },
      { id: "user-1", role: UserRole.User }
    );
    assert.strictEqual(removed.profileImage, null);
    assert.ok(deletedFiles.includes("/uploads/users/abebe-new.jpg"), "Previous image must be deleted from storage");
    console.log("  ✓ Passed: Image removed and deleted from storage");

    // -------------------------------------------------------------
    // 5. Preserving existing profile image when not uploaded in update
    // -------------------------------------------------------------
    console.log("Test 5: Preserving existing profile image when profileImage is omitted");
    // Set an image first
    await userService.update(
      "user-2",
      { profileImage: "/uploads/users/almaz-keep.jpg" },
      { id: "user-2", role: UserRole.User }
    );
    deletedFiles.length = 0;
    const preserved = await userService.update(
      "user-2",
      { full_name: "Almaz Ayana OLY" },
      { id: "user-2", role: UserRole.User }
    );
    assert.strictEqual(preserved.profileImage, "/uploads/users/almaz-keep.jpg");
    assert.strictEqual(deletedFiles.length, 0, "No file should be deleted when image is preserved");
    console.log("  ✓ Passed: Current profile image preserved when no new image is uploaded");

    // -------------------------------------------------------------
    // 6. Security: Non-admin cannot update another user's profile
    // -------------------------------------------------------------
    console.log("Test 6: Non-admin user attempting to update another user receives 403 Forbidden");
    let caught403 = false;
    try {
      await userService.update(
        "user-2",
        { profileImage: "/uploads/users/hacked.jpg" },
        { id: "user-1", role: UserRole.User }
      );
    } catch (err: any) {
      if (err.statusCode === 403) caught403 = true;
    }
    assert.ok(caught403, "Must throw 403 when updating another user's account");
    console.log("  ✓ Passed: Unauthorized profile update successfully blocked");

    // -------------------------------------------------------------
    // 7. Security: Admin can update any user's profile
    // -------------------------------------------------------------
    console.log("Test 7: Admin can update any user's profile image");
    const adminUpdated = await userService.update(
      "user-2",
      { profileImage: "/uploads/users/almaz-admin-updated.jpg" },
      { id: "admin-id", role: UserRole.Admin }
    );
    assert.strictEqual(adminUpdated.profileImage, "/uploads/users/almaz-admin-updated.jpg");
    console.log("  ✓ Passed: Admin authorized to update user profile image");

    // -------------------------------------------------------------
    // 8. Security: Non-admin cannot update status
    // -------------------------------------------------------------
    console.log("Test 8: Non-admin user cannot update account status");
    let statusForbidden = false;
    try {
      await userService.update(
        "user-1",
        { status: UserStatus.SUSPENDED },
        { id: "user-1", role: UserRole.User }
      );
    } catch (err: any) {
      if (err.statusCode === 403) statusForbidden = true;
    }
    assert.ok(statusForbidden, "Must throw 403 when non-admin attempts to update status");
    console.log("  ✓ Passed: Status change by non-admin successfully blocked");

    console.log("\nALL USER PROFILE IMAGE TESTS PASSED! ✓\n");
  } finally {
    (AppDataSource as any).getRepository = originalGetRepository;
  }
}

runUserProfileImageTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
