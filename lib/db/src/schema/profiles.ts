import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const buyerProfilesTable = pgTable("buyer_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyName: text("company_name"),
  country: text("country"),
  city: text("city"),
  address: text("address"),
  importLicenseNumber: text("import_license_number"),
  preferredCurrency: text("preferred_currency").default("USD"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sellerProfilesTable = pgTable("seller_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  businessLicense: text("business_license"),
  exportLicense: text("export_license"),
  city: text("city").default("Shanghai"),
  address: text("address"),
  website: text("website"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const freightForwarderProfilesTable = pgTable("freight_forwarder_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  licenseNumber: text("license_number"),
  country: text("country"),
  city: text("city"),
  specializations: text("specializations").array(),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBuyerProfileSchema = createInsertSchema(buyerProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSellerProfileSchema = createInsertSchema(sellerProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFreightForwarderProfileSchema = createInsertSchema(freightForwarderProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type BuyerProfile = typeof buyerProfilesTable.$inferSelect;
export type SellerProfile = typeof sellerProfilesTable.$inferSelect;
export type FreightForwarderProfile = typeof freightForwarderProfilesTable.$inferSelect;
export type InsertBuyerProfile = z.infer<typeof insertBuyerProfileSchema>;
export type InsertSellerProfile = z.infer<typeof insertSellerProfileSchema>;
