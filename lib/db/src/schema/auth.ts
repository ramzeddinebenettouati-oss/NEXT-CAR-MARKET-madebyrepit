import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── Phone OTPs ─────────────────────────────────────────────────────────────
// Stores short-lived one-time passwords for phone-based authentication.
// OTPs expire after 5 minutes and are invalidated after 5 failed attempts.
export const phoneOtpsTable = pgTable("phone_otps", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),          // E.164 format e.g. +8613800138000
  otpHash: text("otp_hash").notNull(),     // SHA-256(otp + SESSION_SECRET)
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("password_reset_tokens_user_idx").on(table.userId),
  index("password_reset_tokens_expires_idx").on(table.expiresAt),
]);

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
