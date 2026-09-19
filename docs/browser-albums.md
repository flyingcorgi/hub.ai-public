# Browser-only personal albums

## What is local, and what is not?

| Data | Current storage |
| --- | --- |
| New personal album images + names/tags/prompts | Browser IndexedDB, separate account/device namespaces |
| Generation history | Scoped IndexedDB; explicit legacy import and checked backups ([contract](browser-generation-history.md)) |
| API keys and other scratch-tool content | Existing browser stores; not all account-namespaced yet |
| Game sessions/rules, including embedded image messages | Account-scoped browser IndexedDB; old server files preserved but no longer served |
| Curated administrator-published workflow references | Intentionally retained server-side with SQL workflow access checks |
| Accounts, subscriptions, payment facts | Server SQL |

Album saving does **not** upload personal files to the app server. Selecting an album reference
converts its Blob to a data URL in the browser; generation still transmits those bytes and the
prompt through Next.js to Venice. Administrator publishing is an explicit, separate act that
retains curated references on the server. Neither browser storage nor this change establishes
Venice/downstream retention guarantees or app-wide zero retention.

Original operator `data/albums.json`, `data/album-items.json`, and `data/album-media/` files are
preserved on disk. Nothing silently imports them or deletes them; the app no longer serves/uses
them. Backups of these old files may also exist and require deliberate operator retention cleanup
**after a verified export and browser import**, not deletion during this code migration.

## Using albums

- `/profile` contains browser backup/import and persistence controls. The existing paid album
  browsing intent remains a UI hint; **backup/export/import is never locked by subscription expiry**.
- Album detail pages accept local PNG/JPEG/WebP/GIF files up to 20 MiB. Generated data-URL images
  can be saved directly with Save to album. Unsupported videos/SVGs/URLs are rejected safely.
- There is no arbitrary remote download proxy. If a result is a remote URL, download it yourself
  and select the file from the album page. No backend fetch fallback is used for saving it.
- Display uses temporary `blob:` URLs. The picker reads image bytes into a data URL before handing
  them to a model input or an explicitly saved admin definition. Never persist/send a `blob:` URL.
- Album rewards in the game are restored: selected image bytes are copied into browser-local
  session snapshots, not saved as blob handles or server-file references. See
  [browser-game-saves.md](browser-game-saves.md).

## Namespace and transaction contract

Database: `fetishui-private`, now version 3 (adds history records; preserves album/game stores).
Album stores: `albums`, `albumItems`, with compound
`[namespace, id]` keys and namespace/album indexes. Images are actual Blobs, not base64 strings
in `localStorage`. SHA-256 is retained for backup integrity. Default album metadata is synthesized
per namespace, never seeded from server content.

`StorageScope` is captured by each store instance, not a mutable global current-account selector.
The account boundary closes old scopes, aborts outstanding transactions and revokes display URLs
when identity/access state changes or the account service becomes unavailable. Hashing/import
preparation checks the same handle before opening a transaction, so a late callback cannot write
into a newly selected account. An already committed write stays in its original namespace.

Anonymous data lives under `device:anonymous`; account data under a stable user-ID namespace.
Signing in, signing out, and switching accounts **do not copy, claim or delete** existing albums.
Transfer is an explicit export/import operation. A failed identity lookup disables access rather
than silently treating a previously signed-in user as anonymous. Tabs send invalidation-only
BroadcastChannel messages; no identity, prompt, media or session values are broadcast.

Namespaces prevent accidental account mixing, **not inspection by someone controlling the same
browser profile or same-origin JavaScript**. This is not encryption. Use separate browser profiles
on shared devices. Same-origin scripts/extensions/XSS and deliberate devtools inspection remain
security considerations. An HTTP server cannot enforce a tamper-proof paywall on browser-only data.

Only IndexedDB request promises run inside transactions; hashing/file reads happen first to avoid
an inactive transaction. Album deletion and its image deletion are one transaction. Saves never
rewrite a caller's stale whole-library snapshot. Failed imports/quota errors abort all their writes;
no source/history is silently trimmed to create room. Generation history now follows the same
non-trimming policy; legacy localStorage sources are preserved until explicit operator cleanup.

## Backup and recovery limits

The current version supports complete JSON backups with `format: fetishui-albums`, `version: 1`,
album metadata, base64 image data and per-image SHA-256. Export snapshots both stores together
and verifies hashes before producing a download. Import validates structure, IDs, MIME/header
signatures, checksums, album references and default-album invariants **before** writing.

Select a backup first, review the destination/counts, then confirm import. Matching records are
skipped. A conflicting existing ID aborts the whole import—nothing is overwritten, and newly
inserted records roll back. Unrelated existing albums survive. Checksums detect accidental
corruption, not who authored an untrusted backup; import only files you trust. No encryption,
automatic cloud sync or source deletion is implemented.

To keep every accepted collection exportable without streaming/ZIP machinery, collections are
currently capped at **96 MiB estimated serialized size**, including base64/metadata overhead,
2,000 total albums and 10,000 images. Individual images are capped at 20 MiB and backup input at
128 MiB. The collection cap is checked in the same write transaction; exceeding it rejects the
operation without trimming. Larger/streaming archives and video storage are future work.

Quota varies by browser, free disk and mode. The UI reports the browser's origin-wide usage/quota
estimate and offers `navigator.storage.persist()`; the browser may deny it. Persistence is not a
backup and does not protect against clearing site data, deleting a profile or losing a device.
A host/protocol/port change is a **different origin**, with separate storage. Export before changing
origins and explicitly import afterward. Private/incognito storage is usually temporary.

## Explicit operator migration

No web endpoint can export legacy personal files. Only the local CLI reads the source directory:

```sh
# Use a new output path OUTSIDE the source data directory. Does not load .env.local or call SQL.
npm run albums:export -- ./data /absolute/private-backups/albums-v1.json --confirm-operator-owned
```

The directory/output must be explicitly supplied. The CLI accepts only bounded metadata and
existing local raster files, rejects URLs, traversal and symlinks, verifies bytes/types, creates a
new mode-0600 output without overwriting an existing file, and never logs payloads. It does not
export chats, billing or curated workflows. Its tests use disposable synthetic files only.

1. Preserve the original source and any existing backups.
2. Run the command locally as the operator—never expose it as a public/admin web route.
3. Sign in to the intended browser account (or deliberately select anonymous storage).
4. Select the exported JSON at `/profile`, review destination/counts, and confirm import.
5. Reload, check image counts/content and picker behavior, then export another browser backup.
6. Keep a verified external backup. Only after verification decide how to retire original server
   files and their backups. This code intentionally does not delete those sources for you.

## Retired server boundary and tests

`/api/albums`, `/api/albums/items`, `/api/album-media/:filename` return 410/private-no-store for
all callers, including admins. No cookie check leads to a hidden file-serving fallback. The shared
Venice action no longer imports filesystem code or resolves legacy album paths; it rejects local
album/blob handles before any provider call. Remaining remote generation/search validation and
infrastructure logging/buffering audits are separate work.

```sh
npm test
npm run typecheck
npm run test:browser
```

Offline tests use fake-indexeddb and synthetic Blobs to cover isolation, CRUD/cascades, concurrent
saves, versioned stores, round-trip backup, conflict/corruption rollback, injected quota failure,
account-switch cancellation, display URL cleanup, and no network/logging. CLI tests preserve source
bytes and reject traversal/symlinks/overwrites. Generation tests reject server-file references.

The production Chromium smoke uses disposable SQL/identity and a real browser IndexedDB: local
file selection, image decode after reload, data-URL picker handoff, backup download/import,
corruption rejection, same-profile admin→anonymous→user separation, export after entitlement loss,
retired HTTP routes and canaries absent from requests/server logs. No operator source is imported,
no provider generation is submitted, and no browser is implicitly downloaded.

Still pending: Firefox/WebKit and mobile/private-mode qualification, real disk-quota/storage-eviction
experiments, broader personal-data migration (batch drafts/keys/tool stores), backup UX at larger scale,
provider/infrastructure privacy qualification, and the remaining launch gates in [TODO.md](../TODO.md).
