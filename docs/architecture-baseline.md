# Architectural baseline

Status: target architecture; only some protections are implemented. SQL workflow delivery,
revision-checked admin editing, and Better Auth/session policy are covered in
[`workflow-catalog.md`](workflow-catalog.md), including setup and remaining limitations.
Account UI, transactional billing/reconciliation, and interim legacy-file admin checks are covered
in [`account-billing.md`](account-billing.md); live enrollment remains disabled pending provider
association validation and deployment gates. Hosting selection is deliberately deferred. No new product features until the baseline passes
its acceptance tests. Keep Venice BYOK and the existing NOWPayments integration.

## 1. Shape of the application

Use a modular monolith: one Next.js application, one relational database, browser-local personal
content. No microservices, Kubernetes, dedicated GPU, or always-running queue worker is required
for the baseline. Venice performs inference.

```text
Browser
  ├─ versioned IndexedDB: personal media, albums, history, private conversations
  ├─ local/session preference storage: theme, optional remembered BYOK
  └─ HTTPS → Next.js
               ├─ identity/session verification
               ├─ authorization and current subscription entitlements
               ├─ curated workflow catalog and validation
               ├─ NOWPayments subscription and webhook processing
               └─ transient Venice proxy (no content persistence)
                         │
               Relational database
               accounts, sessions, entitlements, minimal billing events,
               curated workflow definitions and asset metadata
```

These are module responsibilities, not separate deployed services. Route handlers and Server
Actions are public entry points and must call the same authorization/service layer. Middleware
may improve navigation but cannot be the only access check.

### Decisions now vs. later

| Decide/build now | Defer |
| --- | --- |
| Privacy boundaries and data ownership | Hosting company, region, and plan |
| Server-enforced roles and entitlements | Hosted vs. self-managed database |
| Relational schema, migrations, transactional billing | Domain, TLS/proxy deployment configuration |
| Versioned browser storage and recovery | Email delivery vendor |
| Validated provider requests and short video status requests | Object-storage vendor for curated assets |
| Local tests using fake Venice/NOWPayments responses | Production credentials and live payment exercise |

Selected local engine: PostgreSQL. Migrations use PostgreSQL semantics; hosting portability does
not promise transparent SQL-dialect switching or two adapters. Tests use an isolated PGlite engine;
real PostgreSQL backup/restore and concurrency qualification still remain.

Selected embedded authentication library: Better Auth. It owns passwords, sessions, verification
and recovery; application code owns roles and entitlements. Account UI/lifecycle has offline and
browser coverage; production configuration and deployment qualification are still incomplete. Do not build separate password hashing or session
issuance. An embedded auth library is not itself a hosted authentication service.

Deployment requirements: a supported/patched Node.js and Next.js combination, HTTPS, outbound
Venice/NOWPayments access, reliable inbound webhooks, durable SQL, secret configuration, bounded
request bodies/timeouts, and tested database backups. Host/provider acceptable-use reviews remain
a launch gate, including adult media transmitted through the application, not only stored files.

## 2. Privacy and data lifecycle

Target: personal prompts, chats, reference images, generated media, provider keys, and signed
media URLs are not persisted on our server or included in application logs. They may pass through
our backend and Venice. This is not end-to-end encryption or a guarantee about provider retention.

| Data | Target storage/lifetime | Access |
| --- | --- | --- |
| Account identity and credentials | SQL; credentials handled by auth library | Account owner / narrowly scoped admin functions |
| Session records | SQL until expiry/revocation; scheduled cleanup | Auth library only |
| Entitlement and necessary billing facts | SQL; documented legal/accounting retention | Account owner / billing/admin service |
| Curated workflows and their reference assets | SQL plus durable asset storage | Public summaries; definitions/assets gated by free/paid/admin policy |
| Personal uploads and generated media | Request memory in transit; browser IndexedDB on save | Browser user; provider during processing |
| Personal prompts and conversations | Browser IndexedDB; transient provider requests | Browser user; provider during processing |
| Venice API key | Browser session by default; opt-in persistence design to be settled | Transient backend/provider use only; never in server database |
| Generation job handle | Prefer browser storage; expiring integrity-protected handle if needed | Bound to the requesting identity or anonymous browser capability |
| Future personal workflows | Separate owner-scoped design, not the shared catalog | Owner only; explicit admin publishing path, never automatic |

Curated catalog reference images are intentionally retained product assets, NOT customer media.
Future personal-workflow storage is not implemented in this baseline and must not silently create
an exception to the personal-content retention promise.

### Processing requirements

- Never log request/response bodies, prompts, key headers, provider error bodies, raw exception
  messages, webhook payloads, or signed download URLs. Use allowlisted error codes and aggregate
  timing/status metrics if diagnostics are needed; no session replay on creation pages.
- Return `Cache-Control: private, no-store` for sensitive API responses, including errors. Disable
  caching on sensitive upstream requests. Audit Server Actions, CDN, reverse proxy, and framework
  error handling too; application headers alone cannot control infrastructure retention.
- Stream supported binary responses. Enforce body/output size limits and concurrency limits so
  base64 buffers cannot exhaust the process. Do not create persistent temporary media files.
- Propagate aborts where supported, set timeouts, and release references on completion/failure.
  Disconnecting does not necessarily cancel a billable Venice job. No automatic paid resubmission
  after an ambiguous network failure.
- Prevent disk buffering of sensitive traffic at deployment. Review swap, crash dumps, tracing,
  and backup configuration. Deleting a disk file after delivery is insufficient if backups already
  captured it. JavaScript garbage collection is not guaranteed immediate secure memory erasure.
- API keys must not be embedded through `NEXT_PUBLIC_*` in a production bundle. Existing public
  key fallbacks must be removed. Browser storage is accessible to same-origin JavaScript, not an
  encrypted vault; XSS prevention and third-party script minimization are essential.
- Retain necessary payment facts separately from personal creation data. Document retention,
  deletion, export, and backup expiry instead of claiming absolutely no records of any kind.

Candidate privacy copy, only after verification:

> Your prompts and media pass through our server to Venice for processing. We do not persist
> them or include them in application logs. Saved creations remain in your browser.

Do not say "your images never touch our servers." Browser storage can be cleared or evicted,
provides no automatic cross-device sync, and does not hide content from others using the same
browser profile.

## 3. Identity and authorization

- Auth-library-managed, revocable sessions with HttpOnly cookies; Secure in production, appropriate
  SameSite policy, explicit expiry, rotation, logout, and account recovery.
- Origin/CSRF protection for cookie-authenticated mutations. Rate limits on login/recovery,
  subscription creation, generation, and anonymous entry points; no raw credentials in limit keys.
- Store `admin` / `user` roles server-side. Initial admin provisioned via a one-time local/admin
  command, never "first signup wins," a public environment flag, or client-supplied role.
- Keep subscription expiry out of long-lived trusted client flags. Resolve current entitlement on
  each protected operation; revocation, expiry, and role changes must take effect predictably.
- An admin can author/publish workflows and access premium features without subscribing. Admin
  status does not imply permission to retrieve users' browser-local media.
- Missing auth/database configuration fails closed on protected operations. No production bypass.

### Access matrix

| Operation | Anonymous | Signed-in, unpaid | Active subscriber | Admin |
| --- | --- | --- | --- | --- |
| Public catalog summaries | Yes | Yes | Yes | Yes |
| Published free workflow definitions/assets | Yes | Yes | Yes | Yes |
| Published premium workflow definitions/assets | No | No | Yes | Yes |
| Draft workflow definitions/assets | No | No | No | Yes |
| Curated workflow create/edit/publish/delete | No | No | No | Yes |
| Direct registered model generation with BYOK | Yes, bounded | Yes, bounded | Yes, bounded | Yes, bounded |
| Create subscription / view own billing | No | Own account | Own account | Own account |
| Browser-local albums | Preserve existing paid UI intent; never upload for authorization |
| Personal workflow authoring / wizard | Deferred product feature; separate owner namespace |

A paid browser-only feature's local UX cannot be made tamper-proof. The real paid boundary is
server delivery of protected definitions/assets/services. Subscribers can copy definitions once
delivered; this design is access control, not DRM.

The public dashboard must use a summary DTO that omits prompts, steps, references, and private
fields. Fetch full definitions by ID after authorization; never download the whole paid catalog
before displaying a lock screen. Protect reference assets as well as JSON. Runtime validation must
check registered model compatibility, option IDs, token references, chain lengths, and terminal
video placement. Use per-workflow mutations/version checks, not whole-catalog replacement.

## 4. Durable data and billing

Logical records (exact auth tables depend on the chosen library):

- Users and sessions: stable user IDs, server-side role, verified identity where applicable.
- Subscriptions: internal ID, owner user ID, unique provider subscription ID, expected plan,
  status, timestamps. Email is contact information, not proof of account ownership.
- Entitlements: owner user ID, product, paid-through timestamp, administrative revocation.
- Payment events: unique provider/payment identity, processing status, validated amount/currency,
  timestamps, associated subscription. No raw webhook JSON by default.
- Workflows: stable ID, schema version, revision, draft/published state, free/paid classification,
  category, definition, timestamps; separate minimal public summary.
- Curated asset metadata: asset ID, workflow association, media type/size, storage key, access
  classification. Avoid public URLs bypassing workflow entitlement checks.

### NOWPayments invariants

Preserve the existing recursive key sorting, HMAC-SHA512 signature verification, and timing-safe
comparison. Those are useful primitives, not evidence that the whole payment flow is safe.

1. Subscription creation requires a real authenticated account and binds the provider subscription
   to its stable user ID. Never return an existing access code to someone who only supplies email.
2. Verify webhook signatures before acting. Validate event structure, payment identity, settled
   status, expected subscription/plan, currency, and applicable paid amount against the actual
   documented provider contract. Confirm real payload shape before production.
3. Record a settled payment uniquely and extend its owner's entitlement in ONE transaction.
   Duplicate, concurrent, or out-of-order callbacks must not grant another 90 days for the same
   payment. Do not mark an earlier pending event as a processed settled payment.
4. Unknown subscriptions, transient database errors, and callbacks arriving before local signup
   persistence need a documented retry/reconciliation path. Do not acknowledge lost payments as
   successfully processed. Provider network calls and SQL cannot be one atomic transaction;
   recover/reconcile partial signup failures without duplicating subscriptions.
5. Support expiry and a documented reversal/revocation policy. Preserve minimal audit facts for
   reconciliation, not the full payment payload in logs.
6. Keep current USD45 / 90-day product terms; no live plan creation, payment submission, or secret
   rotation as part of local architecture work.

Migration of existing email/access-code records requires verified ownership; do not automatically
claim a paid record from an unverified matching email or a localStorage unlock flag.

## 5. Local content and migration

Use versioned IndexedDB stores for albums, blob media, history, conversations/rules, and migration
metadata. Separate signed-in account namespaces from anonymous device data; signing into another
account must not automatically inherit the previous user's content. Namespacing prevents accidental
mix-ups, not inspection by someone who controls the same browser profile.

Ship explicit export/import, storage error handling, and transaction-based schema upgrades before
launch. Preserve localStorage history during migration until the IndexedDB copy is verified. Never
silently truncate all history on quota errors. Handle account switching and deletion deliberately.

Existing `data/albums*`, album media, and game sessions belong to the current local operator.
Provide an explicit local-only/admin export/import path. Never seed that content into public users'
browsers or auto-import it for whichever visitor reaches a migration endpoint first. Do not delete
source data until a verified export/import exists. Then retire the global private-data APIs.

The curated catalog is a separate migration: validate definitions and import product assets into
protected durable storage. Keep a backup of the original file and record migration versions.

## 6. Generation boundary

The browser owns workflow orchestration and optional Canvas caption steps. Server generation
endpoints resolve model IDs from the server's registry and validate the associated schema; do not
trust the complete client-supplied `Model` object as an allowlist. BYOK is supplied per request.

Split Venice video submission from status retrieval so each HTTP request is bounded. Keep signed
provider URLs/queue IDs out of logs, reject tampered job handles, bind handles to their initiating
identity/capability, and require the customer's BYOK for provider requests. Establish resume/expiry
behavior; no server persistence of media or generation keys to make polling work. Short polling
intervals need backoff, rate limits, and a total job deadline.

Audit every remote-fetch route (album imports, search, image sources) for SSRF, redirects, private
network destinations, content type, output limits, and provider allowlists. No public arbitrary URL
proxy. Retire obsolete routes rather than preserving insecure compatibility indefinitely.

## 7. Delivery sequence and acceptance gates

### A — Document and establish regression tests

- Document boundaries and deferred decisions; reconcile README/TODO with source.
- Remove generation content logging and raw provider error echoes; no-store on JSON generation
  responses/upstream calls. Add fake-provider success/failure regression tests.
- This small first slice is NOT complete privacy hardening or endpoint authentication.

### B — Identity, persistence, entitlement

- Select auth library and SQL engine locally; add schema/migrations and local setup.
- Introduce session/authorization services, safe admin bootstrap, account-bound subscriptions,
  idempotent transactional billing, and tests. Upgrade vulnerable framework/runtime dependencies.
- Protect all server entry points and curated assets; remove client/admin bypasses. Exercise
  anonymous/free/paid/expired/revoked/admin access without UI involvement.

### C — Private content and generation lifecycle

- Versioned IndexedDB migration/export and removal of global personal-data routes.
- Validated generation API, no public key fallbacks, bounded video polling, request limits,
  timeout/abort handling, SSRF protections, and remaining logging/cache audit.
- Test malformed provider responses, disconnects, concurrent requests, quota failure, account
  switches, and migration rollback. Canary secrets/prompts/media must not appear in captured logs
  or server files. Repeat with the real proxy/framework, not only mocked unit tests.

### D — Deployment qualification (host chosen here)

- Confirm provider acceptable-use policies and processing/retention boundaries.
- Configure HTTPS, secrets, proxy limits/buffering, backups, monitoring, and patch ownership.
- Restore a database backup into a clean environment; exercise deploy/restart durability.
- Run authenticated endpoint tests in production-like configuration, then exercise a real
  NOWPayments subscription/webhook with explicit approval and verify duplicate delivery.
- Review privacy copy, account/content deletion, adult-content safeguards, and jurisdictional
  requirements before taking real subscriptions. An 18+ self-attestation overlay is not a
  substitute for any legally required age assurance.

Only after the baseline is verified should the Workflow Wizard or other product features resume.
