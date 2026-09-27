import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { UPLOADS_DIR } from "./lib/upload";
import { replitAuthMiddleware } from "./middlewares/replitAuthMiddleware";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(replitAuthMiddleware);

// Brute-force protection for credential and refresh-token endpoints.
// The store is intentionally process-local; deployments should keep a single
// instance or provide a shared express-rate-limit store when scaling out.
const authTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many requests", message: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: true,
  // Skip rate limiting outside production so automated tests and local dev
  // never hit the cap. The limiter is still enforced in the deployed app.
  skip: () => process.env.NODE_ENV !== "production",
});

// Keep registration and phone verification on a separate, less-sensitive
// limiter so they cannot consume login/refresh attempts.
const accountCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests", message: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: true,
  skip: () => process.env.NODE_ENV !== "production",
});

app.use("/api/auth/login", authTokenLimiter);
app.use("/api/auth/refresh", authTokenLimiter);
app.use("/api/auth/register", accountCreationLimiter);
app.use("/api/auth/phone", accountCreationLimiter);

// Phase 2 contract-compatible aliases. The product later standardized on
// "vehicles", so keep both public surfaces available without duplicating logic.
app.use((req, _res, next) => {
  if (req.path === "/api/listings" || req.path.startsWith("/api/listings/")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const suffix = req.path.slice("/api/listings".length);
    req.url = `/api/vehicles${suffix}${query}`;
  }
  next();
});

// Spec-compatible URL aliases: /api/admin-messages/conversations/* → /api/admin-messages/*
// Allows both the internally-consistent surface and the specified contract to coexist.
app.use((req, _res, next) => {
  const base = "/api/admin-messages/conversations";
  if (req.path.startsWith(base)) {
    const rest = req.path.slice(base.length); // "", "/<uuid>", "/<uuid>/reply", "/<uuid>/archive"
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    let newRest = rest
      .replace(/\/reply$/, "/messages")
      .replace(/\/archive$/, "/status");
    req.url = `/api/admin-messages${newRest}${qs}`;
    // For PATCH …/archive, inject status:"archived" into body
    if (rest.endsWith("/archive") && req.method === "PATCH") {
      req.body = { ...(req.body ?? {}), status: "archived" };
    }
  }
  next();
});

app.use("/api", router);

// Serve uploaded files (images and videos) — path resolved from upload.ts constant
app.use("/api/uploads", express.static(UPLOADS_DIR));

// ── Global error handler ────────────────────────────────────────────────────
// Catches unhandled errors from route handlers, including Postgres errors
// (e.g. invalid UUID format → PG error code 22P02).
// Drizzle ORM wraps Postgres errors, so we check both top-level and err.cause.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Resolve the Postgres error code from the error itself or its nested cause
  const pgCode: string | undefined = err?.code ?? err?.cause?.code;

  // PostgreSQL: invalid input syntax for type uuid
  if (pgCode === "22P02") {
    res.status(400).json({ error: "Bad request", message: "Invalid ID format" });
    return;
  }

  // PostgreSQL: foreign key violation
  if (pgCode === "23503") {
    res.status(400).json({ error: "Bad request", message: "Referenced record does not exist" });
    return;
  }

  // PostgreSQL: unique violation
  if (pgCode === "23505") {
    res.status(409).json({ error: "Conflict", message: "Record already exists" });
    return;
  }

  // Drizzle wraps PG errors in a generic Error with message containing the code
  if (typeof err?.message === "string" && err.message.includes("22P02")) {
    res.status(400).json({ error: "Bad request", message: "Invalid ID format" });
    return;
  }

  logger.error({ err }, "Unhandled route error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
