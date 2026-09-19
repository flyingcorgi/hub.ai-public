import { NextRequest } from "next/server";
import { assertVeniceResponseOk, GenerationError, generationErrorMessage } from "@/lib/privacy/generation-errors";
import { privateJson } from "@/lib/privacy/responses";

// Plain Route Handler (not a Server Action) so that generating many briefs/articles in parallel
// actually runs concurrently — Next.js serializes Server Actions invoked directly from a client
// component one at a time via its internal action queue, which silently defeats client-side
// concurrency. See /api/batch-generate/route.ts for the same fix applied to image generation.
// A single OpenAI-style tool call as Venice returns it — surfaced to callers so they can execute
// the call themselves and feed the result back in as a "tool" role message (see the Goon Game's
// agent loop for the fullest use of this).
export interface VeniceToolCall {
  id: string;
  name: string;
  arguments: string; // raw JSON string, same as the OpenAI spec — caller parses it
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemPrompt, userPrompt, apiKey, model, messages, tools, toolChoice } = body as {
      systemPrompt?: string;
      userPrompt?: string;
      apiKey: string;
      model: string;
      // Full conversation history (system/user/assistant/tool turns), for multi-turn chat callers
      // like Topic Designer and the Goon Game. Takes priority over systemPrompt/userPrompt.
      messages?: Record<string, unknown>[];
      // OpenAI-style tool/function definitions — optional. When the model calls one, the response
      // carries toolCalls instead of (or alongside null) text; the caller executes them and feeds
      // results back in as role:"tool" messages on the next call.
      tools?: Record<string, unknown>[];
      toolChoice?: unknown;
    };

    if (!apiKey) {
      throw new GenerationError("Please set your Venice.ai API key first");
    }

    const hasHistory = Array.isArray(messages) && messages.length > 0;
    if (!hasHistory && !userPrompt?.trim()) {
      throw new GenerationError("Prompt is empty");
    }

    const chatMessages = hasHistory
      ? messages
      : [
          ...(systemPrompt?.trim() ? [{ role: "system" as const, content: systemPrompt }] : []),
          { role: "user" as const, content: userPrompt as string },
        ];

    const response = await fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        ...(tools && tools.length > 0 ? { tools, tool_choice: toolChoice ?? "auto" } : {}),
      }),
    });

    await assertVeniceResponseOk(response);

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const text: unknown = message?.content;
    const rawToolCalls: Array<{ id?: string; function?: { name?: string; arguments?: string } }> =
      Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    const toolCalls: VeniceToolCall[] = rawToolCalls
      .filter((tc) => tc.function?.name)
      .map((tc, index) => ({
        id: tc.id || `call_${index}`,
        name: tc.function!.name!,
        arguments: tc.function!.arguments ?? "{}",
      }));

    // A tool-calling response often has null/empty content (the model's whole "reply" is the
    // call itself) — only treat a genuinely empty response as an error when there's no tool call
    // to fall back on either.
    if ((typeof text !== "string" || !text.trim()) && toolCalls.length === 0) {
      throw new GenerationError("Venice.ai returned an empty response");
    }

    return privateJson({
      success: true,
      text: typeof text === "string" ? text : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  } catch (error) {
    return privateJson({
      success: false,
      error: generationErrorMessage(error, "Failed to generate text"),
    });
  }
}
