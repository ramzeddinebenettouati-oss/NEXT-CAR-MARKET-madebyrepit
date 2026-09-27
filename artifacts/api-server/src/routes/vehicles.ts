import { Router } from "express";
import { db, vehicleListingsTable, vehicleImagesTable, vehicleVideosTable, vehicleBrandsTable, vehicleModelsTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, desc, asc, sql, inArray } from "drizzle-orm";
import { authenticate, optionalAuthenticate, requireRole } from "../middlewares/auth";
import { isUUID, requireUuidParams } from "../lib/validate";
import { uploadVideo, getUploadUrl } from "../lib/upload";
import { scrubContactInfo } from "../lib/contact-protection";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();
const objectStorageService = new ObjectStorageService();
const ALLOWED_VEHICLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// ── helpers ──────────────────────────────────────────────────────────────────

type ViewerRole = "buyer" | "seller_own" | "admin";

function computeDisplayPrice(
  fobPriceUsd: string | number | null,
  commissionSnapshot: unknown,
  commissionType: string | null,
): number | null {
  const fob = fobPriceUsd ? Number(fobPriceUsd) : null;
  if (fob === null) return null;
  if (!commissionSnapshot || !commissionType) return fob;
  const snap = commissionSnapshot as Record<string, unknown>;
  const fixed = Number(snap.fixedAmountUsd ?? 0);
  const pct = Number(snap.percentageRate ?? 0);
  switch (commissionType) {
    case "fixed": return fob + fixed;
    case "percentage": return fob + fob * (pct / 100);
    case "hybrid": return fob + fixed + fob * (pct / 100);
    default: return fob;
  }
}

function computeCommissionAmount(
  fobPriceUsd: string | number | null,
  commissionSnapshot: unknown,
  commissionType: string | null,
): number | null {
  const fob = fobPriceUsd ? Number(fobPriceUsd) : null;
  if (fob === null || !commissionSnapshot || !commissionType) return null;
  const snap = commissionSnapshot as Record<string, unknown>;
  const fixed = Number(snap.fixedAmountUsd ?? 0);
  const pct = Number(snap.percentageRate ?? 0);
  switch (commissionType) {
    case "fixed": return fixed || null;
    case "percentage": return (fob * (pct / 100)) || null;
    case "hybrid": return (fixed + fob * (pct / 100)) || null;
    default: return null;
  }
}

function formatListing(
  v: typeof vehicleListingsTable.$inferSelect,
  viewerRole: ViewerRole = "buyer",
) {
  const isAdmin = viewerRole === "admin";
  const displayPriceUsd = computeDisplayPrice(v.fobPriceUsd, v.commissionSnapshot, v.commissionType);

  return {
    id: v.id,
    sellerId: v.sellerId,
    brandId: v.brandId,
    brandName: v.brandName,
    modelId: v.modelId,
    modelName: v.modelName,
    trim: v.trim,
    year: v.year,
    fuelType: v.fuelType,
    transmission: v.transmission,
    driveType: v.driveType,
    engineSizeL: v.engineSizeL,
    batteryCapacityKwh: v.batteryCapacityKwh,
    rangeKm: v.rangeKm,
    exteriorColor: v.exteriorColor,
    interiorColor: v.interiorColor,
    mileageKm: v.mileageKm,
    condition: v.condition,
    vin: v.vin,
    originPortId: v.originPortId,
    quantity: v.quantity,
    // Buyers see only the final marketplace price (FOB + commission); never raw FOB or commission breakdown.
    displayPriceUsd,
    // Non-buyers (seller dashboard, admin) also see the raw FOB price they entered.
    ...(viewerRole !== "buyer" ? { fobPriceUsd: v.fobPriceUsd } : {}),
    // Seller-own: show commission info for their vehicle so they can price negotiations correctly.
    ...(viewerRole === "seller_own" ? {
      commissionType: v.commissionType ?? null,
      commissionValue: v.commissionValue ? Number(v.commissionValue) : null,
      commissionAmountUsd: computeCommissionAmount(v.fobPriceUsd, v.commissionSnapshot, v.commissionType),
      commissionFixedAmountUsd: v.commissionSnapshot
        ? Number((v.commissionSnapshot as Record<string, unknown>).fixedAmountUsd ?? 0) || null
        : null,
    } : {}),
    // Admins get the full commission breakdown.
    ...(isAdmin ? {
      commissionRuleId: v.commissionRuleId ?? null,
      commissionType: v.commissionType ?? null,
      commissionValue: v.commissionValue ? Number(v.commissionValue) : null,
      commissionAmountUsd: computeCommissionAmount(v.fobPriceUsd, v.commissionSnapshot, v.commissionType),
      commissionSnapshot: v.commissionSnapshot ?? null,
    } : {}),
    // Scrub contact info on every read — defence-in-depth even if DB was edited directly
    description: v.description ? scrubContactInfo(v.description) : null,
    notes: v.notes ? scrubContactInfo(v.notes) : null,
    status: v.status,
    rejectionReason: v.rejectionReason,
    viewCount: v.viewCount,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

async function getListingWithImages(vehicleId: string, viewerRole: ViewerRole = "buyer") {
  const [vehicle] = await db
    .select()
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);
  if (!vehicle) return null;

  const [images, videos] = await Promise.all([
    db.select().from(vehicleImagesTable)
      .where(eq(vehicleImagesTable.vehicleId, vehicleId))
      .orderBy(vehicleImagesTable.displayOrder),
    db.select().from(vehicleVideosTable)
      .where(eq(vehicleVideosTable.vehicleId, vehicleId))
      .orderBy(vehicleVideosTable.createdAt),
  ]);

  const primaryImage = images.find((i) => i.isPrimary) ?? images[0];

  return {
    ...formatListing(vehicle, viewerRole),
    primaryImageUrl: primaryImage?.url ?? null,
    sellerName: null,
    images: images.map((i) => ({
      id: i.id,
      vehicleId: i.vehicleId,
      url: i.url,
      displayOrder: i.displayOrder,
      isPrimary: i.isPrimary,
    })),
    videos: videos.map((v) => ({
      id: v.id,
      vehicleId: v.vehicleId,
      url: v.url,
      title: v.title,
    })),
  };
}

// ── GET /api/vehicles — public listing search ─────────────────────────────────
router.get("/vehicles", optionalAuthenticate, async (req, res) => {
  const {
    brandId,
    brandName,
    modelName,
    fuelType,
    condition,
    yearMin,
    yearMax,
    priceMin,
    priceMax,
    sellerId,
    status,
    search,
    exteriorColor,
    originPortId,
    sortBy = "newest",
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;
  const evOnly = req.query.evOnly === "true";
  const inStock = req.query.inStock === "true";

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];

  // Public requests only see published listings unless a specific status is requested
  const isAdminRequest = req.user && ["super_admin", "admin"].includes(req.user.role);
  const isSellerRequest = req.user?.role === "seller";
  const viewerRole: ViewerRole = isAdminRequest ? "admin" : (isSellerRequest && sellerId === req.user?.userId ? "seller_own" : "buyer");

  if (status) {
    // Sellers can only filter their own listings by status
    if (!isAdminRequest && isSellerRequest && sellerId === req.user?.userId) {
      conditions.push(eq(vehicleListingsTable.status, status as "draft" | "pending_review" | "published" | "rejected" | "archived"));
    } else if (isAdminRequest) {
      conditions.push(eq(vehicleListingsTable.status, status as "draft" | "pending_review" | "published" | "rejected" | "archived"));
    } else {
      conditions.push(eq(vehicleListingsTable.status, "published"));
    }
  } else if (!isAdminRequest) {
    conditions.push(eq(vehicleListingsTable.status, "published"));
  }

  if (brandId) conditions.push(eq(vehicleListingsTable.brandId, brandId));
  if (brandName) conditions.push(ilike(vehicleListingsTable.brandName, `%${brandName}%`));
  if (modelName) conditions.push(ilike(vehicleListingsTable.modelName, `%${modelName}%`));
  if (fuelType) conditions.push(eq(vehicleListingsTable.fuelType, fuelType as "petrol" | "diesel" | "electric" | "hybrid" | "phev" | "hydrogen" | "lpg" | "other"));
  if (condition) conditions.push(eq(vehicleListingsTable.condition, condition as "new" | "used" | "certified_used"));
  if (sellerId) conditions.push(eq(vehicleListingsTable.sellerId, sellerId));
  if (yearMin) conditions.push(gte(vehicleListingsTable.year, parseInt(yearMin, 10)));
  if (yearMax) conditions.push(lte(vehicleListingsTable.year, parseInt(yearMax, 10)));
  if (priceMin) conditions.push(gte(vehicleListingsTable.fobPriceUsd, priceMin));
  if (priceMax) conditions.push(lte(vehicleListingsTable.fobPriceUsd, priceMax));
  if (exteriorColor) conditions.push(ilike(vehicleListingsTable.exteriorColor, `%${exteriorColor}%`));
  if (originPortId) conditions.push(eq(vehicleListingsTable.originPortId, originPortId));
  if (evOnly) conditions.push(inArray(vehicleListingsTable.fuelType, ["electric", "hybrid", "phev"]));
  if (inStock) conditions.push(sql`${vehicleListingsTable.quantity} > 0`);
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      sql`(${vehicleListingsTable.brandName} ilike ${term} or ${vehicleListingsTable.modelName} ilike ${term} or ${vehicleListingsTable.exteriorColor} ilike ${term})`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderClause = (() => {
    switch (sortBy) {
      case "oldest": return asc(vehicleListingsTable.createdAt);
      case "price_asc": return asc(vehicleListingsTable.fobPriceUsd);
      case "price_desc": return desc(vehicleListingsTable.fobPriceUsd);
      case "popular": return desc(vehicleListingsTable.viewCount);
      default: return desc(vehicleListingsTable.createdAt);
    }
  })();

  const [rows, [countRow]] = await Promise.all([
    db.select().from(vehicleListingsTable).where(where).orderBy(orderClause).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(vehicleListingsTable).where(where),
  ]);

  // Fetch primary images for all listings
  const vehicleIds = rows.map((r) => r.id);
  const allImages = vehicleIds.length > 0
    ? await db.select().from(vehicleImagesTable).where(inArray(vehicleImagesTable.vehicleId, vehicleIds))
    : [];

  const imageMap = new Map<string, string>();
  for (const img of allImages) {
    if (img.isPrimary && !imageMap.has(img.vehicleId)) {
      imageMap.set(img.vehicleId, img.url);
    }
  }
  // Fallback: first image if no primary marked
  for (const img of allImages) {
    if (!imageMap.has(img.vehicleId)) {
      imageMap.set(img.vehicleId, img.url);
    }
  }

  res.json({
    data: rows.map((v) => ({
      ...formatListing(v, viewerRole),
      primaryImageUrl: imageMap.get(v.id) ?? null,
      sellerName: null,
    })),
    total: Number(countRow?.count ?? 0),
    page: pageNum,
    limit: limitNum,
  });
});

const toUUID = (v: unknown): string | null =>
  typeof v === "string" && isUUID(v) ? v : null;

function toVehicleImageUrl(objectPath: string): string {
  return `/api/vehicle-images/${objectPath.replace(/^\/objects\//, "")}`;
}

function toVehicleImageObjectPath(url: string): string | null {
  const prefix = "/api/vehicle-images/";
  return url.startsWith(prefix) ? `/objects/${url.slice(prefix.length)}` : null;
}

function isOwnedVehicleImagePath(objectPath: string, userId: string): boolean {
  return objectPath.startsWith(`/objects/vehicle-images/${userId}/`);
}

async function deleteStoredVehicleImage(url: string, ownerId: string): Promise<void> {
  const objectPath = toVehicleImageObjectPath(url);
  if (!objectPath) return;
  try {
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: ownerId,
      visibility: "private",
    });
    await objectStorageService.deleteObjectEntity(objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return;
    throw error;
  }
}

// ── POST /api/vehicles/images/request-upload — seller-scoped App Storage URL
router.post(
  "/vehicles/images/request-upload",
  authenticate,
  requireRole("seller", "admin", "super_admin"),
  async (req, res) => {
    const { name, size, contentType } = req.body;
    if (
      typeof name !== "string" ||
      typeof size !== "number" ||
      size <= 0 ||
      size > 10 * 1024 * 1024 ||
      typeof contentType !== "string" ||
      !ALLOWED_VEHICLE_IMAGE_TYPES.has(contentType)
    ) {
      res.status(400).json({ error: "Bad request", message: "A JPEG, PNG, WebP, or GIF image up to 10 MB is required" });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL({
      namespace: "vehicle-images",
      ownerId: req.user!.userId,
    });
    res.json({
      uploadURL,
      objectPath: objectStorageService.normalizeObjectEntityPath(uploadURL),
      metadata: { name, size, contentType },
    });
  },
);

// ── POST /api/vehicles — create listing (seller) ──────────────────────────────
router.post("/vehicles", authenticate, requireRole("seller", "admin", "super_admin"), async (req, res) => {
  const {
    brandId, brandName, modelId, modelName, trim, year, fuelType,
    transmission, driveType, engineSizeL, batteryCapacityKwh, rangeKm,
    exteriorColor, interiorColor, mileageKm, condition, vin, originPortId,
    quantity, fobPriceUsd, description, notes,
  } = req.body;

  if (!brandName || !modelName || !year || !fuelType || !fobPriceUsd) {
    res.status(400).json({ error: "Validation error", message: "brandName, modelName, year, fuelType, and fobPriceUsd are required" });
    return;
  }

  const [listing] = await db
    .insert(vehicleListingsTable)
    .values({
      sellerId: req.user!.userId,
      brandId: toUUID(brandId),
      brandName: String(brandName),
      modelId: toUUID(modelId),
      modelName: String(modelName),
      trim: trim || null,
      year: parseInt(year, 10),
      fuelType,
      transmission: transmission || null,
      driveType: driveType || null,
      engineSizeL: engineSizeL || null,
      batteryCapacityKwh: batteryCapacityKwh || null,
      rangeKm: rangeKm ?? null,
      exteriorColor: exteriorColor || null,
      interiorColor: interiorColor || null,
      mileageKm: mileageKm ?? 0,
      condition: condition ?? "new",
      vin: vin || null,
      originPortId: toUUID(originPortId),
      quantity: quantity ?? 1,
      fobPriceUsd: String(fobPriceUsd),
      description: description ? scrubContactInfo(String(description)) : null,
      notes: notes ? scrubContactInfo(String(notes)) : null,
      status: "draft",
    })
    .returning();

  const detail = await getListingWithImages(listing.id);
  res.status(201).json(detail);
});

// ── GET /api/vehicles/:vehicleId ──────────────────────────────────────────────
router.get("/vehicles/:vehicleId", optionalAuthenticate, requireUuidParams("vehicleId"), async (req, res) => {
  const { vehicleId } = req.params as Record<string, string>;

  const user = req.user;
  const isAdminUser = user && ["super_admin", "admin"].includes(user.role);

  // Light pre-fetch to determine ownership before formatting (avoids double-format)
  const [rawVehicle] = await db
    .select({ id: vehicleListingsTable.id, status: vehicleListingsTable.status, sellerId: vehicleListingsTable.sellerId })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!rawVehicle) {
    res.status(404).json({ error: "Not found", message: "Vehicle not found" });
    return;
  }

  // Only show non-published vehicles to owner or admins
  if (rawVehicle.status !== "published") {
    const isOwner = user?.userId === rawVehicle.sellerId;
    if (!isOwner && !isAdminUser) {
      res.status(404).json({ error: "Not found", message: "Vehicle not found" });
      return;
    }
  } else {
    // Increment view count for published listings (fire-and-forget)
    db.update(vehicleListingsTable)
      .set({ viewCount: sql`${vehicleListingsTable.viewCount} + 1` })
      .where(eq(vehicleListingsTable.id, vehicleId))
      .catch(() => {});
  }

  const isOwner = user?.userId === rawVehicle.sellerId;
  const detailViewerRole: ViewerRole = isAdminUser ? "admin" : (isOwner ? "seller_own" : "buyer");
  const detail = await getListingWithImages(vehicleId, detailViewerRole);
  if (!detail) {
    res.status(404).json({ error: "Not found", message: "Vehicle not found" });
    return;
  }

  res.json(detail);
});

// ── PATCH /api/vehicles/:vehicleId ────────────────────────────────────────────
router.patch("/vehicles/:vehicleId", authenticate, requireUuidParams("vehicleId"), async (req, res) => {
  const { vehicleId } = req.params as Record<string, string>;
  const user = req.user!;

  const [existing] = await db
    .select({ sellerId: vehicleListingsTable.sellerId, status: vehicleListingsTable.status })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isOwner = existing.sellerId === user.userId;
  const isAdmin = ["super_admin", "admin"].includes(user.role);
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Forbidden", message: "You do not own this listing" });
    return;
  }

  // Sellers can only edit draft or rejected listings
  if (isOwner && !isAdmin && !["draft", "rejected"].includes(existing.status)) {
    res.status(400).json({ error: "Bad request", message: "Listing cannot be edited in its current state" });
    return;
  }

  const {
    brandId, brandName, modelId, modelName, trim, year, fuelType,
    transmission, driveType, engineSizeL, batteryCapacityKwh, rangeKm,
    exteriorColor, interiorColor, mileageKm, condition, vin, originPortId,
    quantity, fobPriceUsd, description, notes,
    // Admin-only fields
    status, rejectionReason,
  } = req.body;

  const updates: Partial<typeof vehicleListingsTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (brandId !== undefined) updates.brandId = toUUID(brandId);
  if (brandName !== undefined) updates.brandName = brandName;
  if (modelId !== undefined) updates.modelId = toUUID(modelId);
  if (modelName !== undefined) updates.modelName = modelName;
  if (trim !== undefined) updates.trim = trim || null;
  if (year !== undefined) updates.year = parseInt(year, 10);
  if (fuelType !== undefined) updates.fuelType = fuelType;
  if (transmission !== undefined) updates.transmission = transmission || null;
  if (driveType !== undefined) updates.driveType = driveType || null;
  if (engineSizeL !== undefined) updates.engineSizeL = engineSizeL || null;
  if (batteryCapacityKwh !== undefined) updates.batteryCapacityKwh = batteryCapacityKwh || null;
  if (rangeKm !== undefined) updates.rangeKm = rangeKm;
  if (exteriorColor !== undefined) updates.exteriorColor = exteriorColor || null;
  if (interiorColor !== undefined) updates.interiorColor = interiorColor || null;
  if (mileageKm !== undefined) updates.mileageKm = mileageKm;
  if (condition !== undefined) updates.condition = condition;
  if (vin !== undefined) updates.vin = vin || null;
  if (originPortId !== undefined) updates.originPortId = toUUID(originPortId);
  if (quantity !== undefined) updates.quantity = quantity;
  if (fobPriceUsd !== undefined) updates.fobPriceUsd = String(fobPriceUsd);
  if (description !== undefined) updates.description = description ? scrubContactInfo(String(description)) : null;
  if (notes !== undefined) updates.notes = notes ? scrubContactInfo(String(notes)) : null;

  // Admin-only: status moderation and rejection reason
  if (isAdmin) {
    if (status !== undefined) updates.status = status;
    if (rejectionReason !== undefined) updates.rejectionReason = rejectionReason ?? null;
  } else if (isOwner && existing.status === "rejected") {
    // Seller re-edits a rejected listing → reset to draft
    updates.status = "draft";
    updates.rejectionReason = null;
  }

  await db.update(vehicleListingsTable).set(updates).where(eq(vehicleListingsTable.id, vehicleId));

  const detail = await getListingWithImages(vehicleId);
  res.json(detail);
});

// ── DELETE /api/vehicles/:vehicleId ───────────────────────────────────────────
router.delete("/vehicles/:vehicleId", authenticate, requireUuidParams("vehicleId"), async (req, res) => {
  const { vehicleId } = req.params as Record<string, string>;
  const user = req.user!;

  const [existing] = await db
    .select({ sellerId: vehicleListingsTable.sellerId })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isOwner = existing.sellerId === user.userId;
  const isAdmin = ["super_admin", "admin"].includes(user.role);
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Revoke and delete persistent image objects before deleting database rows.
  const images = await db
    .select()
    .from(vehicleImagesTable)
    .where(eq(vehicleImagesTable.vehicleId, vehicleId));

  try {
    for (const img of images) {
      await deleteStoredVehicleImage(img.url, existing.sellerId);
    }
  } catch {
    res.status(500).json({ error: "Storage cleanup failed", message: "The listing was not deleted" });
    return;
  }

  for (const img of images) {
    const filename = img.url.split("/").pop();
    if (filename && !toVehicleImageObjectPath(img.url)) {
      const filePath = path.resolve(__dirname, "../../../uploads", filename);
      fs.unlink(filePath, () => {});
    }
  }

  await db.delete(vehicleListingsTable).where(eq(vehicleListingsTable.id, vehicleId));
  res.json({ message: "Listing deleted" });
});

// ── POST /api/vehicles/:vehicleId/submit ──────────────────────────────────────
router.post("/vehicles/:vehicleId/submit", authenticate, requireRole("seller", "admin", "super_admin"), requireUuidParams("vehicleId"), async (req, res) => {
  const { vehicleId } = req.params as Record<string, string>;
  const user = req.user!;

  const [existing] = await db
    .select()
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isOwner = existing.sellerId === user.userId;
  const isAdmin = ["super_admin", "admin"].includes(user.role);
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (!["draft", "rejected"].includes(existing.status)) {
    res.status(400).json({ error: "Bad request", message: "Only draft or rejected listings can be submitted for review" });
    return;
  }

  await db
    .update(vehicleListingsTable)
    .set({ status: "pending_review", rejectionReason: null, updatedAt: new Date() })
    .where(eq(vehicleListingsTable.id, vehicleId));

  const detail = await getListingWithImages(vehicleId);
  res.json(detail);
});

// ── POST /api/vehicles/:vehicleId/images/attach — persist an App Storage image
router.post(
  "/vehicles/:vehicleId/images/attach",
  authenticate,
  requireRole("seller", "admin", "super_admin"),
  requireUuidParams("vehicleId"),
  async (req, res) => {
    const { vehicleId } = req.params as Record<string, string>;
    const user = req.user!;
    const objectPath = typeof req.body.objectPath === "string" ? req.body.objectPath : "";
    const isPrimary = req.body.isPrimary === true;

    if (!isOwnedVehicleImagePath(objectPath, user.userId)) {
      res.status(400).json({ error: "Bad request", message: "A valid objectPath is required" });
      return;
    }

    const [existing] = await db
      .select({ sellerId: vehicleListingsTable.sellerId })
      .from(vehicleListingsTable)
      .where(eq(vehicleListingsTable.id, vehicleId))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const isOwner = existing.sellerId === user.userId;
    const isAdmin = ["super_admin", "admin"].includes(user.role);
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [{ count: existingCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vehicleImagesTable)
      .where(eq(vehicleImagesTable.vehicleId, vehicleId));

    if (Number(existingCount) >= 20) {
      res.status(400).json({ error: "Bad request", message: "Maximum 20 images per listing" });
      return;
    }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const [metadata] = await objectFile.getMetadata();
      const contentType = String(metadata.contentType ?? "");
      const size = Number(metadata.size ?? 0);
      if (!ALLOWED_VEHICLE_IMAGE_TYPES.has(contentType)) {
        res.status(400).json({ error: "Bad request", message: "Uploaded object is not a supported image" });
        return;
      }
      if (!Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) {
        await objectStorageService.deleteObjectEntity(objectPath);
        res.status(400).json({ error: "Bad request", message: "Uploaded image must be 10 MB or smaller" });
        return;
      }

      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
        owner: user.userId,
        visibility: "public",
      });
      const imageUrl = toVehicleImageUrl(normalizedPath);
      const [duplicate] = await db
        .select({ id: vehicleImagesTable.id })
        .from(vehicleImagesTable)
        .where(eq(vehicleImagesTable.url, imageUrl))
        .limit(1);
      if (duplicate) {
        res.status(409).json({ error: "Conflict", message: "This image is already attached to a listing" });
        return;
      }

      if (isPrimary) {
        await db
          .update(vehicleImagesTable)
          .set({ isPrimary: false })
          .where(eq(vehicleImagesTable.vehicleId, vehicleId));
      }

      const [image] = await db
        .insert(vehicleImagesTable)
        .values({
          vehicleId,
          url: imageUrl,
          displayOrder: Number(existingCount),
          isPrimary: isPrimary || Number(existingCount) === 0,
        })
        .returning();

      res.status(201).json({
        id: image.id,
        vehicleId: image.vehicleId,
        url: image.url,
        displayOrder: image.displayOrder,
        isPrimary: image.isPrimary,
      });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "Bad request", message: "Uploaded object was not found" });
        return;
      }
      throw error;
    }
  },
);

// Public read endpoint for listing images whose App Storage ACL is public.
router.get("/vehicle-images/*path", async (req, res) => {
  try {
    const rawPath = req.params.path;
    const relativePath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${relativePath}`);
    const canRead = await objectStorageService.canAccessObjectEntity({
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });

    if (!canRead) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [metadata] = await objectFile.getMetadata();
    const contentType = String(metadata.contentType ?? "");
    if (!ALLOWED_VEHICLE_IMAGE_TYPES.has(contentType)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'");
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    throw error;
  }
});

// ── DELETE /api/vehicles/:vehicleId/images/:imageId ───────────────────────────
router.delete("/vehicles/:vehicleId/images/:imageId", authenticate, requireUuidParams("vehicleId", "imageId"), async (req, res) => {
  const { vehicleId, imageId } = req.params as Record<string, string>;
  const user = req.user!;

  const [existing] = await db
    .select({ sellerId: vehicleListingsTable.sellerId })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isOwner = existing.sellerId === user.userId;
  const isAdmin = ["super_admin", "admin"].includes(user.role);
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [image] = await db
    .select()
    .from(vehicleImagesTable)
    .where(and(eq(vehicleImagesTable.id, imageId), eq(vehicleImagesTable.vehicleId, vehicleId)))
    .limit(1);

  if (!image) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const filename = image.url.split("/").pop();
  if (filename) {
    const filePath = path.resolve(__dirname, "../../../uploads", filename);
    fs.unlink(filePath, () => {});
  }

  try {
    await deleteStoredVehicleImage(image.url, existing.sellerId);
  } catch {
    res.status(500).json({ error: "Storage cleanup failed", message: "The image was not deleted" });
    return;
  }

  await db.delete(vehicleImagesTable).where(eq(vehicleImagesTable.id, imageId));

  // If deleted image was primary, promote the next one
  if (image.isPrimary) {
    const [next] = await db
      .select()
      .from(vehicleImagesTable)
      .where(eq(vehicleImagesTable.vehicleId, vehicleId))
      .orderBy(vehicleImagesTable.displayOrder)
      .limit(1);
    if (next) {
      await db.update(vehicleImagesTable).set({ isPrimary: true }).where(eq(vehicleImagesTable.id, next.id));
    }
  }

  res.json({ message: "Image deleted" });
});

// ── POST /api/vehicles/:vehicleId/videos — add video (file upload or URL) ─────
router.post(
  "/vehicles/:vehicleId/videos",
  authenticate,
  requireRole("seller", "admin", "super_admin"),
  uploadVideo.single("file"),
  async (req, res) => {
    const { vehicleId } = req.params as Record<string, string>;
    const user = req.user!;
    const { url: externalUrl, title } = req.body;

    // Resolve video URL: uploaded file takes precedence over external URL
    let videoUrl: string | null = null;
    if (req.file) {
      videoUrl = getUploadUrl(req.file.filename);
    } else if (externalUrl && typeof externalUrl === "string") {
      videoUrl = externalUrl.trim();
    }

    if (!videoUrl) {
      res.status(400).json({ error: "Bad request", message: "Provide either a video file or a url" });
      return;
    }

    const [existing] = await db
      .select({ sellerId: vehicleListingsTable.sellerId })
      .from(vehicleListingsTable)
      .where(eq(vehicleListingsTable.id, vehicleId))
      .limit(1);

    if (!existing) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(404).json({ error: "Not found" });
      return;
    }

    const isOwner = existing.sellerId === user.userId;
    const isAdmin = ["super_admin", "admin"].includes(user.role);
    if (!isOwner && !isAdmin) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [video] = await db
      .insert(vehicleVideosTable)
      .values({ vehicleId, url: videoUrl, title: title ?? null })
      .returning();

    res.status(201).json({
      id: video.id,
      vehicleId: video.vehicleId,
      url: video.url,
      title: video.title,
    });
  }
);

// ── DELETE /api/vehicles/:vehicleId/videos/:videoId ────────────────────────────
router.delete("/vehicles/:vehicleId/videos/:videoId", authenticate, requireUuidParams("vehicleId", "videoId"), async (req, res) => {
  const { vehicleId, videoId } = req.params as Record<string, string>;
  const user = req.user!;

  const [existing] = await db
    .select({ sellerId: vehicleListingsTable.sellerId })
    .from(vehicleListingsTable)
    .where(eq(vehicleListingsTable.id, vehicleId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const isOwner = existing.sellerId === user.userId;
  const isAdmin = ["super_admin", "admin"].includes(user.role);
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [video] = await db
    .select()
    .from(vehicleVideosTable)
    .where(and(eq(vehicleVideosTable.id, videoId), eq(vehicleVideosTable.vehicleId, vehicleId)))
    .limit(1);

  if (!video) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(vehicleVideosTable).where(eq(vehicleVideosTable.id, videoId));

  res.json({ message: "Video deleted" });
});

export default router;
