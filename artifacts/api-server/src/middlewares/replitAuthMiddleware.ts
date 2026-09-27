import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import {
  clearSession,
  getOidcConfig,
  getSession,
  updateSession,
  SESSION_COOKIE,
  type SessionData,
  type SessionUser,
} from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      replitUser?: SessionUser;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function replitAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.replitUser = refreshed.user;
  next();
}
