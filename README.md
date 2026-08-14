# Hub.AI

A single web interface for generating images and videos across multiple AI providers —
**FAL.AI**, **WaveSpeed**, **Replicate**, and **BytePlus** — built with Next.js and TypeScript.
Every model is driven entirely from its own schema, so adding a new model doesn't require
hand-building UI for it.

## Features

- 🗂️ **22+ models, one interface** — text-to-image, image-to-image, image-to-video, text-to-video,
  avatar/lipsync generation, and upscaling, grouped by category and browsable from a single
  "Models" dropdown in the navbar
- 🧩 **Schema-driven UI** — every model's inputs (prompts, images, audio, sliders, toggles) render
  generically from its own `inputSchema`, no per-model forms
- ⚙️ **Batch Automation** — queue up to 50 prompts/jobs against any single model, with adjustable
  concurrency, save/load reusable templates, and a JSON payload editor for power users
- 🔗 **Workflows** *(WIP)* — chain models together into a pipeline where one node's generated
  image feeds directly into the next node's input, with save/load templates for the whole chain
- 🔑 Per-provider API key management, stored locally
- 🌗 Light / dark / auto theme
- 🖼️ Local generation history with an IndexedDB-backed gallery (handles large image/video payloads
  without hitting `localStorage` quota limits)

## Supported providers

| Provider  | What it's used for                                       |
|-----------|------------------------------------------------------------|
| FAL.AI    | Seedream, Qwen Image, Topaz upscaling, Pixverse, LongCat    |
| WaveSpeed | Seedream Edit/Pro, GPT Image 2 Edit, Wan i2v, Grok Imagine, Seedance, Multitalk, Infinitetalk |
| Replicate | Seedream 4.5                                                |
| BytePlus  | Seedream Edit                                               |

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack)
- **Language:** TypeScript
- **UI:** React 19 + Tailwind CSS + shadcn/ui (Radix primitives)
- **Storage:** IndexedDB (batch jobs, templates, workflows, generation history) + `localStorage`
  (API keys, prompt templates, theme)
- **Node version:** >=20.0.0

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

3. Add API keys for whichever providers you plan to use. You can either set them as environment
   variables in `.env.local`, or enter them directly in the app's "API Keys" panel (stored in
   your browser, never committed):
```env
NEXT_PUBLIC_API_KEY=your_fal_api_key
NEXT_PUBLIC_WAVESPEED_API_KEY=your_wavespeed_api_key
NEXT_PUBLIC_REPLICATE_API_KEY=your_replicate_api_key
NEXT_PUBLIC_BYTEPLUS_API_KEY=your_byteplus_api_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) to see the result.

## Project Structure

```
src/
├── app/
│   ├── flux/[model-id]/       # Single-model generation page
│   ├── batch/seedream-edit/   # Batch Automation tool
│   ├── workflows/             # Workflows builder (WIP)
│   └── api/batch-generate/    # Route handler for concurrent batch/workflow generation
├── components/
│   ├── batch-seedream/        # Batch Automation UI + generic parameter renderer
│   ├── workflows/             # Workflow node chaining UI
│   ├── image-generator/       # Single-model generation UI
│   └── ui/                    # shadcn/ui primitives
└── lib/
    ├── models/                # Per-model schema definitions, grouped by provider
    │   └── nav-groups.ts      # Single source of truth for navbar/homepage model grouping
    ├── actions/                # Server actions per provider (FAL, WaveSpeed, Replicate, BytePlus)
    └── types.ts                # Shared Model / ModelParameter / Generation types
```

## Adding a new model

Drop a new file in `src/lib/models/<provider>/`, exporting a `Model` object with an `id`,
`mediaType`, `inputSchema`, and `outputSchema`. Register it in `src/lib/models/registry.ts` and
add its id to the relevant group in `src/lib/models/nav-groups.ts`. No UI code required — the
single-model page, Batch Automation, and Workflows all render its fields generically.

## Data backup

Batch templates, workflow templates, saved prompt templates, and generation history live only in
the browser (IndexedDB/localStorage) — they aren't part of the app's source. See
[`backup/README.md`](backup/README.md) for a point-in-time export of that data and how to restore
it.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
