import { closeDb, getDb } from "../src/lib/db";
import { authConfig } from "../src/lib/auth/config";
import { createAuth } from "../src/lib/auth/server";

// LOCAL DEVELOPMENT ONLY. Creates (or finishes setting up) a verified administrator for manual
// testing. Account creation and email verification still go through Better Auth: the
// verification link is captured instead of mailed, then followed exactly as a browser would.
// Only the role change is direct SQL, matching auth:promote-admin.
//
// Refuses to run unless both the database and the app origin are loopback, so a throwaway test
// password can never be written into a shared or production database.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function assertLocalOnly() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run with NODE_ENV=production.");
  const database = process.env.DATABASE_URL;
  if (!database || !LOOPBACK.has(new URL(database).hostname)) {
    throw new Error("DATABASE_URL must point at a loopback host.");
  }
  const origin = process.env.BETTER_AUTH_URL;
  if (!origin || !LOOPBACK.has(new URL(origin).hostname)) {
    throw new Error("BETTER_AUTH_URL must be a loopback origin.");
  }
}

(async () => {
  const [email, password, ...extra] = process.argv.slice(2);
  try {
    assertLocalOnly();
    if (!email || !password || extra.length) {
      throw new Error("Usage: npm run auth:seed-dev-admin -- <email> <password>");
    }

    const db = getDb();
    const verificationLinks: string[] = [];
    const auth = createAuth(db, {
      ...authConfig(),
      allowSignUp: true,
      sendMail: async (_to, url, purpose) => { if (purpose === "verify") verificationLinks.push(url); },
    });

    const existing = await db.query<{ id: string; emailVerified: boolean }>(
      `SELECT id, "emailVerified" FROM "user" WHERE lower(email) = lower($1)`, [email]);
    let userId: string;
    let verified: boolean;
    if (existing.rows[0]) {
      ({ id: userId, emailVerified: verified } = existing.rows[0]);
      // Never silently reset an existing password; use the app's reset flow for that.
      console.log("Account already exists; its password was left unchanged.");
    } else {
      const signup = await auth.api.signUpEmail({ body: { email, password, name: "Admin" } });
      userId = signup.user.id;
      verified = false;
      console.log("Account created through Better Auth.");
    }

    if (!verified) {
      if (verificationLinks.length === 0) await auth.api.sendVerificationEmail({ body: { email } });
      const link = verificationLinks.at(-1);
      if (!link) throw new Error("Better Auth did not issue a verification link.");
      const response = await auth.handler(new Request(link));
      if (response.status >= 400) throw new Error(`Verification link was rejected (HTTP ${response.status}).`);
      console.log("Email verified by following Better Auth's verification link.");
    }

    const promoted = await db.query(
      `UPDATE "user" SET role = 'admin', "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1 AND "emailVerified" = true RETURNING id`, [userId]);
    if (!promoted.rowCount) throw new Error("Account is not verified, so it was not promoted.");
    console.log(`Administrator ready: ${email}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    // Never echo the supplied password, even inside a library error.
    console.error("Dev admin seed failed:", password && message.includes(password) ? "details withheld" : message);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();
