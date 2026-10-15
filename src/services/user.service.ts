import { FindOptionsWhere, ILike } from "typeorm";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { Payment } from "../entities/payment";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { PaymentStatus } from "../enums/payment-status.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickAdminUserFields, AdminUserOutput } from "../utils/response.utils";
import { getUserDetails, UserDetails } from "../utils/user-details.util";
import { deleteFile } from "../utils/upload.utils";
import { paymentService } from "./payment.service";
import { otpService } from "./otp.service";
import { OtpPurpose } from "../enums/otp-purpose.enum";

interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface CreateUserInput {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  status?: UserStatus;
  is_active?: boolean;
  profileImage?: string | null;
  otp?: string;
}

interface UpdateUserInput {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: UserStatus;
  profileImage?: string | null;
}

export interface CurrentUser {
  id?: string;
  role?: UserRole;
}

const userRepo = () => AppDataSource.getRepository(User);
const parsedBcryptCost = Number(process.env.BCRYPT_COST);
const BCRYPT_COST = Number.isFinite(parsedBcryptCost) && parsedBcryptCost > 0 ? parsedBcryptCost : 12;

function sanitizeUser(user: User): UserDetails {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    profileImage: user.profileImage ?? null,
  };
}

export class UserService {
  async findAll(
    page: number = 1,
    limit: number = 20,
    role?: UserRole,
    is_active?: boolean,
    search?: string,
    status?: UserStatus,
    currentUser?: CurrentUser
  ): Promise<PaginatedResult<AdminUserOutput>> {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const where: FindOptionsWhere<User> = {};

    const isAdmin = currentUser?.role === UserRole.Admin;

    if (!isAdmin) {
      // Non-admin users can ONLY retrieve active users
      // Even when attaching a status or is_active param, non-admin users only get active users (is_active: true, status: ACTIVE)
      where.status = UserStatus.ACTIVE;
      where.is_active = true;
      if (role) {
        where.role = role;
      }
    } else {
      // Admin users can retrieve users regardless of their status
      if (role) {
        where.role = role;
      }
      if (is_active !== undefined) {
        where.is_active = is_active;
      }
      if (status) {
        where.status = status;
      }
    }

    const whereConditions: FindOptionsWhere<User>[] = [];

    if (search) {
      whereConditions.push(
        { ...where, email: ILike(`%${search}%`) },
        { ...where, full_name: ILike(`%${search}%`) }
      );
    } else {
      whereConditions.push(where);
    }

    const [users, total] = await userRepo().findAndCount({
      where: whereConditions,
      order: { created_at: "DESC" },
      skip: (p - 1) * l,
      take: l,
    });

    return {
      data: users.map((u) => pickAdminUserFields(u)!),
      meta: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    };
  }

  async findById(id: string): Promise<UserDetails> {
    const user = await getUserDetails(id);
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return user;
  }

  async create(dto: CreateUserInput, isAdmin = false): Promise<UserDetails> {
    const existingEmail = await userRepo().findOne({ where: { email: dto.email } });
    if (existingEmail) {
      throw new AppError(409, "Email already exists");
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const status = dto.status ?? UserStatus.PENDING;
    const is_active = dto.is_active !== undefined
      ? dto.is_active
      : status === UserStatus.ACTIVE;

    return await AppDataSource.transaction(async (transactionalManager) => {
      let otpRecordId: string | null = null;
      if (!isAdmin && dto.otp && dto.phone) {
        const verifyResult = await otpService.verifyOtp(
          dto.phone,
          dto.otp,
          OtpPurpose.REGISTER,
          transactionalManager
        );
        otpRecordId = verifyResult.record.id;
      }

      const user = transactionalManager.getRepository(User).create({
        full_name: dto.full_name,
        email: dto.email,
        password_hash,
        role: dto.role,
        phone: (dto.phone || undefined) as any,
        profileImage: dto.profileImage || undefined,
        status,
        is_active,
      });

      const saved = await transactionalManager.getRepository(User).save(user);

      if (otpRecordId) {
        await otpService.linkUser(otpRecordId, saved.id, transactionalManager);
      }

      return sanitizeUser(saved);
    });
  }

  async update(
    id: string,
    dto: UpdateUserInput,
    currentUser: CurrentUser
  ): Promise<UserDetails> {
    if (
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      currentUser.id !== id
    ) {
      throw new AppError(403, "Forbidden: You are not authorized to update this user");
    }

    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (dto.email && dto.email !== user.email) {
      const existingEmail = await userRepo().findOne({ where: { email: dto.email } });
      if (existingEmail) {
        throw new AppError(409, "Email already exists");
      }
      user.email = dto.email;
    }

    if (dto.full_name !== undefined) {
      user.full_name = dto.full_name;
    }

    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }

    if (dto.status !== undefined) {
      if (currentUser && currentUser.role !== UserRole.Admin) {
        throw new AppError(403, "Forbidden: Only administrators can update user status");
      }
      user.status = dto.status;
      user.is_active = dto.status === UserStatus.ACTIVE;
    }

    if (dto.profileImage !== undefined) {
      const prevImage = user.profileImage;
      if (prevImage && prevImage !== dto.profileImage) {
        deleteFile(prevImage);
      }
      user.profileImage = dto.profileImage;
    }

    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, BCRYPT_COST);
    }

    user.updated_at = new Date();

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }

  async updateRole(
    id: string,
    role: UserRole,
    currentUser: CurrentUser
  ): Promise<UserDetails> {
    if (id === currentUser.id) {
      throw new AppError(403, "Cannot change your own role");
    }

    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    user.role = role;
    user.updated_at = new Date();

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }

  async updateStatus(
    id: string,
    statusUpdate: { status?: UserStatus; is_active?: boolean; expirationDate?: Date | null; expiration_date?: Date | null } | boolean,
    currentUser: CurrentUser
  ): Promise<UserDetails> {
    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    let nextStatus: UserStatus = user.status;
    let nextIsActive: boolean = user.is_active;

    if (typeof statusUpdate === "boolean") {
      nextIsActive = statusUpdate;
      nextStatus = statusUpdate ? UserStatus.ACTIVE : UserStatus.INACTIVE;
    } else {
      if (statusUpdate.status !== undefined) {
        nextStatus = statusUpdate.status;
        nextIsActive = statusUpdate.is_active !== undefined
          ? statusUpdate.is_active
          : statusUpdate.status === UserStatus.ACTIVE;
      } else if (statusUpdate.is_active !== undefined) {
        nextIsActive = statusUpdate.is_active;
        nextStatus = statusUpdate.is_active ? UserStatus.ACTIVE : UserStatus.INACTIVE;
      }
    }

    if ((!nextIsActive || nextStatus === UserStatus.INACTIVE || nextStatus === UserStatus.SUSPENDED) && id === currentUser.id) {
      throw new AppError(403, "Cannot deactivate or suspend your own account");
    }

    user.status = nextStatus;
    user.is_active = nextIsActive;
    user.updated_at = new Date();

    const saved = await userRepo().save(user);

    // When admin activates user, synchronize latest payment: set accepted and set expiration date
    if (nextStatus === UserStatus.ACTIVE && nextIsActive) {
      const paymentRepo = AppDataSource.getRepository(Payment);
      const latestPayment = await paymentRepo.findOne({
        where: { user_id: id },
        order: { created_at: "DESC" },
      });

      if (latestPayment) {
        let paymentChanged = false;
        if (latestPayment.status !== PaymentStatus.ACCEPTED) {
          latestPayment.status = PaymentStatus.ACCEPTED;
          paymentChanged = true;
        }

        const customExp = typeof statusUpdate === "object"
          ? (statusUpdate.expirationDate ?? statusUpdate.expiration_date)
          : undefined;

        if (customExp) {
          latestPayment.expirationDate = customExp;
          paymentChanged = true;
        } else if (!latestPayment.expirationDate) {
          latestPayment.expirationDate = await paymentService.calculateExpirationDateForPayment(latestPayment);
          paymentChanged = true;
        }

        if (paymentChanged) {
          await paymentRepo.save(latestPayment);
        }
      }
    }

    return sanitizeUser(saved);
  }

  async softDelete(
    id: string,
    currentUser: CurrentUser
  ): Promise<void> {
    if (id === currentUser.id) {
      throw new AppError(403, "Cannot delete your own account");
    }

    const user = await userRepo().findOne({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    user.status = UserStatus.INACTIVE;
    user.is_active = false;
    user.updated_at = new Date();
    await userRepo().save(user);
  }
}

export const userService = new UserService();
