import { Router } from "express";
import { db, vehicleListingsTable, vehicleImagesTable } from "@workspace/db";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";

const router = Router();

function computeSellerCommission(
  fobPriceUsd: string | number | null,
  commissionSnapshot: unknown,
  commissionType: string | null,
): { commissionAmountUsd: number | null; displayPriceUsd: number | null } {
  const fob = fobPriceUsd ? Number(fobPriceUsd) : null;
  if (fob === null || !commissionSnapshot || !commissionType) {
    return { commissionAmountUsd: null, displayPriceUsd: fob };
  }
  const snap = commissionSnapshot as Record<string, unknown>;
  const fixed = Number(snap.fixedAmountUsd ?? 0);
  const pct = Number(snap.percentageRate ?? 0);
  let amt: number;
  switch (commissionType) {
    case "fixed": amt = fixed; break;
    case "percentage": amt = fob * (pct / 100); break;
    case "hybrid": amt = fixed + fob * (pct / 100); break;
    default: return { commissionAmountUsd: null, displayPriceUsd: fob };
  }
  return { commissionAmountUsd: amt || null, displayPriceUsd: fob + amt };
}

// ── GET /api/seller/dashboard ─────────────────────────────────────────────────
router.get("/seller/dashboard", authenticate, requireRole("seller", "admin", "super_admin"), async (req, res) => {
  const sellerId = req.user!.userId;

  const statusCounts = await db
    .select({
      status: vehicleListingsTable.status,
      count: sql<number>`count(*)`,
      totalViews: sql<number>`sum(${vehicleListingsTable.viewCount})`,
    })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.sellerId, sellerId))
    .groupBy(vehicleListingsTable.status);

  const totals = {
    totalListings: 0,
    draftCount: 0,
    pendingCount: 0,
    publishedCount: 0,
    rejectedCount: 0,
    archivedCount: 0,
    totalViews: 0,
  };

  for (const row of statusCounts) {
    const count = Number(row.count);
    const views = Number(row.totalViews ?? 0);
    totals.totalListings += count;
    totals.totalViews += views;
    if (row.status === "draft") totals.draftCount = count;
    else if (row.status === "pending_review") totals.pendingCount = count;
    else if (row.status === "published") totals.publishedCount = count;
    else if (row.status === "rejected") totals.rejectedCount = count;
    else if (row.status === "archived") totals.archivedCount = count;
  }

  const recentRows = await db
    .select()
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.sellerId, sellerId))
    .orderBy(desc(vehicleListingsTable.updatedAt))
    .limit(5);

  const recentIds = recentRows.map((r) => r.id);
  const allImages = recentIds.length > 0
    ? await db.select().from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, recentIds))
    : [];

  const imageMap = new Map<string, string>();
  for (const img of allImages) {
    if (img.isPrimary && !imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }
  for (const img of allImages) {
    if (!imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }

  const recentListings = recentRows.map((v) => ({
    id: v.id,
    sellerId: v.sellerId,
    brandName: v.brandName,
    modelName: v.modelName,
    trim: v.trim,
    year: v.year,
    fuelType: v.fuelType,
    condition: v.condition,
    exteriorColor: v.exteriorColor,
    mileageKm: v.mileageKm,
    fobPriceUsd: v.fobPriceUsd,
    quantity: v.quantity,
    status: v.status,
    primaryImageUrl: imageMap.get(v.id) ?? null,
    sellerName: null,
    viewCount: v.viewCount,
    createdAt: v.createdAt.toISOString(),
  }));

  res.json({ ...totals, recentListings });
});

// ── GET /api/seller/listings ──────────────────────────────────────────────────
router.get("/seller/listings", authenticate, requireRole("seller", "admin", "super_admin"), async (req, res) => {
  const sellerId = req.user!.userId;
  const { status, page = "1", limit = "20" } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(vehicleListingsTable.sellerId, sellerId)];
  if (status) {
    conditions.push(eq(vehicleListingsTable.status, status as "draft" | "pending_review" | "published" | "rejected" | "archived"));
  }

  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(vehicleListingsTable).where(where).orderBy(desc(vehicleListingsTable.updatedAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(vehicleListingsTable).where(where),
  ]);

  const vehicleIds = rows.map((r) => r.id);
  const allImages = vehicleIds.length > 0
    ? await db.select().from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, vehicleIds))
    : [];

  const imageMap = new Map<string, string>();
  for (const img of allImages) {
    if (img.isPrimary && !imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }
  for (const img of allImages) {
    if (!imageMap.has(img.vehicleId)) imageMap.set(img.vehicleId, img.url);
  }

  res.json({
    data: rows.map((v) => {
      const { commissionAmountUsd, displayPriceUsd } = computeSellerCommission(
        v.fobPriceUsd, v.commissionSnapshot, v.commissionType,
      );
      return {
        id: v.id,
        sellerId: v.sellerId,
        brandName: v.brandName,
        modelName: v.modelName,
        trim: v.trim,
        year: v.year,
        fuelType: v.fuelType,
        condition: v.condition,
        exteriorColor: v.exteriorColor,
        mileageKm: v.mileageKm,
        fobPriceUsd: v.fobPriceUsd,
        commissionType: v.commissionType ?? null,
        commissionValue: v.commissionValue ? Number(v.commissionValue) : null,
        commissionAmountUsd,
        displayPriceUsd,
        quantity: v.quantity,
        status: v.status,
        primaryImageUrl: imageMap.get(v.id) ?? null,
        sellerName: null,
        viewCount: v.viewCount,
        createdAt: v.createdAt.toISOString(),
      };
    }),
    total: Number(count),
    page: pageNum,
    limit: limitNum,
  });
});

export default router;
