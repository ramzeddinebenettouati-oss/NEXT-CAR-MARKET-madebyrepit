import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";

export const signupMethodEnum = pgEnum("signup_method", [
  "email",
  "phone",
  "google",
  "wechat",
]);
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "seller",
  "buyer",
  "freight_forwarder",
]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").unique(),
  country: text("country"),
  signupMethod: signupMethodEnum("signup_method").notNull().default("email"),
  preferredLanguage: text("preferred_language"),
  isActive: boolean("is_active").notNull().default(true),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  refreshToken: text("refresh_token"),
  replitSub: text("replit_sub").unique(),
  wechatOpenId: text("wechat_open_id").unique(),
  googleSub: text("google_sub").unique(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const refreshTokensTable = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: true,
  refreshToken: true,
  lastLoginAt: true,
});

export const selectUserSchema = createSelectSchema(usersTable).omit({
  passwordHash: true,
  refreshToken: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type SafeUser = Omit<User, "passwordHash" | "refreshToken">;
