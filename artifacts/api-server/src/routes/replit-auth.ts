import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, refreshTokensTable, buyerProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSession,
  getSessionId,
  createSession,
  deleteSession,
  updateSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
  type SessionUser,
} from "../lib/auth";
import { signAccessToken, signRefreshToken, getRefreshTokenExpiry, verifyAccessToken } from "../lib/jwt";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

async function upsertReplitUser(claims: Record<string, unknown>): Promise<typeof usersTable.$inferSelect> {
  const sub = claims.sub as string;
  const claimedEmail = (claims.email as string | undefined)?.toLowerCase() ?? null;
  const firstName = (claims.first_name as string) || (claims.given_name as string) || "Replit";
  const lastName = (claims.last_name as string) || (claims.family_name as string) || "User";

  // Primary identity lookup: by Replit sub (durable OIDC subject)
  const [existingBySub] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.replitSub, sub))
    .limit(1);

  if (existingBySub) {
    return existingBySub;
  }

  // Determine a safe email: use claimed email only if it is not already owned by another account
  let email = `replit_${sub}@autocango.internal`;
  if (claimedEmail) {
    const [emailTaken] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, claimedEmail))
      .limit(1);
    if (!emailTaken) {
      email = claimedEmail;
    }
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: `$replit$${sub}`,
      replitSub: sub,
      role: "buyer",
      firstName,
      lastName,
      isActive: true,
    })
    .returning();

  await db.insert(buyerProfilesTable).values({
    userId: user.id,
    companyName: null,
    country: null,
  }).catch(() => {});

  return user;
}

router.get("/auth/session-tokens", async (req: Request, res: Response) => {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (!sid) {
    res.status(401).json({ error: "No session" });
    return;
  }

  const session = await getSession(sid);
  if (!session?.jwt_access_token) {
    res.status(401).json({ error: "No pending token exchange" });
    return;
  }

  const { jwt_access_token, jwt_refresh_token } = session;

  // Clear one-time tokens from session immediately after reading
  const { jwt_access_token: _a, jwt_refresh_token: _r, ...remaining } = session;
  await updateSession(sid, remaining as typeof session);

  res.json({ accessToken: jwt_access_token, refreshToken: jwt_refresh_token });
});

router.get("/auth/user", async (req: Request, res: Response) => {
  // 1. Replit OIDC session takes precedence
  if (req.replitUser) {
    res.json({ user: req.replitUser });
    return;
  }

  // 2. Fall back to JWT-authenticated user (email/password flow)
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      const [dbUser] = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);
      if (dbUser) {
        res.json({
          user: {
            id: dbUser.id,
            email: dbUser.email,
            firstName: dbUser.firstName,
            lastName: dbUser.lastName,
            profileImageUrl: null,
          },
        });
        return;
      }
    }
  }

  res.json({ user: null });
});

router.get("/login", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const redirectTo = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile offline_access",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login consent",
      state,
      nonce,
    });

    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);

    res.redirect(redirectTo.href);
  } catch (err) {
    res.redirect("/login");
  }
});

router.get("/callback", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;

    const codeVerifier = req.cookies?.code_verifier;
    const nonce = req.cookies?.nonce;
    const expectedState = req.cookies?.state;

    if (!codeVerifier || !expectedState) {
      res.redirect("/login");
      return;
    }

    const currentUrl = new URL(
      `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
    );

    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedNonce: nonce,
        expectedState,
        idTokenExpected: true,
      });
    } catch {
      res.clearCookie("code_verifier", { path: "/" });
      res.clearCookie("nonce", { path: "/" });
      res.clearCookie("state", { path: "/" });
      res.redirect("/login");
      return;
    }

    res.clearCookie("code_verifier", { path: "/" });
    res.clearCookie("nonce", { path: "/" });
    res.clearCookie("state", { path: "/" });

    const claims = tokens.claims();
    if (!claims) {
      res.redirect("/login");
      return;
    }

    const dbUser = await upsertReplitUser(claims as unknown as Record<string, unknown>);

    const now = Math.floor(Date.now() / 1000);
    const sessionUser: SessionUser = {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: null,
    };

    const sessionData: SessionData = {
      user: sessionUser,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    };

    const jwtPayload = { userId: dbUser.id, email: dbUser.email, role: dbUser.role };
    const accessToken = signAccessToken(jwtPayload);
    const refreshToken = signRefreshToken(jwtPayload);

    await db.insert(refreshTokensTable).values({
      userId: dbUser.id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
    });

    // Store JWT tokens in session for one-time browser exchange (avoids tokens in URL)
    sessionData.jwt_access_token = accessToken;
    sessionData.jwt_refresh_token = refreshToken;

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, dbUser.id));

    res.redirect("/auth/replit-callback");
  } catch (err) {
    res.redirect("/login");
  }
});

router.get("/logout", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const origin = getOrigin(req);

    const sid = getSessionId(req);
    await clearSession(res, sid);

    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID!,
      post_logout_redirect_uri: origin,
    });

    res.redirect(endSessionUrl.href);
  } catch {
    res.redirect("/");
  }
});

router.post("/mobile-auth/token-exchange", async (req: Request, res: Response) => {
  const { code, code_verifier, redirect_uri, state, nonce } = req.body;

  if (!code || !code_verifier || !redirect_uri || !state) {
    res.status(400).json({ error: "Missing or invalid required parameters" });
    return;
  }

  try {
    const config = await getOidcConfig();

    const callbackUrl = new URL(redirect_uri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("iss", ISSUER_URL);

    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: code_verifier,
      expectedNonce: nonce ?? undefined,
      expectedState: state,
      idTokenExpected: true,
    });

    const claims = tokens.claims();
    if (!claims) {
      res.status(401).json({ error: "No claims in ID token" });
      return;
    }

    const dbUser = await upsertReplitUser(claims as unknown as Record<string, unknown>);

    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: null,
      },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    };

    const sid = await createSession(sessionData);
    res.json({ token: sid });
  } catch (err) {
    res.status(500).json({ error: "Token exchange failed" });
  }
});

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json({ success: true });
});

export default router;
