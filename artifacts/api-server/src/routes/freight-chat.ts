import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count, inArray, or, and } from "drizzle-orm";
import {
  db,
  freightConversationsTable,
  freightMessagesTable,
  freightRequestsTable,
  ordersTable,
  usersTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth";
import { scrubContactInfo } from "../lib/contact-protection";
import { emitToUser } from "../lib/socket";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

// ── Helper ────────────────────────────────────────────────────────────────────

async function buildUserMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
}

type ConvRow = typeof freightConversationsTable.$inferSelect;

function buildConvRecord(conv: ConvRow, userMap: Map<string, string>) {
  return {
    id: conv.id,
    orderId: conv.orderId,
    freightRequestId: conv.freightRequestId ?? null,
    sellerId: conv.sellerId,
    sellerName: userMap.get(conv.sellerId) ?? null,
    forwarderId: conv.forwarderId,
    forwarderName: userMap.get(conv.forwarderId) ?? null,
    sellerUnread: conv.sellerUnread,
    forwarderUnread: conv.forwarderUnread,
    lastMessageAt: conv.lastMessageAt.toISOString(),
    lastMessagePreview: conv.lastMessagePreview ?? null,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  };
}

// ── GET /freight-conversations ────────────────────────────────────────────────

router.get(
  "/freight-conversations",
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";
    const orderIdFilter = req.query.orderId as string | undefined;

    let rows: ConvRow[];

    if (isAdmin) {
      rows = await db
        .select()
        .from(freightConversationsTable)
        .where(orderIdFilter ? eq(freightConversationsTable.orderId, orderIdFilter) : undefined)
        .orderBy(desc(freightConversationsTable.lastMessageAt));
    } else {
      const base = or(
        eq(freightConversationsTable.sellerId, userId),
        eq(freightConversationsTable.forwarderId, userId),
      );
      rows = await db
        .select()
        .from(freightConversationsTable)
        .where(orderIdFilter ? and(base, eq(freightConversationsTable.orderId, orderIdFilter)) : base)
        .orderBy(desc(freightConversationsTable.lastMessageAt));
    }

    const userIds = rows.flatMap(c => [c.sellerId, c.forwarderId]);
    const userMap = await buildUserMap(userIds);
    res.json(rows.map(c => buildConvRecord(c, userMap)));
  },
);

// ── POST /freight-conversations ───────────────────────────────────────────────

router.post(
  "/freight-conversations",
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { orderId, forwarderId, freightRequestId } = req.body ?? {};

    if (!orderId || !forwarderId) {
      res.status(400).json({ error: "orderId and forwarderId are required" }); return;
    }

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    const isSeller = role === "seller" && order.sellerId === userId;
    const isForwarder = role === "freight_forwarder" && userId === forwarderId;
    const isAdmin = role === "admin" || role === "super_admin";

    if (!isSeller && !isForwarder && !isAdmin) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Check for existing conversation
    const [existing] = await db
      .select()
      .from(freightConversationsTable)
      .where(
        and(
          eq(freightConversationsTable.orderId, orderId),
          eq(freightConversationsTable.forwarderId, forwarderId),
        ),
      )
      .limit(1);

    if (existing) {
      const userMap = await buildUserMap([existing.sellerId, existing.forwarderId]);
      res.status(200).json(buildConvRecord(existing, userMap));
      return;
    }

    const [conv] = await db
      .insert(freightConversationsTable)
      .values({
        orderId,
        freightRequestId: freightRequestId ?? null,
        sellerId: order.sellerId,
        forwarderId,
      })
      .returning();

    const userMap = await buildUserMap([conv.sellerId, conv.forwarderId]);
    res.status(201).json(buildConvRecord(conv, userMap));
  },
);

// ── GET /freight-conversations/:conversationId ────────────────────────────────

router.get(
  "/freight-conversations/:conversationId",
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [conv] = await db
      .select()
      .from(freightConversationsTable)
      .where(eq(freightConversationsTable.id, req.params.conversationId as string))
      .limit(1);

    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    if (!isAdmin && conv.sellerId !== userId && conv.forwarderId !== userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    // Reset unread count for the caller
    if (conv.sellerId === userId && conv.sellerUnread > 0) {
      await db
        .update(freightConversationsTable)
        .set({ sellerUnread: 0 })
        .where(eq(freightConversationsTable.id, conv.id));
    } else if (conv.forwarderId === userId && conv.forwarderUnread > 0) {
      await db
        .update(freightConversationsTable)
        .set({ forwarderUnread: 0 })
        .where(eq(freightConversationsTable.id, conv.id));
    }

    const userMap = await buildUserMap([conv.sellerId, conv.forwarderId]);
    res.json(buildConvRecord(conv, userMap));
  },
);

// ── GET /freight-conversations/:conversationId/messages ───────────────────────

router.get(
  "/freight-conversations/:conversationId/messages",
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [conv] = await db
      .select()
      .from(freightConversationsTable)
      .where(eq(freightConversationsTable.id, req.params.conversationId as string))
      .limit(1);

    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    if (!isAdmin && conv.sellerId !== userId && conv.forwarderId !== userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(freightMessagesTable)
        .where(eq(freightMessagesTable.conversationId, conv.id))
        .orderBy(desc(freightMessagesTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(freightMessagesTable)
        .where(eq(freightMessagesTable.conversationId, conv.id)),
    ]);

    const senderIds = [...new Set(rows.map(m => m.senderId))];
    const userMap = await buildUserMap(senderIds);

    const data = rows.reverse().map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderName: userMap.get(m.senderId) ?? null,
      body: m.body,
      wasScrubbedAt: m.wasScrubbedAt?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    }));

    res.json({ data, total: totalRow?.total ?? 0, page, limit });
  },
);

// ── POST /freight-conversations/:conversationId/messages ──────────────────────

router.post(
  "/freight-conversations/:conversationId/messages",
  authenticate,
  async (req: Request, res: Response) => {
    const senderId = req.user!.userId;
    const role = req.user!.role;
    const rawBody = (req.body?.body ?? "") as string;

    if (!rawBody.trim()) {
      res.status(400).json({ error: "Message body is required" }); return;
    }

    const [conv] = await db
      .select()
      .from(freightConversationsTable)
      .where(eq(freightConversationsTable.id, req.params.conversationId as string))
      .limit(1);

    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    const isSeller = conv.sellerId === senderId;
    const isForwarder = conv.forwarderId === senderId;
    const isAdmin = role === "admin" || role === "super_admin";

    if (!isSeller && !isForwarder && !isAdmin) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const scrubbed = scrubContactInfo(rawBody.trim());
    const wasScrubbedAt = scrubbed !== rawBody.trim() ? new Date() : null;

    // Insert message + update conversation unread/preview in a transaction
    const [message] = await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(freightMessagesTable)
        .values({
          conversationId: conv.id,
          senderId,
          body: scrubbed,
          wasScrubbedAt,
        })
        .returning();

      const sellerUnread = isForwarder ? conv.sellerUnread + 1 : conv.sellerUnread;
      const forwarderUnread = isSeller ? conv.forwarderUnread + 1 : conv.forwarderUnread;

      await tx
        .update(freightConversationsTable)
        .set({
          lastMessageAt: new Date(),
          lastMessagePreview: scrubbed.slice(0, 120),
          sellerUnread,
          forwarderUnread,
          updatedAt: new Date(),
        })
        .where(eq(freightConversationsTable.id, conv.id));

      return [msg];
    });

    const userMap = await buildUserMap([senderId]);
    const senderName = userMap.get(senderId) ?? null;

    const payload = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName,
      body: message.body,
      wasScrubbedAt: message.wasScrubbedAt?.toISOString() ?? null,
      readAt: null,
      createdAt: message.createdAt.toISOString(),
    };

    // Emit via Socket.io to freight conversation room
    const recipientId = isSeller ? conv.forwarderId : conv.sellerId;
    emitToUser(recipientId, "freight_message:new", payload);

    // Create notification for recipient
    await createNotification({
      userId: recipientId,
      type: "new_message",
      title: "New Freight Message",
      body: scrubbed.slice(0, 80),
    }).catch(() => {});

    res.status(201).json(payload);
  },
);

export default router;
