import { pgTable, text, timestamp, boolean, uuid, json } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const savedSearchesTable = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: json("filters").notNull().$type<Record<string, unknown>>(),
  notify: boolean("notify").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SavedSearch = typeof savedSearchesTable.$inferSelect;
export type NewSavedSearch = typeof savedSearchesTable.$inferInsert;
