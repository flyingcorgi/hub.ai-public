'use client';

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fal } from "@fal-ai/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_KEY_STORAGE_KEY = 'fal-ai-api-key';
const WAVESPEED_API_KEY_STORAGE_KEY = 'wavespeed-api-key';
const REPLICATE_API_KEY_STORAGE_KEY = 'replicate-api-key';
const BYTEPLUS_API_KEY_STORAGE_KEY = 'byteplus-api-key';
const VENICE_API_KEY_STORAGE_KEY = 'venice-api-key';
const GENERATIONS_STORAGE_KEY = 'fal-ai-generations';

type ApiProvider = 'fal' | 'wavespeed' | 'replicate' | 'byteplus' | 'venice';

const providerLabels: Record<ApiProvider, string> = {
  fal: 'FAL.AI',
  wavespeed: 'Wavespeed',
  replicate: 'Replicate',
  byteplus: 'BytePlus',
  venice: 'Venice.ai',
};

const providerStorageKeys: Record<ApiProvider, string> = {
  fal: API_KEY_STORAGE_KEY,
  wavespeed: WAVESPEED_API_KEY_STORAGE_KEY,
  replicate: REPLICATE_API_KEY_STORAGE_KEY,
  byteplus: BYTEPLUS_API_KEY_STORAGE_KEY,
  venice: VENICE_API_KEY_STORAGE_KEY,
};

function configureFalClient(apiKey: string) {
  fal.config({
    credentials: apiKey,
  });
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function setApiKeyStorageItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    // Generation history is the largest localStorage item. Drop it so keys can save.
    localStorage.removeItem(GENERATIONS_STORAGE_KEY);
    localStorage.setItem(key, value);
    return false;
  }
}

// Lives on the Settings page now (previously squeezed into the navbar behind a collapse
// toggle) — always shows the full provider/key form since a dedicated settings section has
// plenty of room and doesn't need to hide itself behind a button.
export function ApiKeyInput() {
  const [isVisible, setIsVisible] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ApiProvider>('fal');
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const key = localStorage.getItem(providerStorageKeys[provider]);
    setApiKey(key ?? '');
  }, [provider]);

  useEffect(() => {
    // Open on whichever provider already has a saved key, so the page shows something relevant
    // instead of always defaulting to FAL.AI regardless of what's actually configured.
    const firstConfigured = (Object.keys(providerStorageKeys) as ApiProvider[]).find(
      (p) => !!localStorage.getItem(providerStorageKeys[p])
    );
    if (firstConfigured) setProvider(firstConfigured);

    const storedFalKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedFalKey) configureFalClient(storedFalKey);
  }, []);

  const handleSave = () => {
    const keyFromInput = apiKeyInputRef.current?.value ?? apiKey;

    if (!keyFromInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid API key",
        variant: "destructive",
      });
      return;
    }

    const trimmedKey = keyFromInput.trim();
    const storageKey = providerStorageKeys[provider];

    let preservedHistory = true;
    try {
      preservedHistory = setApiKeyStorageItem(storageKey, trimmedKey);
    } catch (error) {
      toast({
        title: "API Key Save Failed",
        description:
          error instanceof Error ? error.message : "Could not save API key",
        variant: "destructive",
      });
      return;
    }

    if (provider === 'fal') {
      configureFalClient(trimmedKey);
    }

    toast({
      title: "API Key Saved",
      description: preservedHistory
        ? `Your ${providerLabels[provider]} API key has been saved successfully.`
        : `Your ${providerLabels[provider]} API key was saved. Old generation history was cleared because browser storage was full.`,
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Provider</Label>
        <Select value={provider} onValueChange={(value) => setProvider(value as ApiProvider)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fal">FAL.AI</SelectItem>
            <SelectItem value="wavespeed">Wavespeed</SelectItem>
            <SelectItem value="replicate">Replicate</SelectItem>
            <SelectItem value="byteplus">BytePlus</SelectItem>
            <SelectItem value="venice">Venice.ai</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Input
          ref={apiKeyInputRef}
          type={isVisible ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder={`Enter your ${providerLabels[provider]} API key`}
          className="max-w-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsVisible(!isVisible)}
          title={isVisible ? "Hide API key" : "Show API key"}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button type="button" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
