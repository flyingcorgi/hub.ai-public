export interface GoonMessage {
  id: string;
  role: "domme" | "user";
  type: "text" | "image";
  content: string;
  imageUrl?: string;
  timestamp: number;
}

// The whole game loop is now a negotiation with Mistress V (an LLM agent with tools — see
// TOOL_DEFINITIONS in goon-game.tsx) rather than click-driven mechanics, so there's no more
// stroke count/streak/multiplier to track: score and punishment are both entirely her call.
export interface GoonGameState {
  messages: GoonMessage[];
  score: number;
  phase: "intro" | "chatting" | "punishment";
  // 0 when not punished; a future timestamp (Date.now() + seconds*1000) while locked out.
  punishedUntil: number;
  punishmentReason: string;
}

// One conversation saved in account-scoped browser IndexedDB — the player can have several
// of these going at once (see the list on the pre-game screen), not just a single save slot.
export interface SavedGoonSession {
  id: string;
  fetish: string;
  messages: GoonMessage[];
  // Full OpenAI-style LLM conversation history (system/user/assistant/tool turns) — restoring
  // this, not just the displayed messages, is what gives Mistress V real memory on resume.
  conversation: Record<string, unknown>[];
  score: number;
  phase: GoonGameState["phase"];
  punishedUntil: number;
  punishmentReason: string;
  updatedAt: number;
}
