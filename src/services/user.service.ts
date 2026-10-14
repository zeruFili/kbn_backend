import { FindOptionsWhere, ILike } from "typeorm";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { AppError } from "../middlewares/error.middleware";
import { pickAdminUserFields, AdminUserOutput } from "../utils/response.utils";
import { getUserDetails, UserDetails } from "../utils/user-details.util";

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
}

interface UpdateUserInput {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: UserStatus;
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
    role: user.role,
    status: user.status,
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

  async create(dto: CreateUserInput): Promise<UserDetails> {
    const existingEmail = await userRepo().findOne({ where: { email: dto.email } });
    if (existingEmail) {
      throw new AppError(409, "Email already exists");
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const status = dto.status ?? UserStatus.PENDING;
    const is_active = dto.is_active !== undefined
      ? dto.is_active
      : status === UserStatus.ACTIVE;

    const user = userRepo().create({
      full_name: dto.full_name,
      email: dto.email,
      password_hash,
      role: dto.role,
      phone: (dto.phone || undefined) as any,
      status,
      is_active,
    });

    const saved = await userRepo().save(user);
    return sanitizeUser(saved);
  }

  async update(
    id: string,
    dto: UpdateUserInput,
    currentUser: CurrentUser
  ): Promise<UserDetails> {
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
      user.status = dto.status;
      user.is_active = dto.status === UserStatus.ACTIVE;
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
    statusUpdate: { status?: UserStatus; is_active?: boolean } | boolean,
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
