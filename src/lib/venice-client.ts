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

export interface VeniceToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string per the OpenAI spec — caller parses it
}

export interface VeniceApiResponse {
  success: boolean;
  text?: string;
  toolCalls?: VeniceToolCall[];
  error?: string;
}

// OpenAI-style multimodal content parts. Venice's chat completions endpoint is OpenAI-compatible,
// so a vision-capable model reads an image from a user turn shaped like this. Only models whose
// Venice capabilities include supportsVision will accept it — see listVeniceModels.
export type VeniceContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function callVenice(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string,
  // Data URLs shown to a vision-capable model alongside the prompt. Downscale before calling
  // (see downscaleForVision) — these travel inside the request body.
  images?: string[]
): Promise<VeniceApiResponse> {
  try {
    // With images the user turn has to be a content-part array, so build the full message list
    // here rather than letting the route assemble a plain string turn.
    const body = images && images.length > 0
      ? {
          apiKey,
          model,
          messages: [
            ...(systemPrompt.trim() ? [{ role: "system", content: systemPrompt }] : []),
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                ...images.map((url): VeniceContentPart => ({ type: "image_url", image_url: { url } })),
              ] satisfies VeniceContentPart[],
            },
          ],
        }
      : { systemPrompt, userPrompt, apiKey, model };

    const res = await fetch("/api/venice-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  // A plain string for text-only turns, or OpenAI-style parts when showing a model an image.
  content: string | VeniceContentPart[];
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

// OpenAI-style tool call result fed back into the conversation after the caller executes it —
// see callVeniceChat's `tools` param and the Goon Game's agent loop for the full round trip.
export interface VeniceToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

// Multi-turn variant that also supports OpenAI-style tool calling — the caller owns the message
// history (append the assistant's tool_calls message and each VeniceToolResultMessage onto it
// between rounds, same as any OpenAI-compatible tool-use loop) and passes `tools` each time the
// model should be allowed to call one.
export async function callVeniceChatWithTools(
  messages: (VeniceChatMessage | Record<string, unknown>)[],
  tools: Record<string, unknown>[],
  apiKey: string,
  model: string,
  // Omit for "auto" (the model decides). Pass an OpenAI-style forced choice —
  // { type: "function", function: { name: "..." } } — to require a specific tool call this turn,
  // e.g. for a slash command that must actually run rather than being left to the model's mood.
  toolChoice?: unknown
): Promise<VeniceApiResponse> {
  try {
    const res = await fetch("/api/venice-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tools, toolChoice, apiKey, model }),
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
