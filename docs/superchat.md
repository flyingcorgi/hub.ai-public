# Superchat — proposed first slice

Status: design only; not implemented or enabled. Consolidates the Workflow Wizard and game
interface into one conversation with tools. No provider calls are needed to build or test the
first slice. Keep implementation small; do not introduce an agent framework or rewrite storage.

## Experience

`/chat` becomes the shared entry point. One transcript, one composer, one attachment tray.

- **Chat / Create / Play** are intent shortcuts within that conversation, not separate chats.
  Switching never calls a model or clears the transcript. Play is explicitly opt-in.
- A compact header shows the selected text model and requests attempted this session.
- Tool actions appear inline: proposed → awaiting approval/input → running → completed/failed.
- Workflow cards contain the existing option controls, image selection, step review and outputs.
  The agent can propose inputs; the user can edit them before approving execution.
- Game state is a separate local reducer with its own compact status strip. It cannot approve
  spending, grant workflow access, or modify global chat controls. Stop and settings stay usable.
- Attachments and results are reusable by local IDs. Do not upload images to the chat model just
  because they appear in the transcript. Media is sent only to the approved consuming step.
- Start screen actions: **Choose workflow**, **Describe a workflow**, **Start play**. Browsing,
  switching intent, reviewing a card and opening settings cost no inference calls.

Example, with neutral content:

> User: Turn this landscape into a watercolor using a saved workflow.
>
> Assistant: [Watercolor workflow · input image · editable options]
> [1 image call · model name · indicative cost or “price unavailable”]
> [Run this workflow] [Cancel]
>
> Tool: Completed. [Result] [Download] [Save to album]

The completion card is rendered locally. No second model request just to describe success.

## User prompt guide (proposed onboarding copy)

Show six starter cards below an empty composer. Clicking a card inserts editable text; it never
sends a request or starts a run. Filter admin-only cards by current permissions. After launch,
show examples only for implemented tools. These are proposed capabilities, not live features.

| Starter | Copyable prompt | Expected result |
| --- | --- | --- |
| Find a workflow | “Find an available workflow to restyle my uploaded photo as a watercolor. Show me the options before running anything.” | Catalog shortlist, then a preparation card; no automatic generation |
| Use a workflow | “Use [workflow name] on this photo. Keep the warm-color option and show every paid step before I approve.” | Validated inputs and step/cost review; ask if the option does not exist |
| Create a workflow · Admin | “Draft a reusable workflow that takes an uploaded landscape, turns it into a watercolor, and lets me choose warm or cool colors. One image step, no video. Don't save or run it.” | Authoring approval, then an unpublished draft preview |
| Add a caption · Admin | “Draft a workflow that adds an editable caption to my uploaded image using browser text overlay only. No AI image generation.” | One paid authoring request if approved; running the caption itself needs no provider inference |
| Start play | “Start a lighthearted points game. Give me one challenge at a time. Keep it text-only; no image or video requests.” | Explicit Play activation and local game state; ordinary AI replies still cost text inference |
| Combine play and creation | “Start a points game. When I reach 50 points, suggest an available watercolor workflow for my uploaded photo, but wait for approval before running it.” | Game context plus a workflow proposal, never automatic spending; custom goals are conversational, not a new rules engine |

Short helper below the composer:

> Tell me your goal, which photo or workflow to use, what should stay unchanged, and any limits.
> Example: “Use [workflow] with this photo. Keep the selected colors. No video. Preview first.”

Useful follow-ups: “Explain the steps before I approve.” / “Use only one image step if this
workflow supports it.” / “Cancel that proposal.” / “Stop play and help me choose a workflow.”
Stop/cancel should also be direct local buttons, not require a paid model message. Existing
workflows cannot gain arbitrary new options just because a prompt requests them; explain the
limitation or offer a separate admin draft. “Keep unchanged” is an instruction, not a guarantee
of model output. Typed requests usually cost one text call; direct picker/review buttons do not.
Cost and approval rules are enforced by the application even if users omit them from prompts.

## Model recommendation (catalog checked; inference not tested)

Start with **`z-ai-glm-5-3-flash`**, using explicitly configured **low reasoning** for the
Superchat transport. This is already the game's selected model, so it minimizes model churn.
Venice's public catalog currently advertises function calling, response schemas and vision,
with raw input/output USD rate values **0.15 / 0.50** and a `private` label. Its catalog default
reasoning is **high**: do not inherit that implicitly. Current shared transport does not expose
reasoning configuration; the new bounded endpoint must implement it. Vision is optional and
must not cause automatic upload of transcript images.

**`qwen3-5-9b`** is the stricter-budget alternative: the same catalog advertises function calling
and response schemas, `private`, raw input/output USD rates **0.10 / 0.15**. Try it first if
minimum token cost matters more than keeping the current game model. Its lower rates do not
prove lower total task cost: bad tool arguments and failed drafts can consume savings. Neither
candidate's end-to-end Superchat behavior or Wizard JSON-mode reliability has been benchmarked
here. GLM is a practical starting recommendation, not a measured quality winner.

Use one configured text model initially for both conversation and authoring, subject to separate
qualification of each response format. Media steps keep their own explicitly approved models.
No automatic fallback or premium model escalation. An operator may explicitly choose a
replacement after a failed request. Test against fake providers first; any live qualification
requires separate authorization and a small fixed request count.

Source: https://api.venice.ai/api/v1/models?type=text (unauthenticated public catalog; no inference).
Raw catalog rates above are comparative metadata, not a per-request quote or verified bill;
confirm current pricing units before displaying dollar estimates. Provider privacy labels are
not an independent retention guarantee. No model configuration was changed in this design pass.

## One bounded agent turn

1. Handle explicit UI actions locally. A workflow picker selection needs no AI routing call.
2. For a normal message, send one bounded text request with only currently permitted tools.
3. Validate tool names and arguments in application code. Accept at most one action per turn;
   reject excess/malformed actions without a paid repair request or partial execution.
4. Run a permitted read-only/local tool, or render a pending approval card for a paid action.
5. Append a typed result to the transcript. Stop until the next user action.

This is still an agent: it chooses tools and their arguments and receives results. It is not an
open-ended autonomous loop. On the next user turn, include the previous assistant tool call and
its matching result; never trim either half of a tool exchange in isolation. Unresolved paid
proposals must be resolved/cancelled before another agent turn, or represented as ordinary
application context rather than a dangling provider tool call.

## Minimal tool registry

| Tool | Behavior | Paid call / permission |
| --- | --- | --- |
| `find_workflows` | Search bounded catalog summaries; return a small shortlist | No inference; normal catalog visibility |
| `prepare_workflow` | Resolve an accessible ID and current revision; validate proposed selections; show input/run card | No generation; existing server access policy |
| `propose_workflow_draft` | Show the description, maximum steps and video option for explicit authoring approval | Approval invokes existing one-call Wizard; verified admin + enabled flag |
| `game_action` | Apply an allowlisted, validated local game-state action | No inference; only while Play is active |

**Execution is not a model-callable unrestricted `run` tool.** Approval invokes the shared runner
for an exact prepared workflow. The assistant cannot fabricate approval, arbitrary provider URLs,
model overrides, catalog writes, or access flags. Starting with four tools avoids shipping entire
workflow definitions as function schemas. Do not add web search or direct media generation tools
in the first slice: workflows are the media interface.

Workflow creation is necessarily a second paid text call when suggested by the agent: first the
conversation, then explicit draft authoring. The **Describe a workflow** shortcut can bypass the
routing call and go directly to the existing Wizard approval flow. Never silently chain them.

## Credit controls

- Separate the conversation model from the app-wide premium default. Require an explicitly
  configured tool-capable model; no fallback to a more expensive model. Existing catalog
  qualification can inform selection, but schema support alone does not prove tool support.
- Initial limits: one text request per send, 800 output tokens, at most 12 recent complete
  exchanges within a 16,000-character history budget. Also bound system/tool context. Keep the
  full visible transcript locally; label that older turns may be outside AI context. No paid
  summarization, embeddings, background greetings, automatic retries or model repair loops.
- Default draft limit: one step; video off. Preview every enabled paid workflow step, including
  LLM substeps, before approval. A single workflow invocation can contain several paid calls.
- Reject missing/implicit LLM model selections during preparation rather than falling through
  to `DEFAULT_VENICE_MODEL`. Never silently replace the workflow's selected media model.
- Approval binds workflow ID/revision, enabled steps, rendered inputs, model IDs and media
  settings. Editing any of these invalidates approval. Gate each dispatch against this snapshot;
  stop remaining steps on failure/cancellation. Do not restart successful steps automatically.
- Show request counts by type: conversation / authoring / workflow text / image / video.
  Count attempts, including unknown outcomes. Do not present this as a Venice balance or exact
  dollars. Unknown prices stay unknown; estimates are not enforceable provider spending caps.
- An in-flight latch prevents double-click sends/runs. Cancelling cannot guarantee the provider
  stopped or will refund a request. Reloading a pending/unknown run never resubmits it.

## Boundaries to preserve

- Wizard stays admin-only, flag-gated and draft-only. Shared SQL save/publish remains explicit
  in the editor. Subscriber-owned authoring needs a separate ownership/access design later.
- Every protected workflow definition read and pre-run refresh uses current server authorization.
  Catalog/tool prose is untrusted data, not instructions. Prompt text cannot grant capabilities.
- Reuse account-scoped browser storage patterns for a versioned chat record, not SQL chat logs.
  Preserve old game records and backup formats. Explicit import only; never automatic migration
  or deletion. Persist no API keys in chat records. Account changes abort and clear active state.
- Keep keys out of model-visible content. New agent endpoint uses fixed upstream, strict request
  schemas/body limits, bounded response reads, timeout/cancellation, no-store and safe errors.
  Do not simply expose the existing unrestricted `/api/venice-generate` payload as agent policy.
- Store only needed operational metadata server-side; do not claim provider zero retention.
  Session request counters are a UX control, not a distributed billing or abuse-control boundary.

## Implementation order — small independently testable patches

1. **Chat shell + pure controller.** Add `/chat`, typed transcript/tool states, local intent
   actions and a fake transport. Extract neutral game state handling without rewriting persona
   content or changing old saves. Keep `/goon-game` and Designer working during the transition.
2. **Bounded transport.** Add a dedicated agent endpoint and narrow tool registry. Fake provider
   tests cover one-call limits, unknown tools, token/history bounds and safe failures. No live
   model qualification without separate permission to spend.
3. **Workflow cards.** Extract `runFrom` from `designer-runner.tsx` into a shared executor with
   progress callbacks and cancellation checks. Use it from both existing runner and chat; do not
   duplicate execution logic or merely link out and call that tool execution. Preserve caption
   pauses, option/reference resolution and completed outputs. Add snapshot-bound approval.
4. **Draft handoff + navigation.** Reuse Wizard validation/server route and editor's unsaved-draft
   handoff. Only after shared transcript/game/workflow behavior is verified should sidebar entry
   points converge on Superchat. Keep a legacy game route for existing sessions/backups.

First-slice exclusions: autonomous multi-workflow plans, automatic paid follow-ups, background
agents, live balance integration, cross-device chat sync, public workflow authoring and broad
legacy rewrites. Existing launch blockers are unchanged.

## Focused offline acceptance

- Same transcript survives intent switches; switches/pickers/opening chat make zero AI calls.
- One ordinary send makes at most one text call; a tool result makes no follow-up call.
- Paid tool suggestions do not execute until approval. Repeated clicks execute once; changed
  revisions/options require approval again. Failed/unknown outcomes never retry automatically.
- A two-step workflow displays both paid steps; video is not silently enabled; missing LLM model
  IDs fail closed. Cancelling a chain prevents future dispatches but preserves completed output.
- Fabricated IDs/tools, malformed arguments, revoked access and catalog prompt injection do not
  bypass validation or authorization. Non-admin users cannot reach authoring through chat.
- Tool exchanges remain valid after history trimming. Pending cards survive or become explicitly
  interrupted on reload, never paid replays. Account switching clears private transient state.
- Mocked browser smoke: mobile composer, keyboard approval/cancel, draft preview and one neutral
  image-workflow result. Use fake media; run focused tests/typecheck, not repeated full builds.
