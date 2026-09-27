import { Request, Response, NextFunction } from "express";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * Express route-level middleware that validates one or more UUID params.
 * Returns 404 {"error":"Not found"} if any param is not a valid UUID.
 * Usage: router.get("/things/:id", requireUuidParams("id"), handler)
 */
export function requireUuidParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const value = (req.params as Record<string, string>)[name];
      if (!value || !UUID_RE.test(value)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }
    next();
  };
}
