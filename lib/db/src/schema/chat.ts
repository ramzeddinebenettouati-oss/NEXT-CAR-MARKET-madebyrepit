import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  pgEnum,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { vehicleListingsTable } from "./vehicles";
// Note: quotationsTable is imported for the FK reference only.
// The circular dependency (orders.ts → chat.ts → orders.ts) is safe because
// Drizzle evaluates .references() callbacks lazily after both modules load.
import { quotationsTable } from "./orders";

// ── Enums ────────────────────────────────────────────────────────────────────

export const notificationTypeEnum = pgEnum("notification_type", [
  "new_message",
  "new_inquiry",
  "listing_approved",
  "listing_rejected",
  "order_update",
  "saved_search_match",
]);

export const messageAttachmentTypeEnum = pgEnum("message_attachment_type", [
  "image",
  "document",
  "video",
]);

// ── Favorites ─────────────────────────────────────────────────────────────────

export const favoritesTable = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicleListingsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("favorites_user_vehicle_unique").on(t.userId, t.vehicleId)]
);

// ── Conversations ─────────────────────────────────────────────────────────────

export const conversationsTable = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  vehicleId: uuid("vehicle_id").references(() => vehicleListingsTable.id, {
    onDelete: "set null",
  }),
  buyerId: uuid("buyer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Counters for unread messages per participant
  buyerUnread: integer("buyer_unread").notNull().default(0),
  sellerUnread: integer("seller_unread").notNull().default(0),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  lastMessagePreview: text("last_message_preview"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Messages ──────────────────────────────────────────────────────────────────

export const messageTypeEnum = pgEnum("message_type", ["text", "quotation", "system"]);

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  messageType: messageTypeEnum("message_type").notNull().default("text"),
  quotationId: uuid("quotation_id").references((): AnyPgColumn => quotationsTable.id, { onDelete: "set null" }),
  // True if message was scrubbed by contact protection
  wasScrubbedAt: timestamp("was_scrubbed_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Message Attachments ───────────────────────────────────────────────────────

export const messageAttachmentsTable = pgTable("message_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messagesTable.id, { onDelete: "cascade" }),
  type: messageAttachmentTypeEnum("type").notNull(),
  url: text("url").notNull(),
  filename: text("filename"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Notifications ─────────────────────────────────────────────────────────────

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // Optional links back to source entities
  conversationId: uuid("conversation_id").references(
    () => conversationsTable.id,
    { onDelete: "set null" }
  ),
  vehicleId: uuid("vehicle_id").references(() => vehicleListingsTable.id, {
    onDelete: "set null",
  }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type Favorite = typeof favoritesTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type MessageAttachment = typeof messageAttachmentsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
