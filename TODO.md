# TODO — FetishUI

Sections are in **priority order**. The launch/security baseline remains the priority. At the
user's request, a bounded admin-only Workflow Wizard beta has started before §1 is complete;
this is not an exception to the launch gates or permission to expose it to subscribers.

---

## 0. Launch Roadmap

**Hosting selection is deferred.** Build the provider-independent baseline first; see
[`docs/architecture-baseline.md`](docs/architecture-baseline.md) for the data boundaries, access
matrix, billing invariants, migration plan, and acceptance gates. That document supersedes older
assumptions below; it describes the target, not completed protections.

1. **§1 — Pre-launch hardening.** Must land before a single real payment.
2. **§2 — Workflow Wizard (LLM-assisted workflow creator).** First new feature after the fixes.
3. **§3 — Hosting, domain, payments, launch.**
4. Everything from §4 onward is post-launch backlog.

Soft-launching and iterating in production is fine — *after* §1. The items in §1 are the ones
that are genuinely unsafe to defer.

---

## 1. Pre-launch hardening 🔴

**Context:** the app was built single-user/local — server-side JSON files under `data/`, plus a
client-side paywall flag. Both assumptions break the moment there are real, paying, multiple users.
Full reasoning in the architecture discussion; the short version is below.

### 1a. Close the open product endpoint (most urgent)

The former full-catalog GET and unauthenticated whole-file POST are retired. See
[`docs/workflow-catalog.md`](docs/workflow-catalog.md) for SQL setup/import and the tested API
contract. Account UI and transactional billing now have offline/browser coverage; see
[`docs/account-billing.md`](docs/account-billing.md). Recurring payment association and live billing
qualification remain blocked; this is not launch-ready.

- [x] Retire album metadata/media APIs with 410/no-store for all callers; remove generation's
      direct server-album file reader. Game sessions/rules APIs also now return 410 without file access

- [x] Split public catalog summaries from full definitions; published free definitions remain
      accessible without subscribing, premium definitions require current entitlement, drafts are
      admin-only. Inline curated references share the definition's access boundary
- [x] Retire whole-catalog POST (405); use same-origin, verified-admin, revision-checked per-item
      PUT/DELETE instead
- [ ] Audit every other route under `src/app/api/` for the same problem (goon-game, albums, etc.)

### 1b. Make the paywall a real boundary

The old `isWorkflowAccessUnlocked()` localStorage helper is removed. Account UI hints now use
current server identity/entitlement; every protected API still needs its own boundary.

- [x] Add Better Auth-managed, revocable HttpOnly-cookie sessions and current DB roles/entitlements
      for workflow delivery/editing; cover verification, revocation, expiry, and role changes
- [x] Wire account UI, signup/verification/recovery/reset/logout with real-library offline tests
      and production-browser signin/reset/logout/cross-tab checks
- [ ] Qualify production HTTPS/proxy/email/abuse behavior and account retention/deletion policy
- [ ] Enforce authorization in every protected Route Handler AND Server Action; middleware alone
      is not a security boundary. Add CSRF/origin checks and abuse limits
- [x] Retire localStorage access flags/helper; account hints never authorize server operations
- [x] Retire access-code verification/public plan setup and subscriber-file APIs; require verified
      account ownership for enrollment and own billing summaries
- [x] Preserve IPN recursive HMAC-SHA512/timing-safe comparison; add unique transactional
      settlements, rollback, terminal refunds/revocation, intent-first enrollment and explicit
      operator reconciliation with fake-provider regression tests
- [ ] Confirm NOWPayments' authoritative recurring payment → subscription field using a redacted
      real payload/support confirmation; implement/test automatic binding, validate retry/refund
      behavior and merchant auth. Keep NOWPAYMENTS_ENROLLMENT_ENABLED=false until launch gates pass
- [ ] Repeat billing concurrency against real PostgreSQL and qualify missed-payment/reversal
      operations; serialized PGlite tests do not establish multi-connection isolation

### 1c. Get durable data off the local filesystem

Serverless hosts have a read-only filesystem (except ephemeral `/tmp`), so every `writeFile` under
`data/` fails or vanishes on deploy. Subscriber records live there — paying users would silently
lose access on every deploy. This blocks hosting entirely, regardless of the multi-user issue.

- [x] Choose PostgreSQL locally (hosting deferred); add checksum-checked transactional migrations
      for Better Auth, subscriptions, entitlements, unique payments, and revisioned workflows
- [x] Replace workflow file serving with SQL and an explicit transactional CLI import. Dry-run
      validates the existing catalog; operator must still apply it to their configured database
- [ ] Extract inline curated reference images from protected SQL JSON into a durable asset
      storage interface (vendor deferred)
- [ ] Remove every remaining `fs.writeFile` under `data/`
- [ ] **Check the AUP of whichever host and DB provider is chosen before migrating** — mainstream
      PaaS/managed-DB providers often restrict adult content (same reason payments are on crypto
      rails already)

### 1d. Real admin account

Workflow Designer now uses the current verified DB role on the server page and every API read/
mutation. Sidebar hints use `/api/account`, not a build-time admin flag.

- [x] Add server-side `admin` / `user` roles and an explicit CLI promotion of a verified account;
      never bootstrap from public signup order
- [x] Verified admins can author/publish/delete and read every workflow without subscribing
- [ ] Extend/review admin authorization across remaining legacy tooling and routes
- [x] Retire `NEXT_PUBLIC_ADMIN_TOOLS` from Designer and sidebar
- [x] Retire `NEXT_PUBLIC_BYPASS_PAYWALL` and legacy access helper; original browser/source
      records remain untouched and cannot claim a SQL entitlement

### 1e. Per-user data separation

New albums are account-scoped browser IndexedDB Blobs. Original operator album files are
preserved but no longer served; migration is explicit, never automatic. See
[`docs/browser-albums.md`](docs/browser-albums.md). Game sessions/rules, including embedded image
messages, now use browser namespaces too; album rewards are restored. See
[`docs/browser-game-saves.md`](docs/browser-game-saves.md).

- [x] Move new album metadata/image bytes to account/device-scoped browser **IndexedDB**
- [x] Add versioned album backups/import, checksum/conflict validation, atomic rollback, quota
      errors without truncation, scope cancellation and display-URL cleanup on account switches
- [x] Add explicit local `albums:export` CLI; preserve source files and never import on visitor login
- [ ] Operator: export original albums, verify intended-account browser import and backup,
      then deliberately handle old server files/backups; no original data was deleted
- [x] Move game sessions/rules and embedded image messages to scoped IndexedDB; add queued
      revision-checked saves, backup/import, explicit local export and retire server file routes
- [x] Migrate single-model/batch history to scoped IndexedDB; explicit legacy import, checked
      backups, atomic mutations, visible quota failures and local-only save retry. See
      [`docs/browser-generation-history.md`](docs/browser-generation-history.md)
- [ ] Migrate remaining device-shared batch drafts/templates, API keys and scratch-tool stores
- [ ] Ship versioned client migrations, account namespaces, export/import, quota handling, and
      account-switch behavior. Preserve source data until import is verified; browser storage can
      be cleared/evicted and has no automatic cross-device sync
- [x] Add local/operator-only `game:export`; never auto-import old chats into visiting browsers
- [ ] Operator: verify original game export/import, then deliberately clean up old files/backups
- [ ] Privacy claim must distinguish transit from persistence: media still passes through Next.js
      to Venice. IndexedDB alone does NOT make "images never touch our servers" true

### 1f. Cleanup

- [x] Mark **Goon Game as Beta** in the UI (badge on the sidebar entry + page header)
- [x] Fix the Radix `DialogContent` a11y warning on the mobile nav Sheet (missing `DialogTitle`)

### 1g. Transient generation and operational privacy

- [x] Remove generation payload/exception logging from the shared Venice action and single-model UI
- [x] Return content-free generation errors; no-store on chat/batch JSON responses and Venice
      image/video/chat fetches; cover these boundaries with fake-provider regression tests
- [ ] Audit remaining routes, client logs, framework errors, HTTP caches, and infrastructure
      buffering — the completed slice above does not establish app-wide non-retention
- [ ] Remove public environment API-key fallbacks before production
- [ ] Validate requests against the server registry; enforce size/concurrency limits and SSRF
      protections on remote media fetching
- [ ] Split long video polling into short submit/status calls, with bounded job handles,
      timeout/abort behavior, and no automatic duplicate paid submissions
- [ ] Upgrade vulnerable framework/runtime dependencies and verify production-like deployment

---

## 2. Workflow Wizard — LLM-assisted workflow creator

**Goal:** an internal LLM wizard that assists in creating workflows. A user describes what they
want in plain language and gets a working custom workflow out, without touching the raw admin
Workflow Designer. First new feature after §1 — and expected to be the most architecturally
involved item on this list, so it deserves a real design pass before any code.

Initial **admin-only, disabled-by-default beta**: [`docs/workflow-wizard.md`](docs/workflow-wizard.md).
Offline/API/browser checks pass; no live model qualification or subscriber rollout yet.

- [x] Initial UX: free-text description, step budget and explicit video opt-in
- [x] LLM authoring endpoint + strict blueprint compiler into `WorkflowDefinition`; initial subset
      supports groups, image edits, captions and terminal video, not LLM substeps/references
- [x] Validate registered media models, tokens/dependencies, input shape and bounded linear chains
      before delivery; force fresh IDs and unpublished defaults
- [x] Preview, then explicit handoff to the existing editor for tweaks/export/save; no silent save
- [ ] Decide where wizard-created workflows live: the shared catalog, or a per-user space
      (depends on the §1c/§1e storage split)
- [x] Initial admin-beta limits: one bounded text request, max four workflow steps, no automatic
      retries; process-local concurrency/cooldown, safe errors/no-store and strict same-origin auth
- [ ] Qualify live Venice JSON model availability/output quality, pricing and privacy; add
      distributed limits before subscriber use
- [x] Admin can hand wizard drafts to the raw Designer for explicit edit/save/publish (§1d)
- [x] Gate beta behind server-only `WORKFLOW_WIZARD_ENABLED` and configured authoring model
- [ ] Dogfood with a qualified model before expanding step types or opening to subscribers

---

## 3. Hosting, domain, payments & launch

- [ ] Secure a domain
- [ ] Choose hosting after the baseline works locally; verify adult-business AUP, Node/runtime
      support, SQL connectivity, timeouts, buffering/log retention, and backup/restore behavior
- [ ] Configure/verify the USD45/90-day NOWPayments plan through operator-owned provider setup
      and set `NOWPAYMENTS_PLAN_ID`; the former public setup endpoint returns 410
- [ ] End-to-end test a real subscription against the plan in `src/lib/nowpayments/config.ts`:
      **$45 / 3 months, BYOK for generation** — confirm the IPN webhook lands and unlocks access
- [ ] Point `NOWPAYMENTS_IPN_CALLBACK_URL` at a real public HTTPS URL (can't be tested on
      localhost — see the comment in `src/app/api/nowpayments/ipn/route.ts`)
- [ ] Qualify plan-change policy: local subscription terms are immutable snapshots; provider
      plan amount/interval/currency/callback are checked before enrollment. Never silently reprice
- [ ] Final security review pass before opening up publicly
- [ ] Launch 🚀 — soft-launch, keep iterating live

---

## 4. Album Character Consistency *(post-launch)*

**Goal:** Tag images in albums as `face` or `body`, then call them by label when building prompts.
The system injects a reference directive like `Use face from @image0` alongside the text prompt.

- [ ] Add tagging UI to album images (`face`, `body`, custom labels)
- [ ] Surface tagged images as selectable references in prompt builders
- [ ] Auto-inject reference directive (e.g. `Use face from @image0`) into the prompt payload
- [ ] Ensure multi-reference support (face + body + outfit ref in one prompt)

---

## 5. Workflow Builder — admin-authored *(post-launch)*

### 5a. Combine existing: Male → Female Body + Vagina (2-step pipeline)
- [ ] Chain them: output of step 1 → input of step 2
- [ ] Single "Full Feminization" workflow with all options from both

### 5b. Sissy Outfit / Dress-Up Workflows
- [ ] Outfit selection step (lingerie, dresses, heels, stockings, etc.)
- [ ] Dress-up pipeline: base image → outfit application
- [ ] "Try-on" style — keep face/body, change only clothing

### 5c. Femdom Multi-Character Scenes
Uses the same reference-image technique as §4.

- [ ] Multi-character prompt builder (pick 2+ faces/bodies from album)
- [ ] Scene types:
  - [ ] Submission (kneeling, collared, etc.)
  - [ ] Whipping / impact play
  - [ ] Pegging
  - [ ] Worship (feet, body)
  - [ ] Cuckold / forced-bi scenarios
- [ ] Ensure character consistency across all characters in frame

---

## 6. Image-to-Video Shorts Workflows *(post-launch)*

**Goal:** Turn generated/fetched images into short clips via the video models (Wan, Seedance, etc.).

- [ ] Image-to-video step in workflow builder
- [ ] Prompt template support for video models (timestamp syntax, sound brackets, etc.)
- [ ] Batch: generate multiple image variants → video-ify the best one
- [ ] Looping / boomerang-style outputs
- [ ] Caption/text overlay on video output

---

## Marketing notes

- Solid feature set to showcase once real copy is needed (guided workflows, multi-model generation,
  the Goon Game companion, albums) — worth a feature-by-feature pass once the domain is locked in
- Target privacy message after verification: "Prompts and media pass through our backend to
  Venice, but are not persisted or included in application logs. Saved creations remain in your
  browser." Curated reference assets and necessary account/billing records are separate
- There's already interest building; the §1 work is what makes it safe to convert that into signups

---

## Legend
- `[ ]` = not started
- `[x]` = done
- 🔴 = blocks launch
