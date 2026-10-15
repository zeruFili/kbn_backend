import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { PasswordResetToken } from "../entities/PasswordResetToken";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickSafeUserFields, SafeUserOutput } from "../utils/response.utils";
import { getUserDetails, UserDetails } from "../utils/user-details.util";
import { validatePasswordStrength } from "../utils/password.utils";
import { emailService } from "./email.service";
import { otpService } from "./otp.service";
import { OtpPurpose } from "../enums/otp-purpose.enum";

import { generateAccessToken } from "../utils/jwt.utils";

const userRepo = () => AppDataSource.getRepository(User);
const resetTokenRepo = () => AppDataSource.getRepository(PasswordResetToken);

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
    const user = await userRepo()
      .createQueryBuilder("user")
      .addSelect("user.password_hash")
      .where("user.email = :email", { email })
      .getOne();
    if (!user) {
      throw new AppError(401, "Invalid email or password");
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      throw new AppError(401, "Invalid email or password");
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

  async forgotPassword(identifier: string): Promise<void> {
    const isEmail = identifier.includes("@");
    let user: User | null = null;

    if (isEmail) {
      user = await userRepo().findOne({ where: { email: identifier.trim().toLowerCase() } });
    } else {
      const normalized = otpService.normalizeIdentifier(identifier);
      user = await userRepo()
        .createQueryBuilder("user")
        .where("user.phone = :rawPhone OR user.phone = :normalized", {
          rawPhone: identifier.trim(),
          normalized,
        })
        .getOne();
    }

    if (!user) {
      return;
    }

    // 1. Send OTP via SMS module if user has a phone number
    const targetPhone = user.phone || (!isEmail ? identifier : null);
    if (targetPhone) {
      await otpService.generateAndSendOtp(targetPhone, OtpPurpose.RESET_PASSWORD, user.id);
    }

    // 2. Also generate legacy link token if user has email (for backward compatibility)
    if (user.email) {
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

      try {
        await emailService.sendPasswordResetEmail(user.email, user.full_name, rawToken);
      } catch (e: any) {
        // Non-fatal if SMS was sent
      }
    }
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
      // 1. Verify OTP with RESET_PASSWORD purpose inside transaction
      const verifyResult = await otpService.verifyOtp(
        identifier,
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
        const isEmail = identifier.includes("@");
        if (isEmail) {
          user = await transactionalManager
            .getRepository(User)
            .findOne({ where: { email: identifier.trim().toLowerCase() } });
        } else {
          const normalized = otpService.normalizeIdentifier(identifier);
          user = await transactionalManager
            .getRepository(User)
            .createQueryBuilder("user")
            .where("user.phone = :rawPhone OR user.phone = :normalized", {
              rawPhone: identifier.trim(),
              normalized,
            })
            .getOne();
        }
      }

      if (!user) {
        throw new AppError(400, "User associated with this verification code could not be found.");
      }

      // 3. Update password hash
      user.password_hash = await bcrypt.hash(password, BCRYPT_COST);
      user.updated_at = new Date();
      await transactionalManager.getRepository(User).save(user);

      // 4. Ensure OTP record links to user
      await otpService.linkUser(verifyResult.record.id, user.id, transactionalManager);
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

    matchedToken.used = true;
    await resetTokenRepo().save(matchedToken);
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
  }): Promise<{
    accessToken: string;
    user: SafeUserOutput;
  }> {
    const requireOtp = process.env.REQUIRE_OTP_VERIFICATION !== "false";
    if (requireOtp && !data.otp) {
      throw new AppError(400, "OTP verification code is required for registration.");
    }
    if (requireOtp && !data.phone) {
      throw new AppError(400, "Phone number is required for registration and OTP verification.");
    }

    const existing = await userRepo().findOne({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, "Email already exists");
    }

    const password_hash = await bcrypt.hash(data.password, BCRYPT_COST);
    const role = data.role ?? UserRole.User;

    return await AppDataSource.transaction(async (transactionalManager) => {
      let otpRecordId: string | null = null;
      if (data.otp && data.phone) {
        const verifyResult = await otpService.verifyOtp(
          data.phone,
          data.otp,
          OtpPurpose.REGISTER,
          transactionalManager
        );
        otpRecordId = verifyResult.record.id;
      }

      const user = transactionalManager.getRepository(User).create({
        full_name: data.full_name,
        email: data.email,
        password_hash,
        role,
        phone: (data.phone || undefined) as any,
        website: data.website || undefined,
        profileImage: data.profileImage || undefined,
        status: UserStatus.PENDING,
        is_active: false,
      });

      const saved = await transactionalManager.getRepository(User).save(user);

      if (otpRecordId) {
        await otpService.linkUser(otpRecordId, saved.id, transactionalManager);
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

  async getMe(userId: string): Promise<UserDetails> {
    const user = await getUserDetails(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }
}


export const authService = new AuthService();
