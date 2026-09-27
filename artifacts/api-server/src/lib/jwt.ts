import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { logger } from "./logger";

function getSecret(envVar: string, fallback: string): string {
  const value = process.env[envVar];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envVar} environment variable is required in production but was not set.`);
  }
  logger.warn({ envVar }, `${envVar} not set — using insecure development fallback. Do NOT use in production.`);
  return fallback;
}

const ACCESS_SECRET = getSecret("JWT_SECRET", "autocango-access-secret-dev-only");
const REFRESH_SECRET = getSecret("JWT_REFRESH_SECRET", "autocango-refresh-secret-dev-only");
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
  } catch (err) {
    logger.debug({ err }, "Access token verification failed");
    return null;
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
  } catch (err) {
    logger.debug({ err }, "Refresh token verification failed");
    return null;
  }
}

export function getRefreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

// ─── Phone Verification Token ────────────────────────────────────────────────
// Short-lived token (10 min) issued after a phone OTP is verified.
// Carries the verified phone number so profile-completion can trust it.
export interface PhoneTokenPayload {
  type: "phone_verified";
  phone: string;
}

export function signPhoneToken(phone: string): string {
  const payload: PhoneTokenPayload & { jti: string } = {
    type: "phone_verified",
    phone,
    jti: randomUUID(),
  };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "10m" });
}

export function verifyPhoneToken(token: string): PhoneTokenPayload | null {
  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as any;
    if (payload?.type !== "phone_verified" || !payload.phone) return null;
    return { type: "phone_verified", phone: payload.phone };
  } catch (err) {
    logger.debug({ err }, "Phone token verification failed");
    return null;
  }
}
