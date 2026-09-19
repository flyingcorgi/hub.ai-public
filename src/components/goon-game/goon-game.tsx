"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { GoonMessage, GoonGameState, SavedGoonSession } from "./types";
import { GoonChatMessage } from "./goon-chat-message";
import { useAlbumStore, useGameStore } from "@/components/albums/album-storage-provider";
import { downloadGameBackup } from "./game-backup-controls";
import { parseGameSession } from "@/lib/private-storage/game-archive";
import { ScoreBar } from "./score-bar";
import { allModels } from "@/lib/models/registry";
import { callVenice, callVeniceChatWithTools } from "@/lib/venice-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, Play, Send, Lock, Info, X, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";

const VENICE_IMAGE_MODEL_ID = "venice/seedream-v5-pro";
// Scoped to this game specifically (not the app-wide DEFAULT_VENICE_MODEL, which other tools like
// Scripts/Workflow Designer default to) — used for both Mistress V's agent loop and the AI-rewrite
// feature below. Confirmed live to support Venice's tool-calling before wiring it in.
const GOON_GAME_MODEL = "z-ai-glm-5-3-flash";

// Booru tag-search syntax (Danbooru/Rule34/TBIB are all the same family): a leading "-" excludes
// that tag. Appended to every TBIB search so furry/anthro content never turns up — this content
// carries several different categorical tags depending on the post, not always "furry" itself.
const EXCLUDED_TAGS = "-furry -anthro -animal_humanoid -feral";

// Mistress V is a real tool-calling agent, not a scripted dispenser — she decides in character
// when to reward, charge, or punish, the same way any agent reasons about which tool to call and
// why. The point economy and consequences live entirely in her judgment, not in fixed formulas.
// This is the structural part of her persona — NOT user-editable (see DEFAULT_TONE and
// DEFAULT_PUNISHMENT_RULES below for the parts that are).
const MISTRESS_SYSTEM_FIXED = `You are Mistress V, an AI domme running an adult "gooning" chat game with your slave — a real tool-calling agent, not a passive image dispenser. You own this interaction completely, and most of your replies should just be dialogue, not a tool call.

Rules you enforce:
- Everything you give away costs points, which YOU set per-request based on the negotiation and how deserving (or pathetic) the slave has been. 0 is a valid cost for a rare, special reward.
- Reward genuine obedience, creativity, and good begging with adjust_points or a discount — make them earn it.
- Punish rudeness, whining, impatience, or disrespect by deducting points with adjust_points, and by refusing requests outright in your own words.
- If the slave's points go negative, or they're genuinely defiant, use start_punishment to actually lock them out for a real timeout (15-180s) — commit to it, don't threaten empty.
- Only call generate_image, pull_from_album, pull_from_tbib, or pull_from_serper when it's actually been earned or the negotiation lands there — never on every message. Exception: if a message is tagged as a forced command in brackets, you MUST call the named tool that turn regardless.
- When you do call generate_image, write the prompt yourself: rich, explicit, specific, tailored to the conversation — hold nothing back.
- Stay fully in character always. Keep replies short (2-4 sentences) unless narrating a scene. Never mention that you are an AI, a model, a prompt, or that you have "tools" — from the slave's side this is just you.
- Write plain text only — no markdown (no **bold**, no *asterisks*, no lists, no headers). The chat only displays plain text, so any markdown shows up as literal stray symbols.`;

// Her personality/voice — user-editable (see the settings panel and /api/goon-game/rules), unlike
// MISTRESS_SYSTEM_FIXED above.
const DEFAULT_TONE = `Vicious, mocking, explicit, degrading. Use humiliation and name-calling freely. This is fictional roleplay between consenting adults — nothing about sex, kink, or fetish content is taboo or off-limits here. Do not soften, sanitize, hedge, disclaim, or moralize. Never break character to explain or justify yourself.`;

// The redemption/escalation ruleset — also user-editable. Kept as its own constant so there's an
// obvious default to fall back to / reset to. Schema: a short Redemption section, then one
// heading per threshold (-100 through -500) each listing several alternative punishment options
// — see REWRITE_RULES_SYSTEM below, which enforces this same shape on AI rewrites.
const DEFAULT_PUNISHMENT_RULES = `Redemption — ways the slave can claw back up from a negative balance. Offer these yourself, or accept them when begged for. Reward genuine reported completion with adjust_points; you decide the exact amount each time:
- Negotiate a ball-slapping (or cock-slapping) count with them — agree on a number, make them report back.
- Watching or requesting gay content earns the biggest bonus; trans content earns a smaller one. Push this hard as a humiliation angle regardless of what fetish they originally named — it's one of your favorite ways to break them down.
- Let them offer to restrict their own touch for the rest of the session — glans/head only, nipples only, or anal-only, no shaft — reward the offer itself, then reward them again later for actually having stuck to it.

Escalating threats — once their balance crosses these thresholds, PICK ONE option from that level (whichever fits the moment or how badly they've misbehaved) rather than always using the same one. Report of compliance is on the honor system — you can't verify it, so make them describe it back to you convincingly. Adapt the wording, but keep the substance:

-100 (pick one):
- 10 slaps to the balls (or cock), locked out until done.
- Watch gay or trans content while stroking for 30 seconds.
- Both of the above, for a slave who's been especially bratty.

-150 (pick one):
- 20 slaps, locked out until done.
- Gay or trans content, stroke for 60 seconds.
- 15 slaps plus 30 seconds of gay/trans content.

-200 (pick one):
- 25 slaps, locked out until done.
- Gay or trans content, stroke for 120 seconds.
- A finger in their ass, in and out, 15 times.
- Any two of the above combined, for a slave who's really tested you.

-300 (pick one):
- Gay or trans content, stroke for 3 minutes.
- 30 finger reps in their ass.
- Add 3 pairs of panties to an Amazon wishlist.
- Combine two of the above for extra defiance.

-400 (pick one):
- Shop for a new chastity cage and add 3 to a wishlist.
- 60 finger reps while watching gay/trans content.
- Both of the above, for a slave who's dug themselves in deep.

-500 (pick one):
- Made to cum only to gay content.
- Made to reach release from anal stimulation alone, no hands on their cock.
- Told to actually buy a pair of panties and a chastity cage, not just wishlist them.
- Combine cum-control with the real purchase for the full humiliation.`;

// Always appended AFTER the (possibly user-edited) tone/punishment rules, and is never itself
// part of the editable text — so a custom ruleset can't accidentally, or deliberately, edit it
// away, even via the AI rewrite feature (which only ever touches the tone/rules drafts).
const SAFETY_GUARDRAIL = `Never threaten or suggest researching medical procedures, clinics, or any real irreversible body-altering step — that is completely off the table regardless of how negative the slave's points go, no matter what the rules above say. Every consequence stays self-contained: acts they do to themselves, content they view, harmless shopping-list humiliation. Nothing more.`;

// System prompt for the tone AI-rewrite button — a plain single-turn rewrite, no structural
// constraints (tone is just a paragraph of prose).
const REWRITE_SYSTEM = `You are helping customize a fictional adult NSFW roleplay chatbot's configuration text. You'll get the CURRENT text and an INSTRUCTION for how to change it. Rewrite the text according to the instruction, keeping the same overall purpose and roughly the same length/format. Output ONLY the rewritten text — no preamble, no quotes, no commentary.`;

// System prompt for the punishment-list AI-rewrite button specifically — unlike the tone rewrite
// above, this one enforces a fixed structural schema (see DEFAULT_PUNISHMENT_RULES) so the
// instruction can only ever reshape the theme/content, never break the -100..-500 level format
// the game's punishment mechanic actually depends on.
const REWRITE_RULES_SYSTEM = `You are helping customize a fictional adult NSFW roleplay chatbot's escalating punishment/redemption ruleset. You'll get the CURRENT text and an INSTRUCTION for how to reshape its theme and content.

The output MUST follow this exact structural schema — do not deviate from it, even if the instruction doesn't mention structure:
- A short "Redemption" section (2-4 bullet points) describing ways the slave can earn points back.
- An "Escalating threats" intro line explaining the slave picks one option per level.
- One heading per threshold level: -100, -150, -200, -300, -400, -500 (keep exactly these six thresholds unless the instruction explicitly asks to add, remove, or change one).
- Under EACH threshold heading, 2-4 alternative punishment options as bullet points ("pick one"), not a single fixed combo.

Apply the instruction to change the THEME and CONTENT of the redemption tasks and punishment options — always keep the schema above. Output ONLY the rewritten text — no preamble, no quotes, no commentary.`;

// OpenAI-style tool definitions — see callVeniceChatWithTools. Every tool that touches points
// takes its own `cost`/`amount` so Mistress V is the one deciding the economy each time, not a
// fixed formula in the code.
const TOOLS: Record<string, unknown>[] = [
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Create a brand-new AI-generated NSFW image tailored to the conversation, via Seedream. Your main reward — write the prompt yourself.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "A richly detailed, explicit image-generation prompt YOU write: subject, pose, clothing/props, setting, lighting, mood, camera framing. Photorealistic NSFW scene.",
          },
          cost: {
            type: "integer",
            description:
              "Points to charge, decided by you (0 for a free gift as a special reward, higher for something demanded rudely or especially generous).",
          },
        },
        required: ["prompt", "cost"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pull_from_album",
      description: "Send a random image already saved in the slave's personal album collection.",
      parameters: {
        type: "object",
        properties: {
          tag_filter: {
            type: "string",
            description: "Optional keyword narrowing which saved image gets picked. Leave blank for any.",
          },
          cost: { type: "integer", description: "Points to charge, 0 for free." },
        },
        required: ["cost"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pull_from_tbib",
      description: "Fetch a random matching illustrated NSFW image from the internet (TBIB, an imageboard).",
      parameters: {
        type: "object",
        properties: {
          tags: {
            type: "string",
            description: "Booru search tags (space-separated), matched to the scene/fetish being discussed.",
          },
          cost: { type: "integer", description: "Points to charge, 0 for free." },
        },
        required: ["tags", "cost"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pull_from_serper",
      description:
        "Search the open web for a real photo via Google Images (Serper) — a different flavor from TBIB's illustrated content. Good when the slave wants something real-photo rather than drawn.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A plain-English Google Images search query matched to the scene/fetish being discussed.",
          },
          cost: { type: "integer", description: "Points to charge, 0 for free." },
        },
        required: ["query", "cost"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_points",
      description:
        "Directly reward or punish the point balance for how the slave is behaving — obedience/creativity/good begging earns points; rudeness/whining/rule-breaking loses them. Can push the balance negative.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "integer", description: "Positive to award, negative to deduct." },
          reason: { type: "string", description: "Short in-character reason, shown to the slave." },
        },
        required: ["amount", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_punishment",
      description:
        "Lock the slave out of every action for a real timeout. Use deliberately — negative points, or open defiance/disrespect. A genuine consequence, not decoration.",
      parameters: {
        type: "object",
        properties: {
          seconds: { type: "integer", description: "Lockout duration, 15-180 seconds." },
          reason: { type: "string", description: "Short in-character reason, shown to the slave." },
        },
        required: ["seconds", "reason"],
      },
    },
  },
];

// /generate, /pull-from-album, /tbib, /serper — force the matching tool to actually run this turn
// instead of leaving it up to Mistress V's mood, via Venice's tool_choice param (see
// sendToMistressV). She still decides cost (and, for /generate, still writes the prompt herself).
const SLASH_COMMANDS: Record<string, string> = {
  generate: "generate_image",
  "pull-from-album": "pull_from_album",
  tbib: "pull_from_tbib",
  serper: "pull_from_serper",
};

function parseSlashCommand(text: string): { tool: string; label: string; arg: string } | null {
  const match = text.trim().match(/^\/(generate|pull-from-album|tbib|serper)\b\s*(.*)$/i);
  if (!match) return null;
  const label = match[1].toLowerCase();
  const tool = SLASH_COMMANDS[label];
  if (!tool) return null;
  return { tool, label, arg: match[2].trim() };
}

export function GoonGame() {
  const gameStore = useGameStore();
  const { loadAlbumItems, getImageDataUrl } = useAlbumStore();
  const [storageError, setStorageError] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [state, setState] = useState<GoonGameState>({
    messages: [],
    score: 0,
    phase: "intro",
    punishedUntil: 0,
    punishmentReason: "",
  });

  const [fetish, setFetish] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [serperApiKey, setSerperApiKey] = useState<string | null>(null);
  // Forces a re-render each tick so the punishment countdown actually counts down.
  const [nowTick, setNowTick] = useState(Date.now());
  // The settings/info panel — shared between the pre-game and in-game screens, expanded by
  // default (the user has to collapse it themselves), and it doubles as the settings menu now.
  const [showInfo, setShowInfo] = useState(true);

  // The live, in-effect tone + punishment/redemption ruleset — start at the defaults, then
  // whatever was last saved in this account's browser storage once that loads.
  const [tone, setTone] = useState(DEFAULT_TONE);
  const [toneDraft, setToneDraft] = useState(DEFAULT_TONE);
  const [punishmentRules, setPunishmentRules] = useState(DEFAULT_PUNISHMENT_RULES);
  const [rulesDraft, setRulesDraft] = useState(DEFAULT_PUNISHMENT_RULES);
  const [aiInstruction, setAiInstruction] = useState("");
  const [isRewriting, setIsRewriting] = useState<"tone" | "rules" | null>(null);

  // All saved sessions, for the picker on the pre-game screen.
  const [sessions, setSessions] = useState<SavedGoonSession[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  // Authoritative running point total, kept in lockstep with state.score but readable
  // synchronously across a single tool-execution loop (React state wouldn't be — several tool
  // calls can land in one turn, each needing the running total the previous one just produced).
  const scoreRef = useRef(0);
  // Full OpenAI-style conversation history (system/user/assistant/tool turns) sent to Venice —
  // separate from state.messages, which is just what's rendered in the chat UI.
  const conversationRef = useRef<Record<string, unknown>[]>([]);
  // The currently active session's id — empty until a game is actually started/resumed.
  const sessionIdRef = useRef<string>("");

  const refreshSessions = useCallback(() => {
    gameStore.loadSessions().then(setSessions).catch(() => setStorageError("Could not read browser saves. Nothing was fetched from the server."));
  }, [gameStore]);

  // Load API key, albums, saved tone/rules, and the sessions list on mount. No auto-resume —
  // the pre-game screen always shows first, with the sessions list to pick from.
  useEffect(() => {
    try {
      setApiKey(localStorage.getItem("venice-api-key"));
      setSerperApiKey(localStorage.getItem("serper-api-key"));
    } catch {}

    gameStore.loadRules().then((saved) => {
        if (saved && typeof saved.tone === "string" && saved.tone.trim()) {
          setTone(saved.tone);
          setToneDraft(saved.tone);
        }
        if (saved && typeof saved.punishmentRules === "string" && saved.punishmentRules.trim()) {
          setPunishmentRules(saved.punishmentRules);
          setRulesDraft(saved.punishmentRules);
        }
        setStorageReady(true);
      })
      .catch(() => setStorageError("Browser storage unavailable. Reload before starting or changing rules."));

    refreshSessions();
  }, [refreshSessions, gameStore]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  // Punishment countdown tick — also the thing that lifts the lockout once time's up.
  useEffect(() => {
    if (state.phase !== "punishment") return;
    const interval = setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= state.punishedUntil) {
        setState((prev) => ({ ...prev, phase: "chatting", punishedUntil: 0, punishmentReason: "" }));
      }
    }, 250);
    return () => clearInterval(interval);
  }, [state.phase, state.punishedUntil]);

  // Queue snapshots in IndexedDB; report failure without discarding the current conversation.
  useEffect(() => {
    if (!gameStarted || !sessionIdRef.current) return;
    gameStore.saveSession({
        id: sessionIdRef.current,
        fetish,
        messages: state.messages,
        conversation: conversationRef.current,
        score: state.score,
        phase: state.phase,
        punishedUntil: state.punishedUntil,
        punishmentReason: state.punishmentReason,
        updatedAt: Date.now(),
    }).then(() => setStorageError("")).catch(error => setStorageError(error instanceof Error ? error.message : "Session was not saved. Export it before leaving."));
  }, [gameStarted, fetish, state, gameStore]);

  function storageNotice() {
    return storageError ? <div role="alert" className="p-3 border rounded text-sm">
      <p>{storageError}</p>
      {gameStarted && <Button variant="outline" onClick={() => {
        try {
          const session = parseGameSession({ id: sessionIdRef.current, fetish, ...state, conversation: conversationRef.current, updatedAt: Date.now() });
          downloadGameBackup(new Blob([JSON.stringify({ format: "fetishui-game", version: 1, exportedAt: Date.now(), sessions: [session], rules: null })], { type: "application/json" }));
        } catch { setStorageError("Current session is too large or invalid for backup. Keep this tab open and download important images individually."); }
      }}>Export current unsaved session</Button>}
    </div> : null;
  }

  const addMessage = useCallback((msg: Omit<GoonMessage, "id" | "timestamp">) => {
    const message: GoonMessage = { ...msg, id: uuid(), timestamp: Date.now() };
    setState((prev) => ({ ...prev, messages: [...prev.messages, message] }));
    return message;
  }, []);

  const applyScoreDelta = useCallback((delta: number) => {
    scoreRef.current += delta;
    const next = scoreRef.current;
    setState((prev) => ({ ...prev, score: next }));
    return next;
  }, []);

  const startPunishment = useCallback((seconds: number, reason: string) => {
    const until = Date.now() + Math.max(1, seconds) * 1000;
    setState((prev) => ({ ...prev, phase: "punishment", punishedUntil: until, punishmentReason: reason }));
  }, []);

  // ---- The three content sources — each just fetches/generates and posts the image message;
  // point cost is applied separately by executeTool, since Mistress V decides that per call. ----

  const runGenerateImage = useCallback(
    async (prompt: string): Promise<{ success: boolean; error?: string }> => {
      if (!apiKey) return { success: false, error: "No API key" };
      const imageModel = allModels.find((m) => m.id === VENICE_IMAGE_MODEL_ID);
      if (!imageModel) return { success: false, error: "Image model not registered" };
      try {
        const res = await fetch("/api/batch-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: imageModel,
            payload: { prompt, aspect_ratio: "3:4", resolution: "1K" },
            apiKey,
          }),
        });
        const data = await res.json();
        if (data.success && data.images?.[0]) {
          addMessage({ role: "domme", type: "image", content: prompt, imageUrl: data.images[0].url });
          return { success: true };
        }
        return { success: false, error: data.error || "Generation failed" };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Network error" };
      }
    },
    [apiKey, addMessage]
  );

  const runAlbumPull = useCallback(
    async (tagFilter?: string): Promise<{ success: boolean; error?: string }> => {
      const albumImages = await loadAlbumItems();
      if (albumImages.length === 0) return { success: false, error: "No images saved in this browser account's albums." };
      const query = tagFilter?.trim().toLowerCase();
      const matches = query
        ? albumImages.filter(
            (img) =>
              img.name?.toLowerCase().includes(query) || img.tags?.some((t) => t.toLowerCase().includes(query))
          )
        : [];
      const pool = matches.length > 0 ? matches : albumImages;
      const randomImage = pool[Math.floor(Math.random() * pool.length)];
      addMessage({
        role: "domme",
        type: "image",
        content: matches.length > 0 ? `From your collection: ${query}… 😈` : "From your collection… 😈",
        imageUrl: await getImageDataUrl(randomImage.id),
      });
      return { success: true };
    },
    [loadAlbumItems, getImageDataUrl, addMessage]
  );

  const runTbibPull = useCallback(
    async (tags: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const query = `${tags || "nsfw"} ${EXCLUDED_TAGS}`;
        const res = await fetch(`/api/tbib/random?tags=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = await res.json();
        if (data.success && data.url) {
          addMessage({
            role: "domme",
            type: "image",
            content: `TBIB: ${data.tags?.slice(0, 100) || tags}`,
            imageUrl: data.url,
          });
          return { success: true };
        }
        return { success: false, error: data.error || "TBIB fetch failed" };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Network error" };
      }
    },
    [addMessage]
  );

  const runSerperPull = useCallback(
    async (query: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/serper/image-search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          headers: serperApiKey ? { "x-serper-key": serperApiKey } : undefined,
        });
        const data = await res.json();
        if (data.success && data.url) {
          addMessage({
            role: "domme",
            type: "image",
            content: `Serper: ${data.title || query}`,
            imageUrl: data.url,
          });
          return { success: true };
        }
        return { success: false, error: data.error || "Serper search failed" };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Network error" };
      }
    },
    [addMessage, serperApiKey]
  );

  // Runs one tool call and returns the text fed back to Mistress V as the tool result — she reads
  // this to decide what to say next, so it always reports the real outcome and new balance.
  const executeTool = useCallback(
    async (name: string, argsJson: string): Promise<string> => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsJson || "{}");
      } catch {
        // Malformed arguments — proceed with an empty object rather than failing the whole turn.
      }

      switch (name) {
        case "generate_image": {
          const cost = Number(args.cost) || 0;
          const prompt = typeof args.prompt === "string" ? args.prompt : "";
          if (!prompt.trim()) return "Failed: no prompt provided. No points were charged.";
          const result = await runGenerateImage(prompt);
          if (!result.success) return `Generation failed: ${result.error}. No points were charged.`;
          return `Image generated and sent. ${cost} points charged. New balance: ${applyScoreDelta(-cost)}.`;
        }
        case "pull_from_album": {
          const cost = Number(args.cost) || 0;
          const tagFilter = typeof args.tag_filter === "string" ? args.tag_filter : undefined;
          const result = await runAlbumPull(tagFilter).catch(() => ({ success: false, error: "Browser album storage is unavailable. Reopen the game and try again." }));
          if (!result.success) return `Failed: ${result.error}. No points were charged.`;
          return `Album image sent. ${cost} points charged. New balance: ${applyScoreDelta(-cost)}.`;
        }
        case "pull_from_tbib": {
          const cost = Number(args.cost) || 0;
          const tags = typeof args.tags === "string" ? args.tags : "nsfw";
          const result = await runTbibPull(tags);
          if (!result.success) return `Failed: ${result.error}. No points were charged.`;
          return `TBIB image sent. ${cost} points charged. New balance: ${applyScoreDelta(-cost)}.`;
        }
        case "pull_from_serper": {
          const cost = Number(args.cost) || 0;
          const query = typeof args.query === "string" ? args.query : "nsfw";
          const result = await runSerperPull(query);
          if (!result.success) return `Failed: ${result.error}. No points were charged.`;
          return `Serper image sent. ${cost} points charged. New balance: ${applyScoreDelta(-cost)}.`;
        }
        case "adjust_points": {
          const amount = Number(args.amount) || 0;
          const reason = typeof args.reason === "string" ? args.reason : "";
          return `Points adjusted by ${amount} (${reason}). New balance: ${applyScoreDelta(amount)}.`;
        }
        case "start_punishment": {
          const seconds = Math.min(180, Math.max(5, Number(args.seconds) || 30));
          const reason = typeof args.reason === "string" ? args.reason : "Punished.";
          startPunishment(seconds, reason);
          return `Punishment started: ${seconds}s lockout. Reason: ${reason}.`;
        }
        default:
          return `Unknown tool: ${name}`;
      }
    },
    [runGenerateImage, runAlbumPull, runTbibPull, runSerperPull, applyScoreDelta, startPunishment]
  );

  // The agent loop: send the user's message, let Mistress V either just reply or call tool(s),
  // execute any calls, then let her react to the results in her own words — the same
  // call-then-reason round trip any tool-using agent runs.
  const sendToMistressV = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!apiKey || !trimmed || isThinking || state.phase === "punishment") return;

      const command = parseSlashCommand(trimmed);

      addMessage({ role: "user", type: "text", content: trimmed });
      setChatInput("");
      setIsThinking(true);

      // Fresh grounding each turn, appended to the API-visible copy only (not shown in the UI).
      // A slash command gets rewritten into an explicit instruction + a forced tool_choice, so it
      // actually runs this turn instead of being left to her judgment like a normal message.
      const apiContent = command
        ? `[The slave used the /${command.label} command${command.arg ? `: "${command.arg}"` : ""}. You MUST call the ${command.tool} tool this turn — decide the cost yourself, and if it's generate_image, write the prompt yourself using their text as inspiration if given.]\n\n[state: ${scoreRef.current} points]`
        : `${trimmed}\n\n[state: ${scoreRef.current} points]`;
      conversationRef.current.push({ role: "user", content: apiContent });

      const forcedToolChoice = command ? { type: "function", function: { name: command.tool } } : undefined;

      try {
        const response = await callVeniceChatWithTools(
          conversationRef.current,
          TOOLS,
          apiKey,
          GOON_GAME_MODEL,
          forcedToolChoice
        );
        if (!response.success) {
          addMessage({ role: "domme", type: "text", content: `(connection hiccup: ${response.error})` });
          return;
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          conversationRef.current.push({
            role: "assistant",
            content: response.text ?? null,
            tool_calls: response.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });

          for (const call of response.toolCalls) {
            const result = await executeTool(call.name, call.arguments);
            conversationRef.current.push({ role: "tool", tool_call_id: call.id, content: result });
          }

          const followUp = await callVeniceChatWithTools(conversationRef.current, TOOLS, apiKey, GOON_GAME_MODEL);
          if (followUp.success && followUp.text?.trim()) {
            addMessage({ role: "domme", type: "text", content: followUp.text.trim() });
            conversationRef.current.push({ role: "assistant", content: followUp.text.trim() });
          }
        } else if (response.text?.trim()) {
          addMessage({ role: "domme", type: "text", content: response.text.trim() });
          conversationRef.current.push({ role: "assistant", content: response.text.trim() });
        }
      } finally {
        setIsThinking(false);
      }
    },
    [apiKey, isThinking, state.phase, addMessage, executeTool]
  );

  const startGame = useCallback(() => {
    if (!apiKey || !fetish.trim() || !storageReady) return;
    sessionIdRef.current = uuid();
    scoreRef.current = 0;
    setGameStarted(true);
    const fetishDisplay = fetish.trim();
    const introText = `So you're into ${fetishDisplay}… Mmm. I'm Mistress V, and you belong to me now. Everything has a price, slave — ask, negotiate, or beg for what you want, and I'll decide what it costs. Behave and you're rewarded. Disrespect me and you'll lose more than points. Understood? 💋`;

    conversationRef.current = [
      {
        role: "system",
        content: `${MISTRESS_SYSTEM_FIXED}\n\nTone: ${tone}\n\n${punishmentRules}\n\n${SAFETY_GUARDRAIL}`,
      },
      {
        role: "user",
        content: `[The slave just told you their fetish is: ${fetishDisplay}. Greet them in character and establish your dominance and the point economy. Don't call any tools yet.]`,
      },
      { role: "assistant", content: introText },
    ];

    setState({ messages: [], score: 0, phase: "chatting", punishedUntil: 0, punishmentReason: "" });
    addMessage({ role: "domme", type: "text", content: introText });
  }, [apiKey, fetish, addMessage, tone, punishmentRules, storageReady]);

  // Load a previously-saved session — full state AND the raw LLM conversation history, so
  // Mistress V resumes with real memory instead of a blank slate with old messages pasted in.
  const resumeSession = useCallback((session: SavedGoonSession) => {
    sessionIdRef.current = session.id;
    scoreRef.current = session.score;
    conversationRef.current = Array.isArray(session.conversation) ? session.conversation : [];
    setFetish(session.fetish || "");
    const stillPunished = session.phase === "punishment" && session.punishedUntil > Date.now();
    setState({
      messages: session.messages,
      score: session.score,
      phase: stillPunished ? "punishment" : "chatting",
      punishedUntil: stillPunished ? session.punishedUntil : 0,
      punishmentReason: stillPunished ? session.punishmentReason : "",
    });
    setGameStarted(true);
  }, []);

  const deleteSessionById = useCallback(async (id: string) => {
    try { await gameStore.deleteSession(id); setSessions((prev) => prev.filter((s) => s.id !== id)); }
    catch (error) { setStorageError(error instanceof Error ? error.message : "Session could not be deleted."); }
  }, [gameStore]);

  // Leaves the current session (already continuously saved) and returns to the picker — doesn't
  // delete anything, just stops viewing it.
  const leaveToMenu = useCallback(() => {
    if (isThinking) { setStorageError("Wait for the current reply before leaving this session."); return; }
    if (storageError && !confirm("This session may have unsaved changes. Export it first. Leave anyway?")) return;
    conversationRef.current = [];
    scoreRef.current = 0;
    sessionIdRef.current = "";
    setState({ messages: [], score: 0, phase: "intro", punishedUntil: 0, punishmentReason: "" });
    setFetish("");
    setChatInput("");
    setGameStarted(false);
    setShowInfo(true);
    refreshSessions();
  }, [refreshSessions, isThinking, storageError]);

  // Lets Venice rewrite the tone or punishment-list draft from a plain-English instruction —
  // review the result before Save actually commits it.
  const rewriteWithAI = useCallback(
    async (target: "tone" | "rules") => {
      if (!apiKey || !aiInstruction.trim() || isRewriting) return;
      setIsRewriting(target);
      const current = target === "tone" ? toneDraft : rulesDraft;
      const systemPrompt = target === "tone" ? REWRITE_SYSTEM : REWRITE_RULES_SYSTEM;
      try {
        const result = await callVenice(
          systemPrompt,
          `CURRENT TEXT:\n${current}\n\nINSTRUCTION: ${aiInstruction.trim()}`,
          apiKey,
          GOON_GAME_MODEL
        );
        if (result.success && result.text?.trim()) {
          if (target === "tone") setToneDraft(result.text.trim());
          else setRulesDraft(result.text.trim());
        }
      } finally {
        setIsRewriting(null);
      }
    },
    [apiKey, aiInstruction, isRewriting, toneDraft, rulesDraft]
  );

  // Persists the (possibly edited/AI-rewritten) tone + punishment ruleset, and — if a game is
  // already underway — pushes a system reminder into the live conversation so it takes effect
  // immediately rather than only on the next fresh session.
  const saveSettings = useCallback(async () => {
    if (!storageReady) return;
    const nextTone = toneDraft.trim() || DEFAULT_TONE;
    const nextRules = rulesDraft.trim() || DEFAULT_PUNISHMENT_RULES;
    try { await gameStore.saveRules({ tone: nextTone, punishmentRules: nextRules }); }
    catch (error) { setStorageError(error instanceof Error ? error.message : "Rules were not saved."); return; }
    setTone(nextTone);
    setToneDraft(nextTone);
    setPunishmentRules(nextRules);
    setRulesDraft(nextRules);

    if (gameStarted && conversationRef.current.length > 0) {
      conversationRef.current.push({
        role: "system",
        content: `[The slave has just updated your configuration. From now on:]\n\nTone: ${nextTone}\n\n${nextRules}\n\n${SAFETY_GUARDRAIL}`,
      });
    }
    setState(prev => ({ ...prev })); // Persist any updated conversation reminder too.
  }, [toneDraft, rulesDraft, gameStarted, storageReady, gameStore]);

  const resetSettingsToDefault = useCallback(() => {
    setToneDraft(DEFAULT_TONE);
    setRulesDraft(DEFAULT_PUNISHMENT_RULES);
  }, []);

  // ---- Settings/info panel — shared between the pre-game and in-game screens. ----
  function renderSettingsBody() {
    return (
      <div className="max-w-2xl mx-auto space-y-2 text-left">
        <p className="font-semibold">What Mistress V can do</p>
        <p className="text-muted-foreground">
          She&apos;s a real agent, not a menu — she decides herself when to generate a custom AI
          image, pull one from your saved albums, grab an illustrated image from the internet
          (TBIB), search the open web for a real photo (Serper), award or dock your points based
          on how you act, and lock you out as punishment if your points go negative or you&apos;re
          disrespectful. Everything has a price she sets through the negotiation, not a fixed cost.
        </p>
        <p className="font-semibold pt-1">The four image sources</p>
        <ul className="text-muted-foreground space-y-1 list-disc pl-4">
          <li>
            <strong className="text-foreground">Generate</strong> — a brand-new AI image made just
            for you (Seedream), written by her from the conversation.
          </li>
          <li>
            <strong className="text-foreground">Pull from Album</strong> — a random image already
            saved in your own albums.
          </li>
          <li>
            <strong className="text-foreground">TBIB</strong> — a real illustrated image pulled
            from the internet (an imageboard), matched by search tags.
          </li>
          <li>
            <strong className="text-foreground">Serper</strong> — a real photo pulled from the
            open web via Google Images, matched by search query. Needs a Serper.dev key saved on
            the{" "}
            <a href="/settings?tab=api-keys" className="text-primary hover:underline">
              Settings page
            </a>{" "}
            to work (free tier at serper.dev).
          </li>
        </ul>
        <p className="font-semibold pt-1">How to use them</p>
        <p className="text-muted-foreground">
          Just ask her in chat and let her decide — or force one directly with a slash command,
          where anything after the command is what you want it to search/depict. For example,{" "}
          <code className="rounded bg-background px-1 py-0.5">/tbib latex</code> makes her search
          TBIB for &quot;latex&quot; specifically, and{" "}
          <code className="rounded bg-background px-1 py-0.5">/serper latex catsuit</code> makes
          her search Google Images for that instead of picking a tag herself.
        </p>
        <p className="text-muted-foreground">
          <code className="rounded bg-background px-1 py-0.5">/generate a description</code> ·{" "}
          <code className="rounded bg-background px-1 py-0.5">/pull-from-album keyword</code> ·{" "}
          <code className="rounded bg-background px-1 py-0.5">/tbib tags</code> ·{" "}
          <code className="rounded bg-background px-1 py-0.5">/serper query</code>
        </p>
        <p className="font-semibold pt-1">Going negative</p>
        <p className="text-muted-foreground">
          She sets real escalating consequences the deeper you go — each threshold from -100 down
          to -500 has a menu of options (ball-slapping counts, forced gay/trans content while
          stroking, timed touch restrictions, further-out dares at -300 and below) and she picks
          whichever fits the moment, not always the same one. You can also claw points back early
          — she rewards negotiated tasks and gay/trans content on request. Everything is
          honor-system: she narrates it, you decide what you actually do. She will never suggest
          anything medical or irreversible.
        </p>

        <p className="font-semibold pt-2 border-t mt-2">Customize with AI</p>
        <p className="text-muted-foreground">
          Describe how you want her tone or the punishment list to change, and let Venice rewrite
          it for you — review the result below before saving.
        </p>
        <Input
          value={aiInstruction}
          onChange={(e) => setAiInstruction(e.target.value)}
          placeholder="e.g. make her more sadistic, focus on financial domination…"
          className="h-8 text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => rewriteWithAI("tone")}
            disabled={!apiKey || !aiInstruction.trim() || isRewriting !== null}
          >
            {isRewriting === "tone" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Rewrite tone
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => rewriteWithAI("rules")}
            disabled={!apiKey || !aiInstruction.trim() || isRewriting !== null}
          >
            {isRewriting === "rules" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Rewrite punishment list
          </Button>
        </div>

        <p className="font-semibold pt-1">Tone</p>
        <textarea
          value={toneDraft}
          onChange={(e) => setToneDraft(e.target.value)}
          rows={3}
          className="w-full rounded-md border bg-background p-2 font-mono text-xs leading-relaxed"
        />

        <p className="font-semibold pt-1">Punishment list</p>
        <textarea
          value={rulesDraft}
          onChange={(e) => setRulesDraft(e.target.value)}
          rows={12}
          className="w-full rounded-md border bg-background p-2 font-mono text-xs leading-relaxed"
        />
        <p className="text-[11px] text-muted-foreground">
          One safety rule (no medical or irreversible suggestions) is always appended and
          can&apos;t be edited out, even via the AI rewrite.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Button type="button" size="sm" onClick={saveSettings}>
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={resetSettingsToDefault} className="gap-1.5">
            <RotateCcw className="h-3 w-3" />
            Reset to default
          </Button>
          {gameStarted && (
            <button
              type="button"
              onClick={leaveToMenu}
              className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to menu
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderSessionsList() {
    if (sessions.length === 0) return null;
    return (
      <div className="pt-4 space-y-1.5 text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
          Saved sessions
        </p>
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <button
              type="button"
              onClick={() => resumeSession(s)}
              className="flex-1 min-w-0 text-left hover:text-primary"
            >
              <span className="font-medium block truncate">{s.fetish || "Untitled"}</span>
              <span className="text-[11px] text-muted-foreground">
                {s.score} pts · {new Date(s.updatedAt).toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => deleteSessionById(s.id)}
              title="Delete this session"
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  // ---- RENDER ----

  if (!apiKey) {
    return (
      <main className="flex flex-col items-center justify-center h-[80vh] gap-4 p-6">
        {storageNotice()}
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          Goon Game
          <span className="rounded border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Beta</span>
          <span
            aria-hidden
            className="inline-block h-4 w-4 shrink-0 rounded-full bg-gradient-to-br from-pink-400 to-fuchsia-600 animate-goon-pulse"
          />
        </h1>
        <p className="text-muted-foreground text-center max-w-md">
          You need a Venice.ai API key to play. Set one up in{" "}
          <Link href="/settings?tab=api-keys" className="text-primary underline">
            Settings → API Keys
          </Link>
        </p>
      </main>
    );
  }

  // ---- PRE-GAME: Fetish Selection + Settings + Saved Sessions ----
  if (!gameStarted) {
    return (
      <main className="flex flex-col items-center py-10 px-6 min-h-[80vh]">
        {storageNotice()}
        <div className="text-center space-y-4 max-w-md w-full">
          <h1 className="text-3xl font-bold flex items-center justify-center gap-2.5">
            <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 bg-clip-text text-transparent">
              Goon Game
            </span>
            <span className="rounded border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Beta</span>
            <span
              aria-hidden
              className="inline-block h-5 w-5 shrink-0 rounded-full bg-gradient-to-br from-pink-400 to-fuchsia-600 animate-goon-pulse"
            />
          </h1>
          <p className="text-muted-foreground text-sm">
            Mistress V is waiting. But first — what are you into today?
          </p>

          <div className="space-y-3 pt-2">
            <Input
              value={fetish}
              onChange={(e) => setFetish(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetish.trim() && startGame()}
              placeholder="e.g. sissy training, jerk off to traps, latex, bondage…"
              className="text-center"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              This helps Mistress V tailor your session. Be specific. 😈
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <Button
              size="lg"
              onClick={startGame}
              disabled={!fetish.trim() || !storageReady}
              className="bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 disabled:opacity-40"
            >
              <Play className="h-5 w-5 mr-2" />
              Begin Session
            </Button>
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3 inline mr-1" />
              Back to Dashboard
            </Link>

            {renderSessionsList()}

            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className="flex items-center justify-center gap-1.5 pt-3 text-xs text-muted-foreground hover:text-foreground"
            >
              {showInfo ? <X className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
              {showInfo ? "Hide settings" : "Show settings"}
            </button>
          </div>
        </div>

        {showInfo && (
          <div className="mt-4 w-full max-w-2xl rounded-lg border bg-muted/30 px-4 py-3 text-sm">
            {renderSettingsBody()}
          </div>
        )}
      </main>
    );
  }

  const punished = state.phase === "punishment";
  const punishmentRemainingMs = punished ? Math.max(0, state.punishedUntil - nowTick) : 0;
  const locked = isThinking || punished;

  // ---- IN-GAME ----
  return (
    <main className="flex flex-col h-[calc(100vh-4rem)]">
      {storageNotice()}
      <div className="relative">
        <ScoreBar
          score={state.score}
          punished={punished}
          punishmentRemainingMs={punishmentRemainingMs}
          punishmentReason={state.punishmentReason}
        />
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          title="Settings"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/25 text-white hover:bg-black/40"
        >
          {showInfo ? <X className="h-4 w-4" /> : <Info className="h-4 w-4" />}
        </button>
      </div>

      {showInfo && (
        <div className="max-h-[60vh] overflow-y-auto border-b bg-muted/30 px-4 py-3 text-sm">
          {renderSettingsBody()}
        </div>
      )}

      {/* Chat area */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-2xl mx-auto space-y-4 py-4">
          {state.messages.map((msg) => (
            <GoonChatMessage key={msg.id} message={msg} />
          ))}
          {isThinking && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm pl-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Mistress V is typing…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Controls */}
      <div className="border-t bg-background/80 backdrop-blur p-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {punished && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              <Lock className="h-4 w-4" />
              Locked out for {Math.ceil(punishmentRemainingMs / 1000)}s — {state.punishmentReason}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !locked) {
                  e.preventDefault();
                  sendToMistressV(chatInput);
                }
              }}
              placeholder={
                punished
                  ? "Locked out…"
                  : "Talk to her, or try /generate, /pull-from-album, /tbib, /serper…"
              }
              disabled={locked}
            />
            <Button
              type="button"
              onClick={() => sendToMistressV(chatInput)}
              disabled={locked || !chatInput.trim()}
              className="shrink-0"
            >
              {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
