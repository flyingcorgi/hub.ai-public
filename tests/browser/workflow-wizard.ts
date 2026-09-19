import assert from 'node:assert/strict';
import type { Browser } from 'playwright-core';
import type { Pool } from 'pg';
import { compileWizardDraft } from '../../src/lib/workflows/wizard';
import { wizardBlueprint } from '../helpers/wizard';

export async function verifyWorkflowWizard(browser: Browser, origin: string, cookie: string, pool: Pool) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.addCookies([{name:'better-auth.session_token',value:cookie.slice(cookie.indexOf('=')+1),url:origin,httpOnly:true,sameSite:'Lax'}]);
  await context.addInitScript(() => localStorage.setItem('hub-age-verified', 'true'));
  const draft = compileWizardDraft(wizardBlueprint(), {maxSteps:3,allowVideo:false});
  const errors: string[] = [], warnings: string[] = [];
  let calls = 0, saves = 0, fail = false;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/workflow-wizard') {
      calls++;
      const body = request.postDataJSON();
      assert.equal(body.description, 'Create a watercolor portrait with an editable caption');
      assert.equal(body.apiKey, 'synthetic-wizard-browser-key');
      assert.equal(body.maxSteps, 3); assert.equal(body.allowVideo, false);
      return route.fulfill({status: fail ? 422 : 200, json: fail ? {error:'Invalid draft'} : {definition:draft,authoringModel:'synthetic-json-model',paidSteps:1}});
    }
    if (request.method() === 'PUT' && url.pathname.startsWith('/api/workflows/')) saves++;
    if (url.pathname === '/api/venice-models') return route.fulfill({json:{success:true,models:[]}});
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/account' && !url.pathname.startsWith('/api/workflows')) return route.abort();
    if (request.method() === 'POST') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error','warning'].includes(message.type())) warnings.push(message.text()); });
  try {
    await page.goto(origin + '/workflows/designer');
    await page.getByRole('button',{name:'Blank',exact:true}).click();
    await page.getByLabel('Name',{exact:true}).fill('Older unsaved draft');
    await page.getByRole('button',{name:'Workflow Wizard · Beta',exact:true}).click();
    const wizard = page.getByRole('dialog',{name:'Workflow Wizard',exact:true});
    await wizard.getByLabel('Describe your workflow',{exact:true}).fill('Create a watercolor portrait with an editable caption');
    await wizard.getByRole('button',{name:'Generate draft',exact:true}).click();
    const keys = page.getByRole('dialog',{name:'Set up Venice',exact:true});
    await keys.getByLabel('Venice.ai API key',{exact:true}).fill('synthetic-wizard-browser-key');
    await keys.getByRole('button',{name:'Save',exact:true}).click();
    await keys.waitFor({state:'hidden'});
    assert.equal(calls,0,'Saving a key submitted the wizard'); assert.equal(saves,0);
    await wizard.getByRole('button',{name:'Generate draft',exact:true}).click();
    await wizard.getByRole('heading',{name:'Watercolor portrait',exact:true}).waitFor();
    assert.equal(calls,1); assert.equal(saves,0,'Preview was autosaved');
    const overflow = await wizard.evaluate(element => Array.from(element.querySelectorAll('*')).map(node => ({tag:node.tagName, className:node.className, left:node.getBoundingClientRect().left, right:node.getBoundingClientRect().right})).filter(box => box.left < -1 || box.right > innerWidth + 1));
    assert.deepEqual(overflow, [], 'Wizard content overflows mobile viewport');
    fail = true;
    await wizard.getByRole('button',{name:'Generate another draft',exact:true}).click();
    await wizard.getByRole('alert').waitFor();
    assert.equal(calls,2);
    assert.equal(await wizard.getByLabel('Describe your workflow',{exact:true}).inputValue(),'Create a watercolor portrait with an editable caption');
    await wizard.getByRole('heading',{name:'Watercolor portrait',exact:true}).waitFor();
    assert.equal(saves,0);
    await wizard.getByRole('button',{name:'Open draft in editor',exact:true}).click();
    await wizard.waitFor({state:'hidden'});
    assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Watercolor portrait');
    assert.equal(saves,0,'Opening an editor draft saved it');
    assert.equal(await page.getByRole('checkbox',{name:/Published — show/}).isChecked(),false);
    assert.equal(await page.getByRole('checkbox',{name:/Free to run/}).isChecked(),false);
    await page.getByLabel('Name',{exact:true}).fill('Reviewed wizard draft');
    const saving = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().includes('/api/workflows/'));
    await page.getByRole('button',{name:'Save',exact:true}).click();
    assert.equal((await saving).status(),200); assert.equal(saves,1);
    const saved = (await pool.query('SELECT name, published FROM workflows WHERE id=$1',[draft.id])).rows[0];
    assert.equal(saved.name,'Reviewed wizard draft'); assert.equal(saved.published,false);
    assert.equal((await pool.query("SELECT count(*) FROM workflows WHERE name='Older unsaved draft'")).rows[0].count,'0');
    await page.getByRole('combobox').first().click();
    await page.getByRole('option',{name:'Older unsaved draft',exact:true}).click();
    assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Older unsaved draft');
    assert.equal(calls,2);
    assert.deepEqual(errors,[]);
    assert.ok(!warnings.some(w => /DialogTitle|Missing.*Description/.test(w)), 'Wizard dialog accessibility warning');
  } finally { await context.close(); }
}
