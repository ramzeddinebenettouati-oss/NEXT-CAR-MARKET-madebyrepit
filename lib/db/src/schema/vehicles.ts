import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  numeric,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { portsTable } from "./reference";

export const vehicleFuelTypeEnum = pgEnum("vehicle_fuel_type", [
  "petrol",
  "diesel",
  "electric",
  "hybrid",
  "phev",
  "hydrogen",
  "lpg",
  "other",
]);

export const vehicleConditionEnum = pgEnum("vehicle_condition", [
  "new",
  "used",
  "certified_used",
]);

export const vehicleTransmissionEnum = pgEnum("vehicle_transmission", [
  "manual",
  "automatic",
  "cvt",
  "dct",
  "other",
]);

export const vehicleDriveTypeEnum = pgEnum("vehicle_drive_type", [
  "fwd",
  "rwd",
  "awd",
  "4wd",
]);

export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "archived",
]);

export const vehicleBrandsTable = pgTable("vehicle_brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  countryOfOrigin: text("country_of_origin"),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vehicleModelsTable = pgTable("vehicle_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => vehicleBrandsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vehicleListingsTable = pgTable("vehicle_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => vehicleBrandsTable.id),
  brandName: text("brand_name").notNull(),
  modelId: uuid("model_id").references(() => vehicleModelsTable.id),
  modelName: text("model_name").notNull(),
  trim: text("trim"),
  year: integer("year").notNull(),
  fuelType: vehicleFuelTypeEnum("fuel_type").notNull(),
  transmission: vehicleTransmissionEnum("transmission"),
  driveType: vehicleDriveTypeEnum("drive_type"),
  engineSizeL: numeric("engine_size_l", { precision: 4, scale: 1 }),
  batteryCapacityKwh: numeric("battery_capacity_kwh", { precision: 6, scale: 1 }),
  rangeKm: integer("range_km"),
  exteriorColor: text("exterior_color"),
  interiorColor: text("interior_color"),
  mileageKm: integer("mileage_km").notNull().default(0),
  condition: vehicleConditionEnum("condition").notNull().default("new"),
  vin: text("vin"),
  originPortId: uuid("origin_port_id").references(() => portsTable.id),
  quantity: integer("quantity").notNull().default(1),
  fobPriceUsd: numeric("fob_price_usd", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  notes: text("notes"),
  status: vehicleStatusEnum("status").notNull().default("draft"),
  rejectionReason: text("rejection_reason"),
  viewCount: integer("view_count").notNull().default(0),
  commissionRuleId: uuid("commission_rule_id"),
  commissionType: text("commission_type"),
  commissionValue: numeric("commission_value", { precision: 14, scale: 4 }),
  commissionSnapshot: jsonb("commission_snapshot"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vehicleImagesTable = pgTable("vehicle_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicleListingsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull().unique(),
  displayOrder: integer("display_order").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vehicleVideosTable = pgTable("vehicle_videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicleListingsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VehicleBrand = typeof vehicleBrandsTable.$inferSelect;
export type VehicleModel = typeof vehicleModelsTable.$inferSelect;
export type VehicleListing = typeof vehicleListingsTable.$inferSelect;
export type VehicleImage = typeof vehicleImagesTable.$inferSelect;
export type VehicleVideo = typeof vehicleVideosTable.$inferSelect;
export type InsertVehicleListing = typeof vehicleListingsTable.$inferInsert;
