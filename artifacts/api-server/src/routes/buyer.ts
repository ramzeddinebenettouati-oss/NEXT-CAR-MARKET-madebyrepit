import { Router } from "express";
import { db, favoritesTable, conversationsTable, notificationsTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { vehicleListingsTable, vehicleImagesTable } from "@workspace/db";
import { inArray, desc } from "drizzle-orm";

const router = Router();

// ── GET /api/buyer/dashboard ───────────────────────────────────────────────
router.get("/buyer/dashboard", authenticate, requireRole("buyer", "admin", "super_admin"), async (req, res) => {
  const user = req.user!;

  const [
    [favRow],
    [convRow],
    [unreadMsgRow],
    [unreadNotifRow],
    recentFavRows,
    recentConvRows,
  ] = await Promise.all([
    // Total favorites count
    db.select({ count: sql<number>`count(*)` })
      .from(favoritesTable)
      .where(eq(favoritesTable.userId, user.userId)),

    // Active conversations count
    db.select({ count: sql<number>`count(*)` })
      .from(conversationsTable)
      .where(or(eq(conversationsTable.buyerId, user.userId), eq(conversationsTable.sellerId, user.userId))),

    // Unread messages (own unread counter)
    db.select({ total: sql<number>`sum(buyer_unread)` })
      .from(conversationsTable)
      .where(eq(conversationsTable.buyerId, user.userId)),

    // Unread notifications
    db.select({ count: sql<number>`count(*)` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, user.userId), eq(notificationsTable.isRead, false))),

    // Recent 6 favorites
    db.select().from(favoritesTable)
      .where(eq(favoritesTable.userId, user.userId))
      .orderBy(desc(favoritesTable.createdAt))
      .limit(6),

    // Recent 5 conversations
    db.select().from(conversationsTable)
      .where(or(eq(conversationsTable.buyerId, user.userId), eq(conversationsTable.sellerId, user.userId)))
      .orderBy(desc(conversationsTable.lastMessageAt))
      .limit(5),
  ]);

  // Enrich recent favorites with vehicle data
  let recentFavorites: any[] = [];
  if (recentFavRows.length > 0) {
    const vehicleIds = recentFavRows.map(f => f.vehicleId);
    const [vehicles, images] = await Promise.all([
      db.select().from(vehicleListingsTable).where(inArray(vehicleListingsTable.id, vehicleIds)),
      db.select().from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, vehicleIds)),
    ]);
    const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
    const imageMap = new Map<string, string>();
    for (const img of images) {
      if (img.isPrimary && !imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
    }
    for (const img of images) {
      if (!imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
    }
    recentFavorites = recentFavRows.map(f => {
      const v = vehicleMap.get(f.vehicleId);
      return v ? {
        id: v.id, brandName: v.brandName, modelName: v.modelName, year: v.year,
        fuelType: v.fuelType, condition: v.condition, fobPriceUsd: v.fobPriceUsd,
        mileageKm: v.mileageKm, status: v.status, quantity: v.quantity,
        viewCount: v.viewCount, sellerId: v.sellerId,
        primaryImageUrl: imageMap.get(v.id) ?? null, sellerName: null,
        createdAt: v.createdAt, exteriorColor: v.exteriorColor,
      } : null;
    }).filter(Boolean);
  }

  res.json({
    favoritesCount: Number(favRow?.count ?? 0),
    activeConversations: Number(convRow?.count ?? 0),
    unreadMessages: Number(unreadMsgRow?.total ?? 0),
    unreadNotifications: Number(unreadNotifRow?.count ?? 0),
    recentFavorites,
    recentConversations: recentConvRows.map(c => ({
      id: c.id,
      vehicleId: c.vehicleId,
      buyerId: c.buyerId,
      sellerId: c.sellerId,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      unreadCount: c.buyerUnread,
      createdAt: c.createdAt,
    })),
  });
});

export default router;
