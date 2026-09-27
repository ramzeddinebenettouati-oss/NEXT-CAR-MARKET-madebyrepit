import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const countriesTable = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  region: text("region"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const portsTable = pgTable("ports", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  countryId: uuid("country_id").references(() => countriesTable.id),
  city: text("city"),
  portType: text("port_type").default("sea"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const currenciesTable = pgTable("currencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  symbol: text("symbol").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settingsTable = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  module: text("module").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCountrySchema = createInsertSchema(countriesTable).omit({ id: true, createdAt: true });
export const insertPortSchema = createInsertSchema(portsTable).omit({ id: true, createdAt: true });
export const insertCurrencySchema = createInsertSchema(currenciesTable).omit({ id: true, createdAt: true });

export type Country = typeof countriesTable.$inferSelect;
export type Port = typeof portsTable.$inferSelect;
export type Currency = typeof currenciesTable.$inferSelect;
export type Setting = typeof settingsTable.$inferSelect;
export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
