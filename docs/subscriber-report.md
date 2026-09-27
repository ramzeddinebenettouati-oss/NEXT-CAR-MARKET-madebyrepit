# AutoCango — Subscriber Sign-up Method Report

> This document describes how new user registrations are tracked, categorised, and reviewed in the admin panel.

---

## Overview

Every account created on AutoCango is stamped with the **signup method** the user chose on the registration screen. This field is stored permanently in the `users` table and is visible to admins in the Users panel.

---

## Sign-up Methods

| Method | Icon | Description | Status |
|--------|------|-------------|--------|
| **Email** | ✉️ | Standard email + password registration (default) | ✅ Live |
| **Phone** | 📱 | Mobile number + OTP authentication | 🔜 Coming soon |
| **Gmail** | 🔵 | Google OAuth 2.0 single sign-on | 🔜 Coming soon |
| **WeChat** | 🟢 | WeChat Open Platform OAuth | 🔜 Coming soon |

---

## Database Field

```sql
-- Column added to the users table
ALTER TABLE users
  ADD COLUMN signup_method signup_method NOT NULL DEFAULT 'email';

-- Enum type
CREATE TYPE signup_method AS ENUM ('email', 'phone', 'google', 'wechat');
```

All existing accounts default to `email`. New registrations record whichever method the user selected before filling in the form.

---

## Admin Users Panel

### Summary Cards (top of page)

Four clickable cards show a live count of subscribers per method:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  ✉ Email     │  │  📱 Phone    │  │  G  Gmail    │  │  💬 WeChat   │
│     142      │  │      0       │  │      0       │  │      0       │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

Clicking a card **filters the table** to show only users who signed up via that method. Clicking it again clears the filter.

### Filter Dropdown

A **"Signed up via"** dropdown alongside the existing role filter lets admins combine filters:
- Show all buyers who used Gmail
- Show all sellers who registered by phone
- etc.

### Table Column

A **"Signed up via"** column is present in the users table with a coloured badge:

| Badge colour | Method |
|---|---|
| Yellow (primary) | Email |
| Green | Phone |
| Red/blue multicolour | Gmail |
| WeChat green | WeChat |

---

## How the method is recorded

1. User opens the **Create Account** page.
2. User clicks one of the four method buttons (Phone / Gmail / Email / WeChat).
3. The selected method is highlighted and stored as `signupMethod` in the form state.
4. On submission the API receives `signupMethod` in the request body alongside all other registration fields.
5. The API writes it to `users.signup_method`.

> Phone, Gmail, and WeChat currently display a "coming soon" notification and redirect the user to the email form. Once the OAuth/OTP integrations are live, the method will be set automatically by the provider callback.

---

## API Reference

### `POST /api/auth/register`

**Request body** (new optional field):

```json
{
  "email": "user@company.com",
  "password": "••••••••",
  "role": "buyer",
  "firstName": "Jane",
  "lastName": "Doe",
  "companyName": "Acme Ltd",
  "signupMethod": "email"   ← new field; defaults to "email"
}
```

**Response** (new field in user object):

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "uuid",
    "email": "user@company.com",
    "signupMethod": "email",   ← new
    ...
  }
}
```

### `GET /api/users` (admin)

Each user object now includes:

```json
{
  "signupMethod": "email" | "phone" | "google" | "wechat"
}
```

---

## Viewing Subscribers by Method

1. Navigate to **Admin → Users**.
2. Use the summary cards at the top to filter by method, or use the **"Signed up via"** dropdown.
3. Combine with the **Role** dropdown and **Search** bar for granular queries.
4. The count shown next to the search bar updates to reflect the active filter.

---

*Last updated: July 2026*
