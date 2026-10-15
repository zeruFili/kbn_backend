import { Request, Response, NextFunction } from "express";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";
import { verifyAccessToken } from "../utils/jwt.utils";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    email?: string;
    status: UserStatus;
  };
}

/**
 * Authenticates JWT token and retrieves fresh user role and status directly from the database.
 * Does not trust potentially outdated JWT claims.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAccessToken(token);

    if (!decoded || !decoded.sub) {
      res.status(401).json({ success: false, message: "Invalid or expired token" });
      return;
    }

    // Always fetch live user state from database to ensure up-to-date role and status
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: decoded.sub } });

    if (!user) {
      res.status(401).json({ success: false, message: "User account not found" });
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

/**
 * Ensures user account is ACTIVE.
 * Suspended, Pending, and Inactive users are strictly blocked.
 */
export function requireActiveUser(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  if (req.user.status === UserStatus.SUSPENDED) {
    res.status(403).json({ success: false, message: "Account is suspended. Please contact your administrator." });
    return;
  }

  if (req.user.status === UserStatus.PENDING) {
    res.status(403).json({ success: false, message: "Account is pending approval or payment verification." });
    return;
  }

  if (req.user.status !== UserStatus.ACTIVE) {
    res.status(403).json({ success: false, message: "Account is inactive. Please renew your subscription." });
    return;
  }

  next();
}

/**
 * Allows payment verification for PENDING, INACTIVE, and ACTIVE users.
 * Strictly blocks SUSPENDED users until an authorized administrator changes their status.
 */
export function requirePaymentOrActive(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  if (req.user.status === UserStatus.SUSPENDED) {
    res.status(403).json({ success: false, message: "Account is suspended. Please contact your administrator." });
    return;
  }

  next();
}

/**
 * Authorizes specific user roles.
 * Users must be ACTIVE to exercise role-based authorization.
 */
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
    const decoded = verifyAccessToken(token);

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
