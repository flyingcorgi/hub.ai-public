import { NextRequest, NextResponse } from "next/server";

// Plain Route Handler (not a Server Action) so that generating many briefs/articles in parallel
// actually runs concurrently — Next.js serializes Server Actions invoked directly from a client
// component one at a time via its internal action queue, which silently defeats client-side
// concurrency. See /api/batch-generate/route.ts for the same fix applied to image generation.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemPrompt, userPrompt, apiKey, model, messages } = body as {
      systemPrompt?: string;
      userPrompt?: string;
      apiKey: string;
      model: string;
      // Full conversation history (system/user/assistant turns), for multi-turn chat callers
      // like Topic Designer. Takes priority over systemPrompt/userPrompt when present.
      messages?: { role: "system" | "user" | "assistant"; content: string }[];
    };

    if (!apiKey) {
      throw new Error("Please set your Venice.ai API key first");
    }

    const hasHistory = Array.isArray(messages) && messages.length > 0;
    if (!hasHistory && !userPrompt?.trim()) {
      throw new Error("Prompt is empty");
    }

    const chatMessages = hasHistory
      ? messages
      : [
          ...(systemPrompt?.trim() ? [{ role: "system" as const, content: systemPrompt }] : []),
          { role: "user" as const, content: userPrompt as string },
        ];

    const response = await fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Venice.ai request failed (${response.status}): ${errorBody.slice(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Venice.ai returned an empty response");
    }

    return NextResponse.json({ success: true, text });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate text",
    });
  }
}
