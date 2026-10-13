import { AppDataSource } from "../config/data-source";
import { Company } from "../entities/company";
import { CompanySocialMedia } from "../entities/company-social-media";
import { Category } from "../entities/category";
import { VerificationStatus } from "../enums/verification-status.enum";
import { SocialPlatform } from "../enums/social-platform.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { deleteFile } from "../utils/upload.utils";
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  CompanySocialMediaDto,
} from "../validators/company.dto";

export interface CompanyFilterOptions {
  page?: number;
  limit?: number;
  search?: string;
  business_category_id?: string;
  verification_status?: VerificationStatus;
  is_active?: boolean;
  sort_by?: "created_at" | "company_name" | "updated_at";
  sort_order?: "ASC" | "DESC";
}

export interface PaginatedCompaniesResult {
  data: Company[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CurrentUserContext {
  id: string;
  role: UserRole;
  email?: string;
}

const repo = () => AppDataSource.getRepository(Company);
const categoryRepo = () => AppDataSource.getRepository(Category);
const socialMediaRepo = () => AppDataSource.getRepository(CompanySocialMedia);

export class CompanyService {
  async findAll(options: CompanyFilterOptions = {}): Promise<PaginatedCompaniesResult> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const sortBy = options.sort_by || "created_at";
    const sortOrder = options.sort_order || "DESC";

    const qb = repo()
      .createQueryBuilder("company")
      .leftJoinAndSelect("company.business_category", "business_category")
      .leftJoinAndSelect("company.social_media", "social_media");

    if (options.search) {
      qb.andWhere(
        "(company.company_name ILIKE :search OR company.email ILIKE :search OR company.owner_primary_contact ILIKE :search OR company.physical_address ILIKE :search OR company.description ILIKE :search)",
        { search: `%${options.search}%` }
      );
    }

    if (options.business_category_id) {
      qb.andWhere("company.business_category_id = :catId", {
        catId: options.business_category_id,
      });
    }

    if (options.verification_status) {
      qb.andWhere("company.verification_status = :vStatus", {
        vStatus: options.verification_status,
      });
    }

    if (options.is_active !== undefined) {
      qb.andWhere("company.is_active = :isActive", {
        isActive: options.is_active,
      });
    }

    const validSortColumns = ["created_at", "company_name", "updated_at"];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : "created_at";
    qb.orderBy(`company.${safeSortBy}`, sortOrder === "ASC" ? "ASC" : "DESC");

    const total = await qb.getCount();
    const data = await qb.skip((page - 1) * limit).take(limit).getMany();

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

  async findById(id: string): Promise<Company> {
    const company = await repo().findOne({
      where: { id },
      relations: ["business_category", "social_media"],
    });

    if (!company) {
      throw new AppError(404, "Company not found");
    }

    return company;
  }

  async findByOwnerId(userId: string): Promise<Company | null> {
    return repo().findOne({
      where: { created_by: userId },
      relations: ["business_category", "social_media"],
    });
  }

  async findAllByOwnerId(userId: string, userEmail?: string): Promise<Company[]> {
    const qb = repo()
      .createQueryBuilder("company")
      .leftJoinAndSelect("company.business_category", "business_category")
      .leftJoinAndSelect("company.social_media", "social_media")
      .where("company.created_by = :userId", { userId });

    if (userEmail) {
      qb.orWhere("LOWER(company.email) = LOWER(:userEmail)", { userEmail });
    }

    qb.orderBy("company.created_at", "DESC");
    return qb.getMany();
  }

  async create(dto: CreateCompanyDto, createdBy?: string): Promise<Company> {
    const category = await categoryRepo().findOne({
      where: { id: dto.business_category_id },
    });
    if (!category) {
      throw new AppError(400, "Invalid business category ID: category does not exist");
    }

    const existingEmail = await repo().findOne({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new AppError(409, "A company with this email already exists");
    }

    const { social_media, ...companyData } = dto;
    const company = repo().create({
      ...companyData,
      created_by: createdBy,
    });

    const savedCompany = await repo().save(company);

    if (social_media && social_media.length > 0) {
      const smEntities = social_media.map((sm) =>
        socialMediaRepo().create({
          company_id: savedCompany.id,
          platform: sm.platform,
          link: sm.link,
          created_by: createdBy,
        })
      );
      await socialMediaRepo().save(smEntities);
    }

    return this.findById(savedCompany.id);
  }

  async update(
    id: string,
    dto: UpdateCompanyDto,
    currentUser?: CurrentUserContext
  ): Promise<Company> {
    const company = await this.findById(id);

    if (
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      company.created_by !== currentUser.id
    ) {
      throw new AppError(403, "Forbidden: You are not authorized to update this company");
    }

    if (
      dto.business_category_id &&
      dto.business_category_id !== company.business_category_id
    ) {
      const category = await categoryRepo().findOne({
        where: { id: dto.business_category_id },
      });
      if (!category) {
        throw new AppError(400, "Invalid business category ID: category does not exist");
      }
    }

    if (dto.email && dto.email.toLowerCase() !== company.email.toLowerCase()) {
      const existing = await repo().findOne({ where: { email: dto.email } });
      if (existing && existing.id !== id) {
        throw new AppError(409, "A company with this email already exists");
      }
    }

    if (
      dto.verification_status !== undefined &&
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      dto.verification_status !== company.verification_status
    ) {
      throw new AppError(403, "Only administrators can update the verification status");
    }

    const prevLogo = company.company_logo;
    const prevLicense = company.business_license;

    const { social_media, ...updateData } = dto;
    Object.assign(company, updateData);

    const savedCompany = await repo().save(company);

    if (
      dto.company_logo !== undefined &&
      prevLogo &&
      prevLogo !== dto.company_logo
    ) {
      deleteFile(prevLogo);
    }

    if (
      dto.business_license !== undefined &&
      prevLicense &&
      prevLicense !== dto.business_license
    ) {
      deleteFile(prevLicense);
    }

    if (social_media !== undefined) {
      await socialMediaRepo().delete({ company_id: id });
      if (social_media.length > 0) {
        const smEntities = social_media.map((sm) =>
          socialMediaRepo().create({
            company_id: id,
            platform: sm.platform,
            link: sm.link,
            created_by: currentUser?.id,
          })
        );
        await socialMediaRepo().save(smEntities);
      }
    }

    return this.findById(savedCompany.id);
  }

  async updateVerificationStatus(
    id: string,
    verificationStatus: VerificationStatus
  ): Promise<Company> {
    const company = await this.findById(id);
    company.verification_status = verificationStatus;
    await repo().save(company);
    return this.findById(id);
  }

  async updateStatus(
    id: string,
    isActive: boolean,
    currentUser?: CurrentUserContext
  ): Promise<Company> {
    const company = await this.findById(id);

    if (
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      company.created_by !== currentUser.id
    ) {
      throw new AppError(
        403,
        "Forbidden: You are not authorized to update this company status"
      );
    }

    company.is_active = isActive;
    await repo().save(company);
    return this.findById(id);
  }

  async remove(id: string, currentUser?: CurrentUserContext): Promise<void> {
    const company = await this.findById(id);

    if (
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      company.created_by !== currentUser.id
    ) {
      throw new AppError(403, "Forbidden: You are not authorized to delete this company");
    }

    if (company.company_logo) {
      deleteFile(company.company_logo);
    }
    if (company.business_license) {
      deleteFile(company.business_license);
    }

    await socialMediaRepo().delete({ company_id: id });
    await repo().delete(id);
  }

  async getSocialMedia(companyId: string): Promise<CompanySocialMedia[]> {
    await this.findById(companyId);
    return socialMediaRepo().find({ where: { company_id: companyId } });
  }

  async addOrUpdateSocialMedia(
    companyId: string,
    dto: CompanySocialMediaDto,
    currentUser?: CurrentUserContext
  ): Promise<CompanySocialMedia> {
    const company = await this.findById(companyId);

    if (
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      company.created_by !== currentUser.id
    ) {
      throw new AppError(403, "Forbidden: You are not authorized to modify this company");
    }

    let sm = await socialMediaRepo().findOne({
      where: { company_id: companyId, platform: dto.platform },
    });

    if (sm) {
      sm.link = dto.link;
    } else {
      sm = socialMediaRepo().create({
        company_id: companyId,
        platform: dto.platform,
        link: dto.link,
        created_by: currentUser?.id,
      });
    }

    return socialMediaRepo().save(sm);
  }

  async removeSocialMedia(
    companyId: string,
    platform: SocialPlatform,
    currentUser?: CurrentUserContext
  ): Promise<void> {
    const company = await this.findById(companyId);

    if (
      currentUser &&
      currentUser.role !== UserRole.Admin &&
      company.created_by !== currentUser.id
    ) {
      throw new AppError(403, "Forbidden: You are not authorized to modify this company");
    }

    const sm = await socialMediaRepo().findOne({
      where: { company_id: companyId, platform },
    });

    if (!sm) {
      throw new AppError(404, "Social media record not found for this platform");
    }

    await socialMediaRepo().delete({ company_id: companyId, platform });
  }
}

export const companyService = new CompanyService();
