import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count, inArray, and } from "drizzle-orm";
import {
  db,
  shipmentsTable,
  shipmentTrackingTable,
  shippingDocumentsTable,
  ordersTable,
  usersTable,
  vehicleListingsTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

async function buildUserMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
}

type ShipmentRow = typeof shipmentsTable.$inferSelect;

function buildShipmentSummary(
  s: ShipmentRow,
  userMap: Map<string, string>,
  vehicleTitle: string | null,
  buyerName: string | null,
  documentCount: number,
) {
  return {
    id: s.id,
    orderId: s.orderId,
    freightRequestId: s.freightRequestId ?? null,
    forwarderId: s.forwarderId,
    forwarderName: userMap.get(s.forwarderId) ?? null,
    vehicleTitle,
    buyerName,
    status: s.status,
    notes: s.notes ?? null,
    documentCount,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// ── GET /shipments ─────────────────────────────────────────────────────────────

router.get(
  "/shipments",
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string | undefined;
    const orderIdFilter = req.query.orderId as string | undefined;

    // Load orders for role-scoping
    const orders = await db
      .select({ id: ordersTable.id, buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId, vehicleId: ordersTable.vehicleId })
      .from(ordersTable);
    const orderMap = new Map(orders.map(o => [o.id, o]));

    const rows = await db
      .select()
      .from(shipmentsTable)
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(isAdmin ? 1000 : 500);

    let filtered = rows.filter(s => {
      const order = orderMap.get(s.orderId);
      if (!order) return false;
      if (isAdmin) return true;
      if (role === "buyer") return order.buyerId === userId;
      if (role === "seller") return order.sellerId === userId;
      if (role === "freight_forwarder") return s.forwarderId === userId;
      return false;
    });

    if (statusFilter) filtered = filtered.filter(s => s.status === statusFilter);
    if (orderIdFilter) filtered = filtered.filter(s => s.orderId === orderIdFilter);

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    if (!paged.length) {
      res.json({ data: [], total, page, limit });
      return;
    }

    const shipmentIds = paged.map(s => s.id);
    const orderIds = [...new Set(paged.map(s => s.orderId))];

    const [enrichedOrders, docCounts] = await Promise.all([
      db
        .select({
          id: ordersTable.id,
          buyerId: ordersTable.buyerId,
          vehicleBrandName: vehicleListingsTable.brandName,
          vehicleModelName: vehicleListingsTable.modelName,
          vehicleYear: vehicleListingsTable.year,
        })
        .from(ordersTable)
        .leftJoin(vehicleListingsTable, eq(ordersTable.vehicleId, vehicleListingsTable.id))
        .where(inArray(ordersTable.id, orderIds)),

      db
        .select({ shipmentId: shippingDocumentsTable.shipmentId, cnt: count() })
        .from(shippingDocumentsTable)
        .where(inArray(shippingDocumentsTable.shipmentId, shipmentIds))
        .groupBy(shippingDocumentsTable.shipmentId),
    ]);

    const enrichedOrderMap = new Map(enrichedOrders.map(o => [o.id, o]));
    const docCountMap = new Map(docCounts.map(d => [d.shipmentId, Number(d.cnt)]));

    const allUserIds = [
      ...paged.map(s => s.forwarderId),
      ...enrichedOrders.map(o => o.buyerId).filter(Boolean) as string[],
    ];
    const userMap = await buildUserMap(allUserIds);

    const data = paged.map(s => {
      const o = enrichedOrderMap.get(s.orderId);
      return buildShipmentSummary(
        s,
        userMap,
        o ? `${o.vehicleYear ?? ""} ${o.vehicleBrandName ?? ""} ${o.vehicleModelName ?? ""}`.trim() || null : null,
        o?.buyerId ? (userMap.get(o.buyerId) ?? null) : null,
        docCountMap.get(s.id) ?? 0,
      );
    });

    res.json({ data, total, page, limit });
  },
);

// ── Shipment detail builder ────────────────────────────────────────────────────

async function loadShipmentDetail(shipmentId: string, callerRole: string) {
  const [s] = await db
    .select()
    .from(shipmentsTable)
    .where(eq(shipmentsTable.id, shipmentId))
    .limit(1);
  if (!s) return null;

  const [order] = await db
    .select({ buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId, vehicleId: ordersTable.vehicleId })
    .from(ordersTable)
    .where(eq(ordersTable.id, s.orderId))
    .limit(1);

  const [vehicle] = order?.vehicleId
    ? await db
        .select({ brandName: vehicleListingsTable.brandName, modelName: vehicleListingsTable.modelName, year: vehicleListingsTable.year })
        .from(vehicleListingsTable)
        .where(eq(vehicleListingsTable.id, order.vehicleId))
        .limit(1)
    : [null];

  const tracking = await db
    .select()
    .from(shipmentTrackingTable)
    .where(eq(shipmentTrackingTable.shipmentId, s.id))
    .orderBy(shipmentTrackingTable.createdAt);

  const [docCount] = await db
    .select({ cnt: count() })
    .from(shippingDocumentsTable)
    .where(eq(shippingDocumentsTable.shipmentId, s.id));

  const allUserIds = [
    s.forwarderId,
    ...(order ? [order.buyerId, order.sellerId] : []),
    ...tracking.map(t => t.actorId),
  ].filter(Boolean) as string[];
  const userMap = await buildUserMap(allUserIds);

  return {
    id: s.id,
    orderId: s.orderId,
    freightRequestId: s.freightRequestId ?? null,
    forwarderId: s.forwarderId,
    forwarderName: userMap.get(s.forwarderId) ?? null,
    vehicleTitle: vehicle ? `${vehicle.year} ${vehicle.brandName} ${vehicle.modelName}`.trim() : null,
    buyerName: order?.buyerId ? (userMap.get(order.buyerId) ?? null) : null,
    sellerName: order?.sellerId ? (userMap.get(order.sellerId) ?? null) : null,
    status: s.status,
    notes: s.notes ?? null,
    tracking: tracking.map(t => ({
      id: t.id,
      shipmentId: t.shipmentId,
      status: t.status,
      actorId: t.actorId,
      actorName: userMap.get(t.actorId) ?? null,
      note: t.note ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    documentCount: Number(docCount?.cnt ?? 0),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    _order: order,
  };
}

// ── GET /shipments/:shipmentId ─────────────────────────────────────────────────

router.get(
  "/shipments/:shipmentId",
  authenticate,
  requireUuidParams("shipmentId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const detail = await loadShipmentDetail(req.params.shipmentId as string, role);
    if (!detail) { res.status(404).json({ error: "Shipment not found" }); return; }

    const order = detail._order;
    if (!isAdmin) {
      const allowed =
        (role === "buyer" && order?.buyerId === userId) ||
        (role === "seller" && order?.sellerId === userId) ||
        (role === "freight_forwarder" && detail.forwarderId === userId);
      if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    }

    const { _order: _o, ...response } = detail;
    res.json(response);
  },
);

// ── GET /orders/:orderId/shipment ──────────────────────────────────────────────

router.get(
  "/orders/:orderId/shipment",
  authenticate,
  requireUuidParams("orderId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [s] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.orderId, req.params.orderId as string))
      .limit(1);

    if (!s) { res.status(404).json({ error: "No shipment found for this order" }); return; }

    const detail = await loadShipmentDetail(s.id, role);
    if (!detail) { res.status(404).json({ error: "Shipment not found" }); return; }

    const order = detail._order;
    if (!isAdmin) {
      const allowed =
        (role === "buyer" && order?.buyerId === userId) ||
        (role === "seller" && order?.sellerId === userId) ||
        (role === "freight_forwarder" && detail.forwarderId === userId);
      if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    }

    const { _order: _o, ...response } = detail;
    res.json(response);
  },
);

// ── PATCH /shipments/:shipmentId/status ────────────────────────────────────────
// Forwarder (assigned) or admin updates shipment status. Creates tracking event. Notifies buyer.

router.patch(
  "/shipments/:shipmentId/status",
  authenticate,
  requireUuidParams("shipmentId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const { status, note } = req.body as { status: string; note?: string };
    if (!status) { res.status(400).json({ error: "status is required" }); return; }

    const [s] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, req.params.shipmentId as string))
      .limit(1);

    if (!s) { res.status(404).json({ error: "Shipment not found" }); return; }

    if (!isAdmin && !(role === "freight_forwarder" && s.forwarderId === userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(shipmentsTable)
        .set({ status: status as any, updatedAt: new Date() })
        .where(eq(shipmentsTable.id, s.id));

      await tx.insert(shipmentTrackingTable).values({
        shipmentId: s.id,
        status: status as any,
        actorId: userId,
        note: note ?? null,
      });
    });

    // Notify buyer
    const [order] = await db
      .select({ buyerId: ordersTable.buyerId })
      .from(ordersTable)
      .where(eq(ordersTable.id, s.orderId))
      .limit(1);

    if (order?.buyerId) {
      const statusLabel = status.replace(/_/g, " ");
      await createNotification({
        userId: order.buyerId,
        type: "order_update",
        title: "Shipment Status Updated",
        body: `Your shipment is now: ${statusLabel}${note ? ` — ${note}` : ""}`,
      }).catch(() => {});
    }

    const detail = await loadShipmentDetail(s.id, role);
    const { _order: _o, ...response } = detail!;
    res.json(response);
  },
);

// ── GET /shipments/:shipmentId/tracking ────────────────────────────────────────

router.get(
  "/shipments/:shipmentId/tracking",
  authenticate,
  requireUuidParams("shipmentId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [s] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, req.params.shipmentId as string))
      .limit(1);

    if (!s) { res.status(404).json({ error: "Shipment not found" }); return; }

    if (!isAdmin) {
      const [order] = await db
        .select({ buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId })
        .from(ordersTable)
        .where(eq(ordersTable.id, s.orderId))
        .limit(1);
      const allowed =
        (role === "buyer" && order?.buyerId === userId) ||
        (role === "seller" && order?.sellerId === userId) ||
        (role === "freight_forwarder" && s.forwarderId === userId);
      if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    }

    const tracking = await db
      .select()
      .from(shipmentTrackingTable)
      .where(eq(shipmentTrackingTable.shipmentId, s.id))
      .orderBy(shipmentTrackingTable.createdAt);

    const actorIds = [...new Set(tracking.map(t => t.actorId))];
    const userMap = await buildUserMap(actorIds);

    res.json({
      data: tracking.map(t => ({
        id: t.id,
        shipmentId: t.shipmentId,
        status: t.status,
        actorId: t.actorId,
        actorName: userMap.get(t.actorId) ?? null,
        note: t.note ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  },
);

// ── GET /shipments/:shipmentId/documents ───────────────────────────────────────

router.get(
  "/shipments/:shipmentId/documents",
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [s] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, req.params.shipmentId as string))
      .limit(1);

    if (!s) { res.status(404).json({ error: "Shipment not found" }); return; }

    const [order] = await db
      .select({ buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId })
      .from(ordersTable)
      .where(eq(ordersTable.id, s.orderId))
      .limit(1);

    const isBuyer = role === "buyer" && order?.buyerId === userId;
    const isSeller = role === "seller" && order?.sellerId === userId;
    const isForwarder = role === "freight_forwarder" && s.forwarderId === userId;

    if (!isAdmin && !isBuyer && !isSeller && !isForwarder) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const docs = await db
      .select()
      .from(shippingDocumentsTable)
      .where(eq(shippingDocumentsTable.shipmentId, s.id))
      .orderBy(shippingDocumentsTable.createdAt);

    // Role-filtered visibility
    const filtered = docs.filter(d => {
      if (isAdmin || isForwarder) return true;
      if (isBuyer) return d.visibleToBuyer;
      if (isSeller) return d.visibleToSeller;
      return false;
    });

    const uploaderIds = [...new Set(filtered.map(d => d.uploadedById))];
    const userMap = await buildUserMap(uploaderIds);

    res.json(filtered.map(d => ({
      id: d.id,
      shipmentId: d.shipmentId,
      documentType: d.documentType,
      objectPath: d.objectPath,
      fileName: d.fileName,
      uploadedById: d.uploadedById,
      uploaderName: userMap.get(d.uploadedById) ?? null,
      visibleToBuyer: d.visibleToBuyer,
      visibleToSeller: d.visibleToSeller,
      createdAt: d.createdAt.toISOString(),
    })));
  },
);

// ── POST /shipments/:shipmentId/documents ──────────────────────────────────────

// Default visibility per document type
const BUYER_VISIBLE_TYPES = new Set([
  "bill_of_lading", "commercial_invoice", "packing_list",
  "insurance_certificate", "arrival_notice",
]);
const SELLER_VISIBLE_TYPES = new Set([
  "bill_of_lading", "commercial_invoice", "packing_list", "arrival_notice",
]);

router.post(
  "/shipments/:shipmentId/documents",
  authenticate,
  requireRole("freight_forwarder", "admin", "super_admin"),
  requireUuidParams("shipmentId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [s] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, req.params.shipmentId as string))
      .limit(1);

    if (!s) { res.status(404).json({ error: "Shipment not found" }); return; }
    if (!isAdmin && s.forwarderId !== userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const { documentType, objectPath, fileName, visibleToBuyer, visibleToSeller } = req.body as {
      documentType: string;
      objectPath: string;
      fileName: string;
      visibleToBuyer?: boolean;
      visibleToSeller?: boolean;
    };

    if (!documentType || !objectPath || !fileName) {
      res.status(400).json({ error: "documentType, objectPath, and fileName are required" }); return;
    }

    const defaultBuyerVisible = visibleToBuyer !== undefined ? visibleToBuyer : BUYER_VISIBLE_TYPES.has(documentType);
    const defaultSellerVisible = visibleToSeller !== undefined ? visibleToSeller : SELLER_VISIBLE_TYPES.has(documentType);

    const [doc] = await db
      .insert(shippingDocumentsTable)
      .values({
        shipmentId: s.id,
        documentType: documentType as any,
        objectPath,
        fileName,
        uploadedById: userId,
        visibleToBuyer: defaultBuyerVisible,
        visibleToSeller: defaultSellerVisible,
      })
      .returning();

    const userMap = await buildUserMap([doc.uploadedById]);

    res.status(201).json({
      id: doc.id,
      shipmentId: doc.shipmentId,
      documentType: doc.documentType,
      objectPath: doc.objectPath,
      fileName: doc.fileName,
      uploadedById: doc.uploadedById,
      uploaderName: userMap.get(doc.uploadedById) ?? null,
      visibleToBuyer: doc.visibleToBuyer,
      visibleToSeller: doc.visibleToSeller,
      createdAt: doc.createdAt.toISOString(),
    });
  },
);

// ── DELETE /shipments/:shipmentId/documents/:documentId ────────────────────────

router.delete(
  "/shipments/:shipmentId/documents/:documentId",
  authenticate,
  requireUuidParams("shipmentId", "documentId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [s] = await db
      .select()
      .from(shipmentsTable)
      .where(eq(shipmentsTable.id, req.params.shipmentId as string))
      .limit(1);

    if (!s) { res.status(404).json({ error: "Shipment not found" }); return; }
    if (!isAdmin && !(role === "freight_forwarder" && s.forwarderId === userId)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const [doc] = await db
      .select()
      .from(shippingDocumentsTable)
      .where(and(
        eq(shippingDocumentsTable.id, req.params.documentId as string),
        eq(shippingDocumentsTable.shipmentId, s.id),
      ))
      .limit(1);

    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    await db
      .delete(shippingDocumentsTable)
      .where(eq(shippingDocumentsTable.id, doc.id));

    res.json({ message: "Document deleted" });
  },
);

export default router;
