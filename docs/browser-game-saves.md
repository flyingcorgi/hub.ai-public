# Browser-only game saves

Game sessions, messages (including embedded image bytes), conversation history and custom rules
now live in account/device-scoped browser IndexedDB. No session/rule save requests go to the app
server. Chat and generation still transit Next.js to Venice; this is not a provider-retention claim.

## Behavior

- `fetishui-private` version 2 added `gameRecords`; current version 3 adds generation history,
  preserving existing album and game stores.
  Records use `[namespace, id]` keys and the same captured StorageScope as albums. Switching
  accounts closes old scopes and aborts pending writes; anonymous data is never inherited.
- Autosaves capture a snapshot immediately, then serialize writes. Revisions reject stale tab
  edits/deletes and late saves after deletion. Errors remain visible; current unsaved sessions
  can be exported without relying on a successful database write. Reload after reconciling conflicts.
- Generated data-URL images are saved with messages. Album rewards copy the selected image's
  bytes into the session, not an ephemeral blob URL or server path. Deleting the album original
  does not remove the session copy. Album rewards are re-enabled.
- External HTTPS image links remain links: they can expire and displaying them contacts the
  external host. They are not downloaded by the server to create durable local copies. HTTP,
  local-file and blob links are rejected by saved-session validation.
- Game images currently remain embedded data URLs in the IndexedDB session snapshot (not
  localStorage). Separate deduplicated image-Blob storage is deferred. Limits: 32 MiB per session,
  64 MiB/500 sessions per namespace, 96 MiB backup input. Exceeding a limit/quota does not trim
  existing saves. An oversized unsaved session may need individual image downloads for recovery.
- Browser clearing, private-mode expiry, device loss, or changing origin/port can lose access.
  Namespaces are not encryption against other people using the browser profile or same-origin
  scripts. Use separate browser profiles on shared devices and keep external backups.

## Backups

The game page offers Export saved games and explicit import confirmation even without a Venice
key. Backups contain unencrypted sessions, embedded images and rules; treat them as private files.
Matching imports are skipped, conflicting IDs/rules abort the entire import without overwriting.
Finish/leave an active game before import; reload afterward to load imported rules/sessions.
An unsaved-session backup can be restored into another empty namespace, or after explicitly
backing up/removing its conflicting saved copy. Do not discard the current tab before recovery.

## Original server files

The old `/api/goon-game/sessions` GET/POST/DELETE and `/api/goon-game/rules` GET/POST return
410/private-no-store for everyone. They do not read or write any files. Original operator files
remain untouched on disk and may also exist in old backups; they are not automatically erased.

Export locally, never via an HTTP endpoint or automatic visitor import:

```sh
npm run game:export -- ./data /absolute/private-backups/game-v1.json --confirm-operator-owned
```

This reads bounded `goon-game-sessions.json` and optional `goon-game-rules.json`, rejects unsafe
paths/symlinks, and converts existing `/api/album-media/<raster-file>` message references into
embedded image data. It never downloads remote URLs. Output must be a new file outside the
source directory; it is written mode 0600 with no overwrite. Invalid/oversized source data fails
without changing originals. Open the game page in the intended account, import explicitly,
reload and verify the result before any operator cleanup of source files or their backups.

## Focused verification

`npm run test:game` exercises the version-1 upgrade, scope isolation, image-byte round trip,
queued snapshots, stale-edit/deletion protection, import rollback, retired routes and explicit
operator export using synthetic data. `npm run typecheck` checks wiring without a production
rebuild or full-suite run. Real-browser game interaction and mobile/eviction qualification remain
separate checks; unit tests do not establish production readiness.

Generation history now uses scoped IndexedDB with explicit legacy import; see
[browser-generation-history.md](browser-generation-history.md). Other browser-tool stores still
need migration. Accounts, billing facts and administrator-curated workflows/references remain
intentionally server-side. Live billing and other launch gates remain disabled/pending.
