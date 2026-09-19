# FetishUI

A single web interface for generating images and videos with **Venice.ai** models — built with
Next.js and TypeScript. Every model is driven entirely from its own schema, so adding a new
model doesn't require hand-building UI for it.

## Architectural baseline (in progress)

Hosting selection is deferred while we prepare a secure multi-user foundation. Read
[`docs/architecture-baseline.md`](docs/architecture-baseline.md) for the target architecture and
[`TODO.md`](TODO.md) for the launch blockers. The current app is still a local prototype:
private browser storage migration and generation/deployment hardening remain launch blockers.

The workflow catalog now uses SQL, summary-only listings, session/entitlement-gated definitions,
and revision-checked admin editing. See [`docs/workflow-catalog.md`](docs/workflow-catalog.md) for
setup, explicit source import, admin provisioning, and limitations. Configure/migrate SQL before
using workflows; there is no JSON fallback. Account screens and transactional billing are covered
in [`docs/account-billing.md`](docs/account-billing.md). Live enrollment stays disabled pending
confirmation/implementation of NOWPayments' recurring-payment association and launch qualification.

The target is transient Venice processing plus browser-local personal content, not "images never
touch our servers." New personal albums now use account-scoped browser IndexedDB; see
[`docs/browser-albums.md`](docs/browser-albums.md) for backups and explicit legacy-file export.
Old album/game files are preserved but no longer served. Game sessions/rules now use the same
browser namespaces; see [`docs/browser-game-saves.md`](docs/browser-game-saves.md).

## Features

- 🗂️ **Multiple models, one interface** — text-to-image (Seedream V5 Pro, Ideogram V4, Krea 2
  Turbo) and Wan 2.7 text-to-video / image-to-video, grouped by category and browsable from a
  single "Models" dropdown in the navbar
- 🧩 **Schema-driven UI** — every model's inputs (prompts, images, sliders, toggles) render
  generically from its own `inputSchema`, no per-model forms
- 🪄 Disabled-by-default [Workflow Wizard admin beta](docs/workflow-wizard.md): describe, review,
  then explicitly edit/save a bounded workflow draft (live model qualification pending)
- 🔑 Venice.ai API key management, stored locally
- 🌗 Light / dark / auto theme
- 🖼️ Account-scoped IndexedDB generation history, explicit legacy import and checked backups;
  failed saves never trim old records. See [browser history](docs/browser-generation-history.md)

## Supported providers

| Provider  | What it's used for                                                       |
|-----------|--------------------------------------------------------------------------|
| Venice.ai | All image models (Seedream V5 Pro, Ideogram V4, Krea 2 Turbo) and Wan 2.7 video |

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **Language:** TypeScript
- **UI:** React 19 + Tailwind CSS + shadcn/ui (Radix primitives)
- **Current storage:** IndexedDB (account-scoped albums, game saves and generation history; device-shared batch jobs and several authoring tools), `localStorage` (API
  keys, legacy history sources, prompt templates, theme), PostgreSQL (auth, workflow catalog and
  inline protected curated references, account-bound billing facts). Album/game/subscriber-file
  APIs and access-code login are retired; original files remain untouched for explicit operator review
- **Node version:** >=22.15.0

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/flyingcorgi/hub.ai-public.git
cd hub.ai-public
```

2. Install dependencies:
```bash
npm install
```

3. Enter your Venice.ai API key in the app's "API Keys" settings panel. It is stored in your
   browser and forwarded through the backend for Venice requests. Do not put production keys in
   `NEXT_PUBLIC_*` variables: Next.js embeds those values in the browser bundle. The legacy
   public-key fallback still exists in code and is scheduled for removal.

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:4000](http://localhost:4000) to see the result.

## Verification

```bash
npm test            # Offline Node tests; fake Venice responses, no real generation or payments
npm run typecheck   # TypeScript without emitting or updating incremental build files
npm run test:browser # Optional: production build + workflow smoke test using installed Chrome
```

Regression tests cover generation privacy/error/cache behavior, SQL workflow access, real Better
Auth lifecycle, private legacy-route denial, transactional billing/reconciliation, and safe fake-provider
responses. The browser smoke also covers account signin/reset/logout, disabled enrollment, and
browser album upload/reload/picker/backup/import/account separation. Use `npm run test:albums`
for focused album-storage checks rather than rerunning the whole suite during incremental edits.
These do not replace live provider-contract validation, browser migrations, real-PostgreSQL
concurrency, and deployment qualification.

## Project Structure

```
src/
├── app/
│   ├── flux/[model-id]/       # Single-model generation page
│   ├── batch/seedream-edit/   # Batch Automation tool (currently hidden from the navbar)
│   └── api/batch-generate/    # Route handler for concurrent batch generation
├── components/
│   ├── batch-seedream/        # Batch Automation UI + generic parameter renderer
│   ├── image-generator/       # Single-model generation UI
│   └── ui/                    # shadcn/ui primitives
└── lib/
    ├── models/                # Per-model schema definitions, grouped by provider
    │   └── nav-groups.ts      # Single source of truth for navbar/homepage model grouping
    ├── actions/                # Server action for Venice.ai generation
    └── types.ts                # Shared Model / ModelParameter / Generation types
```

## Adding a new model

Drop a new file in `src/lib/models/<provider>/`, exporting a `Model` object with an `id`,
`mediaType`, `inputSchema`, and `outputSchema`. Register it in `src/lib/models/registry.ts` and
add its id to the relevant group in `src/lib/models/nav-groups.ts`. No UI code required — the
single-model page and Batch Automation render its fields generically.

## Data backup

Batch templates, saved prompt templates, and generation history live only in
the browser (IndexedDB/localStorage) — they aren't part of the app's source. See
[`backup/README.md`](backup/README.md) for a point-in-time export of that data and how to restore
it.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
