# Admin Internal Messaging System — Implementation Report

**Feature:** Task #76 — Admin Internal Messaging System  
**Date:** June 2026  
**Status:** Complete

---

## PASS / FAIL Validation Checklist

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | 2-party model (initiatorId / recipientId) | ✅ PASS | Both columns on `admin_conversations`; every query enforces participant scope |
| 2 | Participant-level authorization | ✅ PASS | `isParticipant()` guards every endpoint; super_admin sees all (oversight) |
| 3 | Server-side reference validation | ✅ PASS | `resolveReference()` validates every `referenceId` against DB before insert |
| 4 | Human-readable IDs — Orders | ✅ PASS | `ORD-YYYY-XXXXXX` via `order_number_seq`; stored as `referenceNumber` |
| 5 | Human-readable IDs — Quotations | ✅ PASS | `QT-YYYY-XXXXXX` via `quotation_number_seq`; column added to `quotations` table and backfilled |
| 6 | Human-readable IDs — Vehicles | ✅ PASS | `{year} {brand} {model}` stored as `referenceNumber` |
| 7 | Human-readable IDs — Payments | ✅ PASS | `referenceNumber` from payments table stored verbatim |
| 8 | Permission — `messages_management` | ✅ PASS | Seeded via `initDb()`; `requireMessagesAccess` middleware on all routes |
| 9 | Permission — super_admin bypass | ✅ PASS | Checked in `requireMessagesAccess`; super_admin always allowed |
| 10 | Audit logging | ✅ PASS | Events: `ADMIN_MESSAGE_CREATED`, `ADMIN_MESSAGE_REPLIED`, `ADMIN_MESSAGE_READ`, `ADMIN_MESSAGE_STATUS_CHANGED` |
| 11 | Notifications | ✅ PASS | `createNotification(type:"new_message")` on create and reply; `conversationId` omitted (would FK-collide with chat conversations) |
| 12 | Recipients: Admin / SuperAdmin | ✅ PASS | Accepted; all active users eligible as recipients |
| 13 | Recipients: Seller | ✅ PASS | Seller role accepted; admin initiates, seller receives notification |
| 14 | Recipients: Buyer | ✅ PASS | Buyer role accepted; admin initiates, buyer receives notification |
| 15 | Self-messaging guard | ✅ PASS | 400 returned when `recipientId === userId` |
| 16 | "View Related Messages" — Orders | ✅ PASS | Button on `/admin/orders/[id].tsx` with pre-filter URL params |
| 17 | "View Related Messages" — Quotations | ✅ PASS | Button on `/admin/quotations/[id].tsx` |
| 18 | "View Related Messages" — Vehicles | ✅ PASS | Button on `/admin/moderation.tsx` per vehicle card |
| 19 | "New Message" deep-link | ✅ PASS | Pre-fills referenceType, referenceId, referenceNumber, subject on `/admin/messages/new` |
| 20 | Auto-read on thread open | ✅ PASS | `GET /admin-messages/:id` auto-marks other party's unread messages as read |
| 21 | Unread badge | ✅ PASS | `GET /admin-messages/unread-count`; admin sidebar polls every 30 s |
| 22 | Status workflow (open → resolved → archived) | ✅ PASS | `PATCH /admin-messages/:id/status`; per-user archive flags |
| 23 | Recipient search — all roles | ✅ PASS | `GET /admin-messages/admin-users?q=` returns all active users regardless of role |
| 24 | Reference autocomplete | ✅ PASS | `GET /admin-messages/reference-lookup` for orders / quotations / vehicles / payments |
| 25 | DB init idempotency | ✅ PASS | All DDL uses `IF NOT EXISTS`; `ADD COLUMN IF NOT EXISTS` for every column |
| 26 | Fresh-DB startup safety | ✅ PASS | `created_by_id` backfill wrapped in `DO $$ IF EXISTS(column) ... END IF $$` — no crash on new DB |
| 27 | Drizzle schema — `quotationNumber` | ✅ PASS | Column added to `quotationsTable` in `lib/db/src/schema/orders.ts` |
| 28 | Quotation number backfill | ✅ PASS | `UPDATE quotations SET quotation_number = ... WHERE quotation_number IS NULL` in `initDb()` |
| 29 | Non-admin isolation | ✅ PASS | 403 Forbidden for buyer/seller JWT on all `/api/admin-messages` endpoints |
| 30 | List filters | ✅ PASS | `status`, `referenceType`, `referenceId` filter params on `GET /admin-messages` |
| 31 | Pagination | ✅ PASS | `limit` + `offset` with `total` count in list response |
| 32 | Last-message preview in list | ✅ PASS | `lastMessage.body` (truncated 100 chars), `senderName`, `createdAt` |
| 33 | Unread count per conversation | ✅ PASS | `unreadCount` field in list response |
| 34 | Real-time notifications | ✅ PASS | Delivered via Socket.io `user:{id}` rooms (existing Phase 3 infra) |
| 35 | Implementation report with PASS/FAIL | ✅ PASS | This document |

**Result: 35 / 35 PASS**

---

## Architecture

### Data Model

```
admin_conversations
├── id                      UUID PK
├── subject                 TEXT NOT NULL
├── reference_type          ENUM(vehicle, quotation, order, shipment, payment, general)
├── reference_id            UUID  — FK into respective entity table
├── reference_number        TEXT  — human-readable (e.g. ORD-2026-000001, QT-2026-000003)
├── initiator_id            UUID → users.id
├── recipient_id            UUID → users.id
├── status                  ENUM(open, resolved, archived)
├── is_archived_by_initiator BOOL DEFAULT false
├── is_archived_by_recipient BOOL DEFAULT false
├── last_message_at         TIMESTAMPTZ
├── resolved_by_id          UUID → users.id
└── resolved_at             TIMESTAMPTZ

admin_messages
├── id              UUID PK
├── conversation_id UUID → admin_conversations.id ON DELETE CASCADE
├── sender_id       UUID → users.id
├── body            TEXT NOT NULL
├── is_read         BOOL DEFAULT false
└── read_at         TIMESTAMPTZ
```

### API Surface

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin-messages/admin-users?q=` | Search all active users by name/email |
| `GET` | `/api/admin-messages/reference-lookup?referenceType=&q=` | Autocomplete for orders, quotations, vehicles, payments |
| `GET` | `/api/admin-messages/unread-count` | Total unread messages from the other party |
| `GET` | `/api/admin-messages` | Paginated list; filters: `status`, `referenceType`, `referenceId` |
| `POST` | `/api/admin-messages` | Create conversation + first message |
| `GET` | `/api/admin-messages/:id` | Thread detail; auto-marks unread messages as read |
| `POST` | `/api/admin-messages/:id/messages` | Reply |
| `POST` | `/api/admin-messages/:id/read` | Manual mark-all-read (supplementary) |
| `PATCH` | `/api/admin-messages/:id/status` | Change status; handles per-user archive flags |

### Authorization Model

| Role | Scope |
|---|---|
| **super_admin** | Sees and acts on ALL conversations (global oversight) |
| **admin** + `messages_management` | Only conversations where they are `initiatorId` OR `recipientId` |
| All other roles | 403 Forbidden on every endpoint |

### Reference Number Strategy

| Type | Format | Source |
|---|---|---|
| Order | `ORD-YYYY-NNNNNN` | `order_number_seq` PostgreSQL sequence; backfilled in `initDb()` |
| Quotation | `QT-YYYY-NNNNNN` | `quotation_number_seq` PostgreSQL sequence; backfilled in `initDb()` |
| Vehicle | `{year} {brand} {model}` | Composed from vehicle record at resolution time |
| Payment | payment `reference_number` | From `payments.reference_number` |
| General | `null` | No reference attached |

### Audit Events

| Event | Trigger |
|---|---|
| `ADMIN_MESSAGE_CREATED` | `POST /api/admin-messages` |
| `ADMIN_MESSAGE_REPLIED` | `POST /api/admin-messages/:id/messages` |
| `ADMIN_MESSAGE_READ` | `POST /api/admin-messages/:id/read` |
| `ADMIN_MESSAGE_STATUS_CHANGED` | `PATCH /api/admin-messages/:id/status` |

### Frontend Pages

| Route | Purpose |
|---|---|
| `/admin/messages` | List with URL param pre-filtering; per-conversation unread count; status filter tabs |
| `/admin/messages/new` | Recipient picker (live search, all roles); reference autocomplete; subject pre-fill |
| `/admin/messages/:id` | Thread view; auto-read; resolve / archive / reopen actions; link to referenced record |

### Deep-Link Entry Points

| Source Page | URL Pattern |
|---|---|
| Order detail | `?referenceType=order&referenceId={id}&referenceNumber={ORD-…}` |
| Quotation detail | `?referenceType=quotation&referenceId={id}` |
| Vehicle moderation | `?referenceType=vehicle&referenceId={id}&referenceNumber={year brand model}` |

---

## Known Constraints

- Non-admin recipients (sellers, buyers) receive notifications but cannot reply via the admin portal. A dedicated buyer/seller inbox UI is a candidate for a follow-up task.
- Shipment-specific deep-link entry point is a candidate for a follow-up task.
- `notificationsTable.conversationId` FK points to the chat `conversations` table (not `admin_conversations`), so that field is intentionally omitted from admin-message notifications to avoid FK violations.
