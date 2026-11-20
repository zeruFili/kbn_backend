import { In } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { FeaturedMember } from "../entities/featured-member";
import { FeaturedCompany } from "../entities/featured-company";
import { User } from "../entities/User";
import { Company } from "../entities/company";
import { AppError } from "../middlewares/error.middleware";

export class FeaturedService {
  private get featuredMemberRepo() {
    return AppDataSource.getRepository(FeaturedMember);
  }

  private get featuredCompanyRepo() {
    return AppDataSource.getRepository(FeaturedCompany);
  }

  private get userRepo() {
    return AppDataSource.getRepository(User);
  }

  private get companyRepo() {
    return AppDataSource.getRepository(Company);
  }

  /**
   * Fetch all featured members ordered by display_order
   */
  async getFeaturedMembers(): Promise<FeaturedMember[]> {
    return this.featuredMemberRepo.find({
      relations: ["user", "user.membershipCategoryEntity"],
      order: {
        display_order: "ASC",
        created_at: "ASC",
      },
    });
  }

  /**
   * Set featured members (admin only)
   * Enforces 5 to 7 members selection
   */
  async setFeaturedMembers(userIds: string[]): Promise<FeaturedMember[]> {
    if (!Array.isArray(userIds)) {
      throw new AppError(400, "userIds must be an array of member IDs.");
    }

    if (userIds.length < 5 || userIds.length > 7) {
      throw new AppError(
        400,
        `You must select between 5 and 7 featured members. Currently selected: ${userIds.length}.`
      );
    }

    const uniqueIds = Array.from(new Set(userIds));
    if (uniqueIds.length !== userIds.length) {
      throw new AppError(400, "Duplicate members are not allowed in the featured list.");
    }

    // Verify all users exist in the database
    const users = await this.userRepo.findBy({ id: In(userIds) });
    if (users.length !== userIds.length) {
      const foundIds = new Set(users.map((u) => u.id));
      const missing = userIds.filter((id) => !foundIds.has(id));
      throw new AppError(
        400,
        `One or more selected members do not exist: ${missing.join(", ")}`
      );
    }

    // Replace featured records in transaction
    await AppDataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(FeaturedMember)
        .execute();

      const repo = manager.getRepository(FeaturedMember);
      const entities = userIds.map((userId, index) =>
        repo.create({
          user_id: userId,
          display_order: index + 1,
        })
      );
      await repo.save(entities);
    });

    return this.getFeaturedMembers();
  }

  /**
   * Fetch all featured companies ordered by display_order
   */
  async getFeaturedCompanies(): Promise<FeaturedCompany[]> {
    return this.featuredCompanyRepo.find({
      relations: [
        "company",
        "company.business_category",
        "company.social_media",
      ],
      order: {
        display_order: "ASC",
        created_at: "ASC",
      },
    });
  }

  /**
   * Set featured companies (admin only)
   * Enforces 5 to 7 companies selection
   */
  async setFeaturedCompanies(companyIds: string[]): Promise<FeaturedCompany[]> {
    if (!Array.isArray(companyIds)) {
      throw new AppError(400, "companyIds must be an array of company IDs.");
    }

    if (companyIds.length < 5 || companyIds.length > 7) {
      throw new AppError(
        400,
        `You must select between 5 and 7 featured companies. Currently selected: ${companyIds.length}.`
      );
    }

    const uniqueIds = Array.from(new Set(companyIds));
    if (uniqueIds.length !== companyIds.length) {
      throw new AppError(400, "Duplicate companies are not allowed in the featured list.");
    }

    // Verify all companies exist in the database
    const companies = await this.companyRepo.findBy({ id: In(companyIds) });
    if (companies.length !== companyIds.length) {
      const foundIds = new Set(companies.map((c) => c.id));
      const missing = companyIds.filter((id) => !foundIds.has(id));
      throw new AppError(
        400,
        `One or more selected companies do not exist: ${missing.join(", ")}`
      );
    }

    // Replace featured records in transaction
    await AppDataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(FeaturedCompany)
        .execute();

      const repo = manager.getRepository(FeaturedCompany);
      const entities = companyIds.map((companyId, index) =>
        repo.create({
          company_id: companyId,
          display_order: index + 1,
        })
      );
      await repo.save(entities);
    });

    return this.getFeaturedCompanies();
  }

  /**
   * Combined fetch for both featured members and companies
   */
  async getFeaturedCombined(): Promise<{
    members: FeaturedMember[];
    companies: FeaturedCompany[];
  }> {
    const [members, companies] = await Promise.all([
      this.getFeaturedMembers(),
      this.getFeaturedCompanies(),
    ]);

    return { members, companies };
  }
}

export const featuredService = new FeaturedService();
