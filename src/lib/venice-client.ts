// Shared client for calling Venice.ai (via the /api/venice-generate Route Handler — see that
// file for why it's a Route Handler and not a Server Action) — used by every tool that generates
// text with Venice (Scripts, Topic Designer, ...).
export const VENICE_API_KEY_STORAGE_KEY = "venice-api-key";
export const VENICE_MODEL_STORAGE_KEY = "venice-model-id";
export const DEFAULT_VENICE_MODEL = "claude-sonnet-5";
export const DEFAULT_TOPIC_DESIGNER_MODEL = "kimi-k3";

export function getVeniceApiKey(): string | null {
  return localStorage.getItem(VENICE_API_KEY_STORAGE_KEY) ?? process.env.NEXT_PUBLIC_VENICE_API_KEY ?? null;
}

export interface VeniceApiResponse {
  success: boolean;
  text?: string;
  error?: string;
}

export async function callVenice(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<VeniceApiResponse> {
  try {
    const res = await fetch("/api/venice-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt, userPrompt, apiKey, model }),
    });
    const data = await res.json();
    if (data && typeof data === "object" && "success" in data) return data as VeniceApiResponse;
    return { success: false, error: `Request failed with status ${res.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

export interface VeniceChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Multi-turn variant of callVenice, for the Topic Designer chat — the caller owns the full
// message history (including the system prompt) instead of this function assembling a single
// system+user turn.
export async function callVeniceChat(
  messages: VeniceChatMessage[],
  apiKey: string,
  model: string
): Promise<VeniceApiResponse> {
  try {
    const res = await fetch("/api/venice-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, apiKey, model }),
    });
    const data = await res.json();
    if (data && typeof data === "object" && "success" in data) return data as VeniceApiResponse;
    return { success: false, error: `Request failed with status ${res.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

export interface VeniceModel {
  id: string;
  name: string;
}

export interface VeniceModelsResponse {
  success: boolean;
  models?: VeniceModel[];
  error?: string;
}

// Venice's model catalog changes over time (new Kimi/Claude/etc. releases), so the Topic
// Designer's model picker loads the live list from Venice instead of hardcoding ids that would
// go stale.
export async function listVeniceModels(): Promise<VeniceModelsResponse> {
  try {
    const res = await fetch("/api/venice-models");
    const data = await res.json();
    if (data && typeof data === "object" && "success" in data) return data as VeniceModelsResponse;
    return { success: false, error: `Request failed with status ${res.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}
