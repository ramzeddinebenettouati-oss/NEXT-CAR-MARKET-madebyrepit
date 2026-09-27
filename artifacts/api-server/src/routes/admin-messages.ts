import { Router } from "express";
import { db } from "@workspace/db";
import {
  adminConversationsTable,
  adminMessagesTable,
  usersTable,
  permissionsTable,
  userPermissionsTable,
  rolesTable,
  rolePermissionsTable,
  ordersTable,
  quotationsTable,
  vehicleListingsTable,
  paymentsTable,
  shipmentsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray, count, or } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";
import { createAuditLog } from "../lib/audit";
import { createNotification } from "../lib/notifications";
import { emitToUser } from "../lib/socket";

const router = Router();

// ── Permission helper ──────────────────────────────────────────────────────────

async function canAccessMessages(userId: string, userRole: string): Promise<boolean> {
  if (userRole === "super_admin") return true;
  if (!["admin"].includes(userRole)) return false;
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
  return allPerms.has("messages_management");
}

async function requireMessagesAccess(req: any, res: any, next: any) {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ok = await canAccessMessages(req.user.userId, req.user.role);
  if (!ok) {
    res.status(403).json({ error: "Forbidden", message: "messages_management permission required" });
    return;
  }
  next();
}

// Participant check: super_admin can see all; others only see their own
function isParticipant(conv: typeof adminConversationsTable.$inferSelect, userId: string, userRole: string) {
  if (userRole === "super_admin") return true;
  return conv.initiatorId === userId || conv.recipientId === userId;
}

// ── Reference resolution ───────────────────────────────────────────────────────

async function resolveReference(
  referenceType: string,
  referenceId: string | undefined,
  referenceNumber: string | undefined
): Promise<{ referenceId: string | null; referenceNumber: string | null; error?: string }> {
  if (!referenceId && !referenceNumber) {
    return { referenceId: null, referenceNumber: null, error: "referenceId or referenceNumber is required for this reference type" };
  }

  if (referenceType === "order") {
    if (referenceId) {
      const [order] = await db.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber })
        .from(ordersTable).where(eq(ordersTable.id, referenceId)).limit(1);
      if (!order) return { referenceId: null, referenceNumber: null, error: "Order not found" };
      return { referenceId: order.id, referenceNumber: order.orderNumber ?? referenceNumber ?? null };
    }
    if (referenceNumber) {
      const [order] = await db.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber })
        .from(ordersTable).where(sql`order_number = ${referenceNumber}`).limit(1);
      if (!order) return { referenceId: null, referenceNumber: null, error: "Order not found" };
      return { referenceId: order.id, referenceNumber: order.orderNumber ?? referenceNumber };
    }
  }

  if (referenceType === "quotation") {
    if (referenceId) {
      const rows = await db.execute<{ id: string; quotation_number: string | null }>(
        sql`SELECT id, quotation_number FROM quotations WHERE id = ${referenceId}::uuid LIMIT 1`
      );
      const q = rows.rows[0];
      if (!q) return { referenceId: null, referenceNumber: null, error: "Quotation not found" };
      const num = q.quotation_number ?? referenceNumber ?? `QT-${q.id.slice(0, 8).toUpperCase()}`;
      return { referenceId: q.id, referenceNumber: num };
    }
    if (referenceNumber) {
      const rows = await db.execute<{ id: string; quotation_number: string | null }>(
        sql`SELECT id, quotation_number FROM quotations WHERE quotation_number = ${referenceNumber} LIMIT 1`
      );
      const q = rows.rows[0];
      if (!q) return { referenceId: null, referenceNumber: null, error: "Quotation not found" };
      return { referenceId: q.id, referenceNumber: q.quotation_number ?? referenceNumber };
    }
  }

  if (referenceType === "vehicle") {
    if (referenceId) {
      const [v] = await db.select({ id: vehicleListingsTable.id, brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName, year: vehicleListingsTable.year })
        .from(vehicleListingsTable).where(eq(vehicleListingsTable.id, referenceId)).limit(1);
      if (!v) return { referenceId: null, referenceNumber: null, error: "Vehicle not found" };
      return { referenceId: v.id, referenceNumber: `${v.year} ${v.brandName} ${v.modelName}` };
    }
    // vehicle has no number-based lookup — referenceId is required
    return { referenceId: null, referenceNumber: null, error: "referenceId (vehicle UUID) is required for vehicle type" };
  }

  if (referenceType === "payment") {
    if (referenceId) {
      const [p] = await db.select({ id: paymentsTable.id, referenceNumber: paymentsTable.referenceNumber })
        .from(paymentsTable).where(eq(paymentsTable.id, referenceId)).limit(1);
      if (!p) return { referenceId: null, referenceNumber: null, error: "Payment not found" };
      return { referenceId: p.id, referenceNumber: p.referenceNumber ?? null };
    }
    // payment has no number-based lookup — referenceId (UUID) is required
    return { referenceId: null, referenceNumber: null, error: "referenceId (payment UUID) is required for payment type" };
  }

  if (referenceType === "shipment") {
    if (referenceId) {
      // referenceId is the shipment UUID; kept as-is so referenceType=shipment&referenceId=<shipmentId> filters correctly.
      // referenceNumber is derived from the related order for human readability.
      const [shipment] = await db.select({ id: shipmentsTable.id, orderId: shipmentsTable.orderId })
        .from(shipmentsTable).where(eq(shipmentsTable.id, referenceId)).limit(1);
      if (!shipment) return { referenceId: null, referenceNumber: null, error: "Shipment not found" };
      const [order] = await db.select({ orderNumber: ordersTable.orderNumber })
        .from(ordersTable).where(eq(ordersTable.id, shipment.orderId)).limit(1);
      const displayNum = order?.orderNumber ? `SHIP-${order.orderNumber}` : `SHIP-${shipment.id.slice(0, 8).toUpperCase()}`;
      return { referenceId: shipment.id, referenceNumber: displayNum };
    }
    // shipment has no number-based lookup — referenceId (shipment UUID) is required
    return { referenceId: null, referenceNumber: null, error: "referenceId (shipment UUID) is required for shipment type" };
  }

  return { referenceId: null, referenceNumber: null, error: `Unsupported referenceType: ${referenceType}` };
}

// ── Enrich helpers ─────────────────────────────────────────────────────────────

async function enrichConversations(
  rows: (typeof adminConversationsTable.$inferSelect)[],
  currentUserId: string,
  currentUserRole: string
) {
  if (rows.length === 0) return [];

  const userIds = [...new Set([
    ...rows.map(r => r.initiatorId),
    ...rows.map(r => r.recipientId),
    ...rows.filter(r => r.resolvedById).map(r => r.resolvedById!),
  ])];

  const convIds = rows.map(r => r.id);

  const [users, allMessages, unreadCounts] = await Promise.all([
    db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
      .from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select({
      conversationId: adminMessagesTable.conversationId,
      id: adminMessagesTable.id,
      body: adminMessagesTable.body,
      senderId: adminMessagesTable.senderId,
      createdAt: adminMessagesTable.createdAt,
    })
      .from(adminMessagesTable)
      .where(inArray(adminMessagesTable.conversationId, convIds))
      .orderBy(desc(adminMessagesTable.createdAt)),
    db.select({
      conversationId: adminMessagesTable.conversationId,
      unread: count(),
    })
      .from(adminMessagesTable)
      .where(
        and(
          inArray(adminMessagesTable.conversationId, convIds),
          eq(adminMessagesTable.isRead, false),
          sql`${adminMessagesTable.senderId} != ${currentUserId}::uuid`
        )
      )
      .groupBy(adminMessagesTable.conversationId),
  ]);

  const userMap = new Map(users.map(u => [u.id, u]));
  // Pick the most recent message per conversation (already sorted by createdAt DESC)
  const lastMsgMap = new Map<string, typeof allMessages[0]>();
  for (const msg of allMessages) {
    if (!lastMsgMap.has(msg.conversationId)) lastMsgMap.set(msg.conversationId, msg);
  }
  const unreadMap = new Map(unreadCounts.map(u => [u.conversationId, Number(u.unread)]));

  return rows.map(conv => {
    const initiator = userMap.get(conv.initiatorId);
    const recipient = userMap.get(conv.recipientId);
    const resolver = conv.resolvedById ? userMap.get(conv.resolvedById) : null;
    const lastMsg = lastMsgMap.get(conv.id);
    const lastMsgSender = lastMsg ? userMap.get(lastMsg.senderId) : null;
    const isInitiator = conv.initiatorId === currentUserId;

    return {
      id: conv.id,
      subject: conv.subject,
      referenceType: conv.referenceType,
      referenceId: conv.referenceId ?? null,
      referenceNumber: conv.referenceNumber ?? null,
      initiatorId: conv.initiatorId,
      initiatorName: initiator ? `${initiator.firstName} ${initiator.lastName}`.trim() : null,
      initiatorEmail: initiator?.email ?? null,
      recipientId: conv.recipientId,
      recipientName: recipient ? `${recipient.firstName} ${recipient.lastName}`.trim() : null,
      recipientEmail: recipient?.email ?? null,
      status: conv.status,
      isArchivedByMe: isInitiator ? conv.isArchivedByInitiator : conv.isArchivedByRecipient,
      resolvedById: conv.resolvedById ?? null,
      resolvedByName: resolver ? `${resolver.firstName} ${resolver.lastName}`.trim() : null,
      resolvedAt: conv.resolvedAt?.toISOString() ?? null,
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      lastMessage: lastMsg
        ? {
            body: lastMsg.body.length > 100 ? lastMsg.body.slice(0, 100) + "…" : lastMsg.body,
            senderName: lastMsgSender ? `${lastMsgSender.firstName} ${lastMsgSender.lastName}`.trim() : null,
            createdAt: lastMsg.createdAt.toISOString(),
          }
        : null,
      unreadCount: unreadMap.get(conv.id) ?? 0,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  });
}

// ── GET /api/admin-messages/admin-users — recipient search (all roles) ────────
router.get("/admin-messages/admin-users", authenticate, requireMessagesAccess, async (req, res) => {
  const q = (req.query.q as string ?? "").trim();
  const currentUserId = req.user!.userId;

  const rows = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(
      and(
        sql`${usersTable.id} != ${currentUserId}::uuid`,
        eq(usersTable.isActive, true),
        q ? sql`(lower(first_name || ' ' || last_name) LIKE ${`%${q.toLowerCase()}%`} OR lower(email) LIKE ${`%${q.toLowerCase()}%`})` : sql`true`
      )
    )
    .orderBy(usersTable.firstName, usersTable.lastName)
    .limit(20);

  res.json(rows.map(u => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    role: u.role,
  })));
});

// ── GET /api/admin-messages/reference-lookup ──────────────────────────────────
router.get("/admin-messages/reference-lookup", authenticate, requireMessagesAccess, async (req, res) => {
  const referenceType = req.query.referenceType as string;
  const query = (req.query.q as string ?? "").trim();

  if (!referenceType || !query) {
    res.status(400).json({ error: "referenceType and q are required" }); return;
  }

  if (referenceType === "order") {
    const rows = await db
      .select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status })
      .from(ordersTable)
      .where(sql`order_number ILIKE ${`%${query}%`}`)
      .limit(10);
    res.json(rows.map(r => ({ id: r.id, number: r.orderNumber ?? r.id.slice(0, 8), label: r.orderNumber ?? r.id.slice(0, 8) })));
    return;
  }

  if (referenceType === "quotation") {
    const rows = await db.execute<{ id: string; quotation_number: string | null; status: string }>(
      sql`SELECT id, quotation_number, status FROM quotations WHERE (quotation_number ILIKE ${`%${query}%`} OR id::text ILIKE ${`%${query}%`}) LIMIT 10`
    );
    res.json(rows.rows.map(r => {
      const num = r.quotation_number ?? `QT-${r.id.slice(0, 8).toUpperCase()}`;
      return { id: r.id, number: num, label: `${num} (${r.status})` };
    }));
    return;
  }

  if (referenceType === "vehicle") {
    const rows = await db
      .select({ id: vehicleListingsTable.id, brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName, year: vehicleListingsTable.year })
      .from(vehicleListingsTable)
      .where(sql`(brand_name ILIKE ${`%${query}%`} OR model_name ILIKE ${`%${query}%`})`)
      .limit(10);
    res.json(rows.map(r => ({ id: r.id, number: `${r.year} ${r.brandName} ${r.modelName}`, label: `${r.year} ${r.brandName} ${r.modelName}` })));
    return;
  }

  if (referenceType === "payment") {
    const rows = await db
      .select({ id: paymentsTable.id, referenceNumber: paymentsTable.referenceNumber })
      .from(paymentsTable)
      .where(sql`reference_number ILIKE ${`%${query}%`}`)
      .limit(10);
    res.json(rows.map(r => ({ id: r.id, number: r.referenceNumber ?? r.id.slice(0, 8), label: r.referenceNumber ?? r.id.slice(0, 8) })));
    return;
  }

  if (referenceType === "shipment") {
    // Search shipments by associated order number; return shipment UUID as id
    // (resolveReference will exchange it for orderId when creating the conversation)
    const rows = await db.execute<{ shipment_id: string; order_number: string | null }>(
      sql`SELECT s.id AS shipment_id, o.order_number
          FROM shipments s
          JOIN orders o ON o.id = s.order_id
          WHERE o.order_number ILIKE ${`%${query}%`}
          LIMIT 10`
    );
    res.json(rows.rows.map(r => {
      const num = r.order_number ? `SHIP-${r.order_number}` : `SHIP-${r.shipment_id.slice(0, 8).toUpperCase()}`;
      return { id: r.shipment_id, number: num, label: num };
    }));
    return;
  }

  res.json([]);
});

// ── GET /api/admin-messages/unread-count ──────────────────────────────────────
router.get("/admin-messages/unread-count", authenticate, requireMessagesAccess, async (req, res) => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;

  const participantFilter = userRole === "super_admin"
    ? sql`true`
    : sql`(${adminConversationsTable.initiatorId} = ${userId}::uuid OR ${adminConversationsTable.recipientId} = ${userId}::uuid)`;

  const convIds = await db
    .select({ id: adminConversationsTable.id })
    .from(adminConversationsTable)
    .where(and(participantFilter, sql`${adminConversationsTable.status} != 'archived'`));

  if (convIds.length === 0) { res.json({ count: 0 }); return; }

  const ids = convIds.map(c => c.id);
  const [{ total }] = await db
    .select({ total: count() })
    .from(adminMessagesTable)
    .where(
      and(
        inArray(adminMessagesTable.conversationId, ids),
        eq(adminMessagesTable.isRead, false),
        sql`${adminMessagesTable.senderId} != ${userId}::uuid`
      )
    );

  res.json({ count: Number(total) });
});

// ── GET /api/admin-messages ────────────────────────────────────────────────────
router.get("/admin-messages", authenticate, requireMessagesAccess, async (req, res) => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const status = req.query.status as string | undefined;
  const referenceType = req.query.referenceType as string | undefined;
  const referenceId = req.query.referenceId as string | undefined;
  const referenceNumber = req.query.referenceNumber as string | undefined;
  const senderId = req.query.senderId as string | undefined;
  const recipientId = req.query.recipientId as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const unreadOnly = req.query.unreadOnly === "true";
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;

  // Participant-scoped filter: super_admin sees all; others see only their conversations
  const participantFilter = userRole === "super_admin"
    ? undefined
    : or(
        eq(adminConversationsTable.initiatorId, userId),
        eq(adminConversationsTable.recipientId, userId)
      );

  const conditions: any[] = [];
  if (participantFilter) conditions.push(participantFilter);
  if (status) conditions.push(eq(adminConversationsTable.status, status as any));
  if (referenceType) conditions.push(eq(adminConversationsTable.referenceType, referenceType as any));
  if (referenceId) conditions.push(eq(adminConversationsTable.referenceId, referenceId));
  if (referenceNumber) conditions.push(sql`${adminConversationsTable.referenceNumber} ILIKE ${`%${referenceNumber}%`}`);
  if (senderId) conditions.push(eq(adminConversationsTable.initiatorId, senderId));
  if (recipientId) conditions.push(eq(adminConversationsTable.recipientId, recipientId));
  if (dateFrom) conditions.push(sql`COALESCE(${adminConversationsTable.lastMessageAt}, ${adminConversationsTable.createdAt}) >= ${new Date(dateFrom)}`);
  if (dateTo) conditions.push(sql`COALESCE(${adminConversationsTable.lastMessageAt}, ${adminConversationsTable.createdAt}) <= ${new Date(dateTo)}`);
  if (unreadOnly) conditions.push(
    sql`EXISTS (
      SELECT 1 FROM admin_messages am2
      WHERE am2.conversation_id = ${adminConversationsTable.id}
        AND am2.is_read = false
        AND am2.sender_id != ${userId}::uuid
    )`
  );

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(adminConversationsTable)
      .where(where)
      .orderBy(desc(sql`COALESCE(${adminConversationsTable.lastMessageAt}, ${adminConversationsTable.createdAt})`))
      .limit(limit).offset(offset),
    db.select({ total: count() }).from(adminConversationsTable).where(where),
  ]);

  const enriched = await enrichConversations(rows, userId, userRole);
  res.json({ data: enriched, total: Number(total), page, limit });
});

// ── POST /api/admin-messages — create conversation ─────────────────────────────
router.post("/admin-messages", authenticate, requireMessagesAccess, async (req, res) => {
  const userId = req.user!.userId;
  const { subject, referenceType = "general", referenceId, referenceNumber, recipientId, body } = req.body;

  if (!subject || !body || !recipientId) {
    res.status(400).json({ error: "Validation error", message: "subject, recipientId, and body are required" }); return;
  }

  const validTypes = ["vehicle", "quotation", "order", "shipment", "payment"];
  if (!validTypes.includes(referenceType)) {
    res.status(400).json({ error: "Validation error", message: `referenceType must be one of: ${validTypes.join(", ")}` }); return;
  }
  if (!referenceId && !referenceNumber) {
    res.status(400).json({ error: "Validation error", message: "referenceId is required — every conversation must be linked to a business record" }); return;
  }

  // Validate recipient exists (any role — admins can message sellers, buyers, etc.)
  const [recipient] = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
    .from(usersTable).where(and(eq(usersTable.id, recipientId), eq(usersTable.isActive, true))).limit(1);
  if (!recipient) {
    res.status(400).json({ error: "Validation error", message: "Recipient not found or inactive" }); return;
  }
  if (recipientId === userId) {
    res.status(400).json({ error: "Validation error", message: "Cannot send a message to yourself" }); return;
  }

  // Server-side reference resolution and validation
  const resolved = await resolveReference(referenceType, referenceId, referenceNumber);
  if (resolved.error) {
    res.status(400).json({ error: "Validation error", message: resolved.error }); return;
  }

  const now = new Date();
  const [conv] = await db.insert(adminConversationsTable).values({
    subject,
    referenceType,
    referenceId: resolved.referenceId,
    referenceNumber: resolved.referenceNumber,
    initiatorId: userId,
    recipientId,
    lastMessageAt: now,
  } as any).returning();

  const [msg] = await db.insert(adminMessagesTable).values({
    conversationId: conv.id,
    senderId: userId,
    body,
  }).returning();

  // Notify recipient
  await createNotification({
    userId: recipientId,
    type: "new_message",
    title: "New Internal Message",
    body: `${req.user!.email} started a conversation: "${subject}"`,
  });
  emitToUser(recipientId, "admin_message:new", {
    conversationId: conv.id,
    subject: conv.subject,
    referenceNumber: conv.referenceNumber ?? null,
    from: req.user!.email,
  });

  await createAuditLog({
    userId,
    userEmail: req.user!.email,
    action: "ADMIN_MESSAGE_CREATED",
    module: "messaging",
    details: `Created admin conversation: "${subject}"${resolved.referenceNumber ? ` (ref: ${resolved.referenceNumber})` : ""} with ${recipient.firstName} ${recipient.lastName}`,
    req,
  });

  const [initiatorRow] = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  res.status(201).json({
    conversation: {
      id: conv.id,
      subject: conv.subject,
      referenceType: conv.referenceType,
      referenceId: conv.referenceId ?? null,
      referenceNumber: conv.referenceNumber ?? null,
      initiatorId: conv.initiatorId,
      initiatorName: initiatorRow ? `${initiatorRow.firstName} ${initiatorRow.lastName}`.trim() : null,
      recipientId: conv.recipientId,
      recipientName: `${recipient.firstName} ${recipient.lastName}`.trim(),
      status: conv.status,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    },
    message: {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      body: msg.body,
      isRead: msg.isRead,
      createdAt: msg.createdAt.toISOString(),
    },
  });
});

// ── GET /api/admin-messages/:id ────────────────────────────────────────────────
router.get("/admin-messages/:id", authenticate, requireMessagesAccess, requireUuidParams("id"), async (req, res) => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const { id } = req.params as Record<string, string>;

  const [conv] = await db.select().from(adminConversationsTable)
    .where(eq(adminConversationsTable.id, id)).limit(1);

  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  if (!isParticipant(conv, userId, userRole)) {
    res.status(403).json({ error: "Forbidden", message: "You are not a participant in this conversation" }); return;
  }

  const messages = await db.select().from(adminMessagesTable)
    .where(eq(adminMessagesTable.conversationId, id))
    .orderBy(adminMessagesTable.createdAt);

  // Auto-mark messages sent by the other party as read when the thread is opened
  const unreadIds = messages.filter(m => !m.isRead && m.senderId !== userId).map(m => m.id);
  if (unreadIds.length > 0) {
    await db.update(adminMessagesTable)
      .set({ isRead: true, readAt: new Date() })
      .where(inArray(adminMessagesTable.id, unreadIds));
    // Reflect the change in the in-memory list for the response
    for (const m of messages) { if (unreadIds.includes(m.id)) { m.isRead = true; } }
    await createAuditLog({
      userId,
      userEmail: req.user!.email,
      action: "ADMIN_MESSAGE_READ",
      module: "messaging",
      details: `Auto-read ${unreadIds.length} message(s) in conversation "${id}"`,
      req,
    });
  }

  const senderIds = [...new Set(messages.map(m => m.senderId))];
  const allUserIds = [...new Set([...senderIds, conv.initiatorId, conv.recipientId, ...(conv.resolvedById ? [conv.resolvedById] : [])])];
  const users = allUserIds.length > 0
    ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
        .from(usersTable).where(inArray(usersTable.id, allUserIds))
    : [];
  const userMap = new Map(users.map(u => [u.id, u]));

  const initiator = userMap.get(conv.initiatorId);
  const recipient = userMap.get(conv.recipientId);
  const resolver = conv.resolvedById ? userMap.get(conv.resolvedById) : null;

  res.json({
    id: conv.id,
    subject: conv.subject,
    referenceType: conv.referenceType,
    referenceId: conv.referenceId ?? null,
    referenceNumber: conv.referenceNumber ?? null,
    initiatorId: conv.initiatorId,
    initiatorName: initiator ? `${initiator.firstName} ${initiator.lastName}`.trim() : null,
    initiatorEmail: initiator?.email ?? null,
    recipientId: conv.recipientId,
    recipientName: recipient ? `${recipient.firstName} ${recipient.lastName}`.trim() : null,
    recipientEmail: recipient?.email ?? null,
    status: conv.status,
    isArchivedByMe: conv.initiatorId === userId ? conv.isArchivedByInitiator : conv.isArchivedByRecipient,
    resolvedById: conv.resolvedById ?? null,
    resolvedByName: resolver ? `${resolver.firstName} ${resolver.lastName}`.trim() : null,
    resolvedAt: conv.resolvedAt?.toISOString() ?? null,
    lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    messages: messages.map(m => {
      const sender = userMap.get(m.senderId);
      return {
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: sender ? `${sender.firstName} ${sender.lastName}`.trim() : null,
        senderEmail: sender?.email ?? null,
        body: m.body,
        isRead: m.isRead,
        readAt: m.readAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      };
    }),
  });
});

// ── POST /api/admin-messages/:id/messages — reply ─────────────────────────────
router.post("/admin-messages/:id/messages", authenticate, requireMessagesAccess, requireUuidParams("id"), async (req, res) => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const { id } = req.params as Record<string, string>;
  const { body } = req.body;

  if (!body || !body.trim()) {
    res.status(400).json({ error: "Validation error", message: "body is required" }); return;
  }

  const [conv] = await db.select().from(adminConversationsTable)
    .where(eq(adminConversationsTable.id, id)).limit(1);

  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  if (!isParticipant(conv, userId, userRole)) {
    res.status(403).json({ error: "Forbidden", message: "You are not a participant in this conversation" }); return;
  }
  if (conv.status === "archived") {
    res.status(400).json({ error: "Cannot reply to an archived conversation" }); return;
  }

  const now = new Date();
  const [msg] = await db.insert(adminMessagesTable)
    .values({ conversationId: id, senderId: userId, body: body.trim() })
    .returning();

  await db.update(adminConversationsTable)
    .set({ updatedAt: now, lastMessageAt: now })
    .where(eq(adminConversationsTable.id, id));

  // Determine the other participant to notify
  const otherUserId = conv.initiatorId === userId ? conv.recipientId : conv.initiatorId;

  const [senderRow] = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  await createNotification({
    userId: otherUserId,
    type: "new_message",
    title: "New Reply in Internal Message",
    body: `${senderRow ? `${senderRow.firstName} ${senderRow.lastName}` : req.user!.email} replied to "${conv.subject}"`,
  });
  emitToUser(otherUserId, "admin_message:new", {
    conversationId: conv.id,
    subject: conv.subject,
    messageId: msg.id,
    from: req.user!.email,
  });

  await createAuditLog({
    userId,
    userEmail: req.user!.email,
    action: "ADMIN_MESSAGE_REPLIED",
    module: "messaging",
    details: `Replied to conversation "${conv.subject}" (${id})`,
    req,
  });

  res.status(201).json({
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    senderName: senderRow ? `${senderRow.firstName} ${senderRow.lastName}`.trim() : null,
    senderEmail: senderRow?.email ?? null,
    body: msg.body,
    isRead: msg.isRead,
    readAt: msg.readAt?.toISOString() ?? null,
    createdAt: msg.createdAt.toISOString(),
    updatedAt: msg.updatedAt.toISOString(),
  });
});

// ── POST /api/admin-messages/:id/read — mark messages read ────────────────────
router.post("/admin-messages/:id/read", authenticate, requireMessagesAccess, requireUuidParams("id"), async (req, res) => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const { id } = req.params as Record<string, string>;

  const [conv] = await db.select().from(adminConversationsTable)
    .where(eq(adminConversationsTable.id, id)).limit(1);

  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  if (!isParticipant(conv, userId, userRole)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const now = new Date();
  await db.update(adminMessagesTable)
    .set({ isRead: true, readAt: now, updatedAt: now })
    .where(
      and(
        eq(adminMessagesTable.conversationId, id),
        eq(adminMessagesTable.isRead, false),
        sql`${adminMessagesTable.senderId} != ${userId}::uuid`
      )
    );

  await createAuditLog({
    userId,
    userEmail: req.user!.email,
    action: "ADMIN_MESSAGE_READ",
    module: "messaging",
    details: `Read conversation "${conv.subject}" (${id})`,
    req,
  });

  res.json({ ok: true });
});

// ── PATCH /api/admin-messages/:id/status ──────────────────────────────────────
router.patch("/admin-messages/:id/status", authenticate, requireMessagesAccess, requireUuidParams("id"), async (req, res) => {
  const userId = req.user!.userId;
  const userRole = req.user!.role;
  const { id } = req.params as Record<string, string>;
  const { status } = req.body;

  if (!["open", "resolved", "archived"].includes(status)) {
    res.status(400).json({ error: "Validation error", message: "status must be open, resolved, or archived" }); return;
  }

  const [conv] = await db.select().from(adminConversationsTable)
    .where(eq(adminConversationsTable.id, id)).limit(1);

  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  if (!isParticipant(conv, userId, userRole)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const now = new Date();
  const update: Record<string, unknown> = { updatedAt: now };

  if (status === "archived") {
    // Per-user archive: mark only this user's flag
    if (conv.initiatorId === userId) {
      update.isArchivedByInitiator = true;
    } else {
      update.isArchivedByRecipient = true;
    }
    // If both archived, set status to archived
    const bothArchived = conv.initiatorId === userId
      ? conv.isArchivedByRecipient
      : conv.isArchivedByInitiator;
    if (bothArchived) update.status = "archived";
  } else if (status === "open") {
    // Unarchive for this user
    if (conv.initiatorId === userId) {
      update.isArchivedByInitiator = false;
    } else {
      update.isArchivedByRecipient = false;
    }
    update.status = "open";
    update.resolvedById = null;
    update.resolvedAt = null;
  } else if (status === "resolved") {
    update.status = "resolved";
    update.resolvedById = userId;
    update.resolvedAt = now;
  }

  const [updated] = await db.update(adminConversationsTable)
    .set(update as any)
    .where(eq(adminConversationsTable.id, id))
    .returning();

  await createAuditLog({
    userId,
    userEmail: req.user!.email,
    action: "ADMIN_MESSAGE_STATUS_CHANGED",
    module: "messaging",
    details: `Changed conversation "${conv.subject}" status to ${status}`,
    req,
  });

  res.json({ id: updated.id, status: updated.status });
});

export default router;
