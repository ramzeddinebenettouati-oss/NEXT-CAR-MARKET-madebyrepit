import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { or, eq } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { authenticate } from "../middlewares/auth";
import { db, paymentsTable, ordersTable, shippingDocumentsTable, shipmentsTable, orderDocumentsTable } from "@workspace/db";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires authentication to prevent anonymous upload URL issuance.
 */
router.post("/storage/uploads/request-url", authenticate, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities (payment receipts/proofs).
 * Requires authentication + object-level authorization:
 *   - Admins/super_admins: full access
 *   - Buyers: only their own submitted payment documents
 *   - Sellers: documents for orders they own
 *   - Everyone else: denied
 */
router.get("/storage/objects/*path", authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = req.user!.role;
  const isAdmin = role === "admin" || role === "super_admin";

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    if (!isAdmin) {
      // ── Check 1: payment receipts / proofs ────────────────────────────────
      const [payment] = await db
        .select({ submittedById: paymentsTable.submittedById, orderId: paymentsTable.orderId })
        .from(paymentsTable)
        .where(
          or(
            eq(paymentsTable.receiptObjectPath, objectPath),
            eq(paymentsTable.proofObjectPath, objectPath),
          ),
        )
        .limit(1);

      if (payment) {
        // Buyer who submitted it or the seller of the order may access
        if (payment.submittedById !== userId) {
          const [order] = await db
            .select({ sellerId: ordersTable.sellerId })
            .from(ordersTable)
            .where(eq(ordersTable.id, payment.orderId))
            .limit(1);
          if (!order || order.sellerId !== userId) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
        }
      } else {
        const [orderDocument] = await db
          .select({ orderId: orderDocumentsTable.orderId })
          .from(orderDocumentsTable)
          .where(eq(orderDocumentsTable.objectPath, objectPath))
          .limit(1);

        if (orderDocument) {
          const [order] = await db
            .select({ buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId })
            .from(ordersTable)
            .where(eq(ordersTable.id, orderDocument.orderId))
            .limit(1);
          if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
        } else {
        // ── Check 2: shipping documents ──────────────────────────────────────
        const [doc] = await db
          .select({
            visibleToBuyer: shippingDocumentsTable.visibleToBuyer,
            visibleToSeller: shippingDocumentsTable.visibleToSeller,
            shipmentId: shippingDocumentsTable.shipmentId,
          })
          .from(shippingDocumentsTable)
          .where(eq(shippingDocumentsTable.objectPath, objectPath))
          .limit(1);

        if (!doc) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        // Resolve the shipment to get order + forwarder
        const [shipment] = await db
          .select({
            orderId: shipmentsTable.orderId,
            forwarderId: shipmentsTable.forwarderId,
          })
          .from(shipmentsTable)
          .where(eq(shipmentsTable.id, doc.shipmentId))
          .limit(1);

        if (!shipment) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        // Forwarder assigned to the shipment: always allowed
        if (role === "freight_forwarder") {
          if (shipment.forwarderId !== userId) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
        } else {
          // Buyer or seller: check order ownership + document visibility flag
          const [order] = await db
            .select({ buyerId: ordersTable.buyerId, sellerId: ordersTable.sellerId })
            .from(ordersTable)
            .where(eq(ordersTable.id, shipment.orderId))
            .limit(1);

          if (!order) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }

          const isBuyerOfOrder = order.buyerId === userId && doc.visibleToBuyer;
          const isSellerOfOrder = order.sellerId === userId && doc.visibleToSeller;

          if (!isBuyerOfOrder && !isSellerOfOrder) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
        }
        }
      }
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
