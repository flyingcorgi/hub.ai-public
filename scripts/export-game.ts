import { exportLegacyGame } from "./lib/export-legacy-game";

(async () => {
  const [source, output, confirmation, ...extra] = process.argv.slice(2);
  if (!source || !output || confirmation !== "--confirm-operator-owned" || extra.length) {
    console.error("Usage: npm run game:export -- <operator-data-directory> <new-backup.json> --confirm-operator-owned");
    process.exitCode = 1; return;
  }
  try {
    const count = await exportLegacyGame(source, output);
    console.log(`Exported ${count} sessions. Source unchanged. Protect the unencrypted backup and verify browser import before cleanup.`);
  } catch {
    console.error("Game export failed. Check source ownership, bounded valid session/rules files, supported image links and a new output path outside the source directory. No source was changed; no private data is logged.");
    process.exitCode = 1;
  }
})();
