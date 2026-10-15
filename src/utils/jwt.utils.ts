import jwt from "jsonwebtoken";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const ACCESS_TOKEN_TTL = (process.env.ACCESS_TOKEN_TTL || "15m") as jwt.SignOptions["expiresIn"];

export interface JwtTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  iat?: number;
  exp?: number;
}

export function generateAccessToken(user: {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}): string {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): JwtTokenPayload {
  return jwt.verify(token, JWT_SECRET) as JwtTokenPayload;
}
