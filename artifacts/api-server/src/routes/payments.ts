import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count, inArray, and } from "drizzle-orm";
import {
  db,
  paymentsTable,
  ordersTable,
  usersTable,
  orderStatusHistoryTable,
  freightRequestsTable,
} from "@workspace/db";
import { authenticate, requireRole, requirePermission } from "../middlewares/auth";
import { requireUuidParams } from "../lib/validate";
import { createNotification } from "../lib/notifications";
import { createAuditLog } from "../lib/audit";

const router: IRouter = Router();

// ── User enrichment helper ──────────────────────────────────────────────────────

async function buildUserMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
}

// ── Record builder ─────────────────────────────────────────────────────────────

type PaymentRow = typeof paymentsTable.$inferSelect;

function buildRecord(
  payment: PaymentRow,
  userMap: Map<string, string>,
  orderStatus?: string | null,
  vehicleTitle?: string | null,
) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    submittedById: payment.submittedById,
    submittedByName: userMap.get(payment.submittedById) ?? null,
    referenceNumber: payment.referenceNumber,
    bankName: payment.bankName,
    paymentDate: payment.paymentDate,
    amount: Number(payment.amount),
    currency: payment.currency,
    receiptObjectPath: payment.receiptObjectPath ?? null,
    proofObjectPath: payment.proofObjectPath ?? null,
    status: payment.status,
    verifiedById: payment.verifiedById ?? null,
    verifiedByName: payment.verifiedById ? (userMap.get(payment.verifiedById) ?? null) : null,
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    rejectionNote: payment.rejectionNote ?? null,
    orderStatus: orderStatus ?? null,
    vehicleTitle: vehicleTitle ?? null,
    buyerName: userMap.get(payment.submittedById) ?? null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

// ── POST /orders/:orderId/payments ────────────────────────────────────────────
// Buyer submits SWIFT payment proof

router.post(
  "/orders/:orderId/payments",
  authenticate,
  requireUuidParams("orderId"),
  requireRole("buyer"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { orderId } = req.params as Record<string, string>;
    const body = req.body ?? {};

    const { referenceNumber, bankName, paymentDate, amount, currency, receiptObjectPath, proofObjectPath } = body;

    if (!referenceNumber || !bankName || !paymentDate || amount == null || !receiptObjectPath || !proofObjectPath) {
      res.status(400).json({ error: "referenceNumber, bankName, paymentDate, amount, receiptObjectPath, and proofObjectPath are all required" });
      return;
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.buyerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (order.status !== "awaiting_payment") {
      res.status(400).json({ error: `Order must be in awaiting_payment status (currently: ${order.status})` });
      return;
    }

    // Block only if a pending_review payment already exists; allow after rejection
    const [existingPending] = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.status, "pending_review")))
      .limit(1);

    if (existingPending) {
      res.status(400).json({ error: "A payment is already pending review for this order" });
      return;
    }

    const [payment] = await db
      .insert(paymentsTable)
      .values({
        orderId,
        submittedById: userId,
        referenceNumber: String(referenceNumber),
        bankName: String(bankName),
        paymentDate: String(paymentDate),
        amount: String(parsedAmount),
        currency: currency ? String(currency) : "USD",
        receiptObjectPath: receiptObjectPath ? String(receiptObjectPath) : null,
        proofObjectPath: proofObjectPath ? String(proofObjectPath) : null,
        status: "pending_review",
      })
      .returning();

    // Notify admins that a new payment is pending review
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, ["admin", "super_admin"]));

    await Promise.allSettled(
      admins.map(admin =>
        createNotification({
          userId: admin.id,
          type: "order_update",
          title: "New Payment Pending Review",
          body: `A buyer has submitted payment for order ${orderId.slice(0, 8)}. Please verify the transfer.`,
        }),
      ),
    );

    const userMap = await buildUserMap([payment.submittedById]);
    res.status(201).json(buildRecord(payment, userMap, order.status));
  },
);

// ── GET /orders/:orderId/payments ─────────────────────────────────────────────
// Get latest payment record for an order

router.get(
  "/orders/:orderId/payments",
  authenticate,
  requireUuidParams("orderId"),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { orderId } = req.params as Record<string, string>;

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // RBAC: buyers see only their own orders; sellers see their orders; admins see all
    const isAdmin = role === "admin" || role === "super_admin";
    if (!isAdmin) {
      if (role === "buyer" && order.buyerId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (role === "seller" && order.sellerId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (role !== "buyer" && role !== "seller") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, orderId))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(1);

    if (!payment) {
      res.status(404).json({ error: "No payment found for this order" });
      return;
    }

    const userIds = [payment.submittedById, payment.verifiedById].filter(Boolean) as string[];
    const userMap = await buildUserMap(userIds);
    res.json(buildRecord(payment, userMap, order.status));
  },
);

// ── GET /payments ─────────────────────────────────────────────────────────────
// Admin: list all payments

router.get(
  "/payments",
  authenticate,
  requirePermission("manage_payments"),
  async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string | undefined;

    const validStatuses = ["pending_review", "verified", "rejected"];
    const whereClause =
      statusFilter && validStatuses.includes(statusFilter)
        ? eq(paymentsTable.status, statusFilter as "pending_review" | "verified" | "rejected")
        : undefined;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(paymentsTable)
        .where(whereClause)
        .orderBy(desc(paymentsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(paymentsTable).where(whereClause),
    ]);

    const allUserIds = rows.flatMap(p => [p.submittedById, p.verifiedById].filter(Boolean) as string[]);
    const orderIds = [...new Set(rows.map(p => p.orderId))];

    const [userMap, orderRows] = await Promise.all([
      buildUserMap(allUserIds),
      orderIds.length
        ? db.select({ id: ordersTable.id, status: ordersTable.status }).from(ordersTable).where(inArray(ordersTable.id, orderIds))
        : Promise.resolve([]),
    ]);

    const orderStatusMap = new Map(orderRows.map(o => [o.id, o.status]));
    const data = rows.map(p => buildRecord(p, userMap, orderStatusMap.get(p.orderId) ?? null));

    res.json({ data, total: totalRow?.total ?? 0, page, limit });
  },
);

// ── POST /payments/:paymentId/verify ──────────────────────────────────────────

router.post(
  "/payments/:paymentId/verify",
  authenticate,
  requirePermission("manage_payments"),
  requireUuidParams("paymentId"),
  async (req: Request, res: Response) => {
    const adminId = req.user!.userId;
    const { paymentId } = req.params as Record<string, string>;

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);

    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (payment.status !== "pending_review") {
      res.status(400).json({ error: `Payment already ${payment.status}` });
      return;
    }

    // Fetch order for status history
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, payment.orderId))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [updatedPayment] = await tx
        .update(paymentsTable)
        .set({ status: "verified", verifiedById: adminId, verifiedAt: new Date(), rejectionNote: null, updatedAt: new Date() })
        .where(eq(paymentsTable.id, paymentId))
        .returning();

      await tx
        .update(ordersTable)
        .set({ status: "payment_received", updatedAt: new Date() })
        .where(eq(ordersTable.id, payment.orderId));

      await tx.insert(orderStatusHistoryTable).values({
        orderId: payment.orderId,
        fromStatus: order.status as any,
        toStatus: "payment_received" as any,
        changedById: adminId,
        note: "Payment verified by admin",
      });

      // Auto-create a FreightRequest for this order (idempotent — skip if already exists)
      await tx
        .insert(freightRequestsTable)
        .values({ orderId: payment.orderId, status: "open" })
        .onConflictDoNothing();

      return [updatedPayment];
    });

    // Notify buyer
    await createNotification({
      userId: order.buyerId,
      type: "order_update",
      title: "Payment Verified",
       body: `Your SWIFT payment for order ${payment.orderId.slice(0, 8)} has been received and verified. Our team will continue processing your order.`,
    }).catch(() => {});

    await createAuditLog({
      userId: req.user!.userId,
      userEmail: req.user!.email,
      action: "PAYMENT_VERIFIED",
      module: "payments",
      details: `paymentId=${paymentId} orderId=${payment.orderId}`,
      req,
    });

    const userMap = await buildUserMap([updated.submittedById, updated.verifiedById].filter(Boolean) as string[]);
    res.json(buildRecord(updated, userMap, "payment_received"));
  },
);

// ── POST /payments/:paymentId/reject ─────────────────────────────────────────

router.post(
  "/payments/:paymentId/reject",
  authenticate,
  requirePermission("manage_payments"),
  requireUuidParams("paymentId"),
  async (req: Request, res: Response) => {
    const adminId = req.user!.userId;
    const { paymentId } = req.params as Record<string, string>;
    const note = req.body?.note as string | undefined;

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);

    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (payment.status !== "pending_review") {
      res.status(400).json({ error: `Payment already ${payment.status}` });
      return;
    }

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, payment.orderId))
      .limit(1);

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const [updated] = await db.transaction(async (tx) => {
      const [updatedPayment] = await tx
        .update(paymentsTable)
        .set({ status: "rejected", verifiedById: adminId, verifiedAt: new Date(), rejectionNote: note ?? null, updatedAt: new Date() })
        .where(eq(paymentsTable.id, paymentId))
        .returning();

      await tx
        .update(ordersTable)
        .set({ status: "awaiting_payment", updatedAt: new Date() })
        .where(eq(ordersTable.id, payment.orderId));

      await tx.insert(orderStatusHistoryTable).values({
        orderId: payment.orderId,
        fromStatus: order.status as any,
        toStatus: "awaiting_payment" as any,
        changedById: adminId,
        note: note ? `Payment rejected: ${note}` : "Payment rejected by admin",
      });

      return [updatedPayment];
    });

    // Notify buyer
    await createNotification({
      userId: order.buyerId,
      type: "order_update",
      title: "Payment Rejected",
      body: note
        ? `Your payment for order ${payment.orderId.slice(0, 8)} was rejected: ${note}. Please resubmit.`
        : `Your payment for order ${payment.orderId.slice(0, 8)} was rejected. Please resubmit with correct details.`,
    }).catch(() => {});

    await createAuditLog({
      userId: req.user!.userId,
      userEmail: req.user!.email,
      action: "PAYMENT_REJECTED",
      module: "payments",
      details: note ? `paymentId=${paymentId} reason=${note}` : `paymentId=${paymentId}`,
      req,
    });

    const userMap = await buildUserMap([updated.submittedById, updated.verifiedById].filter(Boolean) as string[]);
    res.json(buildRecord(updated, userMap, "awaiting_payment"));
  },
);

export default router;
