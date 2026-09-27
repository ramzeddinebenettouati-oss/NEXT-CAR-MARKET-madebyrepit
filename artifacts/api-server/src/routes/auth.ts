import { Router } from "express";
import bcrypt from "bcrypt";
import { createHash, randomBytes, randomUUID } from "crypto";
import { db, usersTable, refreshTokensTable, buyerProfilesTable, sellerProfilesTable, passwordResetTokensTable } from "@workspace/db";
import { phoneOtpsTable } from "@workspace/db/schema";
import { eq, and, sql, isNull, gt } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  RefreshTokenBody,
} from "@workspace/api-zod";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiry, signPhoneToken, verifyPhoneToken } from "../lib/jwt";
import { authenticate } from "../middlewares/auth";
import { createAuditLog } from "../lib/audit";
import { clearSession, getSessionId } from "../lib/auth";
import { sendSms } from "../lib/sms";
import { sendPasswordResetEmail } from "../lib/mailer";

const router = Router();
const SALT_ROUNDS = 12;
const APP_URL = process.env.APP_URL ?? "https://autocango.replit.app";

function appOrigin(req: { protocol: string; get(name: string): string | undefined }): string {
  return process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
}

function credentialValue(name: string): string {
  let value = process.env[name]?.trim() ?? "";
  const assignmentPrefix = `${name}=`;
  if (value.startsWith(assignmentPrefix)) value = value.slice(assignmentPrefix.length).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function googleOAuthConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = credentialValue("GOOGLE_CLIENT_ID");
  const clientSecret = credentialValue("GOOGLE_CLIENT_SECRET");
  const validClientId = /^[^\s]+\.apps\.googleusercontent\.com$/i.test(clientId);

  return validClientId && clientSecret ? { clientId, clientSecret } : null;
}

function wechatOAuthConfig(): { appId: string; appSecret: string } | null {
  const appId = credentialValue("WECHAT_APP_ID");
  const appSecret = credentialValue("WECHAT_APP_SECRET");
  const validAppId = /^wx[a-z0-9]{16}$/i.test(appId);

  return validAppId && appSecret ? { appId, appSecret } : null;
}

router.get("/auth/google", async (req, res) => {
  const config = googleOAuthConfig();
  if (!config) {
    console.error("[google] OAuth is unavailable: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is invalid");
    res.redirect(`${appOrigin(req)}/login?error=google_config`);
    return;
  }

  const role = req.query.role === "seller" ? "seller" : "buyer";
  const state = randomBytes(24).toString("hex");
  res.cookie("google_oauth_state", `${state}:${role}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${appOrigin(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/auth/google/callback", async (req, res) => {
  const config = googleOAuthConfig();
  if (!config) {
    res.redirect(`${appOrigin(req)}/login?error=google_config`);
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const saved = req.cookies?.google_oauth_state as string | undefined;
  res.clearCookie("google_oauth_state");
  if (!code || !saved || !saved.startsWith(`${state}:`)) { res.redirect(`${appOrigin(req)}/login?error=google_state`); return; }
  try {
    const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokens = await tokenResponse.json() as { access_token?: string };
    if (!tokens.access_token) throw new Error("Google token exchange failed");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json() as { sub?: string; email?: string; given_name?: string; family_name?: string; email_verified?: boolean };
    if (!profile.sub || !profile.email) throw new Error("Google profile is incomplete");
    const role = saved.split(":")[1] as "buyer" | "seller";
    let [user] = await db.select().from(usersTable).where(eq(usersTable.googleSub, profile.sub)).limit(1);
    if (!user) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.email, profile.email.toLowerCase())).limit(1);
    }
    if (!user) {
      [user] = await db.insert(usersTable).values({
        email: profile.email.toLowerCase(), passwordHash: await bcrypt.hash(randomUUID(), SALT_ROUNDS),
        role, firstName: profile.given_name || "Google", lastName: profile.family_name || "User",
        signupMethod: "google", googleSub: profile.sub, isEmailVerified: profile.email_verified ?? false, isActive: true,
      }).returning();
      if (role === "buyer") await db.insert(buyerProfilesTable).values({ userId: user.id });
      else await db.insert(sellerProfilesTable).values({ userId: user.id, companyName: "My Company", city: "Shanghai" });
    } else if (!user.isActive) throw new Error("Account suspended");
    if (!user.googleSub) await db.update(usersTable).set({ googleSub: profile.sub, isEmailVerified: profile.email_verified ?? user.isEmailVerified }).where(eq(usersTable.id, user.id));
    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload), refreshToken = signRefreshToken(payload);
    await db.insert(refreshTokensTable).values({ userId: user.id, token: refreshToken, expiresAt: getRefreshTokenExpiry() });
    res.redirect(`${appOrigin(req)}/auth/google-callback?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`);
  } catch (error) {
    console.error("[google] OAuth callback failed", error);
    res.redirect(`${appOrigin(req)}/login?error=google_failed`);
  }
});

router.get("/auth/wechat", async (req, res) => {
  const config = wechatOAuthConfig();
  if (!config) {
    console.error("[wechat] OAuth is unavailable: WECHAT_APP_ID or WECHAT_APP_SECRET is invalid");
    res.redirect(`${appOrigin(req)}/login?error=wechat_config`);
    return;
  }

  const role = req.query.role === "seller" ? "seller" : "buyer";
  const state = randomBytes(24).toString("hex");
  res.cookie("wechat_oauth_state", `${state}:${role}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60 * 1000 });
  const redirectUri = `${appOrigin(req)}/api/auth/wechat/callback`;
  const params = new URLSearchParams({ appid: config.appId, redirect_uri: redirectUri, response_type: "code", scope: "snsapi_login", state });
  res.redirect(`https://open.weixin.qq.com/connect/qrconnect?${params}#wechat_redirect`);
});

router.get("/auth/wechat/callback", async (req, res) => {
  const config = wechatOAuthConfig();
  if (!config) {
    res.redirect(`${appOrigin(req)}/login?error=wechat_config`);
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const saved = req.cookies?.wechat_oauth_state as string | undefined;
  res.clearCookie("wechat_oauth_state");
  if (!code || !saved || !saved.startsWith(`${state}:`)) { res.redirect(`${appOrigin(req)}/login?error=wechat_state`); return; }
  try {
    const tokenRes = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(config.appId)}&secret=${encodeURIComponent(config.appSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`);
    const token = await tokenRes.json() as { openid?: string; access_token?: string; errcode?: number; errmsg?: string };
    if (!token.openid || !token.access_token) throw new Error(`WeChat token exchange failed (${token.errcode ?? "unknown"})`);
    const infoRes = await fetch(`https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(token.access_token)}&openid=${encodeURIComponent(token.openid)}&lang=en`);
    const info = await infoRes.json() as { nickname?: string; headimgurl?: string };
    const role = saved.split(":")[1] as "buyer" | "seller";
    let [user] = await db.select().from(usersTable).where(eq(usersTable.wechatOpenId, token.openid)).limit(1);
    if (!user) {
      const name = (info.nickname || "WeChat User").trim();
      [user] = await db.insert(usersTable).values({ email: `wechat_${token.openid}@wechat.nextcarmarket.internal`, passwordHash: await bcrypt.hash(randomUUID(), SALT_ROUNDS), role, firstName: name, lastName: "", signupMethod: "wechat", wechatOpenId: token.openid, isActive: true }).returning();
      if (role === "buyer") await db.insert(buyerProfilesTable).values({ userId: user.id });
      else await db.insert(sellerProfilesTable).values({ userId: user.id, companyName: "My Company", city: "Shanghai" });
    } else if (!user.isActive) throw new Error("Account suspended");
    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload), refreshToken = signRefreshToken(payload);
    await db.insert(refreshTokensTable).values({ userId: user.id, token: refreshToken, expiresAt: getRefreshTokenExpiry() });
    res.redirect(`${appOrigin(req)}/auth/wechat-callback?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`);
  } catch (error) {
    console.error("[wechat] OAuth callback failed", error);
    res.redirect(`${appOrigin(req)}/login?error=wechat_failed`);
  }
});

router.post("/auth/forgot-password", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const generic = { message: "If an account exists for that email, a password reset link has been sent." };
  if (!email) { res.status(200).json(generic); return; }
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await db.delete(passwordResetTokensTable).where(eq(passwordResetTokensTable.userId, user.id));
    await db.insert(passwordResetTokensTable).values({
      userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await sendPasswordResetEmail(user.email, `${APP_URL}/reset-password?token=${rawToken}`);
  }
  res.status(200).json(generic);
});

router.post("/auth/reset-password", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!token || password.length < 8) {
    res.status(400).json({ error: "Invalid reset request", message: "The reset token or password is invalid." }); return;
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await db.transaction(async (tx) => {
    const [record] = await tx.select().from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, tokenHash)).limit(1);

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      return "invalid-token" as const;
    }

    const [user] = await tx.select().from(usersTable)
      .where(and(eq(usersTable.id, record.userId), eq(usersTable.isActive, true))).limit(1);
    if (!user) {
      return "inactive-account" as const;
    }

    // Claim the token as part of the same transaction as the password update.
    // The state predicates make concurrent requests one-time use even when
    // both requests read the token before either transaction commits.
    const now = new Date();
    const [claimed] = await tx.update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(and(
        eq(passwordResetTokensTable.id, record.id),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, now),
      ))
      .returning({ id: passwordResetTokensTable.id });
    if (!claimed) {
      return "invalid-token" as const;
    }

    await tx.update(usersTable)
      .set({ passwordHash: await bcrypt.hash(password, SALT_ROUNDS), updatedAt: now })
      .where(eq(usersTable.id, user.id));
    await tx.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, user.id));
    return "success" as const;
  });

  if (result === "invalid-token") {
    res.status(400).json({ error: "Invalid reset token", message: "This reset link is expired or has already been used." });
    return;
  }
  if (result === "inactive-account") {
    res.status(400).json({ error: "Invalid reset request", message: "This account cannot reset its password." });
    return;
  }
  res.json({ message: "Password updated successfully." });
});

// ─── OTP helpers ─────────────────────────────────────────────────────────────
const E164_RE = /^\+[1-9]\d{6,14}$/;

function generateOtp(): string {
  // 6-digit numeric OTP (zero-padded)
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-otp-secret";
  return createHash("sha256").update(otp + secret).digest("hex");
}

function otpExpiresAt(): Date {
  return new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
}

// POST /api/auth/register
router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error", message: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }

  const { email, password, role, firstName, lastName, phone, country, companyName, signupMethod } = parsed.data;

  if (!["buyer", "seller"].includes(role)) {
    res.status(400).json({ error: "Invalid role", message: "Can only self-register as buyer or seller" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Conflict", message: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    passwordHash,
    role: role as "buyer" | "seller",
    firstName,
    lastName,
    phone: phone?.trim() || null,
    country: country?.trim() || null,
    signupMethod: (signupMethod as "email" | "phone" | "google" | "wechat") ?? "email",
    isActive: true,
  }).returning();

  // Create role-specific profile
  if (role === "buyer") {
    await db.insert(buyerProfilesTable).values({
      userId: user.id,
      companyName: companyName ?? null,
      country: country ?? null,
    });
  } else if (role === "seller") {
    await db.insert(sellerProfilesTable).values({
      userId: user.id,
      companyName: companyName ?? "My Company",
      city: "Shanghai",
    });
  }

  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getRefreshTokenExpiry(),
  });

  await createAuditLog({ userId: user.id, userEmail: user.email, action: "USER_REGISTERED", module: "auth", req });

  res.status(201).json({ accessToken, refreshToken, user: serializeUser(user) });
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Clean up old tokens: keep at most 4 existing tokens (the new one will make 5 total).
  // This prevents token accumulation from repeated logins without explicit logout.
  await db.execute(
    sql`DELETE FROM refresh_tokens WHERE user_id = ${user.id}
        AND id NOT IN (
          SELECT id FROM refresh_tokens WHERE user_id = ${user.id}
          ORDER BY created_at DESC LIMIT 4
        )`
  );

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getRefreshTokenExpiry(),
  });

  // Update last login
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  await createAuditLog({ userId: user.id, userEmail: user.email, action: "USER_LOGIN", module: "auth", req });

  res.json({ accessToken, refreshToken, user: serializeUser({ ...user, lastLoginAt: new Date() }) });
});

// POST /api/auth/logout
router.post("/auth/logout", authenticate, async (req, res) => {
  const user = req.user!;
  // Invalidate all refresh tokens for this user
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, user.userId));
  // Also clear Replit OIDC session cookie if present
  const sid = getSessionId(req);
  if (sid) await clearSession(res, sid);
  await createAuditLog({ userId: user.userId, userEmail: user.email, action: "USER_LOGOUT", module: "auth", req });
  res.json({ message: "Logged out successfully" });
});

// POST /api/auth/refresh
router.post("/auth/refresh", async (req, res) => {
  const parsed = RefreshTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const { refreshToken } = parsed.data;
  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid refresh token" });
    return;
  }

  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(and(eq(refreshTokensTable.token, refreshToken), eq(refreshTokensTable.userId, payload.userId)))
    .limit(1);

  if (!stored || stored.expiresAt < new Date()) {
    res.status(401).json({ error: "Unauthorized", message: "Refresh token expired or not found" });
    return;
  }

  // Reject if the user has been suspended since the token was issued
  const [activeUser] = await db.select({ isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
  if (!activeUser || !activeUser.isActive) {
    await db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, payload.userId));
    res.status(401).json({ error: "Unauthorized", message: "Account is suspended" });
    return;
  }

  const newAccessToken = signAccessToken({ userId: payload.userId, email: payload.email, role: payload.role });
  const newRefreshToken = signRefreshToken({ userId: payload.userId, email: payload.email, role: payload.role });

  // Rotate refresh token
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.id, stored.id));
  await db.insert(refreshTokensTable).values({
    userId: payload.userId,
    token: newRefreshToken,
    expiresAt: getRefreshTokenExpiry(),
  });

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// ─── Shared user serialiser ──────────────────────────────────────────────────
function serializeUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    country: u.country,
    signupMethod: u.signupMethod,
    preferredLanguage: u.preferredLanguage ?? null,
    isActive: u.isActive,
    isEmailVerified: u.isEmailVerified,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

// GET /api/auth/me
router.get("/auth/me", authenticate, async (req, res) => {
  const user = req.user!;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId)).limit(1);
  if (!dbUser) { res.status(401).json({ error: "User not found" }); return; }
  res.json(serializeUser(dbUser));
});

// PATCH /api/auth/me
router.patch("/auth/me", authenticate, async (req, res) => {
  const user = req.user!;
  const { firstName, lastName, country, preferredLanguage } = req.body ?? {};

  const VALID_LANGS = ["en","zh","es","fr","ar","ru","pt","de","ja","ko"];

  if (preferredLanguage !== undefined && preferredLanguage !== null && !VALID_LANGS.includes(preferredLanguage)) {
    res.status(400).json({ error: "Validation error", message: "Unsupported language code" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (firstName?.trim()) updates.firstName = firstName.trim();
  if (lastName?.trim())  updates.lastName  = lastName.trim();
  if (country !== undefined)          updates.country           = country?.trim() || null;
  if (preferredLanguage !== undefined) updates.preferredLanguage = preferredLanguage ?? null;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, user.userId))
    .returning();

  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(serializeUser(updated));
});

// ─── POST /api/auth/phone/request-otp ────────────────────────────────────────
router.post("/auth/phone/request-otp", async (req, res) => {
  const { phone } = req.body ?? {};

  if (!phone || typeof phone !== "string" || !E164_RE.test(phone.trim())) {
    res.status(400).json({ error: "Validation error", message: "Phone must be in E.164 format (e.g. +8613800138000)" });
    return;
  }

  const normalizedPhone = phone.trim();
  const otp = generateOtp();
  const otpHash = hashOtp(otp);

  // Delete expired / already-verified OTPs for this phone to keep the table clean
  await db.delete(phoneOtpsTable).where(
    and(
      eq(phoneOtpsTable.phone, normalizedPhone),
      // Delete any that are expired or already verified
      sql`(${phoneOtpsTable.expiresAt} < now() OR ${phoneOtpsTable.verified} = true)`
    )
  );

  await db.insert(phoneOtpsTable).values({
    phone: normalizedPhone,
    otpHash,
    expiresAt: otpExpiresAt(),
  });

  const smsBody = `Your AutoCango verification code is: ${otp}. Expires in 5 minutes.`;
  const { devMode } = await sendSms(normalizedPhone, smsBody);

  const isDev = process.env.NODE_ENV !== "production";
  res.json({
    message: devMode
      ? "OTP generated (dev mode — Twilio not configured)"
      : "OTP sent via SMS",
    // devOtp is ONLY exposed in non-production environments to prevent
    // phone possession bypass if Twilio is accidentally unconfigured in prod
    ...(devMode && isDev ? { devOtp: otp } : {}),
  });
});

// ─── POST /api/auth/phone/verify ─────────────────────────────────────────────
router.post("/auth/phone/verify", async (req, res) => {
  const { phone, otp } = req.body ?? {};

  if (!phone || typeof phone !== "string" || !E164_RE.test(phone.trim())) {
    res.status(400).json({ error: "Validation error", message: "Invalid phone number" });
    return;
  }
  if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ error: "Validation error", message: "OTP must be 6 digits" });
    return;
  }

  const normalizedPhone = phone.trim();

  // Find the most recent unverified, unexpired OTP for this phone
  const [record] = await db
    .select()
    .from(phoneOtpsTable)
    .where(
      and(
        eq(phoneOtpsTable.phone, normalizedPhone),
        eq(phoneOtpsTable.verified, false),
        sql`${phoneOtpsTable.expiresAt} > now()`
      )
    )
    .orderBy(sql`${phoneOtpsTable.createdAt} DESC`)
    .limit(1);

  if (!record) {
    res.status(400).json({ error: "Invalid OTP", message: "OTP not found or expired. Please request a new code." });
    return;
  }

  if (record.attempts >= 5) {
    res.status(400).json({ error: "Too many attempts", message: "Too many incorrect attempts. Please request a new code." });
    return;
  }

  const expectedHash = hashOtp(otp);
  if (record.otpHash !== expectedHash) {
    await db
      .update(phoneOtpsTable)
      .set({ attempts: record.attempts + 1 })
      .where(eq(phoneOtpsTable.id, record.id));
    const remaining = 5 - (record.attempts + 1);
    res.status(400).json({ error: "Invalid OTP", message: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
    return;
  }

  // Mark OTP as used
  await db.update(phoneOtpsTable).set({ verified: true }).where(eq(phoneOtpsTable.id, record.id));

  // Check if a user whose PRIMARY sign-in method is this phone exists.
  // We deliberately exclude email-registered users who may have a phone field
  // stored from other flows — they cannot log in via OTP until they explicitly
  // link their phone (task #88). This also prevents account mix-up in the
  // (now impossible post-unique-constraint) edge case of two accounts sharing
  // the same phone value.
  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.phone, normalizedPhone), eq(usersTable.signupMethod, "phone")))
    .orderBy(sql`${usersTable.createdAt} ASC`)
    .limit(1);

  if (existingUser) {
    if (!existingUser.isActive) {
      res.status(401).json({ error: "Unauthorized", message: "Account is suspended" });
      return;
    }

    const payload = { userId: existingUser.id, email: existingUser.email, role: existingUser.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await db.insert(refreshTokensTable).values({
      userId: existingUser.id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiry(),
    });
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, existingUser.id));
    await createAuditLog({ userId: existingUser.id, userEmail: existingUser.email, action: "USER_LOGIN", module: "auth", req });

    res.json({
      needsProfile: false,
      accessToken,
      refreshToken,
      user: serializeUser({ ...existingUser, lastLoginAt: new Date() }),
    });
    return;
  }

  // New user — issue a phone verification token so the frontend can complete registration
  const phoneToken = signPhoneToken(normalizedPhone);
  res.json({ needsProfile: true, phoneToken });
});

// ─── POST /api/auth/phone/complete ───────────────────────────────────────────
router.post("/auth/phone/complete", async (req, res) => {
  const { phoneToken, role, firstName, lastName, companyName, email } = req.body ?? {};

  const tokenPayload = verifyPhoneToken(phoneToken ?? "");
  if (!tokenPayload) {
    res.status(400).json({ error: "Invalid token", message: "Phone verification token is missing or expired. Please start again." });
    return;
  }

  if (!["buyer", "seller"].includes(role)) {
    res.status(400).json({ error: "Validation error", message: "Role must be buyer or seller" });
    return;
  }
  if (!firstName?.trim() || !lastName?.trim() || !companyName?.trim()) {
    res.status(400).json({ error: "Validation error", message: "First name, last name, and company name are required" });
    return;
  }

  const verifiedPhone = tokenPayload.phone;

  // Double-check phone isn't already registered (race condition guard)
  const [alreadyExists] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, verifiedPhone))
    .limit(1);
  if (alreadyExists) {
    res.status(409).json({ error: "Conflict", message: "An account with this phone number already exists" });
    return;
  }

  // Determine email — use provided or generate a phone-based placeholder
  const normalizedEmail = email?.trim().toLowerCase() ||
    `phone_${verifiedPhone.replace(/\+/g, "").replace(/\s/g, "")}@phone.nextcarmarket.internal`;

  // Check email uniqueness if a real email was provided
  if (email?.trim()) {
    const [emailExists] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);
    if (emailExists) {
      res.status(409).json({ error: "Conflict", message: "Email already registered" });
      return;
    }
  }

  // Random password hash — phone users never log in via email+password
  const passwordHash = await bcrypt.hash(randomUUID(), SALT_ROUNDS);

  const [user] = await db.insert(usersTable).values({
    email: normalizedEmail,
    passwordHash,
    role: role as "buyer" | "seller",
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: verifiedPhone,
    signupMethod: "phone",
    isActive: true,
  }).returning();

  if (role === "buyer") {
    await db.insert(buyerProfilesTable).values({
      userId: user.id,
      companyName: companyName.trim() ?? null,
    });
  } else {
    await db.insert(sellerProfilesTable).values({
      userId: user.id,
      companyName: companyName.trim() || "My Company",
      city: "Shanghai",
    });
  }

  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getRefreshTokenExpiry(),
  });

  await createAuditLog({ userId: user.id, userEmail: user.email, action: "USER_REGISTERED", module: "auth", req });

  res.status(201).json({ accessToken, refreshToken, user: serializeUser(user) });
});

export default router;
