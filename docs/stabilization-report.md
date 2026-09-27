# AutoCango API Stabilization Report

**Date:** 2026-06-06  
**Scope:** Full end-to-end audit of all API modules — security hardening, UUID validation, error handling, token hygiene, TypeScript correctness, and smoke testing.

---

## 1. DB Backup

Backup taken at `/tmp/db-backup.sql` via `pg_dump $DATABASE_URL` before any changes.

---

## 2. Fixes Applied

### 2.1 JWT Token Uniqueness (`lib/jwt.ts`)
- Added `jti: randomUUID()` to both `signAccessToken` and `signRefreshToken`.
- **Problem:** Same-second logins by the same user produced identical JWT payloads (same `sub` + `iat`), causing a unique-constraint 409 on the refresh_tokens table.
- **Fix:** Each token now has a unique JWT ID regardless of issue time.
- **Verified:** Three simultaneous logins → 200/200/200 (no 409).

### 2.2 Refresh Token Cap (`auth.ts`)
- Login now prunes the oldest tokens for a user when the count would exceed 5.
- **Problem:** Unlimited token accumulation across sessions; unbounded DB growth.
- **Fix:** `DELETE ... WHERE id IN (SELECT id ... ORDER BY created_at ASC LIMIT n)` before insert.
- **Verified:** DB cleaned; all active users ≤5 refresh tokens.

### 2.3 Token Revocation on User Delete (`admin.ts`)
- Soft-delete (`DELETE /admin/users/:userId`) now immediately revokes all refresh tokens.
- **Problem:** Deleted users could continue making authenticated requests until token expiry.
- **Fix:** `DELETE FROM refresh_tokens WHERE user_id = userId` before soft-delete.

### 2.4 Global Error Handler (`app.ts`)
- Added Drizzle/Postgres error cause unwrapping for codes `22P02` (invalid UUID), `23503` (FK violation), `23505` (unique violation).
- **Problem:** Drizzle wraps pg errors in a generic `Error` with the pg error as `cause`; the default handler returned 500 for user-facing errors.
- **Fix:** Inspects `err.cause?.code` and `err.message` to return appropriate 400/404/409 responses.

### 2.5 UUID Validation Middleware (`lib/validate.ts`)
New shared utility:
- `isUUID(s)` — returns true for valid v4 UUIDs.
- `requireUuidParams(...names)` — Express middleware that returns 404 with `{"error":"Not found"}` for any param that is not a valid UUID.

Applied to **all 42 parametrized route handlers** across 9 files:

| File | Routes protected |
|------|-----------------|
| `vehicles.ts` | GET, PATCH, DELETE `/:vehicleId`; POST `/:vehicleId/submit`; DELETE `/:vehicleId/images/:imageId`; DELETE `/:vehicleId/videos/:videoId` |
| `quotations.ts` | GET `/:quotationId`; PATCH `/:quotationId/accept`; PATCH `/:quotationId/reject` |
| `orders.ts` | GET `/:orderId`; PATCH `/:orderId/status` |
| `payments.ts` | GET/POST `/orders/:orderId/payments`; POST `/payments/:paymentId/verify`; POST `/payments/:paymentId/reject` |
| `shipments.ts` | GET `/:shipmentId`; GET `/orders/:orderId/shipment`; PATCH `/:shipmentId/status`; GET `/:shipmentId/tracking`; POST `/:shipmentId/documents`; DELETE `/:shipmentId/documents/:documentId` |
| `notifications.ts` | POST `/:notificationId/read` |
| `chat.ts` | GET/POST `/conversations/:conversationId`; POST `/conversations/:conversationId/messages`; POST `/conversations/:conversationId/quotations`; POST `/conversations/:conversationId/read` |
| `freight.ts` | GET/POST `/:requestId`; GET `/:requestId/quotes`; GET/POST `/orders/:orderId/shipping-quotes`; GET/POST/PATCH `/shipping-quotes/:quoteId` |
| `admin.ts` | All user, vehicle, commission, reference routes with ID params |

### 2.6 TypeScript Correctness
- Fixed Express 5 `req.params` typing (`string | string[]`) — added `as Record<string, string>` casts at all destructuring points across 10 route files.
- Fixed `objectStorage.ts`: `response.json()` typed as `{ signed_url: string }`.
- Fixed `freight.ts`: `vehicleListingsTable.title` (non-existent column) replaced with `sql\`concat(brandName, ' ', modelName)\``.
- Fixed `chat.ts`: removed dead code branch; explicit `AttachmentRow` type for map.
- Rebuilt `lib/db` declarations to expose `replitSub` column to dependent packages.
- **Result: 0 TypeScript errors** (`tsc --noEmit` passes clean).

---

## 3. DB Cleanup

Executed before hardening work:
- Removed orphaned refresh tokens for soft-deleted users.
- Trimmed active users to ≤5 refresh tokens each.
- Removed stale test vehicle listing.

---

## 4. Smoke Test Results

**42 endpoints tested** across 11 modules. All pass.

| Module | Checks | Result |
|--------|--------|--------|
| Auth (login, refresh, me) | 5 | ✅ All pass |
| Vehicles (list, get, bad UUID) | 7 | ✅ All pass |
| Quotations (list, get, bad UUID, accept/reject) | 5 | ✅ All pass |
| Orders (list, get, status update, bad UUID) | 5 | ✅ All pass |
| Payments (admin/buyer RBAC, bad UUID) | 3 | ✅ All pass |
| Shipments (list, get, tracking, bad UUID) | 3 | ✅ All pass |
| Freight requests (list, get, bad UUID) | 2 | ✅ All pass |
| Conversations (list, get, bad UUID, auth) | 4 | ✅ All pass |
| Notifications (list, mark-read, read-all) | 3 | ✅ All pass |
| Admin (stats, users, moderation, RBAC) | 4 | ✅ All pass |
| Dashboards (buyer, seller, cross-role 403) | 3 | ✅ All pass |
| **Same-second logins (no 409)** | 3 | ✅ All 200 |

---

## 5. Security Summary

- No secrets or credentials exposed in responses.
- All parametrized routes protected against UUID injection → Postgres errors.
- Admin endpoints enforce role checks independently of UUID validation.
- Deleted users lose all session tokens immediately.
- JWT tokens are cryptographically unique per issue even within the same second.
