'use client';

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient, accountError, notifyAccountChanged } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPassword() {
  const search = useSearchParams();
  const [token, setToken] = useState(() => search.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // The library delivers the token via its redirect; keep it only in component memory and
    // remove it from the visible URL/history entry. No token analytics or persistent storage.
    window.history.replaceState(window.history.state, "", "/account/reset-password");
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) { setError(accountError(result.error.code)); return; }
      setPassword(""); setConfirmation(""); setToken(""); setDone(true);
      notifyAccountChanged();
      window.location.assign("/account?reset=1");
    } catch { setError("Account service unavailable. Please try again later."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="container mx-auto max-w-md space-y-5 px-4 py-8">
    <h1 className="text-2xl font-bold">Choose a new password</h1>
    {done ? <p role="status">Password reset. Existing sessions have been revoked. Sign in with your new password.</p>
      : !token ? <p role="alert">This reset link is missing or expired. Request a new password-reset email from your account page.</p>
      : <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
        <div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></div>
        <Button type="submit">{busy ? "Resetting…" : "Save new password"}</Button>
      </fieldset></form>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Link href="/account" className="text-primary underline">Back to account</Link>
  </main>;
}
