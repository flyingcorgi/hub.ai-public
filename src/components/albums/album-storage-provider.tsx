'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createAlbumStore } from "@/lib/albums/store";
import { createGenerationStore } from "@/lib/generations/store";
import { createGameStore } from "@/lib/private-storage/game-store";
import { PRIVATE_STORAGE_CHANGED, StorageScope } from "@/lib/private-storage/database";

type Store = { albums: ReturnType<typeof createAlbumStore>; games: ReturnType<typeof createGameStore>; history: ReturnType<typeof createGenerationStore> };
const Context = createContext<Store | null>(null);
export function useAlbumStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Browser storage is not ready.");
  return store.albums;
}
export function useGameStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Browser storage is not ready.");
  return store.games;
}
export function useGenerationStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Browser storage is not ready.");
  return store.history;
}
export function AlbumStorageProvider({ userId, unavailable, children }: { userId: string | null; unavailable: boolean; children: ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  useEffect(() => {
    const scope = new StorageScope(userId);
    if (unavailable) scope.close(); // Failed auth refresh must not silently select anonymous data.
    setStore({ albums: createAlbumStore(scope), games: createGameStore(scope), history: createGenerationStore(scope) });
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(PRIVATE_STORAGE_CHANGED) : null;
    const refresh = () => window.dispatchEvent(new Event(PRIVATE_STORAGE_CHANGED));
    if (channel) channel.onmessage = refresh;
    window.addEventListener("focus", refresh);
    return () => { scope.close(); channel?.close(); window.removeEventListener("focus", refresh); };
  }, [userId, unavailable]);
  return store ? <Context.Provider value={store}>{children}</Context.Provider> : <p role="status" className="p-6">Opening browser storage…</p>;
}
