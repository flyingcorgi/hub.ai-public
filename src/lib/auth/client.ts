import { createAuthClient } from "better-auth/react";

// Same-origin Better Auth client. Passwords/tokens are not copied into browser storage.
export const authClient = createAuthClient();
export const ACCOUNT_CHANGED_EVENT = "hub-account-changed";
export const ACCOUNT_CHANNEL = "hub-account-events";
export function notifyAccountChanged() {
  window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(ACCOUNT_CHANNEL);
    channel.postMessage("changed"); // Invalidation only, never session/identity/payment data.
    channel.close();
  }
}
export function accountError(code?: string): string {
  if (code === "EMAIL_NOT_VERIFIED") return "Verify your email before signing in. You can resend the verification email below.";
  if (code === "INVALID_EMAIL_OR_PASSWORD") return "Email or password is incorrect.";
  if (code === "TOO_MANY_REQUESTS") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG") return "Use a password between 12 and 128 characters.";
  if (code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED") return "This link is invalid or expired. Request a new one.";
  return "The request could not be completed. Check your details or try again later.";
}
