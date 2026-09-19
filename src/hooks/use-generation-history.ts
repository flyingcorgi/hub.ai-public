'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import type { Generation } from "@/lib/types";
import { useGenerationStore } from "@/components/albums/album-storage-provider";
import { PRIVATE_STORAGE_CHANGED, storageError } from "@/lib/private-storage/database";

export function useGenerationHistory() {
  const store = useGenerationStore();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const rows = await store.list();
      if (mounted.current && request === sequence.current) { setGenerations(rows); setError(null); }
    } catch (cause) {
      if (mounted.current && request === sequence.current) setError(storageError(cause).message);
    } finally { if (mounted.current && request === sequence.current) setLoading(false); }
  }, [store]);
  useEffect(() => {
    mounted.current = true;
    const reload = () => { void refresh(); };
    reload(); window.addEventListener(PRIVATE_STORAGE_CHANGED, reload);
    return () => { mounted.current = false; sequence.current++; window.removeEventListener(PRIVATE_STORAGE_CHANGED, reload); };
  }, [refresh]);
  return { store, generations, setGenerations, loading, error, refresh };
}
