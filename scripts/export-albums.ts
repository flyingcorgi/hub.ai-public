import { exportLegacyAlbums } from "./lib/export-legacy-albums";

(async () => {
  const [source, output, confirmation, ...extra] = process.argv.slice(2);
  if (!source || !output || confirmation !== "--confirm-operator-owned" || extra.length) {
    console.error("Usage: npm run albums:export -- <operator-data-directory> <new-backup.json> --confirm-operator-owned");
    process.exitCode = 1; return;
  }
  try {
    const result = await exportLegacyAlbums(source, output);
    console.log(`Exported ${result.images} images (${result.bytes} bytes). Source files unchanged. Protect the unencrypted backup and verify browser import before any source cleanup.`);
  } catch {
    console.error("Album export failed. Check local ownership, file types, size limits and a new output path outside the source directory. No source files were changed. No private content is logged.");
    process.exitCode = 1;
  }
})();
