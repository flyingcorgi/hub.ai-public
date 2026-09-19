# Workflow Wizard — internal admin beta

This is a deliberately bounded first authoring slice, not the subscriber-owned Workflow Wizard
product or permission to launch. Work began at the user's request while §1 hardening remains
open. Existing billing, request/SSRF, operational privacy and deployment blockers are unchanged.

## Enable locally

In your server configuration (`.env.local` for local development), set:

```dotenv
WORKFLOW_WIZARD_ENABLED=true
WORKFLOW_WIZARD_MODEL=<verified-available-Venice-text-model-id>
```

The committed example keeps the flag **false** and leaves the model empty. There is deliberately
no paid/premium default. Choose a Venice text model that supports OpenAI-style `json_object`
responses, verify its current price/privacy classification, and restart Next. Model availability
and output quality have **not** been qualified with live inference in this slice.

Sign in as a verified administrator and open **Workflow Designer → Design → Workflow Wizard ·
Beta**. Supply a Venice key through the existing browser key setup; the server uses only the key
in this explicit request, never an environment fallback. Do not put real keys in source files.
The existing browser key store is device-shared, not account-encrypted storage.

1. Describe a workflow in 12–4,000 characters. Choose 1–4 maximum steps; video is opt-in.
2. Click **Generate draft**. This makes **one paid Venice text request**, not a media generation.
3. Review the proposed inputs, chain, prompts, model names and indicative running costs.
4. Click **Open draft in editor** to create a new, unsaved local editor draft. Other drafts remain.
5. Edit/export it, then explicitly **Save** to retain it in the shared admin catalog. It defaults
   to paid/unpublished; changing Published and saving is a separate deliberate act.
6. Test-run it separately with a suitable input image. Every media step may incur its own charge.

Missing-key setup preserves the description and does not submit automatically. Failed authoring
preserves the description and any previous preview. Generating another draft is another explicit
paid call. Navigation/account changes can discard in-memory previews; opening one in the editor
makes its existing export and unsaved-change warning available. No draft autosave is implemented.

## Budget-conscious model qualification

Run `npm run wizard:qualify` for a **free, unauthenticated public catalog check**. It lists online
text models advertising response-schema support, with privacy labels and raw catalog USD rates,
sorted by output rate then input rate. Missing/invalid capability or price metadata is excluded.
Catalog schema support does **not** prove the Wizard's `json_object` mode works; provider privacy
labels are not an independent retention audit. Rates are not an actual request-cost quote.

The public check on 2026-09-15 listed `qwen3-5-9b` as the lowest-output-rate candidate, labeled
`private` (raw input/output USD rates: 0.10/0.15). This is a candidate, **not a qualified default**.
Recheck the live catalog and current provider pricing before use.

For the separate opt-in smoke test, supply `VENICE_API_KEY` securely in the process environment
(not a command-line literal or committed file), choose `WORKFLOW_WIZARD_MODEL`, then run:

```sh
WORKFLOW_WIZARD_MODEL=qwen3-5-9b npm run wizard:qualify -- --live
```

`--live` explicitly authorizes **one paid text request** for a fixed landscape-watercolor draft,
with one maximum workflow step and no video. The tool rechecks catalog eligibility, uses the
same bounded provider call/compiler as the app, and reports structural success only. It never
runs media steps, retries, writes to SQL, prints draft content or enables the beta. A failed live
request may still be charged. The operator CLI does not exercise app auth/rate limits or establish
visual quality, current account access, exact billing or downstream privacy compliance.

Offline coverage: `npx tsx --test tests/workflow-wizard-qualification.test.ts`.

## Current supported subset

- A user-uploaded starting image, up to four linear steps, six groups and six choices per group.
- Choices, free-text and toggle groups. Each group is available to step templates through its
  lowercase hyphenated name, plus `{{options}}` and `{{custom}}`.
- Registry-backed image edits using the latest pipeline image or original upload.
- Browser-canvas captions (no model call), with editable text/style in the runner.
- An opt-in terminal image-to-video step using a registered image-input video model.

No reference-image attachments, remote fetch tools, arbitrary parameters, LLM substeps, generated
scripts, branching, loops, personal-workflow persistence or automatic running. The manual editor
still offers its broader existing capabilities; wizard limits do not become app-wide execution
limits once an administrator edits a draft.

## API and privacy boundary

`POST /api/workflow-wizard` requires a current verified admin session, exact same Origin and a
configured feature flag/model. The JSON body is bounded to 16 KiB and strictly validates
`description`, `maxSteps`, `allowVideo`, `apiKey`; clients cannot choose the authoring model.
The route rechecks admin access after inference. It has **no catalog write path**.

The upstream call targets a fixed Venice URL, refuses redirects, disables fetch caching, requests
nonstreaming JSON with a 3,500-token output cap, and aborts at 45 seconds or client cancellation.
Response reading is capped at 64 KiB. No automatic retries or model-based repair loop are used.
Timeout/cancellation cannot guarantee Venice stopped computation or will waive the charge.

A separate strict blueprint compiler rejects unsupported fields, fabricated/wrong-media models,
references, excess steps/options, invalid token dependencies, duplicate IDs, invalid group inputs
and nonterminal/unapproved video. Publish-quality structural validation runs **before** returning
a freshly identified unpublished draft. AI output cannot set catalog IDs, access or publish flags.
Validation establishes structural runner compatibility, not visual quality or truth of model prose.

Errors are application-authored and no-store; parser/provider bodies, prompts and keys are not
logged or echoed as errors. Successful drafts necessarily return generated prompts to the caller.
Only the description/constraints and static capability instructions are sent to Venice: no albums,
existing catalog definitions, reference media or prior chat. This does not establish downstream
zero retention or cover framework/proxy request buffering/logging.

The interim limiter permits one active request per account, two per server process, and at least
30 seconds between starts for an account. It stores only transient identity/timing state. It is
**not distributed** and resets on process restart; replace/qualify it before subscriber/public use.

## Focused verification

- `npm run test:wizard`: compiler and fake-provider tests plus existing real Better Auth/SQL
  workflow access tests. Covers limits, safe errors/cancellation, no automatic provider retries,
  authorization/origin/flag checks, cooldown, role revocation during inference and zero DB writes.
- `npm run test:browser:wizard`: one production build, disposable SQL, real admin session, fake
  browser authoring response. Checks mobile dialog layout, key setup without submission, review,
  invalid-draft preservation, keeping old editor drafts, explicit save and unpublished defaults.
- After a current build, `BROWSER_SMOKE_ONLY=wizard npx tsx tests/browser/workflows.smoke.ts`
  reruns just that browser slice. Do not rebuild or run unrelated full suites for every small edit.

These tests use synthetic credentials and make no real Venice/payment calls. Full legacy editor
mobile layout, real model quality/cost/privacy, subscriber ownership, distributed abuse controls
and the existing launch gates remain separate work.
