import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import {
  usersTable,
  refreshTokensTable,
  vehicleListingsTable,
  ordersTable,
  commissionRulesTable,
  commissionsTable,
  auditLogsTable,
  settingsTable,
  adminProfilesTable,
  rolesTable,
  permissionsTable,
  rolePermissionsTable,
  userPermissionsTable,
  countriesTable,
  portsTable,
  currenciesTable,
} from "@workspace/db";
import {
  eq,
  and,
  ilike,
  desc,
  asc,
  count,
  sql,
  gte,
  lte,
  inArray,
  not,
} from "drizzle-orm";
import { authenticate, requireAdmin, requirePermission } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";

import { createAuditLog } from "../lib/audit";
import { createNotification } from "../lib/notifications";
import { matchAndNotifySavedSearches } from "../lib/match-saved-searches";

// ─── Short-TTL in-memory stats cache ─────────────────────────────────────────
let _statsCache: { data: Record<string, unknown>; expiresAt: number } | null = null;
const STATS_CACHE_TTL_MS = 60_000;

const router = Router();
const SALT_ROUNDS = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden", message: "Super admin access required" });
    return;
  }
  next();
}

// Allows super_admin unconditionally, or any admin/user who holds AT LEAST ONE of the given permissions.
function requireAnyPermission(...permissionNames: string[]) {
  return async (req: any, res: any, next: any) => {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (req.user.role === "super_admin") { next(); return; }
    const userId = req.user.userId as string;
    const userRole = req.user.role as string;
    const [roleRows, userRows] = await Promise.all([
      db.select({ name: permissionsTable.name }).from(rolePermissionsTable)
        .innerJoin(rolesTable, eq(rolePermissionsTable.roleId, rolesTable.id))
        .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
        .where(eq(rolesTable.name, userRole)),
      db.select({ name: permissionsTable.name }).from(userPermissionsTable)
        .innerJoin(permissionsTable, eq(userPermissionsTable.permissionId, permissionsTable.id))
        .where(eq(userPermissionsTable.userId, userId)),
    ]);
    const allPerms = new Set([...roleRows.map(r => r.name), ...userRows.map(r => r.name)]);
    if (permissionNames.some(p => allPerms.has(p))) { next(); return; }
    res.status(403).json({ error: "Forbidden", message: `One of these permissions is required: ${permissionNames.join(", ")}` });
  };
}

function formatRule(r: typeof commissionRulesTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    scope: r.scope,
    scopeValue: r.scopeValue ?? null,
    fixedAmountUsd: r.fixedAmountUsd ? Number(r.fixedAmountUsd) : null,
    percentageRate: r.percentageRate ? Number(r.percentageRate) : null,
    priority: r.priority,
    isActive: r.isActive,
    createdById: r.createdById ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone ?? null,
    country: u.country ?? null,
    isActive: u.isActive,
    isEmailVerified: u.isEmailVerified,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get("/admin/stats", authenticate, requirePermission("view_analytics"), async (req, res) => {
  const now = Date.now();
  if (_statsCache && _statsCache.expiresAt > now) {
    res.json(_statsCache.data);
    return;
  }

  const [
    [{ totalUsers }],
    [{ totalVehicles }],
    [{ totalOrders }],
    [{ totalRevenue }],
    [{ pendingModeration }],
    [{ pendingPayments }],
    [{ activeShipments }],
    [{ commissionRevenue }],
     [{ commissionTotal }],
    [{ shippingRevenue }],
    [{ totalBuyers }],
    [{ buyersWithOrders }],
    ordersByStatusRaw,
    usersByRoleRaw,
    topBrandsRaw,
    topCountriesRaw,
    revenueByMonthRaw,
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(usersTable),
    db.select({ totalVehicles: count() }).from(vehicleListingsTable),
    db.select({ totalOrders: count() }).from(ordersTable),
    db.select({ totalRevenue: sql<number>`coalesce(sum(${ordersTable.totalAmountUsd}::numeric),0)` }).from(ordersTable).where(not(eq(ordersTable.status, "cancelled"))),
    db.select({ pendingModeration: count() }).from(vehicleListingsTable).where(eq(vehicleListingsTable.status, "pending_review")),
    db.select({ pendingPayments: count() }).from(ordersTable).where(eq(ordersTable.status, "awaiting_payment")),
    db.select({ activeShipments: count() }).from(ordersTable).where(sql`${ordersTable.status} in ('shipped','in_production','ready_to_ship','payment_verified')`),
    db.select({ commissionRevenue: sql<number>`coalesce(sum(${commissionsTable.amountUsd}::numeric),0)` }).from(commissionsTable),
     db.select({ commissionTotal: sql<number>`coalesce(sum(${ordersTable.commissionAmountUsd}::numeric),0)` }).from(ordersTable).where(not(eq(ordersTable.status, "cancelled"))),
    // shippingRevenue: estimated as 8% of total order value for shipped/closed orders
    db.select({ shippingRevenue: sql<number>`coalesce(sum(${ordersTable.totalAmountUsd}::numeric * 0.08),0)` }).from(ordersTable).where(sql`${ordersTable.status} in ('shipped','closed','delivered')`),
    db.select({ totalBuyers: count() }).from(usersTable).where(eq(usersTable.role, "buyer")),
    db.select({ buyersWithOrders: sql<number>`count(distinct ${ordersTable.buyerId})` }).from(ordersTable),
    db.select({
      status: ordersTable.status,
      count: count(),
    }).from(ordersTable).groupBy(ordersTable.status),
    db.select({
      role: usersTable.role,
      count: count(),
    }).from(usersTable).groupBy(usersTable.role),
    db.select({
      brand: vehicleListingsTable.brandName,
      count: count(),
    }).from(vehicleListingsTable).groupBy(vehicleListingsTable.brandName).orderBy(desc(count())).limit(10),
    db.select({
      country: usersTable.country,
      count: count(),
    }).from(usersTable).where(and(eq(usersTable.role, "buyer"), sql`${usersTable.country} is not null`)).groupBy(usersTable.country).orderBy(desc(count())).limit(10),
    db.select({
      month: sql<string>`to_char(date_trunc('month', ${ordersTable.createdAt}), 'YYYY-MM')`,
      revenue: sql<number>`coalesce(sum(${ordersTable.totalAmountUsd}::numeric),0)`,
      orders: count(),
    }).from(ordersTable)
      .where(and(
        not(eq(ordersTable.status, "cancelled")),
        gte(ordersTable.createdAt, sql`now() - interval '12 months'`),
      ))
      .groupBy(sql`date_trunc('month', ${ordersTable.createdAt})`)
      .orderBy(asc(sql`date_trunc('month', ${ordersTable.createdAt})`)),
  ]);

  const buyers = Number(totalBuyers);
  const conversionRate = buyers > 0
    ? Math.round((Number(buyersWithOrders) / buyers) * 1000) / 10
    : 0;

  const responseData = {
    totalUsers: Number(totalUsers),
    totalVehicles: Number(totalVehicles),
    totalOrders: Number(totalOrders),
    totalRevenue: Number(totalRevenue),
    shippingRevenue: Number(shippingRevenue),
    commissionRevenue: Number(commissionRevenue),
    commissionTotal: Number(commissionTotal),
    conversionRate,
    pendingModeration: Number(pendingModeration),
    pendingPayments: Number(pendingPayments),
    activeShipments: Number(activeShipments),
    ordersByStatus: ordersByStatusRaw.map(r => ({ status: r.status, count: Number(r.count) })),
    usersByRole: usersByRoleRaw.map(r => ({ role: r.role, count: Number(r.count) })),
    topBrands: topBrandsRaw.map(r => ({ brand: r.brand, count: Number(r.count) })),
    topCountries: topCountriesRaw.map(r => ({ country: r.country ?? "Unknown", count: Number(r.count) })),
    revenueByMonth: revenueByMonthRaw.map(r => ({ month: r.month, revenue: Number(r.revenue), orders: Number(r.orders) })),
  };

  _statsCache = { data: responseData, expiresAt: Date.now() + STATS_CACHE_TTL_MS };
  res.json(responseData);
});

// ─── GET /api/admin/me/permissions ───────────────────────────────────────────
router.get("/admin/me/permissions", authenticate, requireAdmin, async (req, res) => {
  if (req.user!.role === "super_admin") {
    res.json({ permissions: ["*"] });
    return;
  }
  // Merge role-level permissions (assigned to the user's role) with user-level
  // overrides so the portal sees exactly what requirePermission() would grant.
  const [roleRows, userRows] = await Promise.all([
    db
      .select({ name: permissionsTable.name })
      .from(rolePermissionsTable)
      .innerJoin(rolesTable, eq(rolePermissionsTable.roleId, rolesTable.id))
      .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
      .where(eq(rolesTable.name, req.user!.role)),
    db
      .select({ name: permissionsTable.name })
      .from(userPermissionsTable)
      .innerJoin(permissionsTable, eq(userPermissionsTable.permissionId, permissionsTable.id))
      .where(eq(userPermissionsTable.userId, req.user!.userId)),
  ]);
  const merged = Array.from(new Set([...roleRows, ...userRows].map(r => r.name)));
  res.json({ permissions: merged });
});

// ─── GET /api/admin/admins ────────────────────────────────────────────────────
router.get("/admin/admins", authenticate, requireSuperAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;

  const [admins, [{ total }]] = await Promise.all([
    db.select().from(usersTable)
      .where(sql`${usersTable.role} in ('admin','super_admin')`)
      .orderBy(desc(usersTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(usersTable)
      .where(sql`${usersTable.role} in ('admin','super_admin')`),
  ]);

  // Fetch per-user permissions for all admins
  const adminIds = admins.map(a => a.id);
  const permRows = adminIds.length > 0
    ? await db
        .select({ userId: userPermissionsTable.userId, name: permissionsTable.name })
        .from(userPermissionsTable)
        .innerJoin(permissionsTable, eq(userPermissionsTable.permissionId, permissionsTable.id))
        .where(inArray(userPermissionsTable.userId, adminIds))
    : [];

  const permsByUser = permRows.reduce<Record<string, string[]>>((acc, r) => {
    if (!acc[r.userId]) acc[r.userId] = [];
    acc[r.userId].push(r.name);
    return acc;
  }, {});

  // Fetch admin profiles for department
  const profileRows = adminIds.length > 0
    ? await db.select().from(adminProfilesTable).where(inArray(adminProfilesTable.userId, adminIds))
    : [];
  const profilesByUser = profileRows.reduce<Record<string, typeof profileRows[0]>>((acc, p) => {
    acc[p.userId] = p;
    return acc;
  }, {});

  res.json({
    data: admins.map(u => ({
      ...formatUser(u),
      permissions: u.role === "super_admin" ? ["*"] : (permsByUser[u.id] ?? []),
      department: profilesByUser[u.id]?.department ?? null,
    })),
    total: Number(total),
    page,
    limit,
  });
});

// ─── POST /api/admin/admins ───────────────────────────────────────────────────
router.post("/admin/admins", authenticate, requireSuperAdmin, async (req, res) => {
  const { email, firstName, lastName, password, department, permissions = [] } = req.body;

  if (!email || !firstName || !lastName || !password) {
    res.status(400).json({ error: "Validation error", message: "email, firstName, lastName, and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Validation error", message: "Password must be at least 8 characters" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Conflict", message: "Email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const [newUser] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    firstName,
    lastName,
    passwordHash,
    role: "admin",
    isActive: true,
    isEmailVerified: true,
  }).returning();

  // Create admin profile
  await db.insert(adminProfilesTable).values({
    userId: newUser.id,
    department: department ?? null,
  });

  // Assign per-user permissions (not shared role permissions)
  if (permissions.length > 0) {
    const permRows = await db.select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(inArray(permissionsTable.name, permissions as string[]));

    if (permRows.length > 0) {
      await db.insert(userPermissionsTable).values(
        permRows.map(p => ({ userId: newUser.id, permissionId: p.id }))
      ).onConflictDoNothing();
    }
  }

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "ADMIN_CREATED",
    module: "admin",
    details: `Created admin user: ${email}`,
    req,
  });

  res.status(201).json(formatUser(newUser));
});

// ─── POST /api/admin/users — create freight_forwarder / buyer / seller ─────────
router.post("/admin/users", authenticate, requireSuperAdmin, async (req, res) => {
  const { email, firstName, lastName, password, role } = req.body;
  const ALLOWED_ROLES = ["freight_forwarder", "buyer", "seller"];

  if (!email || !firstName || !lastName || !password || !role) {
    res.status(400).json({ error: "Validation error", message: "email, firstName, lastName, password, and role are required" });
    return;
  }
  if (!ALLOWED_ROLES.includes(role)) {
    res.status(400).json({ error: "Validation error", message: `Role must be one of: ${ALLOWED_ROLES.join(", ")}` });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Validation error", message: "Password must be at least 8 characters" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Conflict", message: "Email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const [newUser] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    firstName,
    lastName,
    passwordHash,
    role,
    isActive: true,
    isEmailVerified: true,
  }).returning();

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "USER_CREATED",
    module: "admin",
    details: `Created ${role} user: ${email}`,
    req,
  });

  res.status(201).json(formatUser(newUser));
});

// ─── PATCH /api/admin/admins/:adminId/permissions ─────────────────────────────
router.patch("/admin/admins/:adminId/permissions", authenticate, requireSuperAdmin, requireUuidParams("adminId"), async (req, res) => {
  const { adminId } = req.params as Record<string, string>;
  const { permissions, department } = req.body;

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, adminId as string)).limit(1);
  if (!target || !["admin", "super_admin"].includes(target.role)) {
    res.status(404).json({ error: "Not found", message: "Admin not found" });
    return;
  }

  if (department !== undefined) {
    await db.update(adminProfilesTable)
      .set({ department, updatedAt: new Date() })
      .where(eq(adminProfilesTable.userId, adminId as string));
  }

  // Replace per-user permissions: delete all existing, then insert new set
  if (Array.isArray(permissions)) {
    await db.delete(userPermissionsTable).where(eq(userPermissionsTable.userId, adminId as string));

    if (permissions.length > 0) {
      const permRows = await db.select({ id: permissionsTable.id })
        .from(permissionsTable)
        .where(inArray(permissionsTable.name, permissions as string[]));

      if (permRows.length > 0) {
        await db.insert(userPermissionsTable).values(
          permRows.map(p => ({ userId: adminId as string, permissionId: p.id }))
        ).onConflictDoNothing();
      }
    }
  }

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "ADMIN_PERMISSIONS_UPDATED",
    module: "admin",
    details: `Updated permissions for admin ${target.email}: ${JSON.stringify(permissions)}`,
    req,
  });

  // Return updated user with new permissions
  const updatedPerms = await db
    .select({ name: permissionsTable.name })
    .from(userPermissionsTable)
    .innerJoin(permissionsTable, eq(userPermissionsTable.permissionId, permissionsTable.id))
    .where(eq(userPermissionsTable.userId, adminId as string));

  const [profile] = await db.select().from(adminProfilesTable).where(eq(adminProfilesTable.userId, adminId as string)).limit(1);

  res.json({
    ...formatUser(target),
    permissions: updatedPerms.map(r => r.name),
    department: profile?.department ?? null,
  });
});

// ─── GET /api/commission-rules ────────────────────────────────────────────────
router.get("/commission-rules", authenticate, requireAnyPermission("manage_commissions", "commission_assignment"), async (req, res) => {
  const scope = req.query.scope as string | undefined;
  const isActiveStr = req.query.isActive as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "50", 10)));
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (scope) conditions.push(eq(commissionRulesTable.scope, scope));
  if (isActiveStr !== undefined) conditions.push(eq(commissionRulesTable.isActive, isActiveStr === "true"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rules, [{ total }]] = await Promise.all([
    db.select().from(commissionRulesTable).where(where).orderBy(desc(commissionRulesTable.priority), desc(commissionRulesTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(commissionRulesTable).where(where),
  ]);

  res.json({ data: rules.map(formatRule), total: Number(total), page, limit });
});

// ─── POST /api/commission-rules ───────────────────────────────────────────────
router.post("/commission-rules", authenticate, requireSuperAdmin, async (req, res) => {
  const { name, type, scope, scopeValue, fixedAmountUsd, percentageRate, priority = 0, isActive = true } = req.body;

  if (!name || !type || !scope) {
    res.status(400).json({ error: "Validation error", message: "name, type, and scope are required" });
    return;
  }
  if (!["fixed", "percentage", "hybrid"].includes(type)) {
    res.status(400).json({ error: "Validation error", message: "type must be fixed, percentage, or hybrid" });
    return;
  }
  if (!["default", "seller", "country", "category"].includes(scope)) {
    res.status(400).json({ error: "Validation error", message: "scope must be default, seller, country, or category" });
    return;
  }

  const [rule] = await db.insert(commissionRulesTable).values({
    name,
    type,
    scope,
    scopeValue: scopeValue ?? null,
    fixedAmountUsd: fixedAmountUsd != null ? String(fixedAmountUsd) : null,
    percentageRate: percentageRate != null ? String(percentageRate) : null,
    priority,
    isActive,
    createdById: req.user!.userId,
  }).returning();

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "COMMISSION_RULE_CREATED",
    module: "commission",
    details: `Created rule: ${name}`,
    req,
  });

  res.status(201).json(formatRule(rule));
});

// ─── PATCH /api/commission-rules/:ruleId ──────────────────────────────────────
router.patch("/commission-rules/:ruleId", authenticate, requireSuperAdmin, requireUuidParams("ruleId"), async (req, res) => {
  const { ruleId } = req.params as Record<string, string>;
  const { name, type, scope, scopeValue, fixedAmountUsd, percentageRate, priority, isActive } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  if (scope !== undefined) updates.scope = scope;
  if (scopeValue !== undefined) updates.scopeValue = scopeValue;
  if (fixedAmountUsd !== undefined) updates.fixedAmountUsd = fixedAmountUsd != null ? String(fixedAmountUsd) : null;
  if (percentageRate !== undefined) updates.percentageRate = percentageRate != null ? String(percentageRate) : null;
  if (priority !== undefined) updates.priority = priority;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db.update(commissionRulesTable).set(updates).where(eq(commissionRulesTable.id, ruleId as string)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "COMMISSION_RULE_UPDATED",
    module: "commission",
    details: `Updated rule: ${updated.name}`,
    req,
  });

  res.json(formatRule(updated));
});

// ─── DELETE /api/commission-rules/:ruleId ─────────────────────────────────────
router.delete("/commission-rules/:ruleId", authenticate, requireSuperAdmin, requireUuidParams("ruleId"), async (req, res) => {
  const { ruleId } = req.params as Record<string, string>;

  const [deleted] = await db.delete(commissionRulesTable).where(eq(commissionRulesTable.id, ruleId as string)).returning();
  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "COMMISSION_RULE_DELETED",
    module: "commission",
    details: `Deleted rule: ${deleted.name}`,
    req,
  });

  res.json({ message: "Rule deleted" });
});

// ─── GET /api/audit-logs ──────────────────────────────────────────────────────
router.get("/audit-logs", authenticate, requirePermission("view_audit_logs"), async (req, res) => {
  const { userId, module, action, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || "50", 10)));
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (userId) conditions.push(eq(auditLogsTable.userId, userId));
  if (module) conditions.push(eq(auditLogsTable.module, module));
  if (action) conditions.push(ilike(auditLogsTable.action, `%${action}%`));
  if (dateFrom) conditions.push(gte(auditLogsTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(auditLogsTable.createdAt, new Date(dateTo)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, [{ total }]] = await Promise.all([
    db.select().from(auditLogsTable).where(where).orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(auditLogsTable).where(where),
  ]);

  res.json({
    data: logs.map(l => ({
      id: l.id,
      userId: l.userId ?? null,
      userEmail: l.userEmail ?? null,
      action: l.action,
      module: l.module,
      details: l.details ?? null,
      ipAddress: l.ipAddress ?? null,
      userAgent: l.userAgent ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    total: Number(total),
    page,
    limit,
  });
});

// ─── GET /api/settings ────────────────────────────────────────────────────────
router.get("/settings", authenticate, requirePermission("manage_settings"), async (req, res) => {
  const settings = await db.select().from(settingsTable).orderBy(asc(settingsTable.key));
  res.json(settings.map(s => ({
    id: s.id,
    key: s.key,
    value: s.value,
    description: s.description ?? null,
    updatedAt: s.updatedAt.toISOString(),
  })));
});

// ─── PUT /api/settings/:key ───────────────────────────────────────────────────
router.put("/settings/:key", authenticate, requireSuperAdmin, async (req, res) => {
  const { key } = req.params as Record<string, string>;
  const { value, description } = req.body;

  if (value === undefined) {
    res.status(400).json({ error: "value is required" });
    return;
  }

  // Upsert: update existing or insert new
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key as string)).limit(1);

  let setting;
  if (existing.length > 0) {
    const updates: Record<string, any> = { value, updatedAt: new Date() };
    if (description !== undefined) updates.description = description;
    const [updated] = await db.update(settingsTable).set(updates).where(eq(settingsTable.key, key as string)).returning();
    setting = updated;
  } else {
    const [inserted] = await db.insert(settingsTable).values({ key: key as string, value, description: description ?? null }).returning();
    setting = inserted;
  }

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "SETTING_UPDATED",
    module: "settings",
    details: `Updated setting: ${key} = ${value}`,
    req,
  });

  res.json({
    id: setting.id,
    key: setting.key,
    value: setting.value,
    description: setting.description ?? null,
    updatedAt: setting.updatedAt.toISOString(),
  });
});

// ─── PATCH /api/admin/vehicles/:vehicleId/commission ─────────────────────────
router.patch("/admin/vehicles/:vehicleId/commission", authenticate, requireAnyPermission("commission_assignment"), requireUuidParams("vehicleId"), async (req, res) => {
  const vehicleId = req.params.vehicleId as string;
  const { ruleId } = req.body ?? {};

  if (!ruleId) { res.status(400).json({ error: "ruleId is required" }); return; }

  const [vehicle] = await db.select().from(vehicleListingsTable).where(eq(vehicleListingsTable.id, vehicleId)).limit(1);
  if (!vehicle) { res.status(404).json({ error: "Vehicle not found" }); return; }

  const [rule] = await db.select().from(commissionRulesTable).where(eq(commissionRulesTable.id, ruleId)).limit(1);
  if (!rule) { res.status(404).json({ error: "Commission rule not found" }); return; }
  if (!rule.isActive) { res.status(400).json({ error: "Commission rule is not active" }); return; }

  const [updated] = await db.update(vehicleListingsTable)
    .set({
      commissionRuleId: rule.id,
      commissionType: rule.type,
      commissionValue: rule.type === "fixed"
        ? rule.fixedAmountUsd
        : rule.type === "percentage"
          ? rule.percentageRate
          : rule.percentageRate,
      commissionSnapshot: rule as any,
      updatedAt: new Date(),
    })
    .where(eq(vehicleListingsTable.id, vehicleId as string))
    .returning();

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "VEHICLE_COMMISSION_ASSIGNED",
    module: "vehicles",
    details: `Assigned commission rule "${rule.name}" (${rule.type}) to vehicle ${vehicleId}`,
    req,
  });

  res.json({
    id: updated.id,
    commissionRuleId: updated.commissionRuleId,
    commissionType: updated.commissionType,
    commissionValue: updated.commissionValue,
    commissionSnapshot: updated.commissionSnapshot,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// ─── POST /api/vehicles/:vehicleId/approve ────────────────────────────────────
router.post("/vehicles/:vehicleId/approve", authenticate, requireAnyPermission("commission_assignment"), requireUuidParams("vehicleId"), async (req, res) => {
  const vehicleId = req.params.vehicleId as string;
  const { notes } = req.body ?? {};

  const [vehicle] = await db.select().from(vehicleListingsTable).where(eq(vehicleListingsTable.id, vehicleId)).limit(1);
  if (!vehicle) { res.status(404).json({ error: "Not found" }); return; }

  if (vehicle.status !== "pending_review") {
    res.status(400).json({ error: "Bad request", message: `Listing is not pending review (current: ${vehicle.status})` });
    return;
  }

  if (!vehicle.commissionSnapshot) {
    res.status(422).json({ error: "Commission not assigned", message: "A commission rule must be assigned before approving this listing." });
    return;
  }

  const [updated] = await db.update(vehicleListingsTable)
    .set({ status: "published", rejectionReason: null, updatedAt: new Date() })
    .where(eq(vehicleListingsTable.id, vehicleId as string))
    .returning();

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "VEHICLE_APPROVED",
    module: "vehicles",
    details: `Approved vehicle listing ${vehicleId}${notes ? `: ${notes}` : ""}`,
    req,
  });

  // Notify seller
  await createNotification({
    userId: vehicle.sellerId,
    type: "listing_approved",
    title: "Listing Approved",
    body: `Your listing "${vehicle.brandName} ${vehicle.modelName} ${vehicle.year}" has been approved and is now live.`,
    vehicleId: vehicleId as string,
  });

  // Fire-and-forget: notify buyers whose saved searches match this vehicle
  matchAndNotifySavedSearches(updated).catch(err =>
    console.error("[approve] matchAndNotifySavedSearches error:", err)
  );

  res.json({
    id: updated.id,
    brandName: updated.brandName,
    modelName: updated.modelName,
    year: updated.year,
    status: updated.status,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// ─── POST /api/vehicles/:vehicleId/reject ─────────────────────────────────────
router.post("/vehicles/:vehicleId/reject", authenticate, requirePermission("manage_listings"), requireUuidParams("vehicleId"), async (req, res) => {
  const vehicleId = req.params.vehicleId as string;
  const { rejectionReason } = req.body ?? {};

  if (!rejectionReason) {
    res.status(400).json({ error: "Validation error", message: "rejectionReason is required" });
    return;
  }

  const [vehicle] = await db.select().from(vehicleListingsTable).where(eq(vehicleListingsTable.id, vehicleId as string)).limit(1);
  if (!vehicle) { res.status(404).json({ error: "Not found" }); return; }

  if (vehicle.status !== "pending_review") {
    res.status(400).json({ error: "Bad request", message: `Listing is not pending review (current: ${vehicle.status})` });
    return;
  }

  const [updated] = await db.update(vehicleListingsTable)
    .set({ status: "rejected", rejectionReason, updatedAt: new Date() })
    .where(eq(vehicleListingsTable.id, vehicleId as string))
    .returning();

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "VEHICLE_REJECTED",
    module: "vehicles",
    details: `Rejected vehicle listing ${vehicleId}: ${rejectionReason}`,
    req,
  });

  // Notify seller
  await createNotification({
    userId: vehicle.sellerId,
    type: "listing_rejected",
    title: "Listing Rejected",
    body: `Your listing "${vehicle.brandName} ${vehicle.modelName} ${vehicle.year}" was rejected. Reason: ${rejectionReason}`,
    vehicleId: vehicleId as string,
  });

  res.json({
    id: updated.id,
    brandName: updated.brandName,
    modelName: updated.modelName,
    year: updated.year,
    status: updated.status,
    rejectionReason: updated.rejectionReason,
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// ─── GET /api/admin/moderation-queue ─────────────────────────────────────────
router.get("/admin/moderation-queue", authenticate, requireAnyPermission("manage_listings", "commission_assignment"), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;

  const [vehicles, [{ total }]] = await Promise.all([
    db.select().from(vehicleListingsTable)
      .where(eq(vehicleListingsTable.status, "pending_review"))
      .orderBy(asc(vehicleListingsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(vehicleListingsTable)
      .where(eq(vehicleListingsTable.status, "pending_review")),
  ]);

  res.json({
    data: vehicles.map(v => ({
      id: v.id,
      brandName: v.brandName,
      modelName: v.modelName,
      year: v.year,
      fuelType: v.fuelType,
      condition: v.condition,
      fobPriceUsd: v.fobPriceUsd ? Number(v.fobPriceUsd) : null,
      status: v.status,
      sellerId: v.sellerId,
      commissionRuleId: v.commissionRuleId ?? null,
      commissionType: v.commissionType ?? null,
      commissionValue: v.commissionValue ? Number(v.commissionValue) : null,
      commissionSnapshot: v.commissionSnapshot ?? null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    })),
    total: Number(total),
    page,
    limit,
  });
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get("/admin/users", authenticate, requirePermission("manage_users"), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const role = req.query.role as string | undefined;
  const search = req.query.search as string | undefined;

  const conditions: ReturnType<typeof eq>[] = [];
  if (role) conditions.push(eq(usersTable.role, role as any));
  if (search) {
    conditions.push(
      sql`(${usersTable.email} ILIKE ${`%${search}%`} OR ${usersTable.firstName} ILIKE ${`%${search}%`} OR ${usersTable.lastName} ILIKE ${`%${search}%`})` as any,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [users, [{ total }]] = await Promise.all([
    db.select().from(usersTable).where(where).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(usersTable).where(where),
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

// ─── PATCH /api/admin/users/:userId/status ───────────────────────────────────
router.patch("/admin/users/:userId/status", authenticate, requirePermission("manage_users"), requireUuidParams("userId"), async (req, res) => {
  const { userId } = req.params as { userId: string };
  const { isActive, reason } = req.body ?? {};
  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive (boolean) is required" });
    return;
  }

  // Fetch target before mutating to enforce role guards
  const [target] = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
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
    res.status(404).json({ error: "User not found" });
    return;
  }

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
    isActive: updated.isActive,
    createdAt: updated.createdAt.toISOString(),
  });
});

// ─── DELETE /api/admin/users/:userId ─────────────────────────────────────────
router.delete("/admin/users/:userId", authenticate, requireSuperAdmin, requireUuidParams("userId"), async (req, res) => {
  const { userId } = req.params as { userId: string };

  if (userId === req.user!.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const [target] = await db.select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.role === "super_admin") {
    res.status(403).json({ error: "Cannot delete a super_admin account" });
    return;
  }

  await db.update(usersTable)
    .set({ isActive: false, email: `deleted_${userId}@deleted`, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  // Revoke all refresh tokens so the deleted user can no longer re-authenticate
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, userId));

  await createAuditLog({
    userId: req.user!.userId,
    userEmail: req.user!.email,
    action: "USER_DELETED",
    module: "users",
    details: `Deleted user ${userId}`,
    req,
  });

  res.json({ message: "User deactivated and anonymised" });
});

// ─── REFERENCE DATA — Countries ───────────────────────────────────────────────
router.get("/admin/reference/countries", authenticate, requirePermission("manage_settings"), async (_req, res) => {
  const rows = await db.select().from(countriesTable).orderBy(asc(countriesTable.name));
  res.json(rows);
});

router.post("/admin/reference/countries", authenticate, requirePermission("manage_settings"), async (req, res) => {
  const { name, code, region, isActive } = req.body ?? {};
  if (!name || !code) { res.status(400).json({ error: "name and code required" }); return; }
  const [row] = await db.insert(countriesTable).values({ name, code: code.toUpperCase(), region, isActive: isActive ?? true }).returning();
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "COUNTRY_CREATED", module: "reference", details: `${name} (${code.toUpperCase()})`, req });
  res.status(201).json(row);
});

router.patch("/admin/reference/countries/:id", authenticate, requirePermission("manage_settings"), requireUuidParams("id"), async (req, res) => {
  const { id } = req.params as { id: string };
  const { name, code, region, isActive } = req.body ?? {};
  const [row] = await db.update(countriesTable)
    .set({ ...(name && { name }), ...(code && { code: code.toUpperCase() }), ...(region !== undefined && { region }), ...(isActive !== undefined && { isActive }) })
    .where(eq(countriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "COUNTRY_UPDATED", module: "reference", details: `id=${id}`, req });
  res.json(row);
});

router.delete("/admin/reference/countries/:id", authenticate, requirePermission("manage_settings"), requireUuidParams("id"), async (req, res) => {
  const { id } = req.params as { id: string };
  await db.delete(countriesTable).where(eq(countriesTable.id, id));
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "COUNTRY_DELETED", module: "reference", details: `id=${id}`, req });
  res.json({ message: "Deleted" });
});

// ─── REFERENCE DATA — Ports ───────────────────────────────────────────────────
router.get("/admin/reference/ports", authenticate, requirePermission("manage_settings"), async (_req, res) => {
  const rows = await db.select().from(portsTable).orderBy(asc(portsTable.name));
  res.json(rows);
});

router.post("/admin/reference/ports", authenticate, requirePermission("manage_settings"), async (req, res) => {
  const { name, code, countryId, city, portType, isActive } = req.body ?? {};
  if (!name || !code) { res.status(400).json({ error: "name and code required" }); return; }
  const [row] = await db.insert(portsTable).values({ name, code: code.toUpperCase(), countryId, city, portType: portType ?? "sea", isActive: isActive ?? true }).returning();
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "PORT_CREATED", module: "reference", details: `${name} (${code.toUpperCase()})`, req });
  res.status(201).json(row);
});

router.patch("/admin/reference/ports/:id", authenticate, requirePermission("manage_settings"), requireUuidParams("id"), async (req, res) => {
  const { id } = req.params as { id: string };
  const { name, code, countryId, city, portType, isActive } = req.body ?? {};
  const [row] = await db.update(portsTable)
    .set({ ...(name && { name }), ...(code && { code: code.toUpperCase() }), ...(countryId !== undefined && { countryId }), ...(city !== undefined && { city }), ...(portType && { portType }), ...(isActive !== undefined && { isActive }) })
    .where(eq(portsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "PORT_UPDATED", module: "reference", details: `id=${id}`, req });
  res.json(row);
});

router.delete("/admin/reference/ports/:id", authenticate, requirePermission("manage_settings"), requireUuidParams("id"), async (req, res) => {
  const { id } = req.params as { id: string };
  await db.delete(portsTable).where(eq(portsTable.id, id));
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "PORT_DELETED", module: "reference", details: `id=${id}`, req });
  res.json({ message: "Deleted" });
});

// ─── REFERENCE DATA — Currencies ─────────────────────────────────────────────
router.get("/admin/reference/currencies", authenticate, requirePermission("manage_settings"), async (_req, res) => {
  const rows = await db.select().from(currenciesTable).orderBy(asc(currenciesTable.name));
  res.json(rows);
});

router.post("/admin/reference/currencies", authenticate, requirePermission("manage_settings"), async (req, res) => {
  const { name, code, symbol, isActive } = req.body ?? {};
  if (!name || !code || !symbol) { res.status(400).json({ error: "name, code, and symbol required" }); return; }
  const [row] = await db.insert(currenciesTable).values({ name, code: code.toUpperCase(), symbol, isActive: isActive ?? true }).returning();
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "CURRENCY_CREATED", module: "reference", details: `${name} (${code.toUpperCase()})`, req });
  res.status(201).json(row);
});

router.patch("/admin/reference/currencies/:id", authenticate, requirePermission("manage_settings"), requireUuidParams("id"), async (req, res) => {
  const { id } = req.params as { id: string };
  const { name, code, symbol, isActive } = req.body ?? {};
  const [row] = await db.update(currenciesTable)
    .set({ ...(name && { name }), ...(code && { code: code.toUpperCase() }), ...(symbol && { symbol }), ...(isActive !== undefined && { isActive }) })
    .where(eq(currenciesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "CURRENCY_UPDATED", module: "reference", details: `id=${id}`, req });
  res.json(row);
});

router.delete("/admin/reference/currencies/:id", authenticate, requirePermission("manage_settings"), requireUuidParams("id"), async (req, res) => {
  const { id } = req.params as { id: string };
  await db.delete(currenciesTable).where(eq(currenciesTable.id, id));
  await createAuditLog({ userId: req.user!.userId, userEmail: req.user!.email, action: "CURRENCY_DELETED", module: "reference", details: `id=${id}`, req });
  res.json({ message: "Deleted" });
});

export default router;
