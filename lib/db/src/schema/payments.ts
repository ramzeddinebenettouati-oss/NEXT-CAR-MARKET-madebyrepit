import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  numeric,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

// ── Enum ──────────────────────────────────────────────────────────────────────

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending_review",
  "verified",
  "rejected",
]);

// ── Payments ──────────────────────────────────────────────────────────────────

export const paymentsTable = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  submittedById: uuid("submitted_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  referenceNumber: text("reference_number").notNull(),
  bankName: text("bank_name").notNull(),
  paymentDate: text("payment_date").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  receiptObjectPath: text("receipt_object_path"),
  proofObjectPath: text("proof_object_path"),
  status: paymentStatusEnum("status").notNull().default("pending_review"),
  verifiedById: uuid("verified_by_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at"),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
