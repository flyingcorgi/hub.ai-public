import { Suspense } from "react";
import { AccountPage } from "@/components/account/account-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account — FetishUI", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() {
  const signupEnabled = process.env.AUTH_ALLOW_SIGNUP === "true" && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  return <Suspense fallback={<p>Loading account…</p>}><AccountPage signupEnabled={signupEnabled} /></Suspense>;
}
