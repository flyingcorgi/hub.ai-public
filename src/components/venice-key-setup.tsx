'use client';

import { useEffect, useState } from 'react';
import { API_KEYS_CHANGED_EVENT, readBrowserApiKey } from '@/lib/browser-api-keys';
import { VeniceApiKeyField } from '@/components/api-key-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function useVeniceKeyStatus() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => {
    const refresh = () => setHasKey(!!readBrowserApiKey());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener(API_KEYS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(API_KEYS_CHANGED_EVENT, refresh);
    };
  }, []);
  return hasKey;
}

export function VeniceKeySetup({ open, onOpenChange, disabled = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}) {
  const hasKey = useVeniceKeyStatus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <section aria-label="Venice API key setup" className="rounded-xl border bg-muted/20 p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm font-medium">
          {hasKey === null ? 'Checking browser key…' : hasKey ? 'Venice API key saved' : 'Add a Venice API key to generate'}
        </p>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={disabled || hasKey === null}>
            {hasKey ? 'Change API key' : 'Add API key'}
          </Button>
        </DialogTrigger>
      </div>
      <p className="text-xs text-muted-foreground">
        Venice bills generation separately from FetishUI membership. A saved key is not a connection check.
        You can set up your key here without losing your inputs.
      </p>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set up Venice</DialogTitle>
            <DialogDescription>Your current inputs stay on this page. Saving a key does not start a generation.</DialogDescription>
          </DialogHeader>
          <VeniceApiKeyField onSaved={() => onOpenChange(false)} />
        </DialogContent>
    </section>
    </Dialog>
  );
}
