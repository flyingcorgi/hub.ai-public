import { getAuth } from "./server";
import { getDb } from "@/lib/db";
import type { Principal } from "./policy";
import type { Pool } from "pg";

export class AccessError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

// Always query current DB identity and entitlement. No localStorage flags, public env bypass,
// cookie-cached claims, or role values supplied by the browser are authoritative.
export async function principalForUser(db: Pool, userId: string): Promise<Principal | null> {
  const result = await db.query(`SELECT u.id, u.email, u."emailVerified", u.role,
      e.paid_through_at, e.revoked_at
    FROM "user" u LEFT JOIN entitlements e ON e.user_id = u.id WHERE u.id = $1`, [userId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.id, email: row.email, emailVerified: row.emailVerified,
    role: row.role === "admin" ? "admin" : "user",
    paidThroughAt: row.paid_through_at ? new Date(row.paid_through_at).getTime() : null,
    revoked: Boolean(row.revoked_at),
  };
}

export async function getPrincipal(headers: Headers): Promise<Principal | null> {
  // Public free catalog/generation still works without a signed-in session. A supplied cookie
  // must be verified; configuration/DB failures are not treated as an authorized anonymous user.
  if (!headers.get("cookie")) return null;
  const session = await getAuth().api.getSession({ headers, query: { disableCookieCache: true } });
  return session ? principalForUser(getDb(), session.user.id) : null;
}

export async function requireUser(headers: Headers) {
  const user = await getPrincipal(headers);
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (!user.emailVerified) throw new AccessError(403, "Verify your email to continue.");
  return user;
}

export async function requireAdmin(headers: Headers) {
  const user = await requireUser(headers);
  if (user.role !== "admin") throw new AccessError(403, "Administrator access required.");
  return user;
}
