'use client';

import { useState, useRef, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient, accountError, notifyAccountChanged } from "@/lib/auth/client";
import { useAccount } from "./account-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "signin" | "signup" | "recover" | "verify";
const titles: Record<Mode, string> = { signin: "Sign in", signup: "Create account", recover: "Reset password", verify: "Resend verification" };
export function AccountPage({ signupEnabled }: { signupEnabled: boolean }) {
  const search = useSearchParams();
  const { account, loading, failed } = useAccount();
  const [mode, setMode] = useState<Mode>(search.get("mode") === "signup" && signupEnabled ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState(search.get("reset") === "1" ? "Password reset. Existing sessions have been revoked. Sign in with your new password." : search.has("error") ? "This email verification link is invalid or expired. Request a new one." : search.get("verified") === "1" ? "Email verified. You can now sign in." : "");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(""); setError("");
    try {
      const normalized = email.trim().toLowerCase();
      const callbackURL = `${window.location.origin}/account?verified=1`;
      const result = mode === "signin" ? await authClient.signIn.email({ email: normalized, password })
        : mode === "signup" ? await authClient.signUp.email({ name: name.trim(), email: normalized, password, callbackURL })
        : mode === "recover" ? await authClient.requestPasswordReset({ email: normalized, redirectTo: `${window.location.origin}/account/reset-password` })
        : await authClient.sendVerificationEmail({ email: normalized, callbackURL });
      if (result.error) { setError(accountError(result.error.code)); return; }
      setPassword("");
      if (mode === "signin") {
        notifyAccountChanged();
        window.location.assign("/account"); // Clear prior in-memory views and refresh server role checks.
      } else {
        setMessage(mode === "recover" ? "If the account is eligible, a password-reset email will arrive shortly." : "If the account is eligible, a verification email will arrive shortly. Check your inbox before signing in.");
      }
    } catch { setError("Account service unavailable. Please try again later."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function signOut() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) { setError("Could not sign out. Please try again."); return; }
      notifyAccountChanged();
      window.location.assign("/account");
    } catch { setError("Could not sign out. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  const user = account.user;
  return <main className="container mx-auto max-w-xl space-y-6 px-4 py-8">
    <h1 className="text-2xl font-bold">Your account</h1>
    <p className="text-sm text-muted-foreground">Your account controls workflow access. Albums and game sessions, including image messages, are stored in account-separated browser IndexedDB. Generation history and API keys are still browser-local but not yet separated by account. Original server files require explicit operator export; they are no longer served. Use separate browser profiles on shared devices; signing out does not erase saved creations.</p>
    {loading ? <p role="status">Checking session…</p> : user ? <Card>
      <CardHeader><CardTitle>Signed in</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p>{user.email}</p>
        <p className="text-sm">{user.role === "admin" && user.emailVerified ? "Administrator — workflow access does not require payment." : account.unlocked ? `Workflow access until ${new Date(user.paidThroughAt!).toLocaleString()}.` : user.revoked ? "Paid access is suspended pending review." : "No current paid workflow access."}</p>
        <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/unlock">Billing and access</Link></Button><Button disabled={busy} onClick={signOut}>Sign out</Button></div>
        <p className="text-xs text-muted-foreground">For password recovery, sign out and use Reset password. Completing a reset revokes existing sessions.</p>
      </CardContent>
    </Card> : <Card>
      <CardHeader><CardTitle>{titles[mode]}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {failed && <p role="alert" className="text-sm">Account service is temporarily unavailable. Check configuration or try again later.</p>}
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            {mode === "signup" && <div className="space-y-1"><Label htmlFor="account-name">Display name</Label><Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="nickname" /></div>}
            <div className="space-y-1"><Label htmlFor="account-email">Email</Label><Input id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" required /></div>
            {(mode === "signup" || mode === "signin") && <div className="space-y-1"><Label htmlFor="account-password">Password</Label><Input id="account-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === "signup" ? 12 : undefined} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} required />{mode === "signup" && <p className="text-xs text-muted-foreground">12–128 characters. Verify your email before signing in.</p>}</div>}
            <Button type="submit" className="w-full">{busy ? "Please wait…" : titles[mode]}</Button>
          </fieldset>
        </form>
        <div className="flex flex-wrap gap-2">{(Object.keys(titles) as Mode[]).filter((m) => m !== mode && (m !== "signup" || signupEnabled)).map((m) => <Button key={m} variant="link" size="sm" disabled={busy} onClick={() => { setMode(m); setError(""); setMessage(""); setPassword(""); }}>{titles[m]}</Button>)}</div>
        {!signupEnabled && <p className="text-xs text-muted-foreground">New account registration is currently closed.</p>}
      </CardContent>
    </Card>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </main>;
}
