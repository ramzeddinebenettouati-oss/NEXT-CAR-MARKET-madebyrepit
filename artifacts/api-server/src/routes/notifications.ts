import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";

const router = Router();

// ── GET /api/notifications ────────────────────────────────────────────────
router.get("/notifications", authenticate, async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;
  const unreadOnly = req.query.unreadOnly === "true";

  const where = and(
    eq(notificationsTable.userId, user.userId),
    unreadOnly ? eq(notificationsTable.isRead, false) : undefined
  );

  const [rows, [countRow], [unreadRow]] = await Promise.all([
    db.select().from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(notificationsTable)
      .where(where),
    db.select({ count: sql<number>`count(*)` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, user.userId), eq(notificationsTable.isRead, false))),
  ]);

  res.json({
    data: rows.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      conversationId: n.conversationId,
      vehicleId: n.vehicleId,
      isRead: n.isRead,
      createdAt: n.createdAt,
    })),
    total: Number(countRow?.count ?? 0),
    unreadCount: Number(unreadRow?.count ?? 0),
    page,
    limit,
  });
});

// ── POST /api/notifications/read-all ──────────────────────────────────────
router.post("/notifications/read-all", authenticate, async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, req.user!.userId), eq(notificationsTable.isRead, false)));

  res.json({ message: "All notifications marked as read" });
});

// ── POST /api/notifications/:id/read ──────────────────────────────────────
router.post("/notifications/:notificationId/read", authenticate, requireUuidParams("notificationId"), async (req, res) => {
  const { notificationId } = req.params as Record<string, string>;

  const [notif] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, notificationId))
    .limit(1);

  if (!notif) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (notif.userId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, notificationId));
  res.json({ message: "Notification marked as read" });
});

export default router;
