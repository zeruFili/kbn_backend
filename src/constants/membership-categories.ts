import { MembershipCategory } from "../enums/membership-category.enum";

export interface MembershipCategoryDefinition {
  id: MembershipCategory;
  name: string;
  amount: number;
  currency: "ETB";
  formattedPrice: string;
  tier: number;
  description: string;
  popular?: boolean;
}

export const MEMBERSHIP_CATEGORIES: MembershipCategoryDefinition[] = [
  {
    id: MembershipCategory.BEGINNER_PROFESSIONALS_BUSINESS_OWNERS,
    name: "Beginner Professionals & Business Owners",
    amount: 250,
    currency: "ETB",
    formattedPrice: "ETB 250",
    tier: 1,
    description: "Ideal for emerging professionals, startups, and small business owners.",
  },
  {
    id: MembershipCategory.DEVELOPING_PROFESSIONALS_BUSINESS_OWNERS,
    name: "Developing Professionals & Business Owners",
    amount: 500,
    currency: "ETB",
    formattedPrice: "ETB 500",
    tier: 2,
    popular: true,
    description: "For growing professionals and established businesses scaling operations and networking.",
  },
  {
    id: MembershipCategory.ESTABLISHED_PROFESSIONALS_BUSINESS_OWNERS,
    name: "Established Professionals & Business Owners",
    amount: 750,
    currency: "ETB",
    formattedPrice: "ETB 750",
    tier: 3,
    description: "For experienced professionals and business owners expanding their influence and partnerships.",
  },
  {
    id: MembershipCategory.INVESTORS_STRATEGIC_PARTNERS,
    name: "Investors & Strategic Partners",
    amount: 1000,
    currency: "ETB",
    formattedPrice: "ETB 1,000",
    tier: 4,
    description: "For investors and strategic partners seeking meaningful connections and opportunities.",
  },
];

export function resolveMembershipCategory(
  keyOrName?: string | null
): MembershipCategoryDefinition | null {
  if (!keyOrName) return null;
  const normalized = keyOrName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const cat of MEMBERSHIP_CATEGORIES) {
    const idNorm = cat.id.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameNorm = cat.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalized === idNorm || normalized === nameNorm) {
      return cat;
    }
  }
  return null;
}

export function getMembershipCategoryAmount(keyOrName?: string | null): number | null {
  const cat = resolveMembershipCategory(keyOrName);
  return cat ? cat.amount : null;
}

export function getMembershipCategoryLabel(keyOrName?: string | null): string | null {
  const cat = resolveMembershipCategory(keyOrName);
  return cat ? cat.name : null;
}
