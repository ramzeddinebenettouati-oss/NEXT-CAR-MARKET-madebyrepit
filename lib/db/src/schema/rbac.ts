import {
  pgTable,
  text,
  timestamp,
  uuid,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const rolesTable = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const permissionsTable = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  module: text("module").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rolePermissionsTable = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissionsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.roleId, t.permissionId)],
);

export const adminProfilesTable = pgTable("admin_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").references(() => rolesTable.id),
  department: text("department"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userPermissionsTable = pgTable(
  "user_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissionsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.permissionId)],
);

export const insertRoleSchema = createInsertSchema(rolesTable).omit({ id: true, createdAt: true });
export const insertPermissionSchema = createInsertSchema(permissionsTable).omit({ id: true, createdAt: true });

export type Role = typeof rolesTable.$inferSelect;
export type Permission = typeof permissionsTable.$inferSelect;
export type AdminProfile = typeof adminProfilesTable.$inferSelect;
export type UserPermission = typeof userPermissionsTable.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
