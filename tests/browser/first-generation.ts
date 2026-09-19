import assert from 'node:assert/strict';
import type { Browser } from 'playwright-core';
import { modelHref } from '../../src/lib/models/nav-groups';

// Called by the disposable production-server smoke. All generation submissions are aborted;
// neither synthetic keys nor user prompts can reach a provider or consume credits.
export async function verifyFirstGeneration(browser: Browser, origin: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  const warnings: string[] = [];
  let mode: 'loading' | 'empty' | 'failed' | 'live' = 'loading';
  let releaseCatalog!: () => void;
  const catalogGate = new Promise<void>(resolve => { releaseCatalog = resolve; });
  let submissions = 0;
  await context.addInitScript(() => localStorage.setItem('hub-age-verified', 'true'));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (route.request().method() === 'POST') { submissions++; return route.abort(); }
    if (url.pathname === '/api/workflows') {
      if (mode === 'loading') await catalogGate;
      if (mode === 'empty') return route.fulfill({ json: [] });
      if (mode === 'failed') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    }
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/account' && !url.pathname.startsWith('/api/workflows')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) warnings.push(message.text()); });
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Mobile page overflows horizontally');
  try {
    await page.goto(origin + '/dashboard');
    await page.getByText('Loading workflows…', { exact: true }).waitFor();
    assert.equal(await page.getByText(/No published workflows yet/).count(), 0);
    mode = 'empty'; releaseCatalog();
    await page.getByText(/No published workflows yet/).waitFor();
    mode = 'failed';
    await page.reload();
    await page.getByRole('button', { name: 'Retry catalog' }).waitFor();
    assert.equal(await page.getByText(/No published workflows yet/).count(), 0);
    mode = 'live';
    await page.getByRole('button', { name: 'Retry catalog' }).click();
    await page.getByRole('link', { name: /Free workflow Smoke free/ }).waitFor();
    await page.getByRole('link', { name: /Premium workflow Smoke paid/ }).waitFor();
    await noOverflow();
    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByRole('dialog', { name: 'Navigation' });
    await nav.waitFor();
    await nav.getByRole('link', { name: /Goon Game Beta/ }).waitFor();
    await page.keyboard.press('Escape');
    await nav.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Open menu' }).evaluate(el => el === document.activeElement), true);

    await page.goto(origin + modelHref('venice/seedream-v5-pro'));
    await page.getByLabel('Prompt', { exact: true }).fill('SYNTHETIC_FIRST_GENERATION_PROMPT');
    await page.getByRole('button', { name: 'Generate Image', exact: true }).click();
    const setup = page.getByRole('dialog', { name: 'Set up Venice' });
    await setup.waitFor();
    await noOverflow();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByLabel('Prompt', { exact: true }).inputValue(), 'SYNTHETIC_FIRST_GENERATION_PROMPT');
    assert.equal(submissions, 0);
    await page.getByRole('button', { name: 'Add API key', exact: true }).click();
    await setup.getByLabel('Venice.ai API key', { exact: true }).fill('synthetic-browser-key');
    // Simulate storage quota failure, keeping both historical keys intact.
    await page.evaluate(() => {
      localStorage.setItem('venice-generations', '[]');
      localStorage.setItem('fal-ai-generations', '[]');
      const original = Storage.prototype.setItem;
      (window as any).__restoreKeyStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(key, value) {
        if (key === 'venice-api-key') throw new DOMException('synthetic quota error', 'QuotaExceededError');
        original.call(this, key, value);
      };
    });
    await setup.getByRole('button', { name: 'Save', exact: true }).click();
    await setup.getByRole('alert').filter({ hasText: 'Nothing was deleted.' }).waitFor();
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('venice-generations'), localStorage.getItem('fal-ai-generations')]), ['[]', '[]']);
    assert.equal(await setup.getByLabel('Venice.ai API key', { exact: true }).inputValue(), 'synthetic-browser-key');
    await page.evaluate(() => (window as any).__restoreKeyStorage());
    await setup.getByRole('button', { name: 'Save', exact: true }).click();
    await setup.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Change API key', exact: true }).waitFor();
    assert.equal(submissions, 0, 'Saving a key submitted a generation');
    assert.equal(await page.getByLabel('Prompt', { exact: true }).inputValue(), 'SYNTHETIC_FIRST_GENERATION_PROMPT');
    // An interrupted paid request gets a persistent explanation; no automatic retries.
    await page.getByRole('button', { name: 'Generate Image', exact: true }).click();
    await page.getByText(/Your inputs are still here/).waitFor();
    assert.equal(submissions, 1);
    assert.equal(await page.getByLabel('Prompt', { exact: true }).inputValue(), 'SYNTHETIC_FIRST_GENERATION_PROMPT');
    await noOverflow();

    // A key change in another tab updates this page without a reload or losing its draft.
    const otherTab = await context.newPage();
    await otherTab.goto(origin + '/dashboard');
    await otherTab.evaluate(() => localStorage.removeItem('venice-api-key'));
    await page.getByRole('button', { name: 'Add API key', exact: true }).waitFor();
    await otherTab.close();
    await page.goto(origin + '/workflows/designer?run=free');
    await page.getByLabel('Extra instructions (optional)').fill('SYNTHETIC_WORKFLOW_DRAFT');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=', 'base64');
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    const image = page.getByRole('img', { name: 'Start image', exact: true });
    await image.waitFor();
    const source = await image.getAttribute('src');
    await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
    await setup.waitFor();
    await setup.getByLabel('Venice.ai API key', { exact: true }).fill('synthetic-workflow-key');
    await setup.getByRole('button', { name: 'Save', exact: true }).click();
    await setup.waitFor({ state: 'hidden' });
    assert.equal(await page.getByLabel('Extra instructions (optional)').inputValue(), 'SYNTHETIC_WORKFLOW_DRAFT');
    assert.equal(await image.getAttribute('src'), source);
    assert.equal(submissions, 1, 'Workflow key setup unexpectedly submitted a run');
    await noOverflow();
    assert.deepEqual(errors, []);
    assert.ok(!warnings.some(w => /DialogTitle|Missing.*Description/.test(w)), 'Dialog accessibility warning');
  } finally {
    releaseCatalog();
    await context.close();
  }
}
