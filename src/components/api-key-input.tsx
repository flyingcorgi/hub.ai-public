'use client';

import { useState, useEffect, useRef, useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { readBrowserApiKey, saveBrowserApiKey, VENICE_API_KEY_STORAGE_KEY } from "@/lib/browser-api-keys";

const SERPER_API_KEY_STORAGE_KEY = 'serper-api-key';

// One key field: label, masked input, show/hide, save-to-localStorage. Shared by Venice and
// Serper below rather than duplicating the same input/button/toast wiring per provider.
function KeyField({
  label,
  storageKey,
  placeholder,
  helpText,
  providerName,
  onSaved,
  children,
}: {
  label: string;
  storageKey: string;
  placeholder: string;
  helpText: string;
  providerName: string;
  onSaved?: () => void;
  children?: ReactNode;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const key = readBrowserApiKey(storageKey);
    setApiKey(key ?? '');
  }, [storageKey]);

  const handleSave = () => {
    const keyFromInput = apiKeyInputRef.current?.value ?? apiKey;

    setSaveError(null);
    try {
      saveBrowserApiKey(storageKey, keyFromInput);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save API key. Nothing was deleted.");
      return;
    }

    toast({
      title: "API key saved",
      description: `Your ${providerName} key is saved in this browser. It has not been validated with the provider.`,
    });
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">{label} API key</Label>
        <div className="flex items-center gap-2">
          <Input
            ref={apiKeyInputRef}
            id={inputId}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!saveError}
            aria-describedby={`${inputId}-help${saveError ? ` ${inputId}-error` : ""}`}
            type={isVisible ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder={placeholder}
            className="max-w-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsVisible(!isVisible)}
            title={isVisible ? "Hide API key" : "Show API key"}
            aria-label={isVisible ? "Hide API key" : "Show API key"}
          >
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </div>
        <p id={`${inputId}-help`} className="text-xs text-muted-foreground">{helpText}</p>
        {saveError && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{saveError}</p>}
      </div>

      {children}
    </div>
  );
}

// Shared by Settings and in-place setup so drafts never need to be navigated away from.
export function VeniceApiKeyField({ onSaved }: { onSaved?: () => void }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <p className="text-sm font-medium">One setup. Then back to creating.</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li><strong className="text-foreground">Open Venice.</strong> Sign in or create an account in the new tab.</li>
          <li><strong className="text-foreground">Create an API key.</strong> In API settings, create a key and copy it. It is not your password.</li>
          <li><strong className="text-foreground">Come back and paste below.</strong> Save it here. Nothing generates until you choose to start.</li>
        </ol>
        <a href="https://venice.ai/settings/api" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium text-primary hover:bg-muted">
          Open Venice key settings <ExternalLink className="h-4 w-4" /><span className="sr-only"> (new tab)</span>
        </a>
        <p className="text-xs leading-relaxed text-muted-foreground">Venice sets its own API access and credit requirements. Check those before buying membership here. Generation credit is separate from FetishUI membership.</p>
      </div>
      <KeyField
        onSaved={onSaved}
        label="Venice.ai"
        storageKey={VENICE_API_KEY_STORAGE_KEY}
        placeholder="Paste the key you copied from Venice"
        providerName="Venice.ai"
        helpText="Saved on this browser/device (localStorage), shared across accounts using this browser. Requests send your key, prompts and media through FetishUI to Venice. Privacy varies by model. Saving is not a connection check."
      />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Can’t find the key, or want to revoke it?</summary>
        <p className="mt-2 leading-relaxed">Check Venice’s current API settings/help for account eligibility. You can revoke a key there; never share it in a screenshot or support message. Revoking at Venice prevents further use; saving a replacement here only updates this browser.</p>
      </details>
    </div>
  );
}

export function ApiKeyInput() {
  return (
    <div className="space-y-6">
      <VeniceApiKeyField />
      <KeyField
        label="Serper.dev"
        storageKey={SERPER_API_KEY_STORAGE_KEY}
        placeholder="Enter your Serper.dev API key"
        providerName="Serper.dev"
        helpText="Stored only in this browser (localStorage) — used by the Goon Game's Serper image source (/serper) to search Google Images."
      >
        <div className="max-w-sm space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium">Don&rsquo;t have a key yet?</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              Create a free account at{" "}
              <a
                href="https://serper.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                serper.dev <ExternalLink className="h-3 w-3" />
              </a>{" "}
              (2,500 free searches, then paid)
            </li>
            <li>Copy the API key from your dashboard</li>
            <li>Paste it above and hit Save</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Optional — everything else in FetishUI works without it. Without a key, the Goon
            Game&rsquo;s Serper source just won&rsquo;t return results.
          </p>
        </div>
      </KeyField>
    </div>
  );
}
