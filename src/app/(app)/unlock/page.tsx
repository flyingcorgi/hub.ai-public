'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import type { BillingSummary } from "@/lib/nowpayments/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UnlockPage() {
  const { account, loading, refresh } = useAccount();
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [revision, setRevision] = useState(0);
  const user = account.user;
  useEffect(() => {
    const controller = new AbortController();
    setBilling(null);
    if (user?.emailVerified) fetch("/api/account/billing", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Unavailable");
      const result = await response.json();
      if (!controller.signal.aborted) { setBilling(result); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) setError("Billing details are temporarily unavailable. Please try again later."); });
    return () => controller.abort();
  }, [user?.userId, user?.emailVerified, revision]);
  async function subscribe() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/nowpayments/subscribe", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!response.ok) { setError("Enrollment could not be confirmed. Refresh billing status; do not start another subscription if review is pending."); return; }
      setBilling(await response.json());
    } catch { setError("The response was lost. Refresh billing status before trying again; enrollment may need operator review."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
    <h1 className="text-2xl font-bold">Billing and workflow access</h1>
    <p className="text-sm text-muted-foreground">$45 for 90 days of guided workflow access. Venice.ai generation is billed separately using your own API key.</p>
    {loading ? <p role="status">Checking account…</p> : !user ? <Card><CardContent className="space-y-4 pt-6"><p>Sign in with your verified account to view billing or subscribe. Email/access codes no longer unlock a browser.</p><Button asChild><Link href="/account">Sign in or create an account</Link></Button></CardContent></Card>
      : <Card><CardHeader><CardTitle>Your access</CardTitle></CardHeader><CardContent className="space-y-4">
        <p>{user.email}</p>
        <p>{user.role === "admin" && user.emailVerified ? "Administrator access — no subscription required." : account.unlocked ? `Access is active through ${new Date(user.paidThroughAt!).toLocaleString()}.` : user.revoked ? "Paid access is suspended pending operator review." : "No current paid workflow access."}</p>
        {!user.emailVerified && <Link href="/account" className="underline">Verify your email before subscribing.</Link>}
        {billing && <>
          {!billing.enrollmentEnabled && <p role="status">New billing enrollments are not enabled yet. Provider verification and launch checks must be completed first.</p>}
          {billing.subscriptions.map((subscription) => <div key={subscription.id} className="rounded border p-3 text-sm space-y-1">
            <p>{subscription.status === "active" ? "Enrolled for payment emails. Only a settled, verified payment grants access." : subscription.status === "creating" ? "Enrollment pending. Refresh shortly; do not create another subscription." : "Enrollment needs operator reconciliation. Do not create another subscription."}</p>
            <p className="break-all text-xs text-muted-foreground">Support reference: {subscription.id}</p>
          </div>)}
          {user.role !== "admin" && !user.revoked && billing.subscriptions.length === 0 && <>
            <p className="text-sm text-muted-foreground">NOWPayments receives your account email to send payment links and renewal reminders. Each payment is manual; this is not an automatic wallet debit. Your account unlocks after server confirmation—not after clicking a payment link.</p>
            <Button disabled={busy || !billing.enrollmentEnabled} onClick={subscribe}>{busy ? "Starting enrollment…" : "Send me a payment email"}</Button>
          </>}
        </>}
        <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => { refresh(); setRevision((n) => n + 1); }}>Refresh billing status</Button><Button variant="link" asChild><Link href="/account">Manage account</Link></Button></div>
      </CardContent></Card>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">Existing access-code payments require operator review and verified ownership; they are never claimed automatically from an email address. No real payments should be made while enrollment is disabled.</p>
  </main>;
}
