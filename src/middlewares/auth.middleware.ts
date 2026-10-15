import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    email?: string;
    status?: UserStatus;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const secret = process.env.JWT_SECRET || "default_secret";
    const decoded = jwt.verify(token, secret) as {
      sub: string;
      role?: UserRole;
      email?: string;
    };

    if (!decoded || !decoded.sub) {
      res.status(401).json({ success: false, message: "Invalid or expired token" });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: decoded.sub } });

    if (!user) {
      res.status(401).json({ success: false, message: "User account not found" });
      return;
    }

    if (!user.is_active || user.status === UserStatus.SUSPENDED || user.status === UserStatus.INACTIVE) {
      res.status(403).json({ success: false, message: "Account is suspended or deactivated" });
      return;
    }

    if (user.status === UserStatus.PENDING) {
      res.status(403).json({ success: false, message: "Account is pending approval" });
      return;
    }

    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      status: user.status,
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (req.user.status !== UserStatus.ACTIVE) {
      res.status(403).json({ success: false, message: "Account is not active" });
      return;
    }

    if (req.user.role === UserRole.Admin) {
      next();
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }

    next();
  };
}

export function requireExactRole(role: UserRole, message?: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (req.user.status !== UserStatus.ACTIVE) {
      res.status(403).json({ success: false, message: "Account is not active" });
      return;
    }

    if (req.user.role !== role) {
      res.status(403).json({ success: false, message: message ?? "Forbidden" });
      return;
    }

    next();
  };
}

export async function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const secret = process.env.JWT_SECRET || "default_secret";
    const decoded = jwt.verify(token, secret) as {
      sub: string;
      role?: UserRole;
      email?: string;
    };

    if (decoded && decoded.sub) {
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: decoded.sub } });
      if (user && user.is_active && user.status === UserStatus.ACTIVE) {
        req.user = {
          id: user.id,
          role: user.role,
          email: user.email,
          status: user.status,
        };
      }
    }
  } catch {
    // Continue unauthenticated if token is invalid or expired
  }
  next();
}
