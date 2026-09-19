import assert from 'node:assert/strict';
import type { Browser } from 'playwright-core';

export async function verifyGenerationHistory(browser: Browser, origin: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let identity: string | null = 'history-owner';
  let accountFailure = false;
  let submissions = 0;
  const canary = 'BROWSER_HISTORY_PRIVATE_CANARY';
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';
  const image = { url: png, width: 1, height: 1, content_type: 'image/png' };
  const record = { id: 'legacy-history-one', modelId: 'synthetic', modelName: 'Synthetic', prompt: canary,
    parameters: {}, output: { images: [image], timings: {}, seed: -1, has_nsfw_concepts: [] }, timestamp: 1 };
  const requests: string[] = [], errors: string[] = [];
  await context.addInitScript(() => { localStorage.setItem('hub-age-verified', 'true'); });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    requests.push(request.url() + (request.postData() ?? ''));
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/account') return route.fulfill({ status: accountFailure ? 503 : 200, json: {
      user: identity ? { userId: identity, email: 'history@example.test', emailVerified: true, role: 'user', paidThroughAt: null, revoked: false } : null, unlocked: false,
    } });
    if (url.pathname === '/api/batch-generate') { submissions++; return route.fulfill({ json: { success: true, image, images: [image], seed: -1, timings: {} } }); }
    if (request.method() !== 'GET') return route.abort();
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/workflows') return route.abort();
    return route.continue();
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(origin + '/queue');
    await page.getByText(/No saved history in this namespace/).waitFor();
    await page.evaluate(row => {
      localStorage.setItem('venice-generations', JSON.stringify([row]));
      localStorage.setItem('fal-ai-generations', JSON.stringify([row]));
    }, record);
    await page.reload();
    await page.getByText(/No saved history in this namespace/).waitFor();
    await page.getByText('Import old device-shared history', {exact:true}).click();
    await page.getByRole('button', {name:'Review venice-generations',exact:true}).click();
    await page.getByRole('button', {name:'Confirm history import',exact:true}).click();
    await page.getByText('Imported 1 records.', {exact:false}).waitFor();
    await page.getByRole('img', {name:canary,exact:true}).waitFor();
    await page.reload();
    const savedImage = page.getByRole('img', {name:canary,exact:true}); await savedImage.waitFor();
    assert.equal(await savedImage.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'History page overflows mobile viewport');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', {name:'Export history backup',exact:true}).click();
    const download = await downloading; const stream = await download.createReadStream(); const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const backup = Buffer.concat(chunks);
    assert.ok(backup.toString().includes(canary));

    const other = await context.newPage(); other.on('pageerror', e => errors.push(e.message));
    await other.goto(origin + '/queue'); await other.getByRole('img', {name:canary,exact:true}).waitFor();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', {name:'Clear History',exact:true}).click();
    await other.getByText(/No saved history in this namespace/).waitFor();
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('venice-generations'),localStorage.getItem('fal-ai-generations')]), [JSON.stringify([record]), JSON.stringify([record])]);
    await page.getByLabel('Select history backup', {exact:true}).setInputFiles({ name:'history.json',mimeType:'application/json',buffer:backup });
    await page.getByRole('button', {name:'Confirm history import',exact:true}).click();
    await other.getByRole('img', {name:canary,exact:true}).waitFor(); await other.close();
    const corrupt = JSON.parse(backup.toString()); corrupt.records[0].prompt = 'corrupt';
    await page.getByLabel('Select history backup', {exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
    await page.getByText(/checksum mismatch/).waitFor();
    assert.equal(await page.getByRole('button', {name:'Confirm history import',exact:true}).count(), 0);

    identity = null;
    await page.evaluate(() => window.dispatchEvent(new Event('hub-account-changed')));
    await page.getByText(/No saved history in this namespace/).waitFor();
    assert.equal(await page.getByRole('img', {name:canary,exact:true}).count(), 0);
    identity = 'history-other';
    await page.evaluate(() => window.dispatchEvent(new Event('hub-account-changed')));
    await page.getByText(/No saved history in this namespace/).waitFor();
    accountFailure = true;
    await page.evaluate(() => window.dispatchEvent(new Event('hub-account-changed')));
    await page.getByRole('button', {name:'Retry loading history',exact:true}).waitFor();
    accountFailure = false; identity = 'history-owner';
    await page.evaluate(() => window.dispatchEvent(new Event('hub-account-changed')));
    await page.getByRole('img', {name:canary,exact:true}).waitFor();

    // A successful fake batch response followed by a local quota failure remains completed.
    await page.evaluate(() => localStorage.setItem('venice-api-key', 'synthetic-history-key'));
    await page.goto(origin + '/batch/seedream-edit');
    await page.getByPlaceholder('Prompt for this job...').first().fill('Synthetic landscape');
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.add;
      (window as unknown as {restoreHistoryStorage: () => void}).restoreHistoryStorage = () => { IDBObjectStore.prototype.add = original; };
      IDBObjectStore.prototype.add = function(...args) {
        if (this.name === 'generationRecords') throw new DOMException('synthetic quota', 'QuotaExceededError');
        return original.apply(this, args);
      };
    });
    await page.getByRole('button', {name:'Generate',exact:true}).first().click();
    await page.getByText(/1 completed results are not saved to history/).waitFor();
    assert.equal(submissions, 1);
    await page.evaluate(() => (window as unknown as {restoreHistoryStorage: () => void}).restoreHistoryStorage());
    await page.getByRole('button', {name:'Retry saving history',exact:true}).click();
    await page.getByRole('button', {name:'Retry saving history',exact:true}).waitFor({state:'hidden'});
    assert.equal(submissions, 1, 'Local save retry submitted another paid generation');
    await page.goto(origin + '/queue');
    await page.getByRole('img', {name:'Synthetic landscape',exact:true}).waitFor();
    assert.ok(requests.every(value => !value.includes(canary)), 'History left the browser');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
