import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count, inArray, and, or, sql } from "drizzle-orm";
import {
  db,
  freightRequestsTable,
  shippingQuotesTable,
  ordersTable,
  usersTable,
  vehicleListingsTable,
  orderStatusHistoryTable,
  shipmentsTable,
  shipmentTrackingTable,
} from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";
import { createNotification } from "../lib/notifications";
import { scrubContactInfo } from "../lib/contact-protection";

const router: IRouter = Router();

// ── User map helper ────────────────────────────────────────────────────────────

async function buildUserMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
}

// ── Quote record builder ───────────────────────────────────────────────────────

type QuoteRow = typeof shippingQuotesTable.$inferSelect;

function buildQuoteRecord(q: QuoteRow, userMap: Map<string, string>) {
  return {
    id: q.id,
    freightRequestId: q.freightRequestId,
    orderId: q.orderId,
    forwarderId: q.forwarderId,
    forwarderName: userMap.get(q.forwarderId) ?? null,
    freightCostUsd: Number(q.freightCostUsd),
    insuranceUsd: Number(q.insuranceUsd),
    customsUsd: Number(q.customsUsd),
    portChargesUsd: Number(q.portChargesUsd),
    documentationUsd: Number(q.documentationUsd),
    totalUsd: Number(q.totalUsd),
    currency: q.currency,
    estimatedDaysMin: q.estimatedDaysMin ?? null,
    estimatedDaysMax: q.estimatedDaysMax ?? null,
    notes: q.notes ?? null,
    status: q.status,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    rejectedAt: q.rejectedAt?.toISOString() ?? null,
    rejectionNote: q.rejectionNote ?? null,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}

// ── GET /freight-requests ─────────────────────────────────────────────────────
// Forwarders see open requests; sellers see their own; admins see all.

router.get(
  "/freight-requests",
  authenticate,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";
    const isForwarder = role === "freight_forwarder";
    const isSeller = role === "seller";

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string | undefined;

    // Build base query — join orders to get sellerId
    const orders = await db
      .select({ id: ordersTable.id, sellerId: ordersTable.sellerId, buyerId: ordersTable.buyerId })
      .from(ordersTable);
    const orderMap = new Map(orders.map(o => [o.id, o]));

    // For forwarders: pre-fetch the set of request IDs they have a quote on
    // so we can gate non-open requests to participation only
    let forwarderQuoteRequestIds = new Set<string>();
    if (isForwarder) {
      const myQuoteRows = await db
        .select({ freightRequestId: shippingQuotesTable.freightRequestId })
        .from(shippingQuotesTable)
        .where(eq(shippingQuotesTable.forwarderId, userId));
      forwarderQuoteRequestIds = new Set(myQuoteRows.map(q => q.freightRequestId));
    }

    // Fetch freight requests with quote counts
    const rows = await db
      .select()
      .from(freightRequestsTable)
      .orderBy(desc(freightRequestsTable.createdAt))
      .limit(isAdmin ? 1000 : 500);

    // Filter by role — forwarder sees open requests (any bidder) + non-open only if they participated
    let filtered = rows.filter(r => {
      const order = orderMap.get(r.orderId);
      if (!order) return false;
      if (isAdmin) return true;
      if (isForwarder) {
        if (r.status === "open") return true;
        // Non-open: only visible to forwarders who submitted a quote
        return forwarderQuoteRequestIds.has(r.id);
      }
      if (isSeller) return order.sellerId === userId;
      return false;
    });

    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    if (!paged.length) {
      res.json({ data: [], total, page, limit });
      return;
    }

    // Enrich with order+vehicle info and quote counts
    const reqOrderIds = [...new Set(paged.map(r => r.orderId))];
    const reqIds = paged.map(r => r.id);

    const [enrichedOrders, quoteCounts, myQuotes] = await Promise.all([
      db
        .select({
          id: ordersTable.id,
          totalAmountUsd: ordersTable.totalAmountUsd,
          buyerId: ordersTable.buyerId,
          sellerId: ordersTable.sellerId,
          vehicleTitle: sql<string | null>`concat(${vehicleListingsTable.brandName}, ' ', ${vehicleListingsTable.modelName})`,
        })
        .from(ordersTable)
        .leftJoin(vehicleListingsTable, eq(ordersTable.vehicleId, vehicleListingsTable.id))
        .where(inArray(ordersTable.id, reqOrderIds)),

      db
        .select({ freightRequestId: shippingQuotesTable.freightRequestId, count: count() })
        .from(shippingQuotesTable)
        .where(inArray(shippingQuotesTable.freightRequestId, reqIds))
        .groupBy(shippingQuotesTable.freightRequestId),

      isForwarder
        ? db
            .select({
              freightRequestId: shippingQuotesTable.freightRequestId,
              id: shippingQuotesTable.id,
              status: shippingQuotesTable.status,
            })
            .from(shippingQuotesTable)
            .where(
              and(
                inArray(shippingQuotesTable.freightRequestId, reqIds),
                eq(shippingQuotesTable.forwarderId, userId),
              ),
            )
        : Promise.resolve([]),
    ]);

    const enrichedOrderMap = new Map(enrichedOrders.map(o => [o.id, o]));
    const quoteCountMap = new Map(quoteCounts.map(q => [q.freightRequestId, Number(q.count)]));
    const myQuoteMap = new Map((myQuotes as any[]).map((q: any) => [q.freightRequestId, { id: q.id, status: q.status }]));

    const allUserIds = enrichedOrders.flatMap(o => [o.buyerId, o.sellerId].filter(Boolean)) as string[];
    const userMap = await buildUserMap(allUserIds);

    const data = paged.map(r => {
      const o = enrichedOrderMap.get(r.orderId);
      const myQ = (myQuoteMap as Map<string, { id: string; status: string }>).get(r.id);
      return {
        id: r.id,
        orderId: r.orderId,
        status: r.status,
        notes: r.notes ?? null,
        vehicleTitle: o?.vehicleTitle ?? null,
        buyerName: o?.buyerId ? (userMap.get(o.buyerId) ?? null) : null,
        sellerName: o?.sellerId ? (userMap.get(o.sellerId) ?? null) : null,
        orderTotalUsd: o?.totalAmountUsd != null ? Number(o.totalAmountUsd) : null,
        quoteCount: quoteCountMap.get(r.id) ?? 0,
        myQuoteId: myQ?.id ?? null,
        myQuoteStatus: myQ?.status ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    res.json({ data, total, page, limit });
  },
);

// ── GET /freight-requests/:requestId ─────────────────────────────────────────

router.get(
  "/freight-requests/:requestId",
  authenticate,
  requireUuidParams("requestId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [fr] = await db
      .select()
      .from(freightRequestsTable)
      .where(eq(freightRequestsTable.id, req.params.requestId as string))
      .limit(1);

    if (!fr) { res.status(404).json({ error: "Freight request not found" }); return; }

    const [order] = await db
      .select({ buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId, totalAmountUsd: ordersTable.totalAmountUsd, vehicleId: ordersTable.vehicleId })
      .from(ordersTable)
      .where(eq(ordersTable.id, fr.orderId))
      .limit(1);

    if (!isAdmin) {
      const isOrderSeller = order?.sellerId === userId;
      if (role === "freight_forwarder") {
        // Forwarder may see open requests (to submit a quote) or requests they have already quoted
        if (fr.status !== "open") {
          const [myQuote] = await db
            .select({ id: shippingQuotesTable.id })
            .from(shippingQuotesTable)
            .where(and(eq(shippingQuotesTable.freightRequestId, fr.id), eq(shippingQuotesTable.forwarderId, userId)))
            .limit(1);
          if (!myQuote) { res.status(403).json({ error: "Forbidden" }); return; }
        }
      } else if (!isOrderSeller) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const [vehicle] = order?.vehicleId
      ? await db.select({ title: sql<string>`concat(${vehicleListingsTable.brandName}, ' ', ${vehicleListingsTable.modelName})` }).from(vehicleListingsTable).where(eq(vehicleListingsTable.id, order.vehicleId)).limit(1)
      : [null];

    const userMap = await buildUserMap([order?.buyerId, order?.sellerId].filter(Boolean) as string[]);

    const [qCount] = await db
      .select({ count: count() })
      .from(shippingQuotesTable)
      .where(eq(shippingQuotesTable.freightRequestId, fr.id));

    const myQuotes = role === "freight_forwarder"
      ? await db.select({ id: shippingQuotesTable.id, status: shippingQuotesTable.status })
          .from(shippingQuotesTable)
          .where(and(eq(shippingQuotesTable.freightRequestId, fr.id), eq(shippingQuotesTable.forwarderId, userId)))
          .limit(1)
      : [];

    res.json({
      id: fr.id,
      orderId: fr.orderId,
      status: fr.status,
      notes: fr.notes ?? null,
      vehicleTitle: vehicle?.title ?? null,
      buyerName: order?.buyerId ? (userMap.get(order.buyerId) ?? null) : null,
      sellerName: order?.sellerId ? (userMap.get(order.sellerId) ?? null) : null,
      orderTotalUsd: order?.totalAmountUsd != null ? Number(order.totalAmountUsd) : null,
      quoteCount: Number(qCount?.count ?? 0),
      myQuoteId: myQuotes[0]?.id ?? null,
      myQuoteStatus: myQuotes[0]?.status ?? null,
      createdAt: fr.createdAt.toISOString(),
      updatedAt: fr.updatedAt.toISOString(),
    });
  },
);

// ── POST /freight-requests/:requestId/quotes ──────────────────────────────────
// Forwarder submits a shipping quote

router.post(
  "/freight-requests/:requestId/quotes",
  authenticate,
  requireRole("freight_forwarder"),
  requireUuidParams("requestId"),
  async (req: Request, res: Response) => {
    const forwarderId = req.user!.userId;
    const body = req.body ?? {};
    const { freightCostUsd, insuranceUsd = 0, customsUsd = 0, portChargesUsd = 0, documentationUsd = 0, totalUsd, currency = "USD", estimatedDaysMin, estimatedDaysMax, notes } = body;

    if (freightCostUsd == null || totalUsd == null) {
      res.status(400).json({ error: "freightCostUsd and totalUsd are required" }); return;
    }

    const [fr] = await db
      .select()
      .from(freightRequestsTable)
      .where(eq(freightRequestsTable.id, req.params.requestId as string))
      .limit(1);

    if (!fr) { res.status(404).json({ error: "Freight request not found" }); return; }
    if (fr.status !== "open") {
      res.status(400).json({ error: `Freight request is not open (status: ${fr.status})` }); return;
    }

    // Check for existing quote from this forwarder
    const [existing] = await db
      .select({ id: shippingQuotesTable.id })
      .from(shippingQuotesTable)
      .where(and(eq(shippingQuotesTable.freightRequestId, fr.id), eq(shippingQuotesTable.forwarderId, forwarderId)))
      .limit(1);

    if (existing) {
      res.status(400).json({ error: "You have already submitted a quote for this request" }); return;
    }

    const [quote] = await db
      .insert(shippingQuotesTable)
      .values({
        freightRequestId: fr.id,
        orderId: fr.orderId,
        forwarderId,
        freightCostUsd: String(Number(freightCostUsd)),
        insuranceUsd: String(Number(insuranceUsd)),
        customsUsd: String(Number(customsUsd)),
        portChargesUsd: String(Number(portChargesUsd)),
        documentationUsd: String(Number(documentationUsd)),
        totalUsd: String(Number(totalUsd)),
        currency: String(currency),
        estimatedDaysMin: estimatedDaysMin != null ? Number(estimatedDaysMin) : null,
        estimatedDaysMax: estimatedDaysMax != null ? Number(estimatedDaysMax) : null,
        notes: notes ? scrubContactInfo(String(notes)) : null,
        status: "pending",
      })
      .returning();

    // Notify buyer that a shipping quote was submitted
    const [order] = await db
      .select({ buyerId: ordersTable.buyerId })
      .from(ordersTable)
      .where(eq(ordersTable.id, fr.orderId))
      .limit(1);

    if (order) {
      await createNotification({
        userId: order.buyerId,
        type: "order_update",
        title: "Shipping Quote Received",
        body: `A freight forwarder has submitted a shipping quote for your order. Review it on the order page.`,
      }).catch(() => {});
    }

    const userMap = await buildUserMap([forwarderId]);
    res.status(201).json(buildQuoteRecord(quote, userMap));
  },
);

// ── GET /freight-requests/:requestId/quotes ───────────────────────────────────

router.get(
  "/freight-requests/:requestId/quotes",
  authenticate,
  requireUuidParams("requestId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";
    const isForwarder = role === "freight_forwarder";

    const [fr] = await db
      .select()
      .from(freightRequestsTable)
      .where(eq(freightRequestsTable.id, req.params.requestId as string))
      .limit(1);

    if (!fr) { res.status(404).json({ error: "Freight request not found" }); return; }

    // RBAC: determine who can see what
    // - Admin/super_admin: all quotes
    // - Seller of this order: all quotes (so they know the shipping cost landscape)
    // - Freight forwarder: only their own quote
    // - Buyer/anyone else: forbidden via this endpoint (use /orders/:id/shipping-quotes instead)
    const [order] = await db
      .select({ sellerId: ordersTable.sellerId, buyerId: ordersTable.buyerId })
      .from(ordersTable)
      .where(eq(ordersTable.id, fr.orderId))
      .limit(1);

    const isSeller = role === "seller" && order?.sellerId === userId;

    if (!isAdmin && !isSeller && !isForwarder) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // Forwarders only see their own quote; sellers/admins see all
    const whereClause = and(
      eq(shippingQuotesTable.freightRequestId, fr.id),
      isForwarder && !isAdmin ? eq(shippingQuotesTable.forwarderId, userId) : undefined,
    );

    const [rows, [totalRow]] = await Promise.all([
      db.select().from(shippingQuotesTable).where(whereClause).orderBy(desc(shippingQuotesTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(shippingQuotesTable).where(whereClause),
    ]);

    const forwarderIds = rows.map(q => q.forwarderId);
    const userMap = await buildUserMap(forwarderIds);
    res.json({ data: rows.map(q => buildQuoteRecord(q, userMap)), total: totalRow?.total ?? 0, page, limit });
  },
);

// ── GET /orders/:orderId/shipping-quotes ─────────────────────────────────────

router.get(
  "/orders/:orderId/shipping-quotes",
  authenticate,
  requireUuidParams("orderId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, req.params.orderId as string))
      .limit(1);

    if (!order) { res.status(404).json({ error: "Order not found" }); return; }

    if (!isAdmin && order.buyerId !== userId && order.sellerId !== userId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const rows = await db
      .select()
      .from(shippingQuotesTable)
      .where(eq(shippingQuotesTable.orderId, req.params.orderId as string))
      .orderBy(desc(shippingQuotesTable.createdAt));

    const userMap = await buildUserMap(rows.map(q => q.forwarderId));
    res.json({ data: rows.map(q => buildQuoteRecord(q, userMap)), total: rows.length, page: 1, limit: rows.length });
  },
);

// ── GET /shipping-quotes/:quoteId ─────────────────────────────────────────────

router.get(
  "/shipping-quotes/:quoteId",
  authenticate,
  requireUuidParams("quoteId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [quote] = await db
      .select()
      .from(shippingQuotesTable)
      .where(eq(shippingQuotesTable.id, req.params.quoteId as string))
      .limit(1);

    if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }

    if (!isAdmin && quote.forwarderId !== userId) {
      const [order] = await db
        .select({ buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId })
        .from(ordersTable)
        .where(eq(ordersTable.id, quote.orderId))
        .limit(1);
      if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
    }

    const userMap = await buildUserMap([quote.forwarderId]);
    res.json(buildQuoteRecord(quote, userMap));
  },
);

// ── POST /shipping-quotes/:quoteId/accept ─────────────────────────────────────
// Buyer accepts a shipping quote

router.post(
  "/shipping-quotes/:quoteId/accept",
  authenticate,
  requireRole("buyer"),
  requireUuidParams("quoteId"),
  async (req: Request, res: Response) => {
    const buyerId = req.user!.userId;

    const [quote] = await db
      .select()
      .from(shippingQuotesTable)
      .where(eq(shippingQuotesTable.id, req.params.quoteId as string))
      .limit(1);

    if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
    if (quote.status !== "pending") {
      res.status(400).json({ error: `Quote is already ${quote.status}` }); return;
    }

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, quote.orderId))
      .limit(1);

    if (!order || order.buyerId !== buyerId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [updatedQuote] = await tx
        .update(shippingQuotesTable)
        .set({ status: "accepted", acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(shippingQuotesTable.id, quote.id))
        .returning();

      // Reject all other pending quotes for this request
      await tx
        .update(shippingQuotesTable)
        .set({ status: "rejected", rejectedAt: new Date(), rejectionNote: "Another quote was accepted", updatedAt: new Date() })
        .where(
          and(
            eq(shippingQuotesTable.freightRequestId, quote.freightRequestId),
            eq(shippingQuotesTable.status, "pending"),
          ),
        );

      // Mark freight request as quote_accepted
      await tx
        .update(freightRequestsTable)
        .set({ status: "quote_accepted", updatedAt: new Date() })
        .where(eq(freightRequestsTable.id, quote.freightRequestId));

      // Advance order to in_production
      await tx
        .update(ordersTable)
        .set({ status: "in_production", updatedAt: new Date() })
        .where(eq(ordersTable.id, quote.orderId));

      await tx.insert(orderStatusHistoryTable).values({
        orderId: quote.orderId,
        fromStatus: order.status as any,
        toStatus: "in_production" as any,
        changedById: buyerId,
        note: "Shipping quote accepted — order advanced to in_production",
      });

      return [updatedQuote];
    });

    // Auto-create shipment record (idempotent — skips if already exists)
    try {
      const [existing] = await db
        .select({ id: shipmentsTable.id })
        .from(shipmentsTable)
        .where(eq(shipmentsTable.orderId, quote.orderId))
        .limit(1);

      if (!existing) {
        const [newShipment] = await db
          .insert(shipmentsTable)
          .values({
            orderId: quote.orderId,
            freightRequestId: quote.freightRequestId,
            forwarderId: quote.forwarderId,
            status: "quote_accepted",
          })
          .returning();

        // Seed initial tracking event
        await db.insert(shipmentTrackingTable).values({
          shipmentId: newShipment.id,
          status: "quote_accepted",
          actorId: buyerId,
          note: "Shipping quote accepted — shipment created",
        });
      }
    } catch (err) {
      // Non-blocking — do not fail the quote accept if shipment creation fails
      req.log.error({ err }, "Failed to auto-create shipment after quote accept — orderId: " + quote.orderId);
    }

    // Notify the winning forwarder
    await createNotification({
      userId: quote.forwarderId,
      type: "order_update",
      title: "Shipping Quote Accepted",
      body: `Your shipping quote for order ${quote.orderId.slice(0, 8)} has been accepted. Please proceed with shipping arrangements.`,
    }).catch(() => {});

    const userMap = await buildUserMap([updated.forwarderId]);
    res.json(buildQuoteRecord(updated, userMap));
  },
);

// ── POST /shipping-quotes/:quoteId/reject ─────────────────────────────────────
// Buyer rejects a shipping quote

router.post(
  "/shipping-quotes/:quoteId/reject",
  authenticate,
  requireRole("buyer"),
  requireUuidParams("quoteId"),
  async (req: Request, res: Response) => {
    const buyerId = req.user!.userId;
    const note = req.body?.note as string | undefined;

    const [quote] = await db
      .select()
      .from(shippingQuotesTable)
      .where(eq(shippingQuotesTable.id, req.params.quoteId as string))
      .limit(1);

    if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
    if (quote.status !== "pending") {
      res.status(400).json({ error: `Quote is already ${quote.status}` }); return;
    }

    const [order] = await db
      .select({ buyerId: ordersTable.buyerId })
      .from(ordersTable)
      .where(eq(ordersTable.id, quote.orderId))
      .limit(1);

    if (!order || order.buyerId !== buyerId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const [updated] = await db
      .update(shippingQuotesTable)
      .set({ status: "rejected", rejectedAt: new Date(), rejectionNote: note ?? null, updatedAt: new Date() })
      .where(eq(shippingQuotesTable.id, quote.id))
      .returning();

    // Notify forwarder
    await createNotification({
      userId: quote.forwarderId,
      type: "order_update",
      title: "Shipping Quote Rejected",
      body: note
        ? `Your shipping quote for order ${quote.orderId.slice(0, 8)} was rejected: ${note}`
        : `Your shipping quote for order ${quote.orderId.slice(0, 8)} was rejected by the buyer.`,
    }).catch(() => {});

    const userMap = await buildUserMap([updated.forwarderId]);
    res.json(buildQuoteRecord(updated, userMap));
  },
);

export default router;
