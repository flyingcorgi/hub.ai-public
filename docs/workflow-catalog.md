# SQL workflow catalog and access boundary

This document covers curated workflow delivery/editing. See [account-billing.md](account-billing.md)
for the account UI and transactional billing baseline added afterward. Browser-local personal data,
generation hardening and deployment qualification remain unfinished; hosting stays deferred.
Do not accept real payments: recurring payment association is unconfirmed, enrollment stays disabled,
and legacy NOWPayments/access-code records are not automatically connected to SQL entitlements.

## Local setup

Use Node >=22.15 and PostgreSQL (17 is a suitable local target). A local PostgreSQL instance or
container is sufficient; no managed provider has been selected. Set server-only variables in
`.env.local` (see `.env.example`): `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`.
The auth URL must match the browser origin exactly, including port; HTTP is loopback-only.
Use a random secret of at least 32 characters. Do not commit credentials.

```sh
npm ci
npm run db:migrate
# Validate the operator's source catalog without touching SQL:
npm run workflows:import -- data/workflow-designer-definitions.json
# After backing up both SQL and the source file, explicitly import:
npm run workflows:import -- data/workflow-designer-definitions.json --apply
npm run dev
```

Commands load `.env.local`; existing shell environment variables take precedence. Migration
execution is explicit, transactional, advisory-locked, and checksum-checked. Never edit an
applied migration. `003_workflow_revisions.sql` adds per-item opaque UUID revisions and schema
version 1; the older catalog-wide revision table is unused.

The importer is CLI-only and reads only the file you name. It validates up to 100 workflows
from a file up to 64 MiB and imports **every item as a draft**, even if the source says published.
It never reads albums, game sessions, subscriber files, or media directories. It never deletes
or edits source files. A duplicate ID (including rerunning an import) rolls back the **entire**
import rather than updating existing rows. Keep your original backup until SQL content and
reference images have been verified. Do not expose `data/`, backups, or DB files as static files.

### Administrator provisioning

Better Auth owns signup, email verification, signin, and session cookies at `/api/auth/*`.
Use `/account` for signup/signin/verification/recovery. For local integrations, its JSON endpoints are:
`POST /api/auth/sign-up/email` (`name`, `email`, `password`),
`POST /api/auth/sign-in/email` (`email`, `password`), and `POST /api/auth/sign-out`.
Send `Content-Type: application/json`, the exact allowed `Origin`, and retain HttpOnly cookies.
Never put credentials/session tokens in URLs or log request bodies.

Signup is disabled unless `AUTH_ALLOW_SIGNUP=true` and SMTP host/from are configured. Use a local
SMTP capture service such as Mailpit for development (typically port 1025); follow the verification
link it receives before signin. Production email vendor selection remains deferred. Do not
bypass verification or copy test fixture cookies into a real environment.

After creating and verifying the intended operator account, obtain its stable user ID from the
operator-controlled DB (or the authenticated `/api/account` response) and explicitly promote it:

```sh
npm run auth:promote-admin -- '<verified-user-id>'
```

This command only updates an existing verified user. There is no first-signup admin rule or
browser-supplied role. On the next request that session can open `/workflows/designer`, view
all drafts/premium definitions, and save/publish/delete without subscribing. Demoting the DB
role or deleting its sessions takes effect on subsequent protected requests.

## API contracts

All handled workflow responses, including failures, use `Cache-Control: private, no-store`.
No filesystem fallback is used when SQL/configuration is unavailable; requests fail closed.

| Route | Contract |
| --- | --- |
| `GET /api/workflows` | Published summaries only, for every caller. Exact fields: `id`, `name`, `description`, `category`, `free`, `published`. No steps, prompts, references, or revisions. Names/descriptions are public marketing copy. |
| `GET /api/workflows?scope=admin` | Same summary DTO, including drafts; requires verified admin session. |
| `GET /api/workflows/:id` | `{ definition, revision }`. Published free: public. Published paid: verified current entitlement or verified admin. Draft: verified admin only. Hidden/missing drafts return 404; inaccessible published paid items return 401/403. |
| `PUT /api/workflows/:id` | Verified admin + same Origin. Body `{ definition, revision }`. `revision: null` is create-only; updates require the exact last-read revision. Path and definition IDs must match. |
| `DELETE /api/workflows/:id` | Verified admin + same Origin. Body `{ revision }`, exact last-read revision required. |
| `POST /api/workflows` | 405. Whole-catalog replacement has been removed, not retained as a compatibility bypass. |

A stale revision, missing update target, or conflicting create returns 409. Each write/delete is
one atomic SQL statement; no unrelated workflow is rewritten. A recreated ID receives a fresh
UUID revision, so stale deletes cannot remove its replacement. Reclassification and content
retrieval use one SQL snapshot rather than an unguarded metadata-check/definition-fetch pair.

Paid access comes from current SQL `entitlements`, not localStorage, public env flags, legacy
access codes, or cookie-cached paid-through claims. The runner fetches summaries first and only
the selected definition afterward. It does not prefetch all paid workflows before showing a lock.
The sidebar uses `/api/account` for its admin link/access hints; the page and API separately
resolve current roles. `NEXT_PUBLIC_ADMIN_TOOLS`, `NEXT_PUBLIC_BYPASS_PAYWALL`, and the old
localStorage access helper are retired; browser flags cannot grant access to these APIs.

## Editor, validation, and references

The optional [Workflow Wizard admin beta](workflow-wizard.md) generates new in-memory drafts
through a separately gated authoring endpoint. It does not write this catalog; acceptance hands
its draft to the same explicit, revision-checked editor save flow below. Subscriber-owned
workflow persistence remains separate/unimplemented.

- Saves are **explicit and per-workflow**, not background whole-catalog replacement. Edit several
  workflows locally if needed, but save each one. A failed load never seeds/saves an example.
- Blank/example buttons create local drafts. Checking Published only takes effect after Save.
  Free drafts stay private. Admins can preview drafts in the Run tab.
- Conflicts preserve edits instead of automatically retrying or overwriting. Use **Export draft**
  to download the current local definition before reloading/reconciling. This single-definition
  export includes curated reference bytes; protect it. The catalog importer expects an array,
  not this individual backup. Tab-close warns for unsaved changes; in-app navigation does not
  reliably trigger the browser's unload warning, so save/export first.
- Strict input schemas reject unknown fields, duplicate IDs, missing groups, unsupported image/
  video models, wrong media types, nonterminal video steps, and chains over 16 steps. PUT bodies
  are capped at 16 MiB including references; DELETE bodies at 64 KiB. References are bounded
  raster data URLs, not remote/public URLs or SVG.
- Published definitions also need a nonempty name/chain and valid template token dependencies:
  no unknown/forward variables, reserved/group/output name collisions, or unrenderable variables.
  Drafts can retain unfinished templates while the author repairs them.
- Chat model IDs are dynamically supplied by Venice, not in the static image/video registry;
  this slice bounds their strings but does not establish a server-side chat-model allowlist.
  That remains part of generation validation. A skipped optional LLM step can still leave its
  downstream token unresolved, matching existing runner semantics.
- **Curated reference assets remain inline in protected SQL definition JSON for this phase.**
  They are not public URLs and are omitted from summaries. Extracting them into a durable protected
  asset adapter is still pending. No claim is made that all personal-media storage has migrated.
- Access controls govern subsequent delivery, not DRM: someone authorized to read a definition
  can retain it. Revocation cannot erase a previously delivered browser response or export.

## Verification and remaining gates

```sh
npm test
npm run typecheck
npm run build
# Optional real production-server/browser check; needs an installed Google Chrome:
npm run test:browser
# Or select an installed Chromium-compatible executable:
BROWSER_EXECUTABLE_PATH=/path/to/chromium npm run test:browser
```

The browser smoke command builds the app, launches a separate ephemeral-port production server
against disposable synthetic SQL data, blocks provider/payment requests, and closes both afterward.
It checks summary-only dashboard loading, paid locks despite a forged browser hint, the free runner,
hidden drafts, verified-admin editing with no hydration/autosave writes, explicit draft saving,
conflict retention/export, admin draft preview, and explicit publishing/deletion. It neither imports the operator catalog nor
modifies `.env.local`; `playwright-core` uses your installed browser without downloading one.

Offline regression tests use Better Auth-issued cookies and in-memory PGlite PostgreSQL via
`pg`, not fake localStorage principals. They exercise public/admin summaries; free/paid/draft
reads; verification, expiry, revocation, role and session changes; unauthorized/cross-origin
mutations; validation/size errors; stale/concurrent saves; delete/recreate conflicts; import
rollback; missing configuration; safe errors/no-store headers; and no external traffic/logging.
PGlite's fixture uses one shared connection, so simultaneous HTTP-handler promises are serialized
by the pool. Repeat concurrency/isolation tests against real PostgreSQL before deployment.

Still pending: live NOWPayments association/contract validation, remaining production account/billing
qualification, legacy private-data API retirement/IndexedDB migration, protected asset extraction, distributed
abuse/concurrency limits, generation/SSRF hardening, proxy buffering/log review, real PostgreSQL
backup/restore and production-like auth tests, and hosting/AUP selection. This slice is not a
production-readiness or app-wide privacy claim.
