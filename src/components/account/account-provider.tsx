'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Principal } from "@/lib/auth/policy";
import { AlbumStorageProvider } from "@/components/albums/album-storage-provider";
import { ACCOUNT_CHANGED_EVENT, ACCOUNT_CHANNEL } from "@/lib/auth/client";

type Account = { user: Principal | null; unlocked: boolean };
const anonymous: Account = { user: null, unlocked: false };
const Context = createContext<{ account: Account; loading: boolean; failed: boolean; refresh: () => void }>({
  account: anonymous, loading: true, failed: false, refresh: () => undefined,
});
export function useAccount() { return useContext(Context); }
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account>(anonymous);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Unavailable");
      const data: Account = await response.json();
      if (!controller.signal.aborted) { setAccount(data); setFailed(false); }
    }).catch(() => {
      if (!controller.signal.aborted) { setAccount(anonymous); setFailed(true); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const invalidate = () => { setAccount(anonymous); setLoading(true); refresh(); };
    window.addEventListener(ACCOUNT_CHANGED_EVENT, invalidate);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(ACCOUNT_CHANNEL) : null;
    if (channel) channel.onmessage = () => invalidate();
    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, invalidate);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
      channel?.close();
    };
  }, [refresh]);
  // Remount views and close captured personal-storage scopes on identity/permission/service changes.
  // Albums, games and history are namespaced; API keys and scratch-tool stores remain separate.
  const key = `${account.user?.userId ?? "anonymous"}:${account.user?.role}:${account.user?.emailVerified}:${account.unlocked}:${failed}`;
  return <Context.Provider value={{ account, loading, failed, refresh }}>{loading ? <p role="status" className="p-6">Checking account…</p> : <AlbumStorageProvider key={key} userId={account.user?.userId ?? null} unavailable={failed}>{children}</AlbumStorageProvider>}</Context.Provider>;
}
