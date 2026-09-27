import { Router } from "express";
import { db, savedSearchesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";

const router = Router();

// GET /api/saved-searches
router.get("/saved-searches", authenticate, async (req, res) => {
  const user = req.user!;
  const rows = await db
    .select()
    .from(savedSearchesTable)
    .where(eq(savedSearchesTable.userId, user.userId))
    .orderBy(desc(savedSearchesTable.createdAt));
  res.json({ data: rows });
});

// POST /api/saved-searches
router.post("/saved-searches", authenticate, async (req, res) => {
  const { name, filters, notify } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
    res.status(400).json({ error: "name is required and must be ≤ 100 chars" });
    return;
  }
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    res.status(400).json({ error: "filters must be an object" });
    return;
  }
  const user = req.user!;
  const [row] = await db
    .insert(savedSearchesTable)
    .values({ userId: user.userId, name: name.trim(), filters, notify: !!notify })
    .returning();
  res.status(201).json(row);
});

// PATCH /api/saved-searches/:id — toggle notify
router.patch("/saved-searches/:id", authenticate, async (req, res) => {
  const user = req.user!;
  const { id } = req.params as Record<string, string>;
  const { notify } = req.body ?? {};
  if (typeof notify !== "boolean") {
    res.status(400).json({ error: "notify must be boolean" });
    return;
  }
  const [row] = await db
    .update(savedSearchesTable)
    .set({ notify })
    .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userId, user.userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

// DELETE /api/saved-searches/:id
router.delete("/saved-searches/:id", authenticate, async (req, res) => {
  const user = req.user!;
  const { id } = req.params as Record<string, string>;
  const [deleted] = await db
    .delete(savedSearchesTable)
    .where(and(eq(savedSearchesTable.id, id), eq(savedSearchesTable.userId, user.userId)))
    .returning({ id: savedSearchesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).end();
});

export default router;
