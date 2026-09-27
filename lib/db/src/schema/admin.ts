import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  boolean,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

// ── Commission Rules ──────────────────────────────────────────────────────────
// Defines how platform commission is calculated. Rule matching priority:
// seller-specific > country-specific > category-specific > default (scope=default).

export const commissionRulesTable = pgTable("commission_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'fixed' | 'percentage' | 'hybrid'
  scope: text("scope").notNull().default("default"), // 'default' | 'seller' | 'country' | 'category'
  scopeValue: text("scope_value"), // sellerId UUID, country code, or category name
  fixedAmountUsd: numeric("fixed_amount_usd", { precision: 14, scale: 2 }),
  percentageRate: numeric("percentage_rate", { precision: 5, scale: 2 }), // 0.00–100.00
  priority: integer("priority").notNull().default(0), // higher number = applied first
  isActive: boolean("is_active").notNull().default(true),
  createdById: uuid("created_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Commissions ───────────────────────────────────────────────────────────────
// Immutable record of commission calculated when an order reaches 'closed'.

export const commissionsTable = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),
    ruleId: uuid("rule_id").references(() => commissionRulesTable.id, {
      onDelete: "set null",
    }),
    ruleSnapshot: text("rule_snapshot"),
    amountUsd: numeric("amount_usd", { precision: 14, scale: 2 }).notNull(),
    calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("commissions_order_id_unique").on(t.orderId)],
);

export type CommissionRule = typeof commissionRulesTable.$inferSelect;
export type InsertCommissionRule = typeof commissionRulesTable.$inferInsert;
export type Commission = typeof commissionsTable.$inferSelect;
export type InsertCommission = typeof commissionsTable.$inferInsert;
