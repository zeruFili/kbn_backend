import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";

export interface UserDetails {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  profileImage: string | null;
  phone: string | null;
  website: string | null;
  education: string | null;
  achievement: string | null;
  professional_experience: string | null;
}

const userRepo = () => AppDataSource.getRepository(User);

export async function getUserDetails(userId: string): Promise<UserDetails | null> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.full_name,
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
