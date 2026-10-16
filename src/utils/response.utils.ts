import { User } from "../entities/User";
import { UserStatus } from "../enums/user-status.enum";

export interface SafeUserOutput {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: UserStatus;
  profileImage: string | null;
  phone: string | null;
  website: string | null;
  education: string | null;
  achievement: string | null;
  professional_experience: string | null;
}

export interface AdminUserOutput {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone: string | null;
  website: string | null;
  education: string | null;
  achievement: string | null;
  professional_experience: string | null;
  last_login_at: Date | null;
  status: UserStatus;
  is_active: boolean;
  profileImage: string | null;
}

export function pickSafeUserFields(user: User | null | undefined): SafeUserOutput | null {
  if (!user) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    profileImage: user.profileImage ?? null,
    phone: user.phone ?? null,
    website: user.website ?? null,
    education: user.education ?? null,
    achievement: user.achievement ?? null,
    professional_experience: user.professional_experience ?? null,
  };
}


export function pickAdminUserFields(user: User | null | undefined): AdminUserOutput | null {
  if (!user) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    website: user.website ?? null,
    education: user.education ?? null,
    achievement: user.achievement ?? null,
    professional_experience: user.professional_experience ?? null,
    last_login_at: user.last_login_at ?? null,
    status: user.status,
    is_active: user.is_active,
    profileImage: user.profileImage ?? null,
  };
}
