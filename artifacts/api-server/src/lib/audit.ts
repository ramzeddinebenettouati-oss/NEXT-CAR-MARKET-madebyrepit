import { db, auditLogsTable } from "@workspace/db";
import type { Request } from "express";

export async function createAuditLog({
  userId,
  userEmail,
  action,
  module,
  details,
  req,
}: {
  userId?: string;
  userEmail?: string;
  action: string;
  module: string;
  details?: string;
  req?: Request;
}) {
  try {
    await db.insert(auditLogsTable).values({
      userId: userId ?? null,
      userEmail: userEmail ?? null,
      action,
      module,
      details: details ?? null,
      ipAddress: req ? (req.ip ?? req.socket?.remoteAddress ?? null) : null,
      userAgent: req ? (req.headers["user-agent"] ?? null) : null,
    });
  } catch (_err) {
    // Audit log errors must never break the main request
  }
}
