import { Router } from "express";
import { db, conversationsTable, messagesTable, messageAttachmentsTable, vehicleListingsTable, vehicleImagesTable, usersTable, notificationsTable, quotationsTable } from "@workspace/db";
import { eq, and, or, desc, sql, inArray, count } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";
import { uploadAttachment, getUploadUrl } from "../lib/upload";
import { scrubContactInfo } from "../lib/contact-protection";
import { emitToConversation, emitToUser } from "../lib/socket";
import { createNotification } from "../lib/notifications";
import fs from "fs";

const router = Router();

// ── Helper: enrich a list of quotation rows inline ───────────────────────────
async function fetchQuotationMap(quotationIds: string[]): Promise<Map<string, object>> {
  if (quotationIds.length === 0) return new Map();

  const rows = await db.select().from(quotationsTable)
    .where(inArray(quotationsTable.id, quotationIds));

  if (rows.length === 0) return new Map();

  const vehicleIds = [...new Set(rows.map(r => r.vehicleId))];
  const buyerIds = [...new Set(rows.map(r => r.buyerId))];
  const sellerIds = [...new Set(rows.map(r => r.sellerId))];
  const allUserIds = [...new Set([...buyerIds, ...sellerIds])];

  const [vehicles, images, users] = await Promise.all([
    db.select({ id: vehicleListingsTable.id, brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName, year: vehicleListingsTable.year })
      .from(vehicleListingsTable).where(inArray(vehicleListingsTable.id, vehicleIds)),
    db.select({ vehicleId: vehicleImagesTable.vehicleId, url: vehicleImagesTable.url, isPrimary: vehicleImagesTable.isPrimary })
      .from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, vehicleIds)),
    db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(inArray(usersTable.id, allUserIds)),
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

  const result = new Map<string, object>();
  for (const q of rows) {
    const v = vehicleMap.get(q.vehicleId);
    const unit = Number(q.unitPriceUsd);
    const shipping = q.shippingFeeUsd ? Number(q.shippingFeeUsd) : null;
    const inspection = q.inspectionFeeUsd ? Number(q.inspectionFeeUsd) : null;
    const other = q.otherFeesUsd ? Number(q.otherFeesUsd) : null;
    const total = q.quantity * unit + (shipping ?? 0) + (inspection ?? 0) + (other ?? 0);
    result.set(q.id, {
      id: q.id,
      conversationId: q.conversationId ?? null,
      vehicleId: q.vehicleId,
      vehicleTitle: v ? `${v.year} ${v.brandName} ${v.modelName}` : null,
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
      totalAmountUsd: total,
      notes: q.notes ?? null,
      status: q.status,
      expiresAt: q.expiresAt.toISOString(),
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    });
  }
  return result;
}

// ── GET /api/conversations — list user's conversations ─────────────────────
router.get("/conversations", authenticate, async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;

  const isAdmin = ["super_admin", "admin"].includes(user.role);

  const where = isAdmin
    ? undefined
    : or(
        eq(conversationsTable.buyerId, user.userId),
        eq(conversationsTable.sellerId, user.userId)
      );

  const [rows, [countRow]] = await Promise.all([
    db.select().from(conversationsTable)
      .where(where)
      .orderBy(desc(conversationsTable.lastMessageAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(conversationsTable).where(where),
  ]);

  if (rows.length === 0) {
    res.json({ data: [], total: 0, page, limit });
    return;
  }

  const vehicleIds = [...new Set(rows.map(r => r.vehicleId).filter(Boolean) as string[])];
  const participantIds = [...new Set([...rows.map(r => r.buyerId), ...rows.map(r => r.sellerId)])];

  const [vehicles, participants, primaryImages] = await Promise.all([
    vehicleIds.length > 0
      ? db.select({ id: vehicleListingsTable.id, brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName })
          .from(vehicleListingsTable).where(inArray(vehicleListingsTable.id, vehicleIds))
      : [],
    db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(inArray(usersTable.id, participantIds)),
    vehicleIds.length > 0
      ? db.select({ vehicleId: vehicleImagesTable.vehicleId, url: vehicleImagesTable.url, isPrimary: vehicleImagesTable.isPrimary })
          .from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, vehicleIds))
      : [],
  ]);

  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
  const userMap = new Map(participants.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const imageMap = new Map<string, string>();
  for (const img of primaryImages) {
    if (img.isPrimary && !imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }
  for (const img of primaryImages) {
    if (!imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }

  res.json({
    data: rows.map(c => {
      const v = c.vehicleId ? vehicleMap.get(c.vehicleId) : null;
      const unreadCount = user.userId === c.buyerId ? c.buyerUnread : c.sellerUnread;
      return {
        id: c.id,
        vehicleId: c.vehicleId,
        buyerId: c.buyerId,
        sellerId: c.sellerId,
        buyerName: userMap.get(c.buyerId) ?? null,
        sellerName: userMap.get(c.sellerId) ?? null,
        vehicleTitle: v ? `${v.brandName} ${v.modelName}` : null,
        vehiclePrimaryImageUrl: c.vehicleId ? (imageMap.get(c.vehicleId) ?? null) : null,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        unreadCount,
        createdAt: c.createdAt,
      };
    }),
    total: Number(countRow?.count ?? 0),
    page,
    limit,
  });
});

// ── POST /api/conversations — start a conversation ─────────────────────────
router.post("/conversations", authenticate, requireRole("buyer", "admin", "super_admin"), async (req, res) => {
  const user = req.user!;
  const { vehicleId, message } = req.body;

  if (!vehicleId || !message?.trim()) {
    res.status(400).json({ error: "Bad request", message: "vehicleId and message are required" });
    return;
  }

  const [vehicle] = await db
    .select({ sellerId: vehicleListingsTable.sellerId, brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName, status: vehicleListingsTable.status })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  if (vehicle.status !== "published") {
    res.status(400).json({ error: "Bad request", message: "Can only inquire on published listings" });
    return;
  }
  if (vehicle.sellerId === user.userId) {
    res.status(400).json({ error: "Bad request", message: "Cannot inquire on your own listing" });
    return;
  }

  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.buyerId, user.userId),
        eq(conversationsTable.sellerId, vehicle.sellerId),
        eq(conversationsTable.vehicleId, vehicleId)
      )
    )
    .limit(1);

  let conversationId: string;

  if (existing) {
    conversationId = existing.id;
  } else {
    const [conv] = await db
      .insert(conversationsTable)
      .values({
        vehicleId,
        buyerId: user.userId,
        sellerId: vehicle.sellerId,
        sellerUnread: 0,
      })
      .returning({ id: conversationsTable.id });
    conversationId = conv.id;
  }

  const scrubbed = scrubContactInfo(message.trim());
  const wasScrubbedAt = scrubbed !== message.trim() ? new Date() : null;

  const [msg] = await db
    .insert(messagesTable)
    .values({
      conversationId,
      senderId: user.userId,
      body: scrubbed,
      wasScrubbedAt,
    })
    .returning();

  await db
    .update(conversationsTable)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: scrubbed.slice(0, 120),
      sellerUnread: sql`${conversationsTable.sellerUnread} + 1`,
    })
    .where(eq(conversationsTable.id, conversationId));

  await createNotification({
    userId: vehicle.sellerId,
    type: "new_inquiry",
    title: `New inquiry: ${vehicle.brandName} ${vehicle.modelName}`,
    body: scrubbed.slice(0, 80),
    conversationId,
    vehicleId,
  });

  const msgPayload = {
    id: msg.id,
    conversationId,
    senderId: msg.senderId,
    senderName: null,
    senderRole: user.role,
    body: msg.body,
    messageType: "text" as const,
    quotationId: null,
    quotation: null,
    readAt: null,
    wasScrubbedAt: msg.wasScrubbedAt?.toISOString() ?? null,
    attachments: [],
    createdAt: msg.createdAt,
  };

  emitToConversation(conversationId, "message:new", msgPayload);
  emitToUser(vehicle.sellerId, "message:new", msgPayload);

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  res.status(201).json({
    id: conv.id,
    vehicleId: conv.vehicleId,
    buyerId: conv.buyerId,
    sellerId: conv.sellerId,
    lastMessageAt: conv.lastMessageAt,
    lastMessagePreview: conv.lastMessagePreview,
    unreadCount: 0,
    createdAt: conv.createdAt,
    messages: [msgPayload],
    total: 1,
    page: 1,
    limit: 50,
  });
});

// ── GET /api/conversations/:id — get conversation with messages ────────────
router.get("/conversations/:conversationId", authenticate, requireUuidParams("conversationId"), async (req, res) => {
  const user = req.user!;
  const conversationId = req.params.conversationId as string;
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "50", 10)));
  const offset = (page - 1) * limit;

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isAdmin = ["super_admin", "admin"].includes(user.role);
  const isParticipant = conv.buyerId === user.userId || conv.sellerId === user.userId;

  if (!isParticipant && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [msgs, [msgCount]] = await Promise.all([
    db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId)),
  ]);

  const msgIds = msgs.map(m => m.id);
  const quotationIds = [...new Set(msgs.map(m => m.quotationId).filter(Boolean) as string[])];

  const [attachments, quotationMap] = await Promise.all([
    msgIds.length > 0
      ? db.select().from(messageAttachmentsTable).where(inArray(messageAttachmentsTable.messageId, msgIds))
      : [],
    fetchQuotationMap(quotationIds),
  ]);

  const senderIds = [...new Set([...msgs.map(m => m.senderId), conv.buyerId, conv.sellerId])];
  const senders = senderIds.length > 0
    ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
        .from(usersTable).where(inArray(usersTable.id, senderIds))
    : [];
  const senderMap = new Map(senders.map(s => [s.id, s]));

  const buyerUser = senderMap.get(conv.buyerId);
  const sellerUser = senderMap.get(conv.sellerId);
  const buyerName = buyerUser ? `${buyerUser.firstName} ${buyerUser.lastName}`.trim() : null;
  const sellerName = sellerUser ? `${sellerUser.firstName} ${sellerUser.lastName}`.trim() : null;

  type AttachmentRow = { id: string; messageId: string; type: "image" | "document" | "video"; url: string; filename: string | null; sizeBytes: number | null; createdAt: Date };
  const attachmentMap = new Map<string, AttachmentRow[]>();
  for (const att of attachments) {
    if (!attachmentMap.has(att.messageId)) attachmentMap.set(att.messageId, []);
    attachmentMap.get(att.messageId)!.push(att);
  }

  const vehicleTitle = conv.vehicleId ? await db
    .select({ brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, conv.vehicleId))
    .limit(1)
    .then(r => r[0] ? `${r[0].brandName} ${r[0].modelName}` : null)
    : null;

  const unreadCount = user.userId === conv.buyerId ? conv.buyerUnread : conv.sellerUnread;

  res.json({
    id: conv.id,
    vehicleId: conv.vehicleId,
    buyerId: conv.buyerId,
    sellerId: conv.sellerId,
    buyerName,
    sellerName,
    vehicleTitle,
    lastMessageAt: conv.lastMessageAt,
    lastMessagePreview: conv.lastMessagePreview,
    unreadCount,
    createdAt: conv.createdAt,
    messages: msgs.reverse().map(m => {
      const sender = senderMap.get(m.senderId);
      return {
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: sender ? `${sender.firstName} ${sender.lastName}`.trim() : null,
        senderRole: sender?.role ?? null,
        body: m.body,
        messageType: m.messageType ?? "text",
        quotationId: m.quotationId ?? null,
        quotation: m.quotationId ? (quotationMap.get(m.quotationId) ?? null) : null,
        readAt: m.readAt?.toISOString() ?? null,
        wasScrubbedAt: m.wasScrubbedAt?.toISOString() ?? null,
        attachments: (attachmentMap.get(m.id) ?? []).map(a => ({
          id: a.id,
          type: a.type,
          url: a.url,
          filename: a.filename,
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt,
        })),
        createdAt: m.createdAt,
      };
    }),
    total: Number(msgCount?.count ?? 0),
    page,
    limit,
  });
});

// ── POST /api/conversations/:id/messages — send a message ─────────────────
router.post(
  "/conversations/:conversationId/messages",
  authenticate,
  requireUuidParams("conversationId"),
  uploadAttachment.single("file"),
  async (req, res) => {
    const user = req.user!;
    const conversationId = req.params.conversationId as string;
    const rawBody: string = req.body.body ?? "";

    if (!rawBody.trim() && !req.file) {
      res.status(400).json({ error: "Bad request", message: "Message body or file is required" });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conv) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(404).json({ error: "Not found" });
      return;
    }

    const isAdmin = ["super_admin", "admin"].includes(user.role);
    const isParticipant = conv.buyerId === user.userId || conv.sellerId === user.userId;
    if (!isParticipant && !isAdmin) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const scrubbed = rawBody.trim() ? scrubContactInfo(rawBody.trim()) : (req.file ? "" : rawBody.trim());
    const safeFilename = req.file ? scrubContactInfo(req.file.originalname) : "";
    const body = scrubbed || (req.file ? `[Attachment: ${safeFilename}]` : "");
    const wasScrubbedAt = rawBody.trim() && scrubbed !== rawBody.trim() ? new Date() : null;

    const [msg] = await db
      .insert(messagesTable)
      .values({ conversationId, senderId: user.userId, body, wasScrubbedAt })
      .returning();

    let attachment: { id: string; type: string; url: string; filename: string | null; sizeBytes: number | null; createdAt: Date } | null = null;
    if (req.file) {
      const url = getUploadUrl(req.file.filename);
      const mimeType = req.file.mimetype;
      const attachType = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "document";
      const [att] = await db.insert(messageAttachmentsTable).values({
        messageId: msg.id,
        type: attachType as "image" | "document" | "video",
        url,
        filename: req.file.originalname,
        sizeBytes: req.file.size,
      }).returning();
      attachment = { id: att.id, type: att.type, url: att.url, filename: att.filename, sizeBytes: att.sizeBytes, createdAt: att.createdAt };
    }

    const isBuyer = conv.buyerId === user.userId;
    const recipientId = isBuyer ? conv.sellerId : conv.buyerId;

    await db.update(conversationsTable).set({
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 120),
      ...(isBuyer
        ? { sellerUnread: sql`${conversationsTable.sellerUnread} + 1` }
        : { buyerUnread: sql`${conversationsTable.buyerUnread} + 1` }),
    }).where(eq(conversationsTable.id, conversationId));

    await createNotification({
      userId: recipientId,
      type: "new_message",
      title: "New message",
      body: body.slice(0, 80),
      conversationId,
    });

    const [sender] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .limit(1);

    const msgPayload = {
      id: msg.id,
      conversationId,
      senderId: msg.senderId,
      senderName: sender ? `${sender.firstName} ${sender.lastName}`.trim() : null,
      senderRole: sender?.role ?? user.role,
      body: msg.body,
      messageType: "text" as const,
      quotationId: null,
      quotation: null,
      readAt: null,
      wasScrubbedAt: msg.wasScrubbedAt?.toISOString() ?? null,
      attachments: attachment ? [attachment] : [],
      createdAt: msg.createdAt,
    };

    emitToConversation(conversationId, "message:new", msgPayload);
    emitToUser(recipientId, "message:new", msgPayload);

    res.status(201).json(msgPayload);
  }
);

// ── POST /api/conversations/:id/quotations — seller sends a quotation or
// buyer sends a counter-offer ───────────────────────────────────────────────
router.post("/conversations/:conversationId/quotations", authenticate, requireUuidParams("conversationId"), async (req, res) => {
  const user = req.user!;
  const conversationId = req.params.conversationId as string;

  if (!["buyer", "seller", "admin", "super_admin"].includes(user.role)) {
    res.status(403).json({ error: "Only conversation participants can send quotations" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const isAdmin = ["admin", "super_admin"].includes(user.role);
  const isBuyer = !isAdmin && conv.buyerId === user.userId;
  const isSeller = !isAdmin && conv.sellerId === user.userId;
  if (!isAdmin && !isBuyer && !isSeller) {
    res.status(403).json({ error: "You are not a participant in this conversation" });
    return;
  }

  const { quantity, unitPriceUsd, shippingFeeUsd, inspectionFeeUsd, otherFeesUsd, notes, expiresAt } = req.body;

  if (!quantity || !unitPriceUsd || !expiresAt) {
    res.status(400).json({ error: "quantity, unitPriceUsd and expiresAt are required" });
    return;
  }

  const scrubbedNotes = notes ? scrubContactInfo(notes) : null;
  const sellerId = conv.sellerId;
  const msgBody = isBuyer
    ? `💬 Counter-offer sent — ${Number(quantity)}x unit @ $${Number(unitPriceUsd).toLocaleString()}`
    : `📋 Quotation sent — ${Number(quantity)}x unit @ $${Number(unitPriceUsd).toLocaleString()}`;

  // Fetch vehicle commission snapshot to copy into quotation (immutable at approval time)
  const [vehicle] = await db
    .select({
      commissionRuleId: vehicleListingsTable.commissionRuleId,
      commissionType: vehicleListingsTable.commissionType,
      commissionValue: vehicleListingsTable.commissionValue,
      commissionSnapshot: vehicleListingsTable.commissionSnapshot,
    })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, conv.vehicleId!))
    .limit(1);

  let commissionRuleId: string | null = null;
  let commissionType: string | null = null;
  let commissionValue: string | null = null;
  let commissionAmountUsd: string | null = null;

  if (vehicle?.commissionSnapshot && vehicle.commissionType) {
    const vsnap = vehicle.commissionSnapshot as any;
    const qty = Number(quantity);
    const unit = Number(unitPriceUsd);
    const shipping = shippingFeeUsd ? Number(shippingFeeUsd) : 0;
    const inspection = inspectionFeeUsd ? Number(inspectionFeeUsd) : 0;
    const other = otherFeesUsd ? Number(otherFeesUsd) : 0;
    const lineTotal = qty * unit + shipping + inspection + other;

    commissionRuleId = vehicle.commissionRuleId ?? null;
    commissionType = vehicle.commissionType;
    commissionValue = vehicle.commissionValue ?? null;

    const fixed = Number(vsnap.fixedAmountUsd ?? 0);
    const pct = Number(vsnap.percentageRate ?? 0);
    let amount = 0;
    if (vsnap.type === "fixed") amount = fixed;
    else if (vsnap.type === "percentage") amount = lineTotal * (pct / 100);
    else if (vsnap.type === "hybrid") amount = fixed + lineTotal * (pct / 100);
    commissionAmountUsd = amount.toFixed(2);
  }

  // Create quotation + message + conversation update atomically
  const { q, msg } = await db.transaction(async (tx) => {
    const [q] = await tx.insert(quotationsTable).values({
      vehicleId: conv.vehicleId!,
      buyerId: conv.buyerId,
      sellerId,
      conversationId,
      quantity: Number(quantity),
      unitPriceUsd: String(unitPriceUsd),
      shippingFeeUsd: shippingFeeUsd ? String(shippingFeeUsd) : null,
      inspectionFeeUsd: inspectionFeeUsd ? String(inspectionFeeUsd) : null,
      otherFeesUsd: otherFeesUsd ? String(otherFeesUsd) : null,
      notes: scrubbedNotes,
      expiresAt: new Date(expiresAt),
      quotationNumber: sql`'QT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('quotation_number_seq')::TEXT, 6, '0')`,
      commissionRuleId,
      commissionType,
      commissionValue,
      commissionAmountUsd,
    } as any).returning();

    const [msg] = await tx.insert(messagesTable).values({
      conversationId,
      senderId: user.userId,
      body: msgBody,
      messageType: "quotation",
      quotationId: q.id,
    }).returning();

    await tx.update(conversationsTable).set({
      lastMessageAt: new Date(),
      lastMessagePreview: msgBody.slice(0, 120),
       ...(isBuyer
         ? { sellerUnread: sql`${conversationsTable.sellerUnread} + 1` }
         : { buyerUnread: sql`${conversationsTable.buyerUnread} + 1` }),
    }).where(eq(conversationsTable.id, conversationId));

    return { q, msg };
  });

  // Notify the other participant
  const recipientId = isBuyer ? conv.sellerId : conv.buyerId;
  await createNotification({
    userId: recipientId,
    type: "new_inquiry",
    title: isBuyer ? "Counter-offer Received" : "New Quotation Received",
    body: isBuyer
      ? "The buyer sent a counter-offer. Please review it in your conversation."
      : "You have received a quotation. Please review and accept or reject.",
    vehicleId: conv.vehicleId ?? undefined,
    conversationId,
  });
  emitToUser(recipientId, "notification:new", { type: "new_inquiry" });

  // Fetch enriched quotation for the response
  const quotationMap = await fetchQuotationMap([q.id]);
  const enrichedQuotation = quotationMap.get(q.id) ?? null;

  const [sender] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .limit(1);

  const msgPayload = {
    id: msg.id,
    conversationId,
    senderId: msg.senderId,
    senderName: sender ? `${sender.firstName} ${sender.lastName}`.trim() : null,
    senderRole: sender?.role ?? user.role,
    body: msg.body,
    messageType: "quotation" as const,
    quotationId: q.id,
    quotation: enrichedQuotation,
    readAt: null,
    wasScrubbedAt: null,
    attachments: [],
    createdAt: msg.createdAt,
  };

  emitToConversation(conversationId, "message:new", msgPayload);
  emitToUser(recipientId, "message:new", msgPayload);

  res.status(201).json(msgPayload);
});

// ── POST /api/conversations/:id/read — mark as read ───────────────────────
router.post("/conversations/:conversationId/read", authenticate, requireUuidParams("conversationId"), async (req, res) => {
  const user = req.user!;
  const conversationId = req.params.conversationId as string;

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);

  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isBuyer = conv.buyerId === user.userId;
  const isSeller = conv.sellerId === user.userId;
  const isAdmin = ["super_admin", "admin"].includes(user.role);

  if (!isBuyer && !isSeller && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const otherPartyId = isBuyer ? conv.sellerId : conv.buyerId;
  await db.update(messagesTable)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.senderId, isAdmin ? conv.sellerId : otherPartyId),
        sql`${messagesTable.readAt} is null`
      )
    );

  const updateField = isBuyer ? { buyerUnread: 0 } : { sellerUnread: 0 };
  await db.update(conversationsTable)
    .set(updateField)
    .where(eq(conversationsTable.id, conversationId));

  emitToConversation(conversationId, "message:read", { conversationId, readBy: user.userId });

  res.json({ message: "Marked as read" });
});

export default router;
