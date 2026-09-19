# Workflow landing template

Preview: `/discover` (no database needed). Published SQL workflow: `/discover/<workflow-id>`.
Run `npm run dev`, then open `http://localhost:4000/discover`.

This is a non-graphic, outcome-led template, not a launched sales campaign. It reuses only the
public workflow name/description/access classification. Missing, invalid and unpublished IDs
return 404. It never reads definitions, prompts or curated reference images. SQL is read-only;
there is no filesystem fallback. Pages are noindex until copy/examples and launch gates are reviewed.
The existing home page and billing controls are unchanged.

## Page structure

1. One workflow, one headline, one primary action into the existing runner.
2. Clearly labeled illustration slots for future approved example images—not fabricated results.
3. Three steps: choose workflow → set up Venice → create.
4. Membership versus generation costs, with a link to current billing availability.
5. In-place key setup and short expandable answers. No Wizard expertise required.

Customize `src/components/workflows/workflow-landing.tsx`; keep copy specific to the workflow's
actual capabilities. The demo is sample copy, not an existing catalog entry. Published names and
descriptions come from SQL, but this slice has not reviewed or rewritten the operator's catalog.
Only use approved, non-graphic examples with permission to publish them. Do not promote protected
reference images into marketing assets. Before advertising, review every page for fit: this first
layout assumes a photo-oriented workflow, not every possible caption/chat/video chain.

## Lower-friction Venice setup

The shared `VeniceApiKeyField` now puts three plain-language steps and a direct new-tab settings
link before the paste field. Existing Settings and inline dialogs reuse this copy. Keys are still
saved only on explicit Save; no automatic clipboard read, provider validation, generation or
account creation. The button does not claim a validated connection. No engineering bypass of
Venice's signup, billing or API-eligibility requirements is attempted.

Venice and membership charges stay visible before the CTA. Do not add fake scarcity, testimonials,
unlimited-generation claims, or promise the admin-only Wizard as a subscriber feature. The
current membership is $45/90 days; keep this template consistent if billing changes. Enrollment
remains gated. Post-login/payment return-to-workflow routing is a future slice, not implemented.

## Verification

`npx tsx --test tests/workflow-access.test.ts` checks exact summary fields, hidden drafts and
unpublishing against disposable SQL. `npm run typecheck` checks the page and shared setup UI.
A focused development-server Chrome check covered 1440px/375px layouts, inline setup, synthetic
key saving without generation, and page errors. No production build or paid inference was run.
The root layout still requests Google Fonts; this template does not establish app-wide absence
of external requests or tracking. Existing global privacy/launch blockers remain unchanged.
