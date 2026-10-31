import { User } from "../entities/User";
import { UserStatus } from "../enums/user-status.enum";

export interface SafeUserOutput {
  id: string;
  name?: string;
  full_name: string;
  fullName?: string;
  email: string;
  role: string;
  status: UserStatus;
  profileImage: string | null;
  profile_image?: string | null;
  avatar?: string | null;
  phone: string | null;
  phoneNumber?: string | null;
  phoneVerifiedAt?: Date | null;
  emailVerifiedAt?: Date | null;
  hasPassword?: boolean;
  website: string | null;
  education: string | null;
  achievement: string | null;
  professional_experience: string | null;
  created_at?: Date | null;
  createdAt?: Date | null;
  registeredAt?: string | null;
  updated_at?: Date | null;
}

export interface AdminUserOutput {
  id: string;
  name?: string;
  full_name: string;
  fullName: string;
  email: string;
  role: string;
  phone: string | null;
  phoneNumber?: string | null;
  phoneVerifiedAt?: Date | null;
  emailVerifiedAt?: Date | null;
  hasPassword?: boolean;
  website: string | null;
  education: string | null;
  achievement: string | null;
  professional_experience: string | null;
  last_login_at: Date | null;
  status: UserStatus;
  is_active: boolean;
  profileImage: string | null;
  profile_image: string | null;
  avatar: string | null;
  created_at: Date | null;
  createdAt: Date | null;
  registeredAt: string | null;
  updated_at: Date | null;
  updatedAt: Date | null;
}

export function pickSafeUserFields(user: User | null | undefined): SafeUserOutput | null {
  if (!user) return null;
  const image = user.profileImage ?? null;
  return {
    id: user.id,
    name: user.name || user.full_name,
    full_name: user.full_name,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    profileImage: image,
    profile_image: image,
    avatar: image,
    phone: user.phone ?? null,
    phoneNumber: user.phoneNumber || user.phone || null,
    phoneVerifiedAt: user.phoneVerifiedAt ?? null,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    hasPassword: Boolean(user.localCredential?.passwordHash || user.password_hash),
    website: user.website ?? null,
    education: user.education ?? null,
    achievement: user.achievement ?? null,
    professional_experience: user.professional_experience ?? null,
    created_at: user.created_at ?? null,
    createdAt: user.created_at ?? null,
    registeredAt: user.created_at ? user.created_at.toISOString() : null,
    updated_at: user.updated_at ?? null,
  };
}

export function pickAdminUserFields(user: User | null | undefined): AdminUserOutput | null {
  if (!user) return null;
  const image = user.profileImage ?? null;
  return {
    id: user.id,
    name: user.name || user.full_name,
    full_name: user.full_name,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    phoneNumber: user.phoneNumber || user.phone || null,
    phoneVerifiedAt: user.phoneVerifiedAt ?? null,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    hasPassword: Boolean(user.localCredential?.passwordHash || user.password_hash),
    website: user.website ?? null,
    education: user.education ?? null,
    achievement: user.achievement ?? null,
    professional_experience: user.professional_experience ?? null,
    last_login_at: user.last_login_at ?? null,
    status: user.status,
    is_active: user.is_active,
    profileImage: image,
    profile_image: image,
    avatar: image,
    created_at: user.created_at ?? null,
    createdAt: user.created_at ?? null,
    registeredAt: user.created_at ? user.created_at.toISOString() : null,
    updated_at: user.updated_at ?? null,
    updatedAt: user.updated_at ?? null,
  };
}
