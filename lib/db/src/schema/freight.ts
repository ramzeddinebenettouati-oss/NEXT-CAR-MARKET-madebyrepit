import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const freightRequestStatusEnum = pgEnum("freight_request_status", [
  "open",
  "quote_accepted",
  "completed",
  "cancelled",
]);

export const shippingQuoteStatusEnum = pgEnum("shipping_quote_status", [
  "pending",
  "accepted",
  "rejected",
]);

// ── Freight Requests ──────────────────────────────────────────────────────────
// Auto-created when payment is verified on an order.

export const freightRequestsTable = pgTable("freight_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  status: freightRequestStatusEnum("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Shipping Quotes ───────────────────────────────────────────────────────────
// Submitted by freight forwarders in response to an open freight request.

export const shippingQuotesTable = pgTable("shipping_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  freightRequestId: uuid("freight_request_id")
    .notNull()
    .references(() => freightRequestsTable.id, { onDelete: "cascade" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  forwarderId: uuid("forwarder_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  // Itemised cost breakdown
  freightCostUsd: numeric("freight_cost_usd", { precision: 14, scale: 2 }).notNull(),
  insuranceUsd: numeric("insurance_usd", { precision: 14, scale: 2 }).notNull().default("0"),
  customsUsd: numeric("customs_usd", { precision: 14, scale: 2 }).notNull().default("0"),
  portChargesUsd: numeric("port_charges_usd", { precision: 14, scale: 2 }).notNull().default("0"),
  documentationUsd: numeric("documentation_usd", { precision: 14, scale: 2 }).notNull().default("0"),
  totalUsd: numeric("total_usd", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  estimatedDaysMin: integer("estimated_days_min"),
  estimatedDaysMax: integer("estimated_days_max"),
  notes: text("notes"),
  status: shippingQuoteStatusEnum("status").notNull().default("pending"),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Freight Conversations (Seller ↔ FreightForwarder) ─────────────────────────

export const freightConversationsTable = pgTable("freight_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  freightRequestId: uuid("freight_request_id")
    .references(() => freightRequestsTable.id, { onDelete: "set null" }),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  forwarderId: uuid("forwarder_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  sellerUnread: integer("seller_unread").notNull().default(0),
  forwarderUnread: integer("forwarder_unread").notNull().default(0),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  lastMessagePreview: text("last_message_preview"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Freight Messages ──────────────────────────────────────────────────────────

export const freightMessagesTable = pgTable("freight_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => freightConversationsTable.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  wasScrubbedAt: timestamp("was_scrubbed_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Shipment Status Enum (11 stages) ──────────────────────────────────────────

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "awaiting_quote",
  "quote_submitted",
  "quote_accepted",
  "container_booked",
  "vehicle_collected",
  "at_origin_port",
  "loaded_on_vessel",
  "in_transit",
  "arrived_destination_port",
  "customs_clearance",
  "delivered",
]);

// ── Shipping Document Type Enum ────────────────────────────────────────────────

export const shippingDocumentTypeEnum = pgEnum("shipping_document_type", [
  "bill_of_lading",
  "commercial_invoice",
  "packing_list",
  "insurance_certificate",
  "export_declaration",
  "arrival_notice",
]);

// ── Shipments ─────────────────────────────────────────────────────────────────
// One shipment per order, auto-created when a shipping quote is accepted.

export const shipmentsTable = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  freightRequestId: uuid("freight_request_id")
    .references(() => freightRequestsTable.id, { onDelete: "set null" }),
  forwarderId: uuid("forwarder_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  status: shipmentStatusEnum("status").notNull().default("quote_accepted"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Shipment Tracking Events ───────────────────────────────────────────────────
// Append-only audit log of every status transition.

export const shipmentTrackingTable = pgTable("shipment_tracking", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipmentsTable.id, { onDelete: "cascade" }),
  status: shipmentStatusEnum("status").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Shipping Documents ─────────────────────────────────────────────────────────
// Documents uploaded by the freight forwarder for a shipment.

export const shippingDocumentsTable = pgTable("shipping_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipmentsTable.id, { onDelete: "cascade" }),
  documentType: shippingDocumentTypeEnum("document_type").notNull(),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  uploadedById: uuid("uploaded_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  visibleToBuyer: boolean("visible_to_buyer").notNull().default(true),
  visibleToSeller: boolean("visible_to_seller").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type FreightRequest = typeof freightRequestsTable.$inferSelect;
export type ShippingQuote = typeof shippingQuotesTable.$inferSelect;
export type FreightConversation = typeof freightConversationsTable.$inferSelect;
export type FreightMessage = typeof freightMessagesTable.$inferSelect;
export type Shipment = typeof shipmentsTable.$inferSelect;
export type ShipmentTracking = typeof shipmentTrackingTable.$inferSelect;
export type ShippingDocument = typeof shippingDocumentsTable.$inferSelect;
