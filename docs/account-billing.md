# Accounts and transactional billing

This is a tested local baseline, **not permission to accept payments or open a public beta**.
Hosting remains deferred. The recurring-payment → subscription association is still unconfirmed;
new enrollment is disabled by default. Albums now use browser IndexedDB; see
[browser-albums.md](browser-albums.md) and [browser-game-saves.md](browser-game-saves.md).
History now uses scoped IndexedDB too; see [browser-generation-history.md](browser-generation-history.md).
Other legacy browser-tool stores still require migration.

## Accounts

1. Configure SQL/auth and run `npm run db:migrate` as described in
   [workflow-catalog.md](workflow-catalog.md). Migration `004_transactional_billing.sql` adds
   contact snapshots, explicit payment bindings and reversal facts. Do not edit applied migrations.
2. Configure an operator-owned local SMTP capture service (for example Mailpit on port 1025),
   `SMTP_HOST`, `SMTP_FROM`, and `AUTH_ALLOW_SIGNUP=true`. Otherwise signup stays closed.
3. Visit `/account`, create an account, follow the email verification link, then sign in.
   Registration never chooses the admin role; promotion remains the explicit CLI operation.
4. Recovery sends a link to `/account/reset-password`. Completing a reset revokes all existing
   sessions. Signout revokes the current session. Passwords use Better Auth, not custom hashing.

Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. Sessions expire after seven days;
protected operations query current SQL identity/role/entitlements rather than cached cookie
claims. Auth POSTs require the configured exact Origin, JSON and a bounded 16 KiB body. Better
Auth uses SQL-backed abuse limits, including stricter sensitive-endpoint limits. Deployment
must strip client-supplied `x-real-ip` and set it at the trusted proxy; distributed/load and email
abuse qualification remain outstanding. SMTP failures are not logged with tokens or credentials.

The client shares `/api/account` through AccountProvider, refreshes on focus and every minute,
and broadcasts **invalidation only** across tabs after signin/reset/signout. Identity/access changes
remount in-memory views. Server authorization does not wait for those UI refreshes. Albums use
account/device namespaces and close old storage handles on identity changes, as do game saves
and generation history. API keys and other legacy tool stores are **not yet all account-namespaced or erased on logout**;
use separate browser profiles on shared machines. Album/game APIs now return 410; new game
sessions/rules and embedded image messages also use browser namespaces. Original server files
remain untouched for explicit operator export/review.

Reset tokens are held in component memory and removed from the visible URL/history entry after
loading. Account pages and auth redirects use no-referrer policy. This does not remove the need
to disable sensitive request URL/body logging in the proxy/framework, including reset/verification
callback URLs. Do not install session replay or analytics capturing these pages.

## Billing state and API

Terms remain **USD45 per 90 days**, with Venice BYOK charges separate. Enrollment only requests
provider payment emails; it does not grant access or debit a wallet automatically.

| Endpoint | Contract |
| --- | --- |
| `GET /api/account` | Current principal/access, or anonymous. No session secrets. |
| `GET /api/account/billing` | Verified session; own subscription status/support IDs only. No provider IDs, access codes or another user's records. |
| `POST /api/nowpayments/subscribe` | Verified session, exact Origin, JSON `{}` only (1 KiB max). Owner/email come from SQL identity; plan/amount come from server configuration. |
| `POST /api/nowpayments/ipn` | Bounded JSON (64 KiB), recursive sorted HMAC-SHA512, timing-safe signature comparison. No cookies or guessed ownership. |
| `POST /api/nowpayments/verify` | 410: access-code login is retired. Never reads old subscriber files. |
| `POST /api/nowpayments/setup-plan` | 410: public plan creation is retired. Use operator-owned provider configuration. |

Handled account/billing/auth responses, including failures, are private/no-store. Provider
requests use no-store, redirect rejection, 15-second timeouts and bounded responses. Raw provider
errors/JSON and credentials are never returned or logged by the adapter.

### Provider contract checkpoint — do not enable live enrollment yet

The adapter implements the contract shape reviewed during the preceding integration work:
subscription/plan responses are wrapped in `result`; subscription creation obtains a short-lived
bearer token via `/auth` and sends it alongside `x-api-key` to `/subscriptions`. The merchant's
server-only `NOWPAYMENTS_ACCOUNT_EMAIL` and `NOWPAYMENTS_ACCOUNT_PASSWORD` are distinct from the
customer account. Tokens are not persisted and provider POSTs are never automatically retried.

**Offline fixtures validate our implementation, not the live provider contract.** Before launch,
confirm the current schemas/auth requirements with NOWPayments and obtain a redacted real recurring
payment notification or written support confirmation identifying the authoritative subscription
link. Do not guess `subscription_id`, `order_id`, email or plan aliases. Matching amount/email is
not proof of ownership. Any additional merchant authentication/MFA requirements also need validation.

`NOWPAYMENTS_ENROLLMENT_ENABLED=false` is the safe default. Merely setting it to true does **not**
implement automatic payment association. Keep it false until that association is implemented and
tested, reconciliation operations are ready, and deployment/payment acceptance gates pass. The
flag plus all merchant/plan/callback settings are required to enable even the enrollment scaffold.
No operator `.env.local` settings are changed by tests.

### Enrollment and reconciliation

- SQL records a unique `(user_id, plan_id)` intent **before** provider calls. The plan is checked
  against expected amount, currency, interval and exact HTTPS callback. Its terms are snapshotted;
  changes must never silently reprice existing records.
- A lost response/crash/mismatch leaves `needs_reconciliation` (or an old `creating` intent shown
  as needing review after five minutes). Repeated requests cannot create another enrollment.
  `active` means enrolled with the provider, **not paid**. No automatic reset or retry of a provider
  mutation is allowed after ambiguity.
- Unknown final payments return retryable 503, not successful acknowledgement. Intermediate
  statuses are acknowledged without grants; unsupported final shapes/terms return 422 for review.
  Provider retry timing/exhaustion is unconfirmed: an operator must check provider records for
  missed callbacks. No raw webhook JSON is retained as a fallback queue.
- The current reconciliation path is **local/operator-only**. First independently confirm the exact
  subscription/payment relationship using provider-owned records or support, then explicitly run:

  ```sh
  npm run billing:reconcile -- subscription '<local-subscription-id>' '<provider-subscription-id>' --confirm-provider-link
  npm run billing:reconcile -- payment '<local-subscription-id>' '<provider-payment-id>' --confirm-provider-link
  ```

  These commands contact NOWPayments to read facts and mutate SQL; they are not offline tests.
  Never run them casually against live data. The confirmation is an operator assertion, not
  automated proof. Payment bindings cannot be moved to another subscription. Existing email/code
  records are not automatically imported or claimed; preserve original files and verify ownership
  through an explicit migration/review before granting anything.

### Settlement and reversal invariants

Only bound `finished` payments with matching USD price and a positive, fully paid crypto quote
can grant. Comparisons use fixed-point decimal units; unsafe numeric provider IDs are rejected.
A transaction locks the owner's user row, deduplicates payment ID, records minimal payment facts,
and extends access by 90 days from `max(now, paid_through)`. A duplicate cannot extend it twice;
a SQL failure rolls back both the binding/grant and payment record. Enrollment itself grants nothing.

A `refunded` event is terminal. It records reversal facts and conservatively suspends all paid
access pending operator review rather than blindly subtracting days. A late `finished` event
cannot regrant the refunded payment, and new payments do not clear administrative/refund revocation.
There is no public revocation-clear endpoint. A final operator policy and audited review procedure
are required before launch. Necessary billing facts remain SQL data; privacy copy must not claim
that the app retains no records at all.

## Verification

```sh
npm test             # Fake gateway/provider responses, real library-issued sessions, disposable SQL
npm run typecheck    # Run serially with builds
npm run test:browser # Production build + installed Chrome + disposable SQL, no live provider calls
```

Tests cover account signup/verification/recovery/reset/logout, reset-token/session expiry, role injection,
rate limits, cookie flags, Origin/body rejection, and private legacy-route denial for anonymous and
paid accounts. Billing covers owner-scoped summaries, duplicate enrollment/settlement, ambiguous
provider results, explicit reconciliation, signed/unknown/intermediate notifications, malformed
money/IDs, rollback, immutable payment binding, refunds and out-of-order events. Captured application
logs must be empty. Browser checks exercise real signin/reset/logout and cross-tab invalidation,
closed signup, disabled enrollment, and the existing workflow access/editor smoke.

PGlite uses a serialized SQL connection; simultaneous promises test application retry semantics,
**not real PostgreSQL multi-connection isolation**. Before deployment, repeat concurrency tests on
PostgreSQL, qualify HTTPS/proxy/mail/abuse behavior, perform backup/restore and migration checks,
validate the real provider association/retry/refund contract, then obtain explicit approval for a
small live payment test. Private content migration, generation/SSRF limits and infrastructure
privacy checks remain separate blockers in [TODO.md](../TODO.md).
