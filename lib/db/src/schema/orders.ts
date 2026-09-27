import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { vehicleListingsTable } from "./vehicles";
import { conversationsTable } from "./chat";

// ── Enums ────────────────────────────────────────────────────────────────────

export const quotationStatusEnum = pgEnum("quotation_status", [
  "pending",
  "accepted",
  "rejected",
  "expired",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "inquiry",
  "quotation_sent",
  "quotation_accepted",
  "awaiting_payment",
  "payment_received",
  "payment_verified",
  "seller_payment",
  "documents_preparation",
  "booking_shipping",
  "in_production",
  "ready_to_ship",
  "shipped",
  "arrived",
  "delivered",
  "closed",
  "cancelled",
]);

// ── Quotations ─────────────────────────────────────────────────────────────

export const quotationsTable = pgTable("quotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").references(() => conversationsTable.id, { onDelete: "set null" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicleListingsTable.id, { onDelete: "restrict" }),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
  unitPriceUsd: numeric("unit_price_usd", { precision: 14, scale: 2 }).notNull(),
  shippingFeeUsd: numeric("shipping_fee_usd", { precision: 14, scale: 2 }),
  inspectionFeeUsd: numeric("inspection_fee_usd", { precision: 14, scale: 2 }),
  otherFeesUsd: numeric("other_fees_usd", { precision: 14, scale: 2 }),
  notes: text("notes"),
  status: quotationStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  quotationNumber: text("quotation_number"),
  commissionRuleId: uuid("commission_rule_id"),
  commissionType: text("commission_type"),
  commissionValue: numeric("commission_value", { precision: 14, scale: 4 }),
  commissionAmountUsd: numeric("commission_amount_usd", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Orders ─────────────────────────────────────────────────────────────────

export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").unique(),
  quotationId: uuid("quotation_id")
    .references(() => quotationsTable.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicleListingsTable.id, { onDelete: "restrict" }),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
  unitPriceUsd: numeric("unit_price_usd", { precision: 14, scale: 2 }).notNull(),
  shippingFeeUsd: numeric("shipping_fee_usd", { precision: 14, scale: 2 }),
  inspectionFeeUsd: numeric("inspection_fee_usd", { precision: 14, scale: 2 }),
  otherFeesUsd: numeric("other_fees_usd", { precision: 14, scale: 2 }),
  totalAmountUsd: numeric("total_amount_usd", { precision: 14, scale: 2 }).notNull(),
  status: orderStatusEnum("status").notNull().default("quotation_accepted"),
  notes: text("notes"),
  commissionRuleId: uuid("commission_rule_id"),
  commissionType: text("commission_type"),
  commissionValue: numeric("commission_value", { precision: 14, scale: 4 }),
  commissionAmountUsd: numeric("commission_amount_usd", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Order Status History ───────────────────────────────────────────────────

export const orderStatusHistoryTable = pgTable("order_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  fromStatus: orderStatusEnum("from_status"),
  toStatus: orderStatusEnum("to_status").notNull(),
  changedById: uuid("changed_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Order Documents ─────────────────────────────────────────────────────────
// Metadata for private files uploaded by admins and shared with order parties.
export const orderDocumentsTable = pgTable("order_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  documentType: text("document_type").notNull().default("other"),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});
