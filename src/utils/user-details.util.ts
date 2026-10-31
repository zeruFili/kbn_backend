import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { LocalCredential } from "../entities/LocalCredential";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";

export interface UserDetails {
  id: string;
  fullName: string;
  full_name?: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  is_active?: boolean;
  hasPassword?: boolean;
  profileImage: string | null;
  profile_image?: string | null;
  avatar?: string | null;
  phone: string | null;
  website: string | null;
  education: string | null;
  achievement: string | null;
  professional_experience: string | null;
  last_login_at?: Date | null;
  created_at?: Date | null;
  createdAt?: Date | null;
  registeredAt?: string | null;
  updated_at?: Date | null;
  updatedAt?: Date | null;
}

const userRepo = () => AppDataSource.getRepository(User);

export async function getUserDetails(userId: string): Promise<UserDetails | null> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return null;
  const image = user.profileImage ?? null;

  let hasPassword = Boolean(user.password_hash);
  try {
    const cred = await AppDataSource.getRepository(LocalCredential).findOne({ where: { userId } });
    if (cred && cred.passwordHash) {
      hasPassword = true;
    }
  } catch {
    // Non-fatal
  }

  return {
    id: user.id,
    fullName: user.full_name,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    is_active: user.is_active,
    hasPassword,
    profileImage: image,
    profile_image: image,
    avatar: image,
    phone: user.phone ?? null,
    website: user.website ?? null,
    education: user.education ?? null,
    achievement: user.achievement ?? null,
    professional_experience: user.professional_experience ?? null,
    last_login_at: user.last_login_at ?? null,
    created_at: user.created_at ?? null,
    createdAt: user.created_at ?? null,
    registeredAt: user.created_at ? user.created_at.toISOString() : null,
    updated_at: user.updated_at ?? null,
    updatedAt: user.updated_at ?? null,
  };
}
