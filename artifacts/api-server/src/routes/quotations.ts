import { Router } from "express";
import {
  db,
  quotationsTable,
  ordersTable,
  orderStatusHistoryTable,
  vehicleListingsTable,
  vehicleImagesTable,
  usersTable,
  permissionsTable,
  userPermissionsTable,
  rolesTable,
  rolePermissionsTable,
  messagesTable,
  conversationsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";
import { scrubContactInfo } from "../lib/contact-protection";
import { emitToUser, emitToConversation } from "../lib/socket";
import { createNotification } from "../lib/notifications";

async function hasManageQuotationsPermission(userId: string, userRole: string): Promise<boolean> {
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
  return allPerms.has("manage_quotations");
}

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeTotal(
  quantity: number,
  unitPrice: number,
  shipping?: number | null,
  inspection?: number | null,
  other?: number | null
): number {
  return quantity * unitPrice + (shipping ?? 0) + (inspection ?? 0) + (other ?? 0);
}

async function enrichQuotations(rows: (typeof quotationsTable.$inferSelect)[], userRole?: string) {
  if (rows.length === 0) return [];
  const isAdminRole = userRole === "admin" || userRole === "super_admin";
  const isSellerRole = userRole === "seller";

  const quotationIds = rows.map(r => r.id);
  const vehicleIds = [...new Set(rows.map(r => r.vehicleId))];
  const buyerIds = [...new Set(rows.map(r => r.buyerId))];
  const sellerIds = [...new Set(rows.map(r => r.sellerId))];
  const allUserIds = [...new Set([...buyerIds, ...sellerIds])];

  const [vehicles, images, users, relatedOrders] = await Promise.all([
    db.select({ id: vehicleListingsTable.id, brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName, year: vehicleListingsTable.year })
      .from(vehicleListingsTable).where(inArray(vehicleListingsTable.id, vehicleIds)),
    db.select({ vehicleId: vehicleImagesTable.vehicleId, url: vehicleImagesTable.url, isPrimary: vehicleImagesTable.isPrimary })
      .from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, vehicleIds)),
    db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(inArray(usersTable.id, allUserIds)),
    db.select({ quotationId: ordersTable.quotationId, orderId: ordersTable.id })
      .from(ordersTable).where(inArray(ordersTable.quotationId, quotationIds)),
  ]);

  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
  const imageMap = new Map<string, string>();
  for (const img of images) {
    if (img.isPrimary && !imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }
  for (const img of images) {
    if (!imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }
  const userMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const orderByQuotationMap = new Map(relatedOrders.filter(o => o.quotationId).map(o => [o.quotationId!, o.orderId]));

  return rows.map(q => {
    const v = vehicleMap.get(q.vehicleId);
    const unit = Number(q.unitPriceUsd);
    const shipping = q.shippingFeeUsd ? Number(q.shippingFeeUsd) : null;
    const inspection = q.inspectionFeeUsd ? Number(q.inspectionFeeUsd) : null;
    const other = q.otherFeesUsd ? Number(q.otherFeesUsd) : null;
    const subTotal = computeTotal(q.quantity, unit, shipping, inspection, other);
    const commissionAmt = (q as any).commissionAmountUsd ? Number((q as any).commissionAmountUsd) : 0;
    const buyerTotal = subTotal + commissionAmt;
    return {
      id: q.id,
      quotationNumber: (q as any).quotationNumber ?? null,
      conversationId: q.conversationId ?? null,
      orderId: orderByQuotationMap.get(q.id) ?? null,
      vehicleId: q.vehicleId,
      vehicleTitle: v ? `${v.year} ${v.brandName} ${v.modelName}` : null,
      vehicleBrand: v?.brandName ?? null,
      vehiclePrimaryImage: imageMap.get(q.vehicleId) ?? null,
      buyerId: q.buyerId,
      buyerName: userMap.get(q.buyerId) ?? null,
      sellerId: q.sellerId,
      sellerName: userMap.get(q.sellerId) ?? null,
      quantity: q.quantity,
      unitPriceUsd: unit,
      shippingFeeUsd: shipping,
      inspectionFeeUsd: inspection,
      otherFeesUsd: other,
      // Seller sees their sub-total (no commission mark-up visible);
      // buyer and admin both see the final buyer price (sub-total + commission).
      totalAmountUsd: isSellerRole ? subTotal : buyerTotal,
      notes: q.notes ?? null,
      status: q.status,
      expiresAt: q.expiresAt.toISOString(),
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
      // Commission: seller sees type/value/amount (no rule id); admin also gets ruleId + fobTotalUsd.
      ...(isAdminRole || isSellerRole ? {
        commissionType: (q as any).commissionType ?? null,
        commissionValue: (q as any).commissionValue ? Number((q as any).commissionValue) : null,
        commissionAmountUsd: commissionAmt || null,
      } : {}),
      ...(isAdminRole ? {
        commissionRuleId: (q as any).commissionRuleId ?? null,
        fobTotalUsd: subTotal,
      } : {}),
    };
  });
}

// ── POST /api/quotations — seller creates a quotation ────────────────────────
router.post("/quotations", authenticate, async (req, res) => {
  const user = req.user!;
  if (!["seller", "admin", "super_admin"].includes(user.role)) {
    res.status(403).json({ error: "Only sellers can create quotations" });
    return;
  }

  const {
    vehicleId, buyerId, conversationId,
    quantity, unitPriceUsd, shippingFeeUsd, inspectionFeeUsd, otherFeesUsd,
    notes, expiresAt,
  } = req.body;

  if (!vehicleId || !buyerId || !quantity || !unitPriceUsd || !expiresAt) {
    res.status(400).json({ error: "Missing required fields: vehicleId, buyerId, quantity, unitPriceUsd, expiresAt" });
    return;
  }

  // Sellers can only quote on their own vehicles
  const [vehicle] = await db.select({
    id: vehicleListingsTable.id,
    sellerId: vehicleListingsTable.sellerId,
    fobPriceUsd: vehicleListingsTable.fobPriceUsd,
    commissionRuleId: vehicleListingsTable.commissionRuleId,
    commissionType: vehicleListingsTable.commissionType,
    commissionValue: vehicleListingsTable.commissionValue,
    commissionSnapshot: vehicleListingsTable.commissionSnapshot,
  }).from(vehicleListingsTable).where(eq(vehicleListingsTable.id, vehicleId)).limit(1);

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const isAdmin = ["admin", "super_admin"].includes(user.role);
  if (!isAdmin && vehicle.sellerId !== user.userId) {
    res.status(403).json({ error: "You can only quote on your own vehicles" });
    return;
  }

  const scrubbedNotes = notes ? scrubContactInfo(notes) : null;

  // Auto-populate commission from vehicle's assigned commission snapshot
  let commissionType: string | null = null;
  let commissionValue: string | null = null;
  let commissionAmountUsd: string | null = null;

  if (vehicle.commissionSnapshot && vehicle.commissionType) {
    const vsnap = vehicle.commissionSnapshot as any;
    const qty = Number(quantity);
    const unit = Number(unitPriceUsd);
    const shipping = shippingFeeUsd ? Number(shippingFeeUsd) : 0;
    const inspection = inspectionFeeUsd ? Number(inspectionFeeUsd) : 0;
    const other = otherFeesUsd ? Number(otherFeesUsd) : 0;
    const total = qty * unit + shipping + inspection + other;

    commissionType = vehicle.commissionType;
    commissionValue = vehicle.commissionValue ?? null;

    const fixed = Number(vsnap.fixedAmountUsd ?? 0);
    const pct = Number(vsnap.percentageRate ?? 0);
    let amount = 0;
    if (vsnap.type === "fixed") amount = fixed;
    else if (vsnap.type === "percentage") amount = total * (pct / 100);
    else if (vsnap.type === "hybrid") amount = fixed + total * (pct / 100);
    commissionAmountUsd = amount.toFixed(2);
  }

  const [q] = await db.insert(quotationsTable).values({
    vehicleId,
    buyerId,
    sellerId: isAdmin ? vehicle.sellerId : user.userId,
    conversationId: conversationId ?? null,
    quantity: Number(quantity),
    unitPriceUsd: String(unitPriceUsd),
    shippingFeeUsd: shippingFeeUsd ? String(shippingFeeUsd) : null,
    inspectionFeeUsd: inspectionFeeUsd ? String(inspectionFeeUsd) : null,
    otherFeesUsd: otherFeesUsd ? String(otherFeesUsd) : null,
    notes: scrubbedNotes,
    expiresAt: new Date(expiresAt),
    quotationNumber: sql`'QT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('quotation_number_seq')::TEXT, 6, '0')`,
    commissionRuleId: vehicle.commissionRuleId ?? null,
    commissionType,
    commissionValue,
    commissionAmountUsd,
  } as any).returning();

  // Notify buyer
  await createNotification({
    userId: buyerId,
    type: "new_inquiry",
    title: "New Quotation Received",
    body: `You have received a quotation for ${quantity}x vehicle. Please review and accept or reject.`,
    vehicleId,
  });
  emitToUser(buyerId, "notification:new", { type: "new_inquiry" });

  const [enriched] = await enrichQuotations([q], user.role);
  res.status(201).json(enriched);
});

// ── GET /api/quotations — list (role-scoped) ──────────────────────────────────
router.get("/quotations", authenticate, async (req, res) => {
  const user = req.user!;

  if (user.role === "admin") {
    const hasPerm = await hasManageQuotationsPermission(user.userId, user.role);
    if (!hasPerm) {
      res.status(403).json({ error: "Forbidden", message: "Permission 'manage_quotations' is required" });
      return;
    }
  }

  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const isAdminRole = ["super_admin", "admin"].includes(user.role);
  const maxLimit = isAdminRole ? 1000 : 50;
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;
  const commissionTypeFilter = req.query.commissionType as string | undefined;
  const commissionRuleIdFilter = req.query.commissionRuleId as string | undefined;
  const minCommission = req.query.minCommission ? Number(req.query.minCommission) : undefined;
  const maxCommission = req.query.maxCommission ? Number(req.query.maxCommission) : undefined;

  let whereClause;
  if (["super_admin", "admin"].includes(user.role)) {
    const adminConditions = [
      status ? eq(quotationsTable.status, status as any) : undefined,
      commissionTypeFilter ? sql`commission_type = ${commissionTypeFilter}` : undefined,
      commissionRuleIdFilter ? sql`commission_rule_id = ${commissionRuleIdFilter}::uuid` : undefined,
      minCommission !== undefined ? sql`commission_amount_usd >= ${minCommission}` : undefined,
      maxCommission !== undefined ? sql`commission_amount_usd <= ${maxCommission}` : undefined,
    ].filter(Boolean) as Parameters<typeof and>;
    whereClause = adminConditions.length > 0 ? and(...adminConditions) : undefined;
  } else if (user.role === "seller") {
    whereClause = status
      ? and(eq(quotationsTable.sellerId, user.userId), eq(quotationsTable.status, status as any))
      : eq(quotationsTable.sellerId, user.userId);
  } else {
    whereClause = status
      ? and(eq(quotationsTable.buyerId, user.userId), eq(quotationsTable.status, status as any))
      : eq(quotationsTable.buyerId, user.userId);
  }

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(quotationsTable)
      .where(whereClause)
      .orderBy(desc(quotationsTable.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(quotationsTable).where(whereClause),
  ]);

  const enriched = await enrichQuotations(rows, user.role);
  res.json({ data: enriched, total: Number(count), page, limit });
});

// ── GET /api/quotations/:id ───────────────────────────────────────────────────
router.get("/quotations/:quotationId", authenticate, requireUuidParams("quotationId"), async (req, res) => {
  const user = req.user!;

  if (user.role === "admin") {
    const hasPerm = await hasManageQuotationsPermission(user.userId, user.role);
    if (!hasPerm) {
      res.status(403).json({ error: "Forbidden", message: "Permission 'manage_quotations' is required" });
      return;
    }
  }

  const { quotationId } = req.params as Record<string, string>;

  const [q] = await db.select().from(quotationsTable)
    .where(eq(quotationsTable.id, quotationId)).limit(1);

  if (!q) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }

  const isAdmin = ["super_admin", "admin"].includes(user.role);
  if (!isAdmin && q.buyerId !== user.userId && q.sellerId !== user.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [enriched] = await enrichQuotations([q], user.role);
  res.json(enriched);
});

// ── POST /api/quotations/:id/accept — buyer accepts ───────────────────────────
router.post("/quotations/:quotationId/accept", authenticate, requireUuidParams("quotationId"), async (req, res) => {
  const user = req.user!;
  const { quotationId } = req.params as Record<string, string>;

  const [q] = await db.select().from(quotationsTable)
    .where(eq(quotationsTable.id, quotationId)).limit(1);

  if (!q) { res.status(404).json({ error: "Quotation not found" }); return; }
  // A buyer accepts a seller quotation. A seller may accept only a
  // buyer-originated quotation (a counter-offer sent in chat).
  let isSellerAcceptingCounter = false;
  if (q.sellerId === user.userId) {
    const [quotationMessage] = await db.select({ senderId: messagesTable.senderId })
      .from(messagesTable)
      .where(and(eq(messagesTable.quotationId, quotationId), eq(messagesTable.messageType, "quotation")))
      .limit(1);
    isSellerAcceptingCounter = quotationMessage?.senderId === q.buyerId;
  }
  if (q.buyerId !== user.userId && !isSellerAcceptingCounter) {
    res.status(403).json({ error: "Only the quotation recipient can accept this quotation" }); return;
  }
  if (q.status !== "pending") { res.status(400).json({ error: `Quotation is already ${q.status}` }); return; }
  if (new Date() > q.expiresAt) { res.status(400).json({ error: "Quotation has expired" }); return; }

  // Update quotation status
  await db.update(quotationsTable)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(quotationsTable.id, quotationId));

  // Compute total (FOB sub-total from quotation line items)
  const unit = Number(q.unitPriceUsd);
  const shipping = q.shippingFeeUsd ? Number(q.shippingFeeUsd) : 0;
  const inspection = q.inspectionFeeUsd ? Number(q.inspectionFeeUsd) : 0;
  const other = q.otherFeesUsd ? Number(q.otherFeesUsd) : 0;
  const fobSubTotal = computeTotal(q.quantity, unit, shipping || null, inspection || null, other || null);

  // Commission was snapshotted at quotation creation; copy it immutably to the order
  const commissionAmt = (q as any).commissionAmountUsd ? Number((q as any).commissionAmountUsd) : 0;
  // Buyer's total = FOB sub-total + commission mark-up
  const buyerTotal = fobSubTotal + commissionAmt;

  // Generate order number (ORD-YYYY-XXXXXX) using a PostgreSQL sequence for race safety
  const seqResult = await db.execute(sql`SELECT nextval('order_number_seq') AS n`);
  const year = new Date().getFullYear();
  const orderNumber = `ORD-${year}-${String(Number(seqResult.rows[0].n)).padStart(6, "0")}`;

  // Create order — copy commission fields from quotation (immutable snapshot)
  const [order] = await db.insert(ordersTable).values({
    orderNumber,
    quotationId: q.id,
    vehicleId: q.vehicleId,
    buyerId: q.buyerId,
    sellerId: q.sellerId,
    quantity: q.quantity,
    unitPriceUsd: q.unitPriceUsd,
    shippingFeeUsd: q.shippingFeeUsd ?? null,
    inspectionFeeUsd: q.inspectionFeeUsd ?? null,
    otherFeesUsd: q.otherFeesUsd ?? null,
    totalAmountUsd: String(buyerTotal),
    status: "quotation_accepted",
    notes: q.notes ?? null,
    commissionRuleId: (q as any).commissionRuleId ?? null,
    commissionType: (q as any).commissionType ?? null,
    commissionValue: (q as any).commissionValue ?? null,
    commissionAmountUsd: (q as any).commissionAmountUsd ?? null,
  } as any).returning();

  // Record initial status history
  await db.insert(orderStatusHistoryTable).values({
    orderId: order.id,
    fromStatus: null,
    toStatus: "quotation_accepted",
    changedById: user.userId,
    note: "Order created from accepted quotation",
  });

  const acceptingBuyer = q.buyerId === user.userId;
  const recipientId = acceptingBuyer ? q.sellerId : q.buyerId;
  const acceptanceBody = acceptingBuyer
    ? "Buyer has accepted your quotation. An order has been created."
    : "Seller has accepted your counter-offer. An order has been created.";

  // Notify the other participant
  await createNotification({
    userId: recipientId,
    type: "order_update",
    title: "Quotation Accepted",
    body: acceptanceBody,
    vehicleId: q.vehicleId,
  });
  emitToUser(recipientId, "notification:new", { type: "order_update" });

  // Post a system message to the conversation thread
  if (q.conversationId) {
    const [sysMsg] = await db.insert(messagesTable).values({
      conversationId: q.conversationId,
      senderId: q.buyerId,
      body: acceptanceBody,
      messageType: "system",
    } as any).returning();

    await db.update(conversationsTable).set({
      lastMessageAt: new Date(),
      lastMessagePreview: acceptanceBody,
    }).where(eq(conversationsTable.id, q.conversationId));

    const sysMsgPayload = {
      id: sysMsg.id,
      conversationId: q.conversationId,
      senderId: q.buyerId,
      senderName: null,
      body: sysMsg.body,
      messageType: "system",
      quotationId: null,
      quotation: null,
      attachments: [],
      createdAt: sysMsg.createdAt.toISOString(),
      readAt: null,
      wasScrubbedAt: null,
    };
    emitToConversation(q.conversationId, "message:new", sysMsgPayload);
  }

  // Return the new order with enrichment
  const [enriched] = await enrichOrders([order], user.role);
  res.status(201).json(enriched);
});

// ── POST /api/quotations/:id/reject — buyer rejects ───────────────────────────
router.post("/quotations/:quotationId/reject", authenticate, requireUuidParams("quotationId"), async (req, res) => {
  const user = req.user!;
  const { quotationId } = req.params as Record<string, string>;

  const [q] = await db.select().from(quotationsTable)
    .where(eq(quotationsTable.id, quotationId)).limit(1);

  if (!q) { res.status(404).json({ error: "Quotation not found" }); return; }
  if (q.buyerId !== user.userId) { res.status(403).json({ error: "Only the buyer can reject this quotation" }); return; }
  if (q.status !== "pending") { res.status(400).json({ error: `Quotation is already ${q.status}` }); return; }

  const [updated] = await db.update(quotationsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(quotationsTable.id, quotationId))
    .returning();

  // Notify seller
  await createNotification({
    userId: q.sellerId,
    type: "order_update",
    title: "Quotation Rejected",
    body: `Buyer has rejected your quotation.`,
    vehicleId: q.vehicleId,
  });
  emitToUser(q.sellerId, "notification:new", { type: "order_update" });

  // Post a system message to the conversation thread
  if (q.conversationId) {
    const [sysMsg] = await db.insert(messagesTable).values({
      conversationId: q.conversationId,
      senderId: q.buyerId,
      body: "Buyer rejected the quotation.",
      messageType: "system",
    } as any).returning();

    await db.update(conversationsTable).set({
      lastMessageAt: new Date(),
      lastMessagePreview: "Buyer rejected the quotation.",
    }).where(eq(conversationsTable.id, q.conversationId));

    const sysMsgPayload = {
      id: sysMsg.id,
      conversationId: q.conversationId,
      senderId: q.buyerId,
      senderName: null,
      body: sysMsg.body,
      messageType: "system",
      quotationId: null,
      quotation: null,
      attachments: [],
      createdAt: sysMsg.createdAt.toISOString(),
      readAt: null,
      wasScrubbedAt: null,
    };
    emitToConversation(q.conversationId, "message:new", sysMsgPayload);
  }

  const [enriched] = await enrichQuotations([updated], user.role);
  res.json(enriched);
});

// ── Shared order enrichment (imported by orders.ts too) ───────────────────────
export async function enrichOrders(rows: (typeof ordersTable.$inferSelect)[], userRole?: string) {
  if (rows.length === 0) return [];
  const isAdminRole = userRole === "admin" || userRole === "super_admin";
  const isSellerRole = userRole === "seller";

  const vehicleIds = [...new Set(rows.map(r => r.vehicleId))];
  const userIds = [...new Set([...rows.map(r => r.buyerId), ...rows.map(r => r.sellerId)])];

  const [vehicles, images, users] = await Promise.all([
    db.select({ id: vehicleListingsTable.id, brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName, year: vehicleListingsTable.year })
      .from(vehicleListingsTable).where(inArray(vehicleListingsTable.id, vehicleIds)),
    db.select({ vehicleId: vehicleImagesTable.vehicleId, url: vehicleImagesTable.url, isPrimary: vehicleImagesTable.isPrimary })
      .from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, vehicleIds)),
    db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(inArray(usersTable.id, userIds)),
  ]);

  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
  const imageMap = new Map<string, string>();
  for (const img of images) {
    if (img.isPrimary && !imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }
  for (const img of images) {
    if (!imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }
  const userMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  return rows.map(o => {
    const v = vehicleMap.get(o.vehicleId);
    // buyerTotal = total_amount_usd as stored in DB = the buyer's final price (FOB + commission).
    const buyerTotal = Number(o.totalAmountUsd);
    const commissionAmt = (o as any).commissionAmountUsd ? Number((o as any).commissionAmountUsd) : 0;
    // fobSubTotal = what the seller actually earns = buyer price minus commission mark-up.
    const fobSubTotal = buyerTotal - commissionAmt;
    return {
      id: o.id,
      orderNumber: o.orderNumber ?? `ORD-${new Date(o.createdAt).getFullYear()}-LEGACY`,
      quotationId: o.quotationId ?? null,
      vehicleId: o.vehicleId,
      vehicleTitle: v ? `${v.year} ${v.brandName} ${v.modelName}` : null,
      vehiclePrimaryImage: imageMap.get(o.vehicleId) ?? null,
      buyerId: o.buyerId,
      buyerName: userMap.get(o.buyerId) ?? null,
      sellerId: o.sellerId,
      sellerName: userMap.get(o.sellerId) ?? null,
      quantity: o.quantity,
      unitPriceUsd: Number(o.unitPriceUsd),
      shippingFeeUsd: o.shippingFeeUsd ? Number(o.shippingFeeUsd) : null,
      inspectionFeeUsd: o.inspectionFeeUsd ? Number(o.inspectionFeeUsd) : null,
      otherFeesUsd: o.otherFeesUsd ? Number(o.otherFeesUsd) : null,
      // Seller sees their FOB subtotal (no commission); buyer and admin see the full buyer price.
      totalAmountUsd: isSellerRole ? fobSubTotal : buyerTotal,
      status: o.status,
      notes: o.notes ?? null,
      // Commission: seller sees type/value/amount; admin also gets ruleId + fobTotalUsd.
      ...(isAdminRole || isSellerRole ? {
        commissionType: (o as any).commissionType ?? null,
        commissionValue: (o as any).commissionValue ? Number((o as any).commissionValue) : null,
        commissionAmountUsd: commissionAmt || null,
      } : {}),
      ...(isAdminRole ? {
        commissionRuleId: (o as any).commissionRuleId ?? null,
        fobTotalUsd: fobSubTotal,
      } : {}),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  });
}

export default router;
