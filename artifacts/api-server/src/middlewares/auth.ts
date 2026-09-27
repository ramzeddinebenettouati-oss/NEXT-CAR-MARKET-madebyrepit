import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type JwtPayload } from "../lib/jwt";
import { db, rolePermissionsTable, userPermissionsTable, rolesTable, permissionsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    next();
  };
}

/**
 * Optional auth — parses the JWT if present but never rejects the request.
 * Sets req.user when a valid token is found; leaves it undefined otherwise.
 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) req.user = payload;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!["super_admin", "admin"].includes(req.user.role)) {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }
  next();
}

/**
 * Permission-based RBAC middleware.
 * SuperAdmins bypass all permission checks.
 * All other roles must have the requested permission via the role_permissions table.
 *
 * Usage: requirePermission("users:manage") or requirePermission("vehicle:moderate")
 */
export function requirePermission(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (req.user.role === "super_admin") {
      next();
      return;
    }

    try {
      // Check both role-level permissions AND per-user overrides
      const [roleRows, userRows] = await Promise.all([
        db
          .select({ permissionName: permissionsTable.name })
          .from(rolePermissionsTable)
          .innerJoin(rolesTable, eq(rolePermissionsTable.roleId, rolesTable.id))
          .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
          .where(eq(rolesTable.name, req.user.role)),
        db
          .select({ permissionName: permissionsTable.name })
          .from(userPermissionsTable)
          .innerJoin(permissionsTable, eq(userPermissionsTable.permissionId, permissionsTable.id))
          .where(eq(userPermissionsTable.userId, req.user.userId)),
      ]);

      const userPermissions = new Set([
        ...roleRows.map((r) => r.permissionName),
        ...userRows.map((r) => r.permissionName),
      ]);

      if (!userPermissions.has(permissionName)) {
        res.status(403).json({
          error: "Forbidden",
          message: `Permission '${permissionName}' is required for this action`,
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
