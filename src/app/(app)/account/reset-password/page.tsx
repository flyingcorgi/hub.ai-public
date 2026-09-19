import { Suspense } from "react";
import { ResetPassword } from "@/components/account/reset-password";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password — FetishUI", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function Page() {
  return <Suspense fallback={<p>Loading reset form…</p>}><ResetPassword /></Suspense>;
}
