'use client';

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

const STORAGE_KEY = "hub-age-verified";

// A genuinely blocking full-screen overlay — deliberately not built on the shared Dialog
// primitive, since that always ships a close button and dismisses on Escape/outside-click by
// default. This has no way to get past it except the two buttons below.
export function AgeGate() {
  const [verified, setVerified] = useState(true); // starts "true" (nothing rendered) until the check below runs, avoiding a flash of the gate for already-verified returning visitors

  useEffect(() => {
    try {
      setVerified(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // If localStorage is unavailable, fail open rather than trap every visit behind a gate
      // that can never be dismissed.
      setVerified(true);
    }
  }, []);

  if (verified) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
    >
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-white/10 bg-[#0b0b0d] p-6 text-center text-neutral-200 shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <h1 id="age-gate-title" className="text-lg font-bold">
            18+ Content Warning
          </h1>
          <p className="text-sm text-neutral-400">
            This site generates and displays AI-generated adult content. You must be 18 or older
            to enter.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => {
              try {
                localStorage.setItem(STORAGE_KEY, "true");
              } catch {
                // Nothing to fall back to — worst case this asks again next visit.
              }
              setVerified(true);
            }}
          >
            I am 18 or older — Enter
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100"
            onClick={() => {
              window.location.href = "https://www.google.com";
            }}
          >
            I am under 18 — Leave
          </button>
        </div>
      </div>
    </div>
  );
}
