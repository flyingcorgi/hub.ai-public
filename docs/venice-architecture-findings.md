# Findings from Venice's public architecture and privacy documentation

Research snapshot: 2026-09-12. This is a public-documentation review, not an independent audit
of Venice's production servers. The unauthenticated public model catalog was queried; no account,
API key, paid generation, user content, or payment was used. No application behavior was changed.

## Executive findings

Venice's useful pattern is **separate identity/billing from inference content**: keep account and
operational records, keep ordinary conversation history on the device, and relay inference through
a content-nonretaining proxy. That resembles our baseline, but it does NOT support a blanket
statement that all Venice models/providers retain nothing or that nothing ever reaches storage.

Most important for FetishUI:

1. Venice has publicly named managed authentication vendors; self-hosted auth is a choice, not an
   inherent requirement for this product category.
2. Several models currently registered here are **anonymized**, not **private**, in Venice's live
   catalog. Privacy needs a model-aware policy and UI, not a provider-wide promise.
3. Video has an explicit storage/download/cleanup lifecycle. Our current action does not request
   provider deletion after a successful download.
4. Device-local history needs persistence warnings and recovery. Venice handles portability with
   opt-in encrypted sharing/backups, not ordinary plaintext cloud synchronization.

## 1. Proxy plus device-local history

Sources: [current API privacy guide][privacy], [2024 architecture post][architecture],
[2025 privacy explanation][blog], [current FAQ][faq].

Venice describes ordinary requests as:

```text
Browser with local conversation history
   → HTTPS Venice proxy
   → selected provider/GPU infrastructure
   → response through proxy back to browser
```

The proxy does not store/log ordinary prompt and response content. The selected model's runtime
privacy determines what happens downstream. A proxy that hides account identifiers cannot remove
personal information the user deliberately puts inside a prompt or image.

The FAQ says ordinary history is not automatically available on another browser/device and offers
a "Persist Storage" control. Older architecture posts also claim encrypted local history, but do
not establish the current browser database schema or encryption-key lifecycle. One older post uses
both "encrypted" and "plain text" descriptions of local storage; do not infer a cryptographic
security guarantee or a specific IndexedDB implementation from that prose.

**Adopt:** versioned IndexedDB, explicit save/delete/export/import, browser-persistence requests
where supported, quota handling, and clear device-local/account-switching behavior. If we add
local encryption, specify who holds the key and what attacks it prevents. Same-origin malicious
JavaScript can generally access content while the application is unlocked.

## 2. Authentication is independent of private history

The February 24, 2025 [privacy post][blog] states: "For email authentication we use Clerk.io and
for web3 logins, we utilize Wallet Connect"; it also names Customer.io for email marketing and
Stripe for card payments. Preserve the date and wording: this is a published vendor statement,
not a verified description of every current production component or an endorsement of those
vendors for our business.

The current [privacy policy][policy] describes email-based accounts, wallet-based accounts, and
third-party sign-in such as Apple, Google, and Discord. The current FAQ documents password changes,
account deletion, 2FA, and wallet session expiration. It does not disclose database topology,
server session storage implementation, framework auth internals, or token-signing algorithms.

**Adopt:** maintained authentication software, standard account recovery, optional/required-by-role
MFA, and account IDs separate from content. Managed auth remains an option subject to current AUP
and privacy review; no need to assume an adult site must operate its own auth servers. Keep
NOWPayments for our product. Do not infer that Venice's vendor relationships grant us permission
under the same vendors' policies. Wallet login is not required just because payments use crypto.

## 3. Model privacy is not uniform — direct impact on this repo

Sources: [privacy modes][privacy], [public model catalog][models], [TEE/E2EE guide][tee].

| Mode | Documented meaning |
| --- | --- |
| Anonymous / `anonymized` | Venice hides the customer's Venice identity from the provider; provider can see content and its retention policies apply |
| Private / `private` | Inference-only processing on Venice-controlled or zero-data-retention partner infrastructure; trust/contract based |
| TEE | Hardware-isolated inference with attestation; plaintext may still pass through the client-to-proxy API path |
| E2EE | Client encrypts to an attested enclave; Venice relays ciphertext; requires actual client-side protocol implementation |

TEE/E2EE are currently documented as available on **text models only**. Selecting a model name
or using HTTPS is not equivalent to client-side E2EE.

The live `/models?type=all` response reported these classifications at research time:

| Model used by this repo | Venice `model_spec.privacy` |
| --- | --- |
| `seedream-v5-pro` | `anonymized` |
| `seedream-v5-pro-edit` | `anonymized` |
| `ideogram-v4` | `anonymized` |
| `wan-2-7-text-to-video` | `anonymized` |
| `wan-2-7-image-to-video` | `anonymized` |
| `claude-sonnet-5` | `anonymized` |
| `krea-2-turbo` | `private` |
| `kimi-k3` | `private` |
| `venice-uncensored-1-2` | `private` |

Our multi-edit model ID maps to Venice's `seedream-v5-pro-edit`; it is not a separate privacy mode.
These are observed classifications, not perpetual guarantees. Recheck the registry before release.

Current code implications:

- `src/app/api/venice-models/route.ts` reduces model entries to ID/name, dropping privacy metadata.
- `src/lib/types.ts` has no model privacy field.
- `src/lib/venice-client.ts` defaults chat to `claude-sonnet-5`, observed as anonymized.
- Existing paid editing workflows depend on anonymized models. Silently changing the default model
  is not a complete fix and may change behavior/cost.

**Adopt:** preserve privacy/capability metadata, show model-specific disclosures, validate against
server-side metadata, treat unknown classification as unknown (not private), and explain the least
protective stage in a multi-step workflow. A privacy-only mode would need compatible models for
EVERY inference step. That is a product decision, not implemented by this research.

## 4. Video is temporary storage, not a purely memory-only response

Sources: [video guide][video], [retrieve schema][retrieve], [complete schema][complete],
[current privacy policy][policy].

Venice documents async video submission and retrieval. `/video/retrieve` supports
`delete_media_on_completion`, defaulting to **false**. `/video/complete` is documented in its
endpoint schema as deleting a generation after successful download.

Some private video models return a `download_url` once at queue submission. Their guide says:

- The URL is short-lived, valid up to 24 hours or until object removal.
- It is a delivery link, not permanent hosting; retries and source-network changes are limited.
- `DELETE` on that URL can revoke it without a separate API-key header.
- Download, save, then delete is the recommended privacy-sensitive flow.

The privacy policy explicitly permits temporary generated-video storage until download. For the
specific likeness-processing flow it also describes per-upload consent, minimal consent metadata,
temporary upload deletion within one hour, and BytePlus deletion after generation. Do not apply
that one-hour claim to all videos or all media models.

Current `src/lib/actions/generate-venice.ts` polls/retrieves media but neither sets automatic cleanup
nor calls the completion endpoint. For URL-backed results it returns the URL without ensuring a
browser-local blob copy. We therefore must not claim successful delivery implies provider deletion.

**Adopt:** short submit/status requests; private browser storage of job handles; fetch results into
local blobs; acknowledge successful browser receipt/save before requesting cleanup; retry cleanup
safely and show unresolved status. Account for disconnects and failed local writes. Deleting when
our backend finishes receiving the response can lose the only retrievable copy before the customer
actually receives it. Bound any endpoint that accepts provider URLs to avoid creating an SSRF proxy.

## 5. No content logs is different from no records

Sources: [operational metadata section][privacy], [privacy policy][policy].

Venice documents metadata for authentication, billing, reliability, rate limits, analytics, support,
and abuse prevention: account/wallet/API-key identifiers, request times, model/endpoint, token
counts, billing amounts, IP/device information, and product events. The legal policy also describes
analytics services and third-party tracking technologies. Do not describe Venice as retaining
absolutely no user information or having no analytics.

**Adopt:** minimal necessary account/entitlement/payment records and bounded operational diagnostics,
without content, credentials, raw errors, or download URLs. Our workflow IDs/categories may themselves
reveal sensitive interests, so we should not blindly copy every model/event metric. Prefer aggregate
counters and documented retention. BYOK means we do not need a duplicate content-linked generation
billing ledger; Venice bills that usage.

## 6. Backups and sharing are explicit encrypted exceptions

Sources: [encrypted-backup FAQ][backups], [2025 post][blog].

Venice's FAQ describes a Pro web feature that encrypts a backup on the device using a password
controlled by the user, chunks and uploads the ciphertext, and restores/merges it on another
logged-in device. It states a limit of five concurrent backups, 90-day expiry, and no recovery if
the password is lost. Shared text chats likewise use encrypted links with limited lifetime; the
older post describes 14 days and keys held in the shared URL, while the current FAQ only says
limited time.

**Adopt now:** explicit local export/import and storage warnings. **Defer:** encrypted cloud backup
and sharing until after the baseline. Those features would intentionally store ciphertext and
require honest exceptions to a "nothing is stored" promise, plus reviewed crypto/key-management.
Never imply backups are ordinary plaintext history stored against the login account.

## 7. BYOK should use least-privilege credentials

Source: [Venice API-key guidance][keys].

Venice recommends Inference Only rather than Admin keys, with optional expiration and 24-hour
consumption caps. Key secrets are displayed once; management UI shows identifying metadata later.
Account balance and per-key spending permission are separate: HTTP 402 can mean a key spending cap,
not simply an empty account.

**Adopt:** onboarding that requests an app-specific Inference Only key and recommends an expiry/
spend cap. Never request the customer's Admin key. Do not log keys or embed them in public build
variables. Explicitly explain that their entered BYOK exists in the browser and is transmitted
through our backend, unlike a secret application-owner key stored only on a server.

## 8. Documentation limits and contradictions to resolve

- The current privacy policy broadly describes zero-retention arrangements with model providers,
  while current privacy-mode docs warn that anonymized-model providers may retain content. Use
  the narrower model-specific disclosure until Venice clarifies the relationship in writing.
- General no-storage claims have documented video, consent-flow, encrypted-sharing, and backup
  exceptions. Older 2024/2025 blog posts predate the expanded model catalog and current modes.
- The docs index describes `/video/complete` as a queue-and-wait operation, but its actual endpoint
  reference/OpenAPI and video guide describe deletion. Follow the specific endpoint contract and
  verify with approved integration tests before implementing destructive cleanup.
- The [prompt-caching guide][caching] describes provider-dependent caches lasting minutes (or longer
  for some providers). It does not fully reconcile every caching mode with every privacy label.
  HTTP `no-store` in our proxy does not disable a model provider's inference/KV caching.
- Public documentation does not establish Venice's actual database product, host, exact session
  cookie design, local-encryption key handling, or deletion verification inside partner systems.
  Do not invent those implementation details or treat these findings as an independent audit.

## Recommended baseline adjustments (not implemented here)

1. Keep hosting deferred and retain the modular-monolith/browser-local plan.
2. Evaluate managed auth alongside an embedded auth library; Venice's example supports evaluating
   vendors rather than assuming all hosted auth is incompatible with adult products.
3. Treat per-model privacy metadata and multi-step disclosure as baseline requirements.
4. Add explicit provider-side video cleanup after confirmed receipt, with documented failure paths.
5. Build reliable browser persistence/export before considering encrypted cloud sync.
6. Keep server content-nonretention separate from upstream model retention and necessary account
   records in both architecture and marketing copy.
7. Ask Venice for current retention and consent requirements specifically for Seedream edits and
   Wan 2.7 before publishing stronger privacy guarantees for those workflows.

[privacy]: https://docs.venice.ai/overview/privacy
[architecture]: https://venice.ai/blog/venice-ai-privacy-architecture
[blog]: https://venice.ai/blog/how-venice-handles-your-privacy
[policy]: https://venice.ai/legal/privacy-policy
[faq]: https://venice.ai/faqs
[backups]: https://venice.ai/faqs#how-do-encrypted-backups-on-venice-work
[models]: https://api.venice.ai/api/v1/models?type=all
[tee]: https://docs.venice.ai/guides/features/tee-e2ee-models
[video]: https://docs.venice.ai/guides/media/video-generation
[retrieve]: https://docs.venice.ai/api-reference/endpoint/video/retrieve
[complete]: https://docs.venice.ai/api-reference/endpoint/video/complete
[keys]: https://docs.venice.ai/guides/getting-started/generating-api-key
[caching]: https://docs.venice.ai/guides/features/prompt-caching
