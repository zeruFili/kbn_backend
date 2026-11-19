import { DataSource } from "typeorm";
import { MembershipCategory } from "../entities/membership-category.entity";

export interface MembershipCategorySeedData {
  code: string;
  name: string;
  tier: number;
  amount: number;
  currency: string;
  formattedPrice: string;
  description: string;
  popular: boolean;
  is_active: boolean;
}

export const INITIAL_MEMBERSHIP_CATEGORIES: MembershipCategorySeedData[] = [
  {
    code: "beginner_professionals_business_owners",
    name: "Beginner Professionals & Business Owners",
    tier: 1,
    amount: 250.00,
    currency: "ETB",
    formattedPrice: "ETB 250",
    description: "Ideal for emerging professionals, startups, and small business owners.",
    popular: false,
    is_active: true,
  },
  {
    code: "developing_professionals_business_owners",
    name: "Developing Professionals & Business Owners",
    tier: 2,
    amount: 500.00,
    currency: "ETB",
    formattedPrice: "ETB 500",
    description: "For growing professionals and established businesses scaling operations and networking.",
    popular: true,
    is_active: true,
  },
  {
    code: "established_professionals_business_owners",
    name: "Established Professionals & Business Owners",
    tier: 3,
    amount: 750.00,
    currency: "ETB",
    formattedPrice: "ETB 750",
    description: "For experienced professionals and business owners expanding their influence and partnerships.",
    popular: false,
    is_active: true,
  },
  {
    code: "investors_strategic_partners",
    name: "Investors & Strategic Partners",
    tier: 4,
    amount: 1000.00,
    currency: "ETB",
    formattedPrice: "ETB 1,000",
    description: "For investors and strategic partners seeking meaningful connections and opportunities.",
    popular: false,
    is_active: true,
  },
];

export async function seedMembershipCategories(dataSource: DataSource): Promise<MembershipCategory[]> {
  const repo = dataSource.getRepository(MembershipCategory);
  const results: MembershipCategory[] = [];

  for (const item of INITIAL_MEMBERSHIP_CATEGORIES) {
    let existing = await repo.findOne({ where: { code: item.code } });
    if (!existing) {
      existing = repo.create({
        code: item.code,
        name: item.name,
        tier: item.tier,
        amount: item.amount,
        currency: item.currency,
        formattedPrice: item.formattedPrice,
        description: item.description,
        popular: item.popular,
        is_active: item.is_active,
      });
      existing = await repo.save(existing);
      console.log(`[Seed] Created membership category: ${existing.name} (${existing.code}) - ${existing.amount} ${existing.currency}`);
    } else {
      let updated = false;
      if (existing.name !== item.name) {
        existing.name = item.name;
        updated = true;
      }
      if (existing.tier !== item.tier) {
        existing.tier = item.tier;
        updated = true;
      }
      if (Number(existing.amount) !== item.amount) {
        existing.amount = item.amount;
        updated = true;
      }
      if (existing.currency !== item.currency) {
        existing.currency = item.currency;
        updated = true;
      }
      if (existing.formattedPrice !== item.formattedPrice) {
        existing.formattedPrice = item.formattedPrice;
        updated = true;
      }
      if (existing.description !== item.description) {
        existing.description = item.description;
        updated = true;
      }
      if (existing.popular !== item.popular) {
        existing.popular = item.popular;
        updated = true;
      }
      if (existing.is_active !== item.is_active) {
        existing.is_active = item.is_active;
        updated = true;
      }
      if (updated) {
        existing = await repo.save(existing);
        console.log(`[Seed] Updated membership category: ${existing.name} (${existing.code})`);
      }
    }
    results.push(existing);
  }

  return results;
}
