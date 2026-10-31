import { OAuth2Client, TokenPayload } from "google-auth-library";
import { AppError } from "../middlewares/error.middleware";

export interface VerifiedGoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export class GoogleAuthService {
  private client: OAuth2Client;
  private allowedClientId: string | undefined;

  constructor() {
    this.allowedClientId = process.env.GOOGLE_CLIENT_ID;
    this.client = new OAuth2Client(this.allowedClientId);
  }

  getClientId(): string | undefined {
    return this.allowedClientId;
  }

  setClient(client: OAuth2Client) {
    this.client = client;
  }

  setAllowedClientId(clientId: string | undefined) {
    this.allowedClientId = clientId;
  }

  /**
   * Verifies the Google ID token using Google's official OAuth2Client library.
   * Validates signature, issuer, audience, expiration, and essential claims.
   * Never exposes raw ID tokens in error logs.
   */
  async verifyToken(idToken: string): Promise<VerifiedGoogleProfile> {
    if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
      throw new AppError(400, "Google ID token is required");
    }

    const trimmedToken = idToken.trim();

    try {
      const clientId = this.allowedClientId;
      const audiences = clientId ? [clientId] : undefined;

      const ticket = await this.client.verifyIdToken({
        idToken: trimmedToken,
        audience: audiences,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new AppError(401, "Invalid Google ID token: payload is empty");
      }

      return this.validatePayload(payload);
    } catch (err: any) {
      if (err instanceof AppError) {
        throw err;
      }
      // Log sanitized error message without exposing ID token
      console.warn("[GoogleAuthService] Token verification failed:", err?.message || "Verification error");
      throw new AppError(401, `Google token verification failed: ${err?.message || "Invalid or expired token"}`);
    }
  }

  /**
   * Validates essential claims against strict security rules.
   */
  validatePayload(payload: TokenPayload): VerifiedGoogleProfile {
    // 1. Validate 'sub' (provider subject identifier)
    if (!payload.sub || typeof payload.sub !== "string" || !payload.sub.trim()) {
      throw new AppError(401, "Google ID token is missing required subject claim (sub)");
    }

    // 2. Validate issuer (must be accounts.google.com or https://accounts.google.com)
    const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      throw new AppError(401, `Invalid Google ID token issuer: ${payload.iss}`);
    }

    // 3. Validate audience if GOOGLE_CLIENT_ID configured
    if (this.allowedClientId) {
      const audMatches =
        payload.aud === this.allowedClientId ||
        (Array.isArray(payload.aud) && payload.aud.includes(this.allowedClientId));
      if (!audMatches) {
        throw new AppError(401, "Invalid Google ID token audience (client ID mismatch)");
      }
    }

    // 4. Validate expiration timestamp
    if (typeof payload.exp === "number") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSeconds) {
        throw new AppError(401, "Google ID token has expired");
      }
    }

    // 5. Validate email claim
    if (!payload.email || typeof payload.email !== "string" || !payload.email.trim()) {
      throw new AppError(400, "Google ID token does not contain a valid email address");
    }

    // 6. Validate email_verified claim (do not trust unverified emails)
    if (payload.email_verified !== true) {
      throw new AppError(400, "Google account email is not verified");
    }

    const email = payload.email.trim().toLowerCase();
    const name =
      payload.name ||
      [payload.given_name, payload.family_name].filter(Boolean).join(" ") ||
      email.split("@")[0];
    const picture = payload.picture || null;

    return {
      sub: payload.sub.trim(),
      email,
      emailVerified: true,
      name: name.trim(),
      picture,
    };
  }
}

export const googleAuthService = new GoogleAuthService();
