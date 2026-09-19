import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import { getDb } from "@/lib/db";
import { authConfig } from "./config";
import { sendAuthMail } from "./mail";

// The factory also permits isolated SQL/transport fixtures in tests and local CLI bootstrap.
// No request data can select these options. Production always uses getAuth().
export function createAuth(db: Pool, options: {
  baseURL: string;
  secret: string;
  allowSignUp?: boolean;
  sendMail?: typeof sendAuthMail;
}) {
  const sendMail = options.sendMail ?? sendAuthMail;
  return betterAuth({
    appName: "FetishUI",
    baseURL: options.baseURL,
    secret: options.secret,
    database: db,
    trustedOrigins: [options.baseURL],
    logger: { disabled: true },
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => { await sendMail(user.email, url, "reset"); },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => { await sendMail(user.email, url, "verify"); },
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    advanced: {
      useSecureCookies: options.baseURL.startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      // Deployment must strip spoofed forwarded headers and set this trusted header itself.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!instance) instance = createAuth(getDb(), {
    ...authConfig(),
    allowSignUp: process.env.AUTH_ALLOW_SIGNUP === "true" && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM),
  });
  return instance;
}
