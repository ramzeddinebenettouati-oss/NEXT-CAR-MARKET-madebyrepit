/**
 * Shared test helpers for AutoCango API smoke tests.
 * Tests run against the live dev server at BASE_URL (default: http://localhost:8080).
 * Seed accounts are created by `dist/seed.mjs`.
 */

export const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

// ── Known seed credentials ────────────────────────────────────────────────────
export const SEED = {
  admin:  { email: "admin@autocango.com",  password: "SuperAdmin123!" },
  seller: { email: "seller@example.com",   password: "Seller123!" },
  buyer:  { email: "buyer@example.com",    password: "Buyer123!" },
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────
export function api(path: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
}

export function authed(token: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  };
}

// ── Auth helper — returns access token ────────────────────────────────────────
export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status} ${text}`);
  }
  return res.json();
}

// ── BAD_UUID — a string that looks like a UUID but is not in the DB ───────────
export const BAD_UUID = "00000000-0000-0000-0000-000000000000";
/** Definitely not a UUID — triggers UUID validation middleware */
export const NOT_UUID  = "not-a-uuid";
