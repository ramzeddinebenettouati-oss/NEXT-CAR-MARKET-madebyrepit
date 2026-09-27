import { Router } from "express";
import { db, usersTable, refreshTokensTable } from "@workspace/db";
import { eq, ilike, or, count, sql, and } from "drizzle-orm";
import { authenticate, requireAdmin, requirePermission } from "../middlewares/auth";
import { createAuditLog } from "../lib/audit";
import {
  UpdateUserBody,
  UpdateUserParams,
  SuspendUserParams,
  SuspendUserBody,
  ListUsersQueryParams,
  GetUserParams,
} from "@workspace/api-zod";

const router = Router();

// GET /api/users — admin must have manage_users permission
router.get("/users", authenticate, requirePermission("manage_users"), async (req, res) => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { role, isActive, search, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (role) conditions.push(eq(usersTable.role, role as any));
  if (isActive !== undefined) conditions.push(eq(usersTable.isActive, isActive));
  if (search) {
    conditions.push(
      or(
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.firstName, `%${search}%`),
        ilike(usersTable.lastName, `%${search}%`),
      ) as any
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [users, [{ count: total }]] = await Promise.all([
    db.select().from(usersTable).where(whereClause).limit(limit).offset(offset).orderBy(sql`${usersTable.createdAt} DESC`),
    db.select({ count: count() }).from(usersTable).where(whereClause),
  ]);

  res.json({
    data: users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      country: u.country,
      signupMethod: u.signupMethod,
      isActive: u.isActive,
      isEmailVerified: u.isEmailVerified,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    total: Number(total),
    page,
    limit,
  });
});

// GET /api/users/:userId — admin must have seller:manage permission
router.get("/users/:userId", authenticate, requirePermission("seller:manage"), async (req, res) => {
  const parsed = GetUserParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "Not found", message: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    country: user.country,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  });
});

// PATCH /api/users/:userId — self-edit always allowed; cross-user edits require manage_users permission
router.patch("/users/:userId", authenticate, async (req, res) => {
  const paramsParsed = UpdateUserParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const { userId } = paramsParsed.data;
  const user = req.user!;

  // Cross-user edits require explicit manage_users permission (not just any admin role)
  if (user.userId !== userId) {
    const isSuperAdmin = user.role === "super_admin";
    const perms: string[] = (user as any).permissions ?? [];
    const hasManageUsers = isSuperAdmin || perms.includes("manage_users");
    if (!hasManageUsers) {
      res.status(403).json({ error: "Forbidden", message: "manage_users permission required" });
      return;
    }
  }

  const bodyParsed = UpdateUserBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ ...bodyParsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    firstName: updated.firstName,
    lastName: updated.lastName,
    phone: updated.phone,
    country: updated.country,
    isActive: updated.isActive,
    isEmailVerified: updated.isEmailVerified,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

// POST /api/users/:userId/suspend — requires manage_users permission
router.post("/users/:userId/suspend", authenticate, requirePermission("manage_users"), async (req, res) => {
  const paramsParsed = SuspendUserParams.safeParse(req.params);
  const bodyParsed = SuspendUserBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { userId } = paramsParsed.data;
  const { isActive, reason } = bodyParsed.data;

  // Fetch target to enforce role guard before mutating
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Non-super-admins cannot change status of super_admin accounts
  if (target.role === "super_admin" && req.user!.role !== "super_admin") {
    res.status(403).json({ error: "Cannot modify a super_admin account" });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Revoke all refresh tokens immediately when suspending so the user cannot re-authenticate
  if (!isActive) {
    await db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, userId));
  }

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: isActive ? "USER_ACTIVATED" : "USER_SUSPENDED",
    module: "users",
    details: reason ?? undefined,
    req,
  });

  res.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    firstName: updated.firstName,
    lastName: updated.lastName,
    phone: updated.phone,
    country: updated.country,
    isActive: updated.isActive,
    isEmailVerified: updated.isEmailVerified,
    lastLoginAt: updated.lastLoginAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
