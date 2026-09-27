import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { sendEmail, getDefaultFromAddress, isCustomDomainConfigured, isResendConfigured } from "../lib/resend";
import { db } from "@workspace/db";
import {
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  userPermissionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function canAccessMailboxes(userId: string, userRole: string): Promise<boolean> {
  if (userRole === "super_admin") return true;
  if (userRole !== "admin") return false;
  const [roleRows, userRows] = await Promise.all([
    db
      .select({ name: permissionsTable.name })
      .from(rolePermissionsTable)
      .innerJoin(rolesTable, eq(rolePermissionsTable.roleId, rolesTable.id))
      .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
      .where(eq(rolesTable.name, userRole)),
    db
      .select({ name: permissionsTable.name })
      .from(userPermissionsTable)
      .innerJoin(permissionsTable, eq(userPermissionsTable.permissionId, permissionsTable.id))
      .where(eq(userPermissionsTable.userId, userId)),
  ]);
  const allPerms = new Set([...roleRows.map((r) => r.name), ...userRows.map((r) => r.name)]);
  return allPerms.has("manage_mailboxes");
}

async function requireMailboxAccess(req: any, res: any, next: any) {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ok = await canAccessMailboxes(req.user.userId, req.user.role);
  if (!ok) {
    res.status(403).json({ error: "Forbidden", message: "manage_mailboxes permission required" });
    return;
  }
  next();
}

// Send an email via Resend
router.post("/mailboxes/send", authenticate, requireMailboxAccess, async (req, res) => {
  try {
    const { to, subject, text, html, replyTo, from } = req.body;
    if (!to || !subject || (!text && !html)) {
      res.status(400).json({ error: "to, subject, and text or html are required" });
      return;
    }
    if (!isResendConfigured()) {
      res.status(503).json({ error: "Resend API key is not configured" });
      return;
    }
    const fromAddress = from || getDefaultFromAddress();
    const toList = Array.isArray(to) ? to.map((t: any) => typeof t === "string" ? t : t.email) : [to];
    const data = await sendEmail({ from: fromAddress, to: toList, subject, text, html, replyTo });
    res.status(201).json({ id: data?.id, sent: true, from: fromAddress, to: toList, subject });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to send email", details: err.message });
  }
});

// Resend config — tells frontend what from address is active
router.get("/mailboxes-config", authenticate, requireMailboxAccess, async (_req, res) => {
  res.json({
    resendConfigured: isResendConfigured(),
    customDomain: isCustomDomainConfigured(),
    fromAddress: getDefaultFromAddress(),
  });
});

export default router;
