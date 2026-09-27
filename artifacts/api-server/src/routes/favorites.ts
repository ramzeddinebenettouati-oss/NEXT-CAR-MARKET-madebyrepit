import { Router } from "express";
import { db, favoritesTable, vehicleListingsTable, vehicleImagesTable } from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";

const router = Router();

// ── GET /api/favorites ────────────────────────────────────────────────────
router.get("/favorites", authenticate, async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || "20", 10)));
  const offset = (page - 1) * limit;

  const [rows, [countRow]] = await Promise.all([
    db.select().from(favoritesTable)
      .where(eq(favoritesTable.userId, user.userId))
      .orderBy(desc(favoritesTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(favoritesTable)
      .where(eq(favoritesTable.userId, user.userId)),
  ]);

  if (rows.length === 0) {
    res.json({ data: [], total: 0, page, limit });
    return;
  }

  const vehicleIds = rows.map(r => r.vehicleId);

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

  res.json({
    data: rows.map(fav => {
      const v = vehicleMap.get(fav.vehicleId);
      return {
        id: fav.id,
        vehicleId: fav.vehicleId,
        createdAt: fav.createdAt,
        vehicle: v ? {
          id: v.id,
          brandName: v.brandName,
          modelName: v.modelName,
          year: v.year,
          fuelType: v.fuelType,
          condition: v.condition,
          fobPriceUsd: v.fobPriceUsd,
          mileageKm: v.mileageKm,
          status: v.status,
          quantity: v.quantity,
          viewCount: v.viewCount,
          sellerId: v.sellerId,
          primaryImageUrl: imageMap.get(v.id) ?? null,
          sellerName: null,
          createdAt: v.createdAt,
          exteriorColor: v.exteriorColor,
        } : null,
      };
    }),
    total: Number(countRow?.count ?? 0),
    page,
    limit,
  });
});

// ── POST /api/favorites/:vehicleId — toggle favorite ─────────────────────
router.post("/favorites/:vehicleId", authenticate, async (req, res) => {
  const user = req.user!;
  const { vehicleId } = req.params as Record<string, string>;

  const [vehicle] = await db
    .select({ id: vehicleListingsTable.id })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(favoritesTable)
    .where(and(eq(favoritesTable.userId, user.userId), eq(favoritesTable.vehicleId, vehicleId)))
    .limit(1);

  if (existing) {
    await db.delete(favoritesTable).where(eq(favoritesTable.id, existing.id));
    res.json({ isFavorited: false, vehicleId });
  } else {
    await db.insert(favoritesTable).values({ userId: user.userId, vehicleId });
    res.json({ isFavorited: true, vehicleId });
  }
});

export default router;
