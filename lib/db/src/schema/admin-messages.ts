import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adminConvReferenceTypeEnum = pgEnum("admin_conv_reference_type", [
  "vehicle",
  "quotation",
  "order",
  "shipment",
  "payment",
  "general",
]);

export const adminConvStatusEnum = pgEnum("admin_conv_status", [
  "open",
  "resolved",
  "archived",
]);

export const adminConversationsTable = pgTable("admin_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  subject: text("subject").notNull(),
  referenceType: adminConvReferenceTypeEnum("reference_type")
    .notNull()
    .default("general"),
  referenceId: uuid("reference_id"),
  referenceNumber: text("reference_number"),
  initiatorId: uuid("initiator_id")
    .notNull()
    .references(() => usersTable.id),
  recipientId: uuid("recipient_id")
    .notNull()
    .references(() => usersTable.id),
  status: adminConvStatusEnum("status").notNull().default("open"),
  isArchivedByInitiator: boolean("is_archived_by_initiator")
    .notNull()
    .default(false),
  isArchivedByRecipient: boolean("is_archived_by_recipient")
    .notNull()
    .default(false),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  resolvedById: uuid("resolved_by_id").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminMessagesTable = pgTable("admin_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => adminConversationsTable.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => usersTable.id),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
