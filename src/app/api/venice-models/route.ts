import { NextResponse } from "next/server";

interface VeniceModelEntry {
  id: string;
  model_spec?: { name?: string };
}

// Venice's model catalog listing is public (no API key required — only inference calls need
// one), so this just proxies it for the Topic Designer's model picker.
export async function GET() {
  try {
    const response = await fetch("https://api.venice.ai/api/v1/models?type=text");

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Venice.ai request failed (${response.status}): ${errorBody.slice(0, 300)}`);
    }

    const data = await response.json();
    const entries: VeniceModelEntry[] = Array.isArray(data?.data) ? data.data : [];
    const models = entries
      .map((m) => ({ id: m.id, name: m.model_spec?.name ?? m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, models });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to list Venice.ai models",
    });
  }
}
