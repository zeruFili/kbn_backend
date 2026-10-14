import { AppDataSource } from "../config/data-source";
import { RolePayment } from "../entities/role-payment";
import { RolePaymentStatus } from "../enums/role-payment-status.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import {
  CreateRolePaymentDto,
  UpdateRolePaymentDto,
} from "../validators/role-payment.dto";

export interface RolePaymentFilterOptions {
  role?: UserRole;
  status?: RolePaymentStatus;
  page?: number;
  limit?: number;
  sort_by?: "role" | "monthlyAmount" | "status" | "createdAt" | "updatedAt";
  sort_order?: "ASC" | "DESC";
}

export interface PaginatedRolePaymentsResult {
  data: RolePayment[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const repo = () => AppDataSource.getRepository(RolePayment);

export class RolePaymentService {
  async findAll(
    options: RolePaymentFilterOptions = {}
  ): Promise<PaginatedRolePaymentsResult> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const sortOrder = options.sort_order === "DESC" ? "DESC" : "ASC";

    const qb = repo().createQueryBuilder("rp");

    if (options.role) {
      qb.andWhere("rp.role = :role", { role: options.role });
    }

    if (options.status) {
      qb.andWhere("rp.status = :status", { status: options.status });
    }

    // Mapping sort column to entity/column names safely
    switch (options.sort_by) {
      case "monthlyAmount":
        qb.orderBy("rp.monthlyAmount", sortOrder);
        break;
      case "status":
        qb.orderBy("rp.status", sortOrder);
        break;
      case "createdAt":
        qb.orderBy("rp.createdAt", sortOrder);
        break;
      case "updatedAt":
        qb.orderBy("rp.updatedAt", sortOrder);
        break;
      case "role":
      default:
        qb.orderBy("rp.role", sortOrder);
        break;
    }

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string): Promise<RolePayment> {
    const record = await repo().findOne({ where: { id } });
    if (!record) {
      throw new AppError(404, "Role payment configuration not found");
    }
    return record;
  }

  async findByRole(role: UserRole): Promise<RolePayment> {
    const record = await repo().findOne({ where: { role } });
    if (!record) {
      throw new AppError(
        404,
        `Payment configuration for role '${role}' not found`
      );
    }
    return record;
  }

  async create(dto: CreateRolePaymentDto): Promise<RolePayment> {
    // Validate non-negative amount
    if (dto.monthlyAmount === undefined || dto.monthlyAmount === null || isNaN(dto.monthlyAmount)) {
      throw new AppError(400, "Monthly payment amount is required and must be a valid number");
    }
    if (dto.monthlyAmount < 0) {
      throw new AppError(400, "Monthly payment amount must be a non-negative number (0 or greater)");
    }

    // Check for duplicate payment configuration for the role
    const existing = await repo().findOne({ where: { role: dto.role } });
    if (existing) {
      throw new AppError(
        409,
        `A payment configuration for role '${dto.role}' already exists. Please update the existing configuration instead.`
      );
    }

    const status = dto.status || RolePaymentStatus.ACTIVE;

    const rolePayment = repo().create({
      role: dto.role,
      monthlyAmount: Number(dto.monthlyAmount),
      status,
    });

    return repo().save(rolePayment);
  }

  async update(id: string, dto: UpdateRolePaymentDto): Promise<RolePayment> {
    const record = await this.findById(id);

    // If updating amount, validate non-negative
    if (dto.monthlyAmount !== undefined) {
      if (dto.monthlyAmount === null || isNaN(dto.monthlyAmount)) {
        throw new AppError(400, "Monthly payment amount must be a valid number");
      }
      if (dto.monthlyAmount < 0) {
        throw new AppError(400, "Monthly payment amount must be a non-negative number (0 or greater)");
      }
      record.monthlyAmount = Number(dto.monthlyAmount);
    }

    // If updating role, check for uniqueness conflict
    if (dto.role && dto.role !== record.role) {
      const conflict = await repo().findOne({ where: { role: dto.role } });
      if (conflict && conflict.id !== id) {
        throw new AppError(
          409,
          `A payment configuration for role '${dto.role}' already exists.`
        );
      }
      record.role = dto.role;
    }

    // If updating status
    if (dto.status) {
      record.status = dto.status;
    }

    return repo().save(record);
  }

  async updateStatus(id: string, status: RolePaymentStatus): Promise<RolePayment> {
    const record = await this.findById(id);
    record.status = status;
    return repo().save(record);
  }

  async activate(id: string): Promise<RolePayment> {
    return this.updateStatus(id, RolePaymentStatus.ACTIVE);
  }

  async deactivate(id: string): Promise<RolePayment> {
    return this.updateStatus(id, RolePaymentStatus.INACTIVE);
  }

  async remove(id: string): Promise<void> {
    const record = await this.findById(id);
    await repo().delete(record.id);
  }
}

export const rolePaymentService = new RolePaymentService();
