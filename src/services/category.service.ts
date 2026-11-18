import { AppDataSource } from "../config/data-source";
import { Category } from "../entities/category";
import { Company } from "../entities/company";
import { CategoryType } from "../enums/category-type.enum";
import { AppError } from "../middlewares/error.middleware";
import { deleteFile } from "../utils/upload.utils";
import { CreateCategoryDto, UpdateCategoryDto } from "../validators/category.dto";

export interface CategoryFilterOptions {
  page?: number;
  limit?: number;
  search?: string;
  type?: CategoryType;
  is_active?: boolean;
  sort_by?: "name" | "created_at" | "type";
  sort_order?: "ASC" | "DESC";
}

export type CategoryWithCount = Category & {
  company_count: number;
};

export interface PaginatedCategoriesResult {
  data: CategoryWithCount[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const repo = () => AppDataSource.getRepository(Category);
const companyRepo = () => AppDataSource.getRepository(Company);

export class CategoryService {
  async findAll(options: CategoryFilterOptions = {}): Promise<PaginatedCategoriesResult> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const sortBy = options.sort_by || "name";
    const sortOrder = options.sort_order || "ASC";

    const qb = repo().createQueryBuilder("category");

    if (options.search) {
      qb.andWhere(
        "(category.name ILIKE :search OR category.description ILIKE :search)",
        { search: `%${options.search}%` }
      );
    }

    if (options.type) {
      qb.andWhere("category.type = :type", { type: options.type });
    }

    if (options.is_active !== undefined) {
      qb.andWhere("category.is_active = :isActive", {
        isActive: options.is_active,
      });
    }

    const validSortColumns = ["name", "created_at", "type"];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : "name";
    qb.orderBy(`category.${safeSortBy}`, sortOrder === "DESC" ? "DESC" : "ASC");

    const total = await qb.getCount();
    const categories = await qb.skip((page - 1) * limit).take(limit).getMany();

    const countMap = new Map<string, number>();
    if (categories.length > 0) {
      const categoryIds = categories.map((c) => c.id);
      const rawCounts = await companyRepo()
        .createQueryBuilder("company")
        .select("company.business_category_id", "categoryId")
        .addSelect("COUNT(*)", "count")
        .where("company.business_category_id IN (:...categoryIds)", { categoryIds })
        .groupBy("company.business_category_id")
        .getRawMany<{ categoryId: string; count: string }>();

      for (const row of rawCounts) {
        countMap.set(row.categoryId, parseInt(row.count, 10) || 0);
      }
    }

    const data: CategoryWithCount[] = categories.map((cat) => ({
      ...cat,
      company_count: countMap.get(cat.id) ?? 0,
    }));

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

  private async findEntityById(id: string): Promise<Category> {
    const category = await repo().findOne({ where: { id } });
    if (!category) {
      throw new AppError(404, "Category not found");
    }
    return category;
  }

  async findById(id: string): Promise<CategoryWithCount> {
    const category = await this.findEntityById(id);
    const company_count = await companyRepo().count({
      where: { business_category_id: id },
    });
    return { ...category, company_count };
  }

  async create(dto: CreateCategoryDto): Promise<CategoryWithCount> {
    const type = dto.type || CategoryType.COMPANY;
    const trimmedName = dto.name.trim();

    const existing = await repo()
      .createQueryBuilder("category")
      .where("LOWER(category.name) = LOWER(:name) AND category.type = :type", {
        name: trimmedName,
        type,
      })
      .getOne();

    if (existing) {
      throw new AppError(
        409,
        `Category '${trimmedName}' of type '${type}' already exists`
      );
    }

    const category = repo().create({
      ...dto,
      name: trimmedName,
      type,
    });

    const saved = await repo().save(category);
    return { ...saved, company_count: 0 };
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryWithCount> {
    const category = await this.findEntityById(id);

    const newName = dto.name !== undefined ? dto.name.trim() : category.name;
    const newType = dto.type !== undefined ? dto.type : category.type;

    if (
      newName.toLowerCase() !== category.name.toLowerCase() ||
      newType !== category.type
    ) {
      const existing = await repo()
        .createQueryBuilder("category")
        .where(
          "LOWER(category.name) = LOWER(:name) AND category.type = :type AND category.id != :id",
          {
            name: newName,
            type: newType,
            id,
          }
        )
        .getOne();

      if (existing) {
        throw new AppError(
          409,
          `Category '${newName}' of type '${newType}' already exists`
        );
      }
    }

    const prevIcon = category.icon;
    Object.assign(category, {
      ...dto,
      ...(dto.name !== undefined ? { name: newName } : {}),
      ...(dto.type !== undefined ? { type: newType } : {}),
    });

    const saved = await repo().save(category);

    if (dto.icon !== undefined && prevIcon && prevIcon !== dto.icon) {
      deleteFile(prevIcon);
    }

    const company_count = await companyRepo().count({
      where: { business_category_id: id },
    });

    return { ...saved, company_count };
  }

  async updateStatus(id: string, isActive: boolean): Promise<CategoryWithCount> {
    const category = await this.findEntityById(id);
    category.is_active = isActive;
    const saved = await repo().save(category);
    const company_count = await companyRepo().count({
      where: { business_category_id: id },
    });
    return { ...saved, company_count };
  }

  async remove(id: string): Promise<void> {
    const category = await this.findEntityById(id);

    const associatedCompaniesCount = await companyRepo().count({
      where: { business_category_id: id },
    });

    if (associatedCompaniesCount > 0) {
      throw new AppError(
        400,
        `Cannot delete category '${category.name}' because it is assigned to ${associatedCompaniesCount} company/companies. Deactivate it instead.`
      );
    }

    if (category.icon) {
      deleteFile(category.icon);
    }

    await repo().delete(id);
  }
}

export const categoryService = new CategoryService();
