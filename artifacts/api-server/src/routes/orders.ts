import { Router } from "express";
import {
  db,
  ordersTable,
  orderStatusHistoryTable,
  usersTable,
  vehicleListingsTable,
  commissionRulesTable,
  commissionsTable,
  permissionsTable,
  userPermissionsTable,
  rolesTable,
  rolePermissionsTable,
  orderDocumentsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, inArray, or, ilike, gte, lte } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";
import { emitToUser } from "../lib/socket";
import { createNotification } from "../lib/notifications";
import { enrichOrders } from "./quotations";

const router = Router();

async function getOrderForUser(orderId: string, userId: string, role: string) {
  const [order] = await db.select({
    id: ordersTable.id, buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId,
  }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return null;
  const isAdmin = role === "admin" || role === "super_admin";
  if (!isAdmin && order.buyerId !== userId && order.sellerId !== userId) return "forbidden" as const;
  return order;
}

// ── Order documents ─────────────────────────────────────────────────────────
router.get("/orders/:orderId/documents", authenticate, requireUuidParams("orderId"), async (req, res) => {
  const user = req.user!;
  const order = await getOrderForUser(req.params.orderId as string, user.userId, user.role);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

  const documents = await db.select({
    id: orderDocumentsTable.id,
    orderId: orderDocumentsTable.orderId,
    fileName: orderDocumentsTable.fileName,
    objectPath: orderDocumentsTable.objectPath,
    documentType: orderDocumentsTable.documentType,
    contentType: orderDocumentsTable.contentType,
    sizeBytes: orderDocumentsTable.sizeBytes,
    uploadedBy: orderDocumentsTable.uploadedBy,
    uploadedAt: orderDocumentsTable.uploadedAt,
  }).from(orderDocumentsTable)
    .where(eq(orderDocumentsTable.orderId, order.id))
    .orderBy(desc(orderDocumentsTable.uploadedAt));
  res.json({ data: documents });
});

router.post("/orders/:orderId/documents", authenticate, requireUuidParams("orderId"), async (req, res) => {
  const user = req.user!;
  if (!["admin", "super_admin"].includes(user.role)) {
    res.status(403).json({ error: "Only admins can upload order documents" });
    return;
  }
  const order = await getOrderForUser(req.params.orderId as string, user.userId, user.role);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

  const { fileName, objectPath, documentType, contentType, sizeBytes } = req.body ?? {};
  if (!fileName || !objectPath) {
    res.status(400).json({ error: "fileName and objectPath are required" });
    return;
  }
  if (typeof objectPath !== "string" || !objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "objectPath must be a private object path" });
    return;
  }
  const [document] = await db.insert(orderDocumentsTable).values({
    orderId: order.id,
    fileName: String(fileName).slice(0, 255),
    objectPath,
    documentType: String(documentType || "other").slice(0, 80),
    contentType: contentType ? String(contentType).slice(0, 160) : null,
    sizeBytes: Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null,
    uploadedBy: user.userId,
  }).returning();
  res.status(201).json(document);
});

router.delete("/orders/:orderId/documents/:documentId", authenticate, requireUuidParams("orderId", "documentId"), async (req, res) => {
  const user = req.user!;
  if (!["admin", "super_admin"].includes(user.role)) {
    res.status(403).json({ error: "Only admins can delete order documents" });
    return;
  }
  const order = await getOrderForUser(req.params.orderId as string, user.userId, user.role);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  if (order === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
  const [document] = await db.select().from(orderDocumentsTable)
    .where(and(eq(orderDocumentsTable.id, req.params.documentId as string), eq(orderDocumentsTable.orderId, order.id)))
    .limit(1);
  if (!document) { res.status(404).json({ error: "Document not found" }); return; }
  await db.delete(orderDocumentsTable).where(eq(orderDocumentsTable.id, document.id));
  // The object is intentionally left in storage; this avoids deleting a file
  // that may still be referenced by an audit/export process.
  res.json({ message: "Document deleted" });
});

// Valid status transitions — key = current status, values = allowed next statuses
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  inquiry: ["quotation_sent", "cancelled"],
  quotation_sent: ["quotation_accepted", "cancelled"],
  quotation_accepted: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_received", "payment_verified", "cancelled"],
  payment_received: ["seller_payment", "payment_verified"],
  payment_verified: ["seller_payment", "in_production"],
  seller_payment: ["documents_preparation"],
  documents_preparation: ["booking_shipping"],
  booking_shipping: ["ready_to_ship"],
  in_production: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["arrived", "delivered"],
  arrived: ["delivered"],
  delivered: ["closed"],
  closed: [],
  cancelled: [],
};

// Human-readable status labels for notifications
const STATUS_LABELS: Record<string, string> = {
  quotation_accepted: "Quotation Accepted",
  awaiting_payment: "Awaiting Payment",
  payment_received: "Payment Received",
  payment_verified: "Payment Verified",
  seller_payment: "Seller Payment",
  documents_preparation: "Documents Preparation",
  booking_shipping: "Booking Shipping",
  in_production: "In Production",
  ready_to_ship: "Ready to Ship",
  shipped: "Shipped",
  arrived: "Arrived",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

// All valid status values for super_admin free-form transition
const ALL_STATUSES = Object.keys(ALLOWED_TRANSITIONS);

// ── Permission helper ─────────────────────────────────────────────────────────
async function hasOrderManagementPermission(userId: string, userRole: string): Promise<boolean> {
  const [roleRows, userRows] = await Promise.all([
    db
      .select({ name: permissionsTable.name })
      .from(rolePermissionsTable)
      .innerJoin(rolesTable, eq(rolePermissionsTable.roleId, rolesTable.id))
      .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
      .where(eq(rolesTable.name, userRole)),
    db
      .select({ name: permissionsTable.name })
      .from(userPermissionsTable)
      .innerJoin(permissionsTable, eq(userPermissionsTable.permissionId, permissionsTable.id))
      .where(eq(userPermissionsTable.userId, userId)),
  ]);
  const allPerms = new Set([...roleRows.map(r => r.name), ...userRows.map(r => r.name)]);
  return allPerms.has("order_management");
}

// ── GET /api/orders ───────────────────────────────────────────────────────────
router.get("/orders", authenticate, async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const isSuperAdmin = user.role === "super_admin";
  const isAdmin = ["super_admin", "admin"].includes(user.role);
  const maxLimit = isAdmin ? 1000 : 50;
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const buyerNameFilter = req.query.buyerName as string | undefined;
  const sellerNameFilter = req.query.sellerName as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const sortParam = (req.query.sort as string | undefined) ?? "newest";
  const commissionTypeFilter = req.query.commissionType as string | undefined;
  const commissionRuleIdFilter = req.query.commissionRuleId as string | undefined;
  const minCommission = req.query.minCommission ? Number(req.query.minCommission) : undefined;
  const maxCommission = req.query.maxCommission ? Number(req.query.maxCommission) : undefined;

  // Non-super admins need order_management permission to see all orders
  if (!isSuperAdmin && user.role === "admin") {
    const hasPerm = await hasOrderManagementPermission(user.userId, user.role);
    if (!hasPerm) {
      res.status(403).json({ error: "Forbidden", message: "Permission 'order_management' is required" });
      return;
    }
  }

  // Resolve general search → matching user IDs (buyer/seller name + order_number)
  let searchClause;
  if (search?.trim()) {
    const pattern = `%${search.trim().toLowerCase()}%`;
    const matchedUsers = await db.execute(
      sql`SELECT id FROM users WHERE LOWER(first_name || ' ' || last_name) LIKE ${pattern}`
    );
    const searchUserIds = (matchedUsers.rows as Array<{ id: string }>).map(r => r.id);
    searchClause = or(
      ilike(ordersTable.orderNumber, `%${search.trim()}%`),
      ...(searchUserIds.length > 0
        ? [inArray(ordersTable.buyerId, searchUserIds), inArray(ordersTable.sellerId, searchUserIds)]
        : [])
    );
  }

  // Admin-only: resolve buyer/seller name filter → specific buyer/seller IDs
  let buyerIdFilter: string[] | undefined;
  let sellerIdFilter: string[] | undefined;
  if (isAdmin) {
    if (buyerNameFilter?.trim()) {
      const pattern = `%${buyerNameFilter.trim().toLowerCase()}%`;
      const rows = await db.execute(
        sql`SELECT id FROM users WHERE LOWER(first_name || ' ' || last_name) LIKE ${pattern}`
      );
      buyerIdFilter = (rows.rows as Array<{ id: string }>).map(r => r.id);
    }
    if (sellerNameFilter?.trim()) {
      const pattern = `%${sellerNameFilter.trim().toLowerCase()}%`;
      const rows = await db.execute(
        sql`SELECT id FROM users WHERE LOWER(first_name || ' ' || last_name) LIKE ${pattern}`
      );
      sellerIdFilter = (rows.rows as Array<{ id: string }>).map(r => r.id);
    }
  }

  // Sort order
  const orderByClause =
    sortParam === "oldest" ? asc(ordersTable.createdAt) :
    sortParam === "highest" ? desc(ordersTable.totalAmountUsd) :
    sortParam === "lowest" ? asc(ordersTable.totalAmountUsd) :
    desc(ordersTable.createdAt); // default: newest

  let whereClause;

  if (isAdmin) {
    const conditions = [
      status ? eq(ordersTable.status, status as any) : undefined,
      searchClause,
      buyerIdFilter !== undefined
        ? (buyerIdFilter.length > 0 ? inArray(ordersTable.buyerId, buyerIdFilter) : sql`false`)
        : undefined,
      sellerIdFilter !== undefined
        ? (sellerIdFilter.length > 0 ? inArray(ordersTable.sellerId, sellerIdFilter) : sql`false`)
        : undefined,
      dateFrom ? gte(ordersTable.createdAt, new Date(dateFrom)) : undefined,
      dateTo ? lte(ordersTable.createdAt, new Date(dateTo + "T23:59:59.999Z")) : undefined,
      commissionTypeFilter ? sql`commission_type = ${commissionTypeFilter}` : undefined,
      commissionRuleIdFilter ? sql`commission_rule_id = ${commissionRuleIdFilter}::uuid` : undefined,
      minCommission !== undefined ? sql`commission_amount_usd >= ${minCommission}` : undefined,
      maxCommission !== undefined ? sql`commission_amount_usd <= ${maxCommission}` : undefined,
    ].filter(Boolean) as Parameters<typeof and>;
    whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  } else if (user.role === "seller") {
    const conditions = [
      eq(ordersTable.sellerId, user.userId),
      status ? eq(ordersTable.status, status as any) : undefined,
      searchClause,
    ].filter(Boolean) as Parameters<typeof and>;
    whereClause = and(...conditions);
  } else {
    const conditions = [
      eq(ordersTable.buyerId, user.userId),
      status ? eq(ordersTable.status, status as any) : undefined,
      searchClause,
    ].filter(Boolean) as Parameters<typeof and>;
    whereClause = and(...conditions);
  }

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(ordersTable)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(ordersTable).where(whereClause),
  ]);

  const enriched = await enrichOrders(rows, user.role);
  res.json({ data: enriched, total: Number(count), page, limit });
});

// ── Shared side-effect helper — runs after any status transition ──────────────
// Handles: status history, commission engine (on 'closed'), notifications,
// and socket emits. The DB update itself must be done by the caller.
async function runOrderStatusSideEffects(opts: {
  orderId: string;
  order: {
    buyerId: string;
    sellerId: string;
    vehicleId: string;
    orderNumber: string | null;
    totalAmountUsd: string | number;
  };
  fromStatus: string;
  newStatus: string;
  changedById: string;
  note: string | null;
  logger?: { error: (obj: object, msg: string) => void };
}): Promise<void> {
  const { orderId, order, fromStatus, newStatus, changedById, note, logger } = opts;

  // 1. Record status history
  await db.insert(orderStatusHistoryTable).values({
    orderId,
    fromStatus: fromStatus as any,
    toStatus: newStatus as any,
    changedById,
    note,
  });

  // 2. Commission engine — only fires on transition to 'closed'
  if (newStatus === "closed") {
    try {
      const [[buyer], [vehicle]] = await Promise.all([
        db.select({ country: usersTable.country }).from(usersTable).where(eq(usersTable.id, order.buyerId)).limit(1),
        db.select({ fuelType: vehicleListingsTable.fuelType }).from(vehicleListingsTable).where(eq(vehicleListingsTable.id, order.vehicleId)).limit(1),
      ]);
      const buyerCountry = buyer?.country ?? null;
      const vehicleCategory = vehicle?.fuelType ?? null;

      const allRules = await db.select().from(commissionRulesTable)
        .where(eq(commissionRulesTable.isActive, true))
        .orderBy(desc(commissionRulesTable.priority));

      const matchedRule = allRules.find(r => r.scope === "seller" && r.scopeValue === order.sellerId)
        ?? allRules.find(r => r.scope === "country" && buyerCountry && r.scopeValue === buyerCountry)
        ?? allRules.find(r => r.scope === "category" && vehicleCategory && r.scopeValue === vehicleCategory)
        ?? allRules.find(r => r.scope === "default");

      if (matchedRule) {
        const totalAmount = Number(order.totalAmountUsd);
        const fixed = Number(matchedRule.fixedAmountUsd ?? 0);
        const pct = Number(matchedRule.percentageRate ?? 0);
        let amountUsd = 0;
        if (matchedRule.type === "fixed") amountUsd = fixed;
        else if (matchedRule.type === "percentage") amountUsd = totalAmount * (pct / 100);
        else if (matchedRule.type === "hybrid") amountUsd = fixed + totalAmount * (pct / 100);

        await db.insert(commissionsTable).values({
          orderId,
          ruleId: matchedRule.id,
          ruleSnapshot: JSON.stringify(matchedRule),
          amountUsd: String(amountUsd.toFixed(2)),
        }).onConflictDoNothing();
      }
    } catch (err) {
      logger?.error({ err }, "Commission engine error on order close");
    }
  }

  // 3. Notifications to both parties
  const orderRef = order.orderNumber ?? orderId.slice(0, 8);
  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus.replace(/_/g, " ");
  await Promise.all([
    createNotification({
      userId: order.buyerId,
      type: "order_update",
      title: `Order status updated`,
      body: `Your order ${orderRef} status has been updated to: ${statusLabel}.`,
      vehicleId: order.vehicleId,
    }),
    createNotification({
      userId: order.sellerId,
      type: "order_update",
      title: `Order status updated`,
      body: `Your order ${orderRef} status has been updated to: ${statusLabel}.`,
      vehicleId: order.vehicleId,
    }),
  ]);

  // 4. Real-time socket events
  emitToUser(order.buyerId, "order:status_updated", { orderId, status: newStatus });
  emitToUser(order.sellerId, "order:status_updated", { orderId, status: newStatus });
}

// ── POST /api/orders/bulk-update ─────────────────────────────────────────────
// NOTE: must come BEFORE /:orderId to avoid "bulk-update" matching as a UUID param
router.post("/orders/bulk-update", authenticate, async (req, res) => {
  const user = req.user!;
  const isSuperAdmin = user.role === "super_admin";
  const isAdmin = ["super_admin", "admin"].includes(user.role);

  if (!isAdmin) {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }

  if (!isSuperAdmin) {
    const hasPerm = await hasOrderManagementPermission(user.userId, user.role);
    if (!hasPerm) {
      res.status(403).json({ error: "Forbidden", message: "Permission 'order_management' is required" });
      return;
    }
  }

  const { orderIds, status: newStatus } = req.body ?? {};

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    res.status(400).json({ error: "Validation error", message: "orderIds must be a non-empty array" });
    return;
  }
  if (orderIds.length > 100) {
    res.status(400).json({ error: "Validation error", message: "Cannot bulk-update more than 100 orders at once" });
    return;
  }
  if (!newStatus || !ALL_STATUSES.includes(newStatus)) {
    res.status(400).json({ error: "Validation error", message: `Invalid status: '${newStatus}'` });
    return;
  }

  // Fetch full order rows so side-effect helper has all fields it needs
  const orders = await db
    .select()
    .from(ordersTable)
    .where(inArray(ordersTable.id, orderIds));

  const results: { orderId: string; success: boolean; error?: string }[] = [];
  const validOrders: (typeof orders)[number][] = [];

  for (const order of orders) {
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (isSuperAdmin || allowed.includes(newStatus)) {
      validOrders.push(order);
      results.push({ orderId: order.id, success: true });
    } else {
      results.push({
        orderId: order.id,
        success: false,
        error: `Cannot transition '${order.status}' → '${newStatus}'. Allowed: ${allowed.join(", ") || "none"}`,
      });
    }
  }

  for (const id of orderIds) {
    if (!orders.find(o => o.id === id)) {
      results.push({ orderId: id, success: false, error: "Order not found" });
    }
  }

  if (validOrders.length > 0) {
    // Bulk DB update
    await db
      .update(ordersTable)
      .set({ status: newStatus as any, updatedAt: new Date() })
      .where(inArray(ordersTable.id, validOrders.map(o => o.id)));

    // Run full side effects (history + commission + notifications + socket) per order
    await Promise.all(
      validOrders.map(order =>
        runOrderStatusSideEffects({
          orderId: order.id,
          order: {
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            vehicleId: order.vehicleId,
            orderNumber: order.orderNumber,
            totalAmountUsd: order.totalAmountUsd,
          },
          fromStatus: order.status,
          newStatus,
          changedById: user.userId,
          note: "Bulk status update by admin",
        })
      )
    );
  }

  res.json({
    updated: validOrders.length,
    skipped: results.filter(r => !r.success).length,
    results,
  });
});

// ── GET /api/orders/export ────────────────────────────────────────────────────
// NOTE: must come BEFORE /:orderId to avoid "export" matching as a UUID param
router.get("/orders/export", authenticate, async (req, res) => {
  const user = req.user!;
  const isSuperAdmin = user.role === "super_admin";
  const isAdmin = ["super_admin", "admin"].includes(user.role);

  if (!isAdmin) {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }

  if (!isSuperAdmin) {
    const hasPerm = await hasOrderManagementPermission(user.userId, user.role);
    if (!hasPerm) {
      res.status(403).json({ error: "Forbidden", message: "Permission 'order_management' is required" });
      return;
    }
  }

  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const buyerNameFilter = req.query.buyerName as string | undefined;
  const sellerNameFilter = req.query.sellerName as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  let searchClause;
  if (search?.trim()) {
    const pattern = `%${search.trim().toLowerCase()}%`;
    const matchedUsers = await db.execute(
      sql`SELECT id FROM users WHERE LOWER(first_name || ' ' || last_name) LIKE ${pattern}`
    );
    const searchUserIds = (matchedUsers.rows as Array<{ id: string }>).map(r => r.id);
    searchClause = or(
      ilike(ordersTable.orderNumber, `%${search.trim()}%`),
      ...(searchUserIds.length > 0
        ? [inArray(ordersTable.buyerId, searchUserIds), inArray(ordersTable.sellerId, searchUserIds)]
        : [])
    );
  }

  let buyerIdFilter: string[] | undefined;
  let sellerIdFilter: string[] | undefined;
  if (buyerNameFilter?.trim()) {
    const pattern = `%${buyerNameFilter.trim().toLowerCase()}%`;
    const rows = await db.execute(
      sql`SELECT id FROM users WHERE LOWER(first_name || ' ' || last_name) LIKE ${pattern}`
    );
    buyerIdFilter = (rows.rows as Array<{ id: string }>).map(r => r.id);
  }
  if (sellerNameFilter?.trim()) {
    const pattern = `%${sellerNameFilter.trim().toLowerCase()}%`;
    const rows = await db.execute(
      sql`SELECT id FROM users WHERE LOWER(first_name || ' ' || last_name) LIKE ${pattern}`
    );
    sellerIdFilter = (rows.rows as Array<{ id: string }>).map(r => r.id);
  }

  const conditions = [
    status ? eq(ordersTable.status, status as any) : undefined,
    searchClause,
    buyerIdFilter !== undefined
      ? (buyerIdFilter.length > 0 ? inArray(ordersTable.buyerId, buyerIdFilter) : sql`false`)
      : undefined,
    sellerIdFilter !== undefined
      ? (sellerIdFilter.length > 0 ? inArray(ordersTable.sellerId, sellerIdFilter) : sql`false`)
      : undefined,
    dateFrom ? gte(ordersTable.createdAt, new Date(dateFrom)) : undefined,
    dateTo ? lte(ordersTable.createdAt, new Date(dateTo + "T23:59:59.999Z")) : undefined,
  ].filter(Boolean) as Parameters<typeof and>;

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(ordersTable)
    .where(whereClause)
    .orderBy(desc(ordersTable.createdAt))
    .limit(5000);

  const enriched = await enrichOrders(rows, user.role);

  function csvCell(val: unknown): string {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const headers = [
    "Order Number", "Buyer", "Seller", "Vehicle",
    "Quantity", "FOB Total (USD)", "Buyer Price (USD)",
    "Commission (USD)", "Status", "Created", "Updated",
  ];

  const csvRows = enriched.map(o => [
    o.orderNumber ?? "",
    (o as any).buyerName ?? o.buyerId,
    (o as any).sellerName ?? o.sellerId,
    (o as any).vehicleTitle ?? o.vehicleId,
    o.quantity,
    (o as any).fobTotalUsd ?? "",
    o.totalAmountUsd,
    (o as any).commissionAmountUsd ?? "",
    o.status,
    new Date(o.createdAt).toISOString().slice(0, 10),
    o.updatedAt ? new Date(o.updatedAt).toISOString().slice(0, 10) : "",
  ].map(csvCell).join(","));

  const csv = [headers.map(csvCell).join(","), ...csvRows].join("\n");

  const filename = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("\uFEFF" + csv); // BOM for Excel UTF-8 compatibility
});

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
router.get("/orders/:orderId", authenticate, requireUuidParams("orderId"), async (req, res) => {
  const user = req.user!;
  const { orderId } = req.params as Record<string, string>;
  const isSuperAdmin = user.role === "super_admin";

  const [order] = await db.select().from(ordersTable)
    .where(eq(ordersTable.id, orderId)).limit(1);

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const isAdmin = ["super_admin", "admin"].includes(user.role);
  if (!isAdmin && order.buyerId !== user.userId && order.sellerId !== user.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // Non-super admins need order_management permission to access the order directly
  if (!isSuperAdmin && user.role === "admin") {
    const hasPerm = await hasOrderManagementPermission(user.userId, user.role);
    if (!hasPerm) {
      res.status(403).json({ error: "Forbidden", message: "Permission 'order_management' is required" });
      return;
    }
  }

  // Fetch status history with changer names
  const history = await db
    .select({
      id: orderStatusHistoryTable.id,
      orderId: orderStatusHistoryTable.orderId,
      fromStatus: orderStatusHistoryTable.fromStatus,
      toStatus: orderStatusHistoryTable.toStatus,
      changedById: orderStatusHistoryTable.changedById,
      note: orderStatusHistoryTable.note,
      createdAt: orderStatusHistoryTable.createdAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(orderStatusHistoryTable)
    .leftJoin(usersTable, eq(orderStatusHistoryTable.changedById, usersTable.id))
    .where(eq(orderStatusHistoryTable.orderId, orderId))
    .orderBy(orderStatusHistoryTable.createdAt);

  const [enriched] = await enrichOrders([order], user.role);
  res.json({
    ...enriched,
    statusHistory: history.map(h => ({
      id: h.id,
      orderId: h.orderId,
      fromStatus: h.fromStatus ?? null,
      toStatus: h.toStatus,
      changedById: h.changedById,
      changedByName: h.firstName ? `${h.firstName} ${h.lastName ?? ""}`.trim() : null,
      note: h.note ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

// ── PATCH /api/orders/:id/status — update order status ────────────────────────
router.patch("/orders/:orderId/status", authenticate, requireUuidParams("orderId"), async (req, res) => {
  const user = req.user!;
  const { orderId } = req.params as Record<string, string>;
  const { status: newStatus, note } = req.body;

  if (!newStatus) { res.status(400).json({ error: "status is required" }); return; }

  const [order] = await db.select().from(ordersTable)
    .where(eq(ordersTable.id, orderId)).limit(1);

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const isSuperAdmin = user.role === "super_admin";
  const isAdmin = ["super_admin", "admin"].includes(user.role);
  const isSeller = user.role === "seller" && order.sellerId === user.userId;

  if (!isAdmin && !isSeller) {
    res.status(403).json({ error: "Only the seller or an admin can update order status" }); return;
  }

  // Non-super admins need order_management permission to update order status
  if (!isSuperAdmin && user.role === "admin") {
    const hasPerm = await hasOrderManagementPermission(user.userId, user.role);
    if (!hasPerm) {
      res.status(403).json({ error: "Forbidden", message: "Permission 'order_management' is required" });
      return;
    }
  }

  // Validate transition:
  // - super_admin can transition to any valid status (bypasses ALLOWED_TRANSITIONS)
  // - others must follow ALLOWED_TRANSITIONS
  if (!isSuperAdmin) {
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      res.status(400).json({
        error: `Cannot transition from '${order.status}' to '${newStatus}'. Allowed: ${allowed.join(", ") || "none"}`,
      });
      return;
    }
  } else if (!ALL_STATUSES.includes(newStatus)) {
    // super_admin still can't set an invalid status value
    res.status(400).json({ error: `Invalid status: '${newStatus}'` });
    return;
  }

  // Update order status
  const [updated] = await db.update(ordersTable)
    .set({ status: newStatus as any, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId))
    .returning();

  // Run all side effects via shared helper (history, commission, notifications, socket)
  await runOrderStatusSideEffects({
    orderId,
    order: {
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      vehicleId: order.vehicleId,
      orderNumber: updated.orderNumber,
      totalAmountUsd: order.totalAmountUsd,
    },
    fromStatus: order.status,
    newStatus,
    changedById: user.userId,
    note: note ?? null,
    logger: req.log,
  });

  // Return full detail
  const history = await db
    .select({
      id: orderStatusHistoryTable.id,
      orderId: orderStatusHistoryTable.orderId,
      fromStatus: orderStatusHistoryTable.fromStatus,
      toStatus: orderStatusHistoryTable.toStatus,
      changedById: orderStatusHistoryTable.changedById,
      note: orderStatusHistoryTable.note,
      createdAt: orderStatusHistoryTable.createdAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(orderStatusHistoryTable)
    .leftJoin(usersTable, eq(orderStatusHistoryTable.changedById, usersTable.id))
    .where(eq(orderStatusHistoryTable.orderId, orderId))
    .orderBy(orderStatusHistoryTable.createdAt);

  const [enriched] = await enrichOrders([updated], user.role);
  res.json({
    ...enriched,
    statusHistory: history.map(h => ({
      id: h.id,
      orderId: h.orderId,
      fromStatus: h.fromStatus ?? null,
      toStatus: h.toStatus,
      changedById: h.changedById,
      changedByName: h.firstName ? `${h.firstName} ${h.lastName ?? ""}`.trim() : null,
      note: h.note ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

export default router;
