import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { EntityManager, IsNull } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { LocalCredential } from "../entities/LocalCredential";
import { AuthIdentity } from "../entities/AuthIdentity";
import { PasswordResetToken } from "../entities/PasswordResetToken";
import { OtpVerification } from "../entities/otp-verification";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields, SafeUserOutput } from "../utils/response.utils";
import { getUserDetails, UserDetails } from "../utils/user-details.util";
import { validatePasswordStrength } from "../utils/password.utils";
import { emailService } from "./email.service";
import { otpService } from "./otp.service";
import { googleAuthService } from "./google-auth.service";
import { OtpPurpose } from "../enums/otp-purpose.enum";

import { generateAccessToken } from "../utils/jwt.utils";

const userRepo = () => AppDataSource.getRepository(User);
const localCredRepo = () => AppDataSource.getRepository(LocalCredential);
const authIdentityRepo = () => AppDataSource.getRepository(AuthIdentity);
const resetTokenRepo = () => AppDataSource.getRepository(PasswordResetToken);
const otpRepo = () => AppDataSource.getRepository(OtpVerification);

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 9) {
    const end = digits.slice(-2);
    const start = digits.slice(0, 4);
    return `+${start}******${end}`;
  }
  return phone;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

const parsedBcryptCost = Number(process.env.BCRYPT_COST);
const BCRYPT_COST = Number.isFinite(parsedBcryptCost) && parsedBcryptCost > 0 ? parsedBcryptCost : 12;

function sanitizeUser(user: User): SafeUserOutput {
  return pickSafeUserFields(user)!;
}

function hashToken(rawToken: string): string {
  return bcrypt.hashSync(rawToken, 10);
}

export class AuthService {
  async login(email: string, password: string): Promise<{
    accessToken: string;
    user: SafeUserOutput;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepo()
      .createQueryBuilder("user")
      .addSelect("user.password_hash")
      .where("user.email = :email", { email: normalizedEmail })
      .getOne();
    if (!user) {
      throw new AppError(401, "Invalid email or password");
    }

    // 1. Look for password in LocalCredential model first
    let passwordHash: string | null = null;
    try {
      const localCred = await localCredRepo()
        .createQueryBuilder("lc")
        .addSelect("lc.passwordHash")
        .where("lc.userId = :userId", { userId: user.id })
        .getOne();

      if (localCred && localCred.passwordHash) {
        passwordHash = localCred.passwordHash;
      }
    } catch {
      // Non-fatal fallback to legacy hash
    }

    // 2. Fall back to legacy user.password_hash if not yet migrated
    if (!passwordHash && user.password_hash) {
      passwordHash = user.password_hash;
    }

    if (!passwordHash) {
      // User registered via external provider (Google) without a local password
      throw new AppError(
        401,
        "This account does not have a local password. Please sign in with Google or reset your password."
      );
    }

    const passwordValid = await bcrypt.compare(password, passwordHash);
    if (!passwordValid) {
      throw new AppError(401, "Invalid email or password");
    }

    // 3. Migrate legacy password hash to LocalCredential if missing
    try {
      const existingCred = await localCredRepo().findOne({ where: { userId: user.id } });
      if (!existingCred) {
        const newCred = localCredRepo().create({
          userId: user.id,
          passwordHash,
        });
        await localCredRepo().save(newCred);
      }
    } catch {
      // Migration failure is non-fatal for login
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new AppError(403, "Account is suspended. Please contact your administrator.");
    }

    user.last_login_at = new Date();
    user.updated_at = new Date();
    await userRepo().save(user);

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });

    return {
      accessToken,
      user: sanitizeUser(user),
    };
  }

  async resolveResetPasswordIdentifier(
    rawIdentifier: string,
    manager?: EntityManager
  ): Promise<string> {
    const trimmed = rawIdentifier.trim();
    const isEmail = trimmed.includes("@");
    const uRepo = manager ? manager.getRepository(User) : userRepo();
    const oRepo = manager ? manager.getRepository(OtpVerification) : otpRepo();

    if (isEmail) {
      const user = await uRepo.findOne({ where: { email: trimmed.toLowerCase() } });
      if (user?.phone) {
        const normalizedPhone = otpService.normalizeIdentifier(user.phone);
        const altPhone = normalizedPhone.startsWith("+")
          ? normalizedPhone.slice(1)
          : `+${normalizedPhone}`;
        const phoneOtp = await oRepo.findOne({
          where: [
            { identifier: normalizedPhone, purpose: OtpPurpose.RESET_PASSWORD, usedAt: IsNull() },
            { identifier: altPhone, purpose: OtpPurpose.RESET_PASSWORD, usedAt: IsNull() },
          ],
          order: { createdAt: "DESC" },
        });
        if (phoneOtp) {
          return user.phone;
        }
      }
    } else {
      const normalized = otpService.normalizeIdentifier(trimmed);
      const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`;
      const withoutPlus = normalized.replace(/^\+/, "");
      const user = await uRepo
        .createQueryBuilder("user")
        .where(
          "user.phone = :rawPhone OR user.phone = :normalized OR user.phone = :withPlus OR user.phone = :withoutPlus",
          {
            rawPhone: trimmed,
            normalized,
            withPlus,
            withoutPlus,
          }
        )
        .getOne();

      if (user?.email) {
        const altNormalized = normalized.startsWith("+") ? normalized.slice(1) : `+${normalized}`;
        const phoneOtp = await oRepo.findOne({
          where: [
            { identifier: normalized, purpose: OtpPurpose.RESET_PASSWORD, usedAt: IsNull() },
            { identifier: altNormalized, purpose: OtpPurpose.RESET_PASSWORD, usedAt: IsNull() },
          ],
          order: { createdAt: "DESC" },
        });
        if (!phoneOtp) {
          return user.email;
        }
      }
    }

    return trimmed;
  }

  async forgotPassword(identifier: string): Promise<{
    message: string;
    channel: "sms" | "email";
    maskedDestination?: string;
  }> {
    const isEmail = identifier.includes("@");
    let user: User | null = null;

    if (isEmail) {
      user = await userRepo().findOne({ where: { email: identifier.trim().toLowerCase() } });
    } else {
      const normalized = otpService.normalizeIdentifier(identifier);
      const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`;
      const withoutPlus = normalized.replace(/^\+/, "");
      user = await userRepo()
        .createQueryBuilder("user")
        .where(
          "user.phone = :rawPhone OR user.phone = :normalized OR user.phone = :withPlus OR user.phone = :withoutPlus",
          {
            rawPhone: identifier.trim(),
            normalized,
            withPlus,
            withoutPlus,
          }
        )
        .getOne();
    }

    if (!user) {
      return {
        message: "If an account exists with this credential, a verification code has been sent.",
        channel: isEmail ? "email" : "sms",
      };
    }

    // 1. Also generate legacy link token if user has email (for backward compatibility)
    if (user.email) {
      try {
        await resetTokenRepo().delete({ userId: user.id, used: false });
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(rawToken);

        const resetToken = resetTokenRepo().create({
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          used: false,
        });
        await resetTokenRepo().save(resetToken);
        await emailService.sendPasswordResetEmail(user.email, user.full_name, rawToken);
      } catch (e: any) {
        // Non-fatal
      }
    }

    // 2. Prioritize user's registered phone number for SMS OTP delivery
    const targetPhone = user.phone ? user.phone.trim() : (!isEmail ? identifier.trim() : null);

    if (targetPhone) {
      await otpService.generateAndSendOtp(targetPhone, OtpPurpose.RESET_PASSWORD, user.id);
      const masked = maskPhone(targetPhone);
      return {
        message: `Verification code sent via SMS to your registered phone number (${masked}).`,
        channel: "sms",
        maskedDestination: masked,
      };
    }

    // Fallback: If user only has an email and no registered phone number
    if (user.email) {
      await otpService.generateAndSendOtp(user.email, OtpPurpose.RESET_PASSWORD, user.id);
      const masked = maskEmail(user.email);
      return {
        message: `Verification code sent to your registered email (${masked}).`,
        channel: "email",
        maskedDestination: masked,
      };
    }

    return {
      message: "If an account exists with this credential, a verification code has been sent.",
      channel: "sms",
    };
  }

  async resetPasswordWithOtp(
    identifier: string,
    otp: string,
    password: string,
    confirmPassword: string
  ): Promise<void> {
    if (password !== confirmPassword) {
      throw new AppError(400, "Passwords do not match");
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new AppError(400, passwordValidation.errors.join("; "));
    }

    await AppDataSource.transaction(async (transactionalManager) => {
      // Resolve identifier if user entered email but OTP was sent to their phone via SMS
      const resolvedIdentifier = await this.resolveResetPasswordIdentifier(
        identifier,
        transactionalManager
      );

      // 1. Verify OTP with RESET_PASSWORD purpose inside transaction
      const verifyResult = await otpService.verifyOtp(
        resolvedIdentifier,
        otp,
        OtpPurpose.RESET_PASSWORD,
        transactionalManager
      );

      // 2. Locate user by userId on OTP or by identifier
      let user: User | null = null;
      if (verifyResult.record.userId) {
        user = await transactionalManager
          .getRepository(User)
          .findOne({ where: { id: verifyResult.record.userId } });
      }

      if (!user) {
        const isEmail = resolvedIdentifier.includes("@");
        if (isEmail) {
          user = await transactionalManager
            .getRepository(User)
            .findOne({ where: { email: resolvedIdentifier.trim().toLowerCase() } });
        } else {
          const normalized = otpService.normalizeIdentifier(resolvedIdentifier);
          const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`;
          const withoutPlus = normalized.replace(/^\+/, "");
          user = await transactionalManager
            .getRepository(User)
            .createQueryBuilder("user")
            .where(
              "user.phone = :rawPhone OR user.phone = :normalized OR user.phone = :withPlus OR user.phone = :withoutPlus",
              {
                rawPhone: resolvedIdentifier.trim(),
                normalized,
                withPlus,
                withoutPlus,
              }
            )
            .getOne();
        }
      }

      if (!user) {
        throw new AppError(400, "User associated with this verification code could not be found.");
      }

      // 3. Update password hash in User and LocalCredential model
      user.password_hash = await bcrypt.hash(password, BCRYPT_COST);
      user.updated_at = new Date();
      await transactionalManager.getRepository(User).save(user);

      try {
        const tLocalRepo = transactionalManager.getRepository(LocalCredential);
        let cred = await tLocalRepo.findOne({ where: { userId: user.id } });
        if (cred) {
          cred.passwordHash = user.password_hash;
          cred.updatedAt = new Date();
          await tLocalRepo.save(cred);
        } else {
          cred = tLocalRepo.create({
            userId: user.id,
            passwordHash: user.password_hash,
          });
          await tLocalRepo.save(cred);
        }
      } catch (credErr: any) {
        console.warn("[AuthService] LocalCredential update notice:", credErr?.message);
      }

      // 4. Ensure OTP record links to user
      await otpService.linkUser(verifyResult.record.id, user.id, transactionalManager);

      // 5. Send password reset success email
      if (user.email) {
        try {
          await emailService.sendResetSuccessEmail(user.email);
        } catch (emailErr: any) {
          console.warn("[AuthService] Reset success email notice:", emailErr?.message);
        }
      }
    });
  }

  async resetPassword(rawToken: string, password: string, confirmPassword: string): Promise<void> {
    if (password !== confirmPassword) {
      throw new AppError(400, "Passwords do not match");
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new AppError(400, passwordValidation.errors.join("; "));
    }

    const tokens = await resetTokenRepo().find({
      where: { used: false },
      order: { createdAt: "DESC" },
    });

    let matchedToken: PasswordResetToken | null = null;
    for (const t of tokens) {
      const isMatch = await bcrypt.compare(rawToken, t.tokenHash);
      if (isMatch) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      throw new AppError(400, "Password reset link is invalid or has already been used.");
    }

    if (new Date() > new Date(matchedToken.expiresAt)) {
      matchedToken.used = true;
      await resetTokenRepo().save(matchedToken);
      throw new AppError(400, "Password reset link has expired. Please request a new one.");
    }

    const user = await userRepo().findOne({ where: { id: matchedToken.userId } });
    if (!user) {
      throw new AppError(400, "Password reset link is invalid.");
    }

    user.password_hash = await bcrypt.hash(password, BCRYPT_COST);
    user.updated_at = new Date();
    await userRepo().save(user);

    try {
      let cred = await localCredRepo().findOne({ where: { userId: user.id } });
      if (cred) {
        cred.passwordHash = user.password_hash;
        cred.updatedAt = new Date();
        await localCredRepo().save(cred);
      } else {
        cred = localCredRepo().create({
          userId: user.id,
          passwordHash: user.password_hash,
        });
        await localCredRepo().save(cred);
      }
    } catch (credErr: any) {
      console.warn("[AuthService] LocalCredential update notice:", credErr?.message);
    }

    matchedToken.used = true;
    await resetTokenRepo().save(matchedToken);

    if (user.email) {
      try {
        await emailService.sendResetSuccessEmail(user.email);
      } catch (emailErr: any) {
        console.warn("[AuthService] Reset success email notice:", emailErr?.message);
      }
    }
  }

  async register(data: {
    full_name: string;
    email: string;
    password: string;
    role?: UserRole;
    phone?: string;
    website?: string;
    profileImage?: string | null;
    otp?: string;
    otpMethod?: "sms" | "email";
  }): Promise<{
    accessToken: string;
    user: SafeUserOutput;
  }> {
    const requireOtp = process.env.REQUIRE_OTP_VERIFICATION !== "false";
    const otpMethod = (data.otpMethod || (data.phone ? "sms" : "email")).toLowerCase() as "sms" | "email";
    const targetIdentifier =
      otpMethod === "email"
        ? data.email.trim().toLowerCase()
        : data.phone
        ? data.phone.trim()
        : data.email.trim().toLowerCase();

    if (requireOtp && !data.otp) {
      throw new AppError(400, "OTP verification code is required for registration.");
    }
    if (requireOtp && otpMethod === "sms" && !data.phone) {
      throw new AppError(400, "Phone number is required for registration and SMS OTP verification.");
    }

    const existing = await userRepo().findOne({ where: { email: data.email.trim().toLowerCase() } });
    if (existing) {
      throw new AppError(409, "Email already exists");
    }

    const password_hash = await bcrypt.hash(data.password, BCRYPT_COST);
    const role = data.role && data.role !== UserRole.Admin ? data.role : UserRole.User;

    return await AppDataSource.transaction(async (transactionalManager) => {
      let otpRecordId: string | null = null;
      if (data.otp && targetIdentifier) {
        const verifyResult = await otpService.verifyOtp(
          targetIdentifier,
          data.otp,
          OtpPurpose.REGISTER,
          transactionalManager
        );
        otpRecordId = verifyResult.record.id;
      }

      const isSmsOtp = otpMethod === "sms" && !!otpRecordId;
      const isEmailOtp = otpMethod === "email" && !!otpRecordId;

      const user = transactionalManager.getRepository(User).create({
        full_name: data.full_name,
        email: data.email.trim().toLowerCase(),
        password_hash,
        role,
        phone: (data.phone ? data.phone.trim() : undefined) as any,
        website: data.website || undefined,
        profileImage: data.profileImage || undefined,
        status: UserStatus.PENDING,
        is_active: false,
        phoneVerifiedAt: isSmsOtp ? new Date() : null,
        emailVerifiedAt: isEmailOtp ? new Date() : null,
      });

      const saved = await transactionalManager.getRepository(User).save(user);

      // Persist password hash in LocalCredential model
      const localCred = transactionalManager.getRepository(LocalCredential).create({
        userId: saved.id,
        passwordHash: password_hash,
      });
      await transactionalManager.getRepository(LocalCredential).save(localCred);

      if (otpRecordId) {
        await otpService.linkUser(otpRecordId, saved.id, transactionalManager);
      }

      // Send welcome email
      try {
        await emailService.sendWelcomeEmail(saved.email, saved.full_name);
      } catch (welcomeErr: any) {
        console.warn("[AuthService] Welcome email notice:", welcomeErr?.message);
      }

      const accessToken = generateAccessToken({
        id: saved.id,
        email: saved.email,
        role: saved.role,
        status: saved.status,
      });

      return {
        accessToken,
        user: sanitizeUser(saved),
      };
    });
  }

  /**
   * Google Sign-In & Registration:
   * 1. Verifies token signature, issuer, audience, expiration, and required claims.
   * 2. Identifies existing Google users via verified provider subject ID (sub claim).
   * 3. Authenticates active users, rejects suspended accounts, prevents pending accounts from unrestricted access.
   * 4. For new Google users with no conflicting email, creates User (status: active) and AuthIdentity.
   * 5. If Google email conflicts with an existing account, strictly blocks auto-merge and requires secure account linking.
   */
  async googleLogin(idToken: string): Promise<{
    accessToken: string;
    user: SafeUserOutput;
  }> {
    const verified = await googleAuthService.verifyToken(idToken);

    // 1. Identify existing Google users using verified provider subject ID, not email alone
    const existingIdentity = await authIdentityRepo().findOne({
      where: { provider: "google", providerUserId: verified.sub },
      relations: ["user"],
    });

    if (existingIdentity) {
      const user =
        existingIdentity.user ||
        (await userRepo().findOne({ where: { id: existingIdentity.userId } }));

      if (!user) {
        throw new AppError(404, "User account associated with this Google identity was not found.");
      }

      if (user.status === UserStatus.SUSPENDED) {
        throw new AppError(403, "Account is suspended. Please contact your administrator.");
      }

      user.last_login_at = new Date();
      user.updated_at = new Date();
      await userRepo().save(user);

      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      });

      return {
        accessToken,
        user: sanitizeUser(user),
      };
    }

    // 2. Identity does not exist: Check for email conflict
    const existingUserByEmail = await userRepo().findOne({
      where: { email: verified.email },
    });

    if (existingUserByEmail) {
      // Do not automatically merge or link accounts.
      throw new AppError(
        409,
        "An account with this email already exists. To link your Google account, please verify your existing account password."
      );
    }

    // 3. New Google identity: Safely create User and AuthIdentity in a transaction
    return await AppDataSource.transaction(async (transactionalManager) => {
      const tUserRepo = transactionalManager.getRepository(User);
      const tIdentityRepo = transactionalManager.getRepository(AuthIdentity);

      // Concurrency check within transaction
      const raceIdentity = await tIdentityRepo.findOne({
        where: { provider: "google", providerUserId: verified.sub },
      });
      if (raceIdentity) {
        const raceUser = await tUserRepo.findOne({ where: { id: raceIdentity.userId } });
        if (!raceUser) throw new AppError(404, "User account not found");
        if (raceUser.status === UserStatus.SUSPENDED) {
          throw new AppError(403, "Account is suspended. Please contact your administrator.");
        }
        raceUser.last_login_at = new Date();
        await tUserRepo.save(raceUser);
        const accessToken = generateAccessToken({
          id: raceUser.id,
          email: raceUser.email,
          role: raceUser.role,
          status: raceUser.status,
        });
        return { accessToken, user: sanitizeUser(raceUser) };
      }

      const raceEmailUser = await tUserRepo.findOne({ where: { email: verified.email } });
      if (raceEmailUser) {
        throw new AppError(
          409,
          "An account with this email already exists. To link your Google account, please verify your existing account password."
        );
      }

      const newUser = tUserRepo.create({
        full_name: verified.name,
        email: verified.email,
        status: UserStatus.PENDING,
        is_active: false,
        role: UserRole.User,
        profileImage: verified.picture,
        phone: null,
        password_hash: null,
        phoneVerifiedAt: null,
        emailVerifiedAt: new Date(),
        last_login_at: new Date(),
      });

      const savedUser = await tUserRepo.save(newUser);

      const newIdentity = tIdentityRepo.create({
        userId: savedUser.id,
        provider: "google",
        providerUserId: verified.sub,
      });

      await tIdentityRepo.save(newIdentity);

      try {
        await emailService.sendWelcomeEmail(savedUser.email, savedUser.full_name);
      } catch (e: any) {
        console.warn("[AuthService] Welcome email notice for Google user:", e?.message);
      }

      const accessToken = generateAccessToken({
        id: savedUser.id,
        email: savedUser.email,
        role: savedUser.role,
        status: savedUser.status,
      });

      return {
        accessToken,
        user: sanitizeUser(savedUser),
      };
    });
  }

  /**
   * Secure Google Account Linking:
   * When a Google email conflicts with an existing email/phone password account,
   * the user verifies their existing account password to securely establish the link.
   */
  async linkGoogleAccount(
    idToken: string,
    password: string
  ): Promise<{
    accessToken: string;
    user: SafeUserOutput;
    message: string;
  }> {
    const verified = await googleAuthService.verifyToken(idToken);

    // Locate existing account by verified email
    const user = await userRepo()
      .createQueryBuilder("user")
      .addSelect("user.password_hash")
      .where("user.email = :email", { email: verified.email })
      .getOne();

    if (!user) {
      throw new AppError(404, "No account found with this email to link.");
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new AppError(403, "Account is suspended. Please contact your administrator.");
    }

    // Verify existing password against LocalCredential or legacy user.password_hash
    let passwordHash: string | null = null;
    const localCred = await localCredRepo()
      .createQueryBuilder("lc")
      .addSelect("lc.passwordHash")
      .where("lc.userId = :userId", { userId: user.id })
      .getOne();

    if (localCred && localCred.passwordHash) {
      passwordHash = localCred.passwordHash;
    } else if (user.password_hash) {
      passwordHash = user.password_hash;
    }

    if (!passwordHash) {
      throw new AppError(400, "Account has no password configured. Please contact support.");
    }

    const passwordValid = await bcrypt.compare(password, passwordHash);
    if (!passwordValid) {
      throw new AppError(401, "Invalid password. Could not link account.");
    }

    // Check if this Google identity is already associated with an account
    const existingIdentity = await authIdentityRepo().findOne({
      where: { provider: "google", providerUserId: verified.sub },
    });

    if (existingIdentity) {
      if (existingIdentity.userId === user.id) {
        // Already linked to this user
        user.last_login_at = new Date();
        await userRepo().save(user);
        const accessToken = generateAccessToken({
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
        });
        return {
          accessToken,
          user: sanitizeUser(user),
          message: "Account already linked.",
        };
      }
      throw new AppError(409, "This Google identity is already linked to another account.");
    }

    // Link identity in transaction
    await AppDataSource.transaction(async (transactionalManager) => {
      const tIdentityRepo = transactionalManager.getRepository(AuthIdentity);
      const tLocalRepo = transactionalManager.getRepository(LocalCredential);
      const tUserRepo = transactionalManager.getRepository(User);

      const identity = tIdentityRepo.create({
        userId: user.id,
        provider: "google",
        providerUserId: verified.sub,
      });
      await tIdentityRepo.save(identity);

      if (!localCred && user.password_hash) {
        const newCred = tLocalRepo.create({
          userId: user.id,
          passwordHash: user.password_hash,
        });
        await tLocalRepo.save(newCred);
      }

      if (!user.emailVerifiedAt) {
        user.emailVerifiedAt = new Date();
      }
      user.last_login_at = new Date();
      user.updated_at = new Date();
      await tUserRepo.save(user);
    });

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });

    return {
      accessToken,
      user: sanitizeUser(user),
      message: "Google account successfully linked.",
    };
  }

  async getMe(userId: string): Promise<UserDetails> {
    const user = await getUserDetails(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }
}


export const authService = new AuthService();
