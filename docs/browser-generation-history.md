# Browser generation history

Single-model and batch generation history now uses account-scoped IndexedDB. `/queue` is saved
history, not a durable live job queue, and does not yet collect workflow-runner outputs.

## Storage and account boundaries

- `fetishui-private` database v3 adds `generationRecords` with `[namespace, id]` keys and a
  namespace index; existing album and game stores are preserved.
- Signed-in records use `account:<user-id>`; anonymous records use `device:anonymous`. Signing
  in/out does not copy, claim, delete or import either namespace. Auth lookup failure disables
  storage instead of falling back to anonymous. Captured scopes reject late provider responses,
  pending imports and writes after an account switch.
- Records contain prompt/settings/output metadata and embedded data URLs when supplied by the
  provider. Like game saves, these are structured IndexedDB records, not deduplicated Blob media.
  HTTPS result links remain links; export does **not** fetch them. They may expire and displaying
  them contacts their host. Download important remote media separately.
- Namespaces prevent accidental mixing, not deliberate inspection in the same browser profile.
  Storage/backups are not encrypted. Use separate profiles on shared devices. API keys, batch
  drafts/templates and other scratch tools are still device-shared and need a separate migration.
- Generation still sends inputs through Next.js to Venice. Local history does not establish
  provider/infrastructure non-retention or that media never touches the server.

## Safe saving and recovery

New additions are idempotent per ID; a conflicting ID is rejected. Flag updates and deletions
operate on individual records, not stale whole-history snapshots. Clear History confirms deletion
and removes only IDs loaded by that view, so it cannot erase a concurrently arriving generation.
Cross-tab invalidation messages contain no content and refresh history. Account changes remount
views and close the old scope. A write already committed stays in its original namespace.

All writes/imports are transactional. History is limited to 2,000 records and 96 MiB serialized
record data to keep complete backups feasible. Quota, capacity or validation failures are visible
and never trim old history. On a local save failure, single-model/batch results remain available
in memory; **Retry saving history** retries only IndexedDB, never a generation/provider call.
The page warns on unload while unsaved results remain. Download them or retry before navigating
away; client navigation, browser crashes and account switches can still discard in-memory results.

`/queue` offers backup export, file selection/review and explicit confirmation. Version-1
`fetishui-history` JSON backups include a SHA-256 checksum of canonical record JSON. Imports
validate all records, reject duplicate IDs, unsupported media URLs and corruption, skip identical
records and abort the entire import on conflicting IDs. Checksums detect corruption, not authorship.
No subscription is required to recover your browser data. Browser eviction, origin changes and
clearing site data can remove saves; external backups are essential.

## Old localStorage history

Under **Import old device-shared history**, deliberately choose `venice-generations` or
`fal-ai-generations`, review the count and destination, then confirm. Neither source key is read
on ordinary history load or login, migrated automatically, overwritten, trimmed or deleted—even
when you clear new history. Inspect/import only records you own. A repeated import is idempotent
unless an ID now conflicts (for example, after changing its NSFW flag).

Legacy malformed/unsupported records cause an all-or-nothing rejection; they are not silently
skipped or repaired. Original bytes remain available for deliberate recovery. Verify imported
results after reload and export a new backup before any manual source-key cleanup. No automated
cleanup or ownership assertion is provided.

## Verification

- `npm run test:history`: offline fake IndexedDB tests for v2→v3 preservation, immutable snapshots,
  concurrent additions, namespaces, checksums/conflicts, explicit legacy reads, targeted mutation,
  quota rollback, capacity rejection and account-switch cancellation; no network/log payloads.
- `npm run test:browser:history`: production build plus focused Chromium smoke using disposable
  SQL and synthetic client identities/provider responses. Covers mobile Queue, image decode after
  reload, backup/import, cross-tab clearing, original-key preservation, failed identity lookup,
  account switching and batch local-save retry without a second provider submission.
- Album/game focused tests verify the shared database upgrade; `npm run typecheck` checks wiring.

Real eviction/disk exhaustion, Firefox/WebKit/private-mode qualification, streaming large archives
and single-model successful Server Action browser coverage remain separate. No real provider
credits, payment calls or operator data are used by these checks.
