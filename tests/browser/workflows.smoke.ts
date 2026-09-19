import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { isolatedDatabase } from '../helpers/database';
import { migrate } from '../../src/lib/db/migrate';
import { createAuth } from '../../src/lib/auth/server';
import { writeWorkflow } from '../../src/lib/workflows/catalog';
import { createStarterWorkflow } from '../../src/lib/workflows/designer-samples';
import { verifyFirstGeneration } from './first-generation';
import { verifyGenerationHistory } from './generation-history';
import { verifyWorkflowWizard } from './workflow-wizard';

// Run after a production build. Uses synthetic data in a disposable DB and a separate port;
// never imports operator content or writes to .env.local. No browser is downloaded implicitly.

(async () => {
 const listener = createServer();
 await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
 const port = (listener.address() as {port:number}).port;
 await new Promise<void>(resolve => listener.close(() => resolve()));
 const origin = `http://127.0.0.1:${port}`;
 const db = await isolatedDatabase({maxConnections: 10});
 let app: ReturnType<typeof spawn> | undefined;
 let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
 const serverOutput: string[] = [];
 try {
  await migrate(db.pool);
  const secret = 'synthetic-browser-smoke-secret-at-least-thirty-two-characters';
  const mail: {url:string; purpose:string}[] = [];
  const auth = createAuth(db.pool, {baseURL:origin, secret, allowSignUp:true, sendMail:async(_to,url,purpose)=>{mail.push({url,purpose});}});
  const signup = await auth.api.signUpEmail({body:{name:'Test Admin',email:'browser-admin@example.test',password:'synthetic-browser-password-only'}});
  await db.pool.query('UPDATE "user" SET role=\'admin\', "emailVerified"=true WHERE id=$1',[signup.user.id]);
  const login = await auth.api.signInEmail({body:{email:'browser-admin@example.test',password:'synthetic-browser-password-only'},asResponse:true});
  const cookie = login.headers.getSetCookie().find(v=>v.startsWith('better-auth.session_token='))!.split(';')[0];
  const user={userId:signup.user.id,email:'browser-admin@example.test',emailVerified:true,role:'admin' as const,paidThroughAt:null,revoked:false};
  for (const [id,free,published] of [['paid',false,true],['free',true,true],['draft',false,false]] as const) {
   const d = {...createStarterWorkflow(),id,name:`Smoke ${id}`,free,published};
   d.steps[0].promptTemplate='BROWSER_PRIVATE_CANARY';
   await writeWorkflow(db.pool,user,id,{definition:d,revision:null});
  }
  const customer = await auth.api.signUpEmail({body:{name:'Test Customer',email:'browser-user@example.test',password:'synthetic-browser-password-only'}});
  await db.pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[customer.user.id]);
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:db.connectionString,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,NEXT_TELEMETRY_DISABLED:'1',AUTH_ALLOW_SIGNUP:'false',WORKFLOW_WIZARD_ENABLED:process.env.BROWSER_SMOKE_ONLY === 'wizard' ? 'true' : 'false',WORKFLOW_WIZARD_MODEL:'synthetic-json-model',NOWPAYMENTS_ENROLLMENT_ENABLED:'false',NOWPAYMENTS_API_KEY:'',NOWPAYMENTS_ACCOUNT_PASSWORD:'',SMTP_HOST:'',SMTP_FROM:''},stdio:['ignore','pipe','pipe']});
  app.stdout!.on('data',d=>serverOutput.push(String(d))); app.stderr!.on('data',d=>serverOutput.push(String(d)));
  let ready = false;
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/workflows')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready, 'Production server did not become ready. Run npm run build first.');
  browser=await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : { channel: 'chrome' }),
    headless:true,
  });
  if (process.env.BROWSER_SMOKE_ONLY === 'wizard') {
    await verifyWorkflowWizard(browser, origin, cookie, db.pool);
    assert.ok(!serverOutput.join('').includes('synthetic-wizard-browser-key'));
    console.log('Workflow Wizard browser smoke passed (no provider calls).');
    return;
  }
  await verifyGenerationHistory(browser, origin);
  if (process.env.BROWSER_SMOKE_ONLY === 'history') {
    assert.ok(!serverOutput.join('').includes('BROWSER_HISTORY_PRIVATE_CANARY'));
    console.log('Generation history browser smoke passed (synthetic provider only).');
    return;
  }
  await verifyFirstGeneration(browser, origin);
  const anonymous=await browser.newContext();
  await anonymous.addInitScript(()=>{localStorage.setItem('hub-age-verified','true');localStorage.setItem('hub-workflow-access',JSON.stringify({email:'forged@example.test',paidThroughAt:9999999999999}));});
  await anonymous.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/venice-models') return route.fulfill({json:{success:true,models:[]}});
    if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/workflows') && url.pathname !== '/api/account') return route.abort();
    return route.continue();
  });
  const page=await anonymous.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/workflows'))requests.push(r.url());});
  await page.goto(origin+'/dashboard');
  await page.getByRole('link',{name:/Smoke paid/}).first().waitFor();
  assert.ok(!requests.some(url=>/\/api\/workflows\//.test(url)),'Dashboard fetched a definition');
  assert.equal(await page.getByRole('link',{name:/Workflow Designer/}).count(),0);
  await page.goto(origin+'/workflows/designer?run=paid');
  await page.getByText('"Smoke paid" requires current account access').waitFor();
  assert.ok(!(await page.content()).includes('BROWSER_PRIVATE_CANARY'));
  await page.goto(origin+'/workflows/designer?run=free');
  await page.getByText('Start image',{exact:true}).waitFor();
  assert.equal(await page.getByRole('tab',{name:'Design',exact:true}).count(),0);
  await page.goto(origin+'/workflows/designer?run=draft');
  await page.getByText(/This workflow isn.t available anymore/).waitFor();
  await anonymous.close();
  // Exercise the actual account client and production auth HTTP wrapper, not injected cookies.
  const customerContext=await browser.newContext();
  await customerContext.addInitScript(()=>localStorage.setItem('hub-age-verified','true'));
  await customerContext.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/') && !['/api/account','/api/account/billing'].includes(url.pathname) && !url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/workflows')) return route.abort();
    return route.continue();
  });
  const customerPage=await customerContext.newPage(); customerPage.on('pageerror',e=>errors.push(e.message));
  await customerPage.goto(origin+'/account');
  await customerPage.getByText('New account registration is currently closed.').waitFor();
  await customerPage.getByLabel('Email',{exact:true}).fill('browser-user@example.test');
  await customerPage.getByLabel('Password',{exact:true}).fill('synthetic-browser-password-only');
  await customerPage.getByRole('button',{name:'Sign in',exact:true}).click();
  await customerPage.getByText('Signed in',{exact:true}).waitFor();
  const secondTab=await customerContext.newPage(); secondTab.on('pageerror',e=>errors.push(e.message));
  await secondTab.goto(origin+'/account'); await secondTab.getByText('Signed in',{exact:true}).waitFor();
  await customerPage.getByRole('link',{name:'Billing and access'}).click();
  await customerPage.getByText(/New billing enrollments are not enabled yet/).waitFor();
  assert.equal(await customerPage.getByRole('button',{name:'Send me a payment email'}).isDisabled(),true);
  await auth.api.requestPasswordReset({body:{email:'browser-user@example.test',redirectTo:origin+'/account/reset-password'}});
  const reset=mail.findLast(m=>m.purpose==='reset')!;
  await customerPage.goto(reset.url);
  await customerPage.getByLabel('New password',{exact:true}).waitFor();
  await customerPage.waitForURL(origin+'/account/reset-password');
  await customerPage.getByLabel('New password',{exact:true}).fill('new-synthetic-browser-password');
  await customerPage.getByLabel('Confirm password',{exact:true}).fill('new-synthetic-browser-password');
  await customerPage.getByRole('button',{name:'Save new password'}).click();
  await customerPage.getByText(/Password reset. Existing sessions have been revoked/).waitFor();
  await secondTab.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  await customerPage.getByLabel('Email',{exact:true}).fill('browser-user@example.test');
  await customerPage.getByLabel('Password',{exact:true}).fill('new-synthetic-browser-password');
  await customerPage.getByRole('button',{name:'Sign in',exact:true}).click();
  await customerPage.getByText('Signed in',{exact:true}).waitFor();
  await customerPage.getByRole('button',{name:'Sign out',exact:true}).click();
  await customerPage.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  assert.equal((await (await customerContext.request.get(origin+'/api/account')).json()).user,null);
  await customerContext.close();
  const admin=await browser.newContext();
  await admin.addCookies([{name:'better-auth.session_token',value:cookie.slice(cookie.indexOf('=')+1),url:origin,httpOnly:true,sameSite:'Lax'}]);
  await admin.addInitScript(()=>localStorage.setItem('hub-age-verified','true'));
  await admin.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/venice-models') return route.fulfill({json:{success:true,models:[]}});
    if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/workflows') && !url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/account') return route.abort();
    return route.continue();
  });
  const editor=await admin.newPage(); editor.on('pageerror',e=>errors.push(e.message));
  const writes:string[]=[];editor.on('request',r=>{if(['PUT','POST','DELETE'].includes(r.method()) && r.url().includes('/api/workflows'))writes.push(r.url());});
  await editor.goto(origin+'/workflows/designer');
  await editor.getByLabel('Name',{exact:true}).waitFor();
  assert.equal(writes.length,0,'Hydration wrote workflows');
  await editor.getByRole('button',{name:'Blank',exact:true}).click();
  await editor.getByLabel('Name',{exact:true}).fill('Browser-created draft');
  assert.equal(writes.length,0,'Editing autosaved unexpectedly');
  await editor.getByRole('button',{name:'Save',exact:true}).click();
  await editor.getByText('Workflow saved',{exact:true}).first().waitFor();
  assert.equal(writes.length,1);
  const draftRow=(await db.pool.query("SELECT id, revision, published FROM workflows WHERE name='Browser-created draft'")).rows[0];
  assert.equal(draftRow.published,false);
  const listed=await (await fetch(origin+'/api/workflows')).json(); assert.ok(!listed.some((d:{id:string})=>d.id===draftRow.id));
  // An external edit must cause a visible conflict, retaining the local form.
  await db.pool.query('UPDATE workflows SET revision=gen_random_uuid() WHERE id=$1',[draftRow.id]);
  await editor.getByLabel('Name',{exact:true}).fill('Unsaved conflicting name');
  await editor.getByRole('button',{name:'Save',exact:true}).click();
  await editor.getByText(/Workflow changed elsewhere/).first().waitFor();
  assert.equal(await editor.getByLabel('Name',{exact:true}).inputValue(),'Unsaved conflicting name');
  assert.equal((await db.pool.query('SELECT name FROM workflows WHERE id=$1',[draftRow.id])).rows[0].name,'Browser-created draft');
  const downloadPromise=editor.waitForEvent('download'); await editor.getByRole('button',{name:'Export draft',exact:true}).click(); await downloadPromise;
  editor.on('dialog',d=>d.accept());
  await editor.reload(); await editor.getByLabel('Name',{exact:true}).waitFor();
  await editor.getByRole('tab',{name:'Run',exact:true}).click();
  // First item is the newly-created empty draft, available to the admin without paying.
  await editor.getByText('Run a workflow',{exact:true}).waitFor();
  await editor.getByRole('tab',{name:'Design',exact:true}).click();
  await editor.getByRole('button',{name:'From example',exact:true}).click();
  await editor.getByLabel('Name',{exact:true}).fill('Published browser example');
  await editor.getByRole('checkbox',{name:/Free to run when published/}).check();
  await editor.getByRole('checkbox',{name:/Published — show in the public catalog/}).check();
  const publishResponse = editor.waitForResponse(r=>r.request().method()==='PUT' && r.url().includes('/api/workflows/'));
  await editor.getByRole('button',{name:'Save',exact:true}).click();
  const publishedResponse = await publishResponse;
  assert.equal(publishedResponse.status(),200);
  const publishedRecord = await publishedResponse.json();
  const publicDefinition = await fetch(origin+'/api/workflows/'+publishedRecord.definition.id);
  assert.equal(publicDefinition.status,200);
  assert.equal((await publicDefinition.json()).definition.published,true);
  const deleteResponse = editor.waitForResponse(r=>r.request().method()==='DELETE' && r.url().includes('/api/workflows/'));
  await editor.getByRole('button',{name:'Delete',exact:true}).click();
  assert.equal((await deleteResponse).status(),200);
  assert.equal((await fetch(origin+'/api/workflows/'+publishedRecord.definition.id)).status,404);
  // Real Chromium IndexedDB and Blob round trip. No local/private content may hit an API.
  const albumCanary='BROWSER_ALBUM_PRIVATE_CANARY';
  const albumRequests: {url:string; body:string}[]=[];
  editor.on('request',r=>albumRequests.push({url:r.url(),body:r.postData()??''}));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=','base64');
  await editor.goto(origin+'/profile');
  await editor.getByRole('link',{name:/My Mirror/}).click();
  await editor.getByLabel('Add an image from this device').setInputFiles({name:albumCanary+'.png',mimeType:'image/png',buffer:png});
  const savedImage=editor.getByRole('img',{name:albumCanary+'.png',exact:true});
  await savedImage.waitFor();
  assert.match((await savedImage.getAttribute('src'))!,/^blob:/);
  await editor.reload(); await savedImage.waitFor();
  assert.equal(await savedImage.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth===1),true);
  // Selecting a reference gives the runner data bytes, not an ephemeral browser blob URL.
  await editor.goto(origin+'/workflows/designer?run=free');
  await editor.getByRole('button',{name:'Choose from album',exact:true}).click();
  await editor.getByRole('img',{name:albumCanary+'.png',exact:true}).click();
  await editor.locator('img[src^="data:image/png;base64,"]').first().waitFor();
  await editor.goto(origin+'/profile');
  const downloadBackup=async()=>{
    const downloading=editor.waitForEvent('download');
    await editor.getByRole('button',{name:'Export album backup',exact:true}).click();
    return JSON.parse(await readFile((await (await downloading).path())!,'utf8'));
  };
  const albumBackup=await downloadBackup();
  assert.equal(albumBackup.items.length,1); assert.equal(albumBackup.items[0].name,albumCanary+'.png');
  assert.equal(albumBackup.items[0].dataUrl,'data:image/png;base64,'+png.toString('base64'));
  assert.ok(!JSON.stringify(albumBackup).includes('blob:'));
  const backupInput={name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(albumBackup))};
  await editor.getByLabel('Select an album backup (up to 128 MiB)').setInputFiles(backupInput);
  await editor.getByRole('button',{name:'Confirm album import'}).click();
  await editor.getByText('Imported 0 images; 1 matching images skipped. Source backup preserved.').waitFor();
  const corrupt={...albumBackup,items:[{...albumBackup.items[0],sha256:'0'.repeat(64)}]};
  await editor.getByLabel('Select an album backup (up to 128 MiB)').setInputFiles({name:'corrupt.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(corrupt))});
  await editor.getByRole('button',{name:'Confirm album import'}).click();
  await editor.getByText('Backup image checksum/type mismatch. No changes were imported.').waitFor();
  assert.equal((await downloadBackup()).items.length,1);
  assert.ok(!albumRequests.some(r=>r.url.includes('/api/albums') || r.url.includes('/api/album-media/')));
  assert.ok(!albumRequests.some(r=>r.body.includes(albumCanary) || r.body.includes(png.toString('base64'))));
  // Same browser profile, different identities: anonymous/user do not inherit admin albums.
  await editor.goto(origin+'/account'); await editor.getByRole('button',{name:'Sign out',exact:true}).click();
  await editor.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  await editor.goto(origin+'/profile'); assert.equal((await downloadBackup()).items.length,0);
  await editor.goto(origin+'/account');
  await editor.getByLabel('Email',{exact:true}).fill('browser-user@example.test');
  await editor.getByLabel('Password',{exact:true}).fill('new-synthetic-browser-password');
  await editor.getByRole('button',{name:'Sign in',exact:true}).click();
  await editor.getByText('Signed in',{exact:true}).waitFor();
  await editor.goto(origin+'/profile'); assert.equal((await downloadBackup()).items.length,0);
  // Backup remains accessible without an active subscription. Explicit import is a user choice.
  await editor.getByLabel('Select an album backup (up to 128 MiB)').setInputFiles(backupInput);
  await editor.getByRole('button',{name:'Confirm album import'}).click();
  await editor.getByText('Imported 1 images; 0 matching images skipped. Source backup preserved.').waitFor();
  assert.equal((await downloadBackup()).items.length,1);
  for(const path of ['/api/albums','/api/albums/items','/api/album-media/unknown.png']) {
    const response=await fetch(origin+path); assert.equal(response.status,410);
    assert.match(response.headers.get('cache-control')??'',/private, no-store/);
  }
  assert.deepEqual(errors,[]);
  assert.ok(!serverOutput.join('').includes('BROWSER_PRIVATE_CANARY'));
  assert.ok(!serverOutput.join('').includes(albumCanary));
  assert.ok(!serverOutput.join('').includes('SYNTHETIC_FIRST_GENERATION_PROMPT'));
  assert.ok(!serverOutput.join('').includes('synthetic-browser-key'));
  console.log('First-generation UX passed: catalog loading/empty/failure/retry; free/premium badges; mobile navigation accessibility; in-place key setup preserves drafts/uploads; storage quota preserves history; no auto-submit/retry; cross-tab key status.');
  console.log('Browser smoke passed: summary-only navigation; paid lock despite forged flag; free runner; hidden drafts; admin load without autosave; explicit draft save; revision conflict preserves edits; draft export; admin preview; explicit publish/delete; real account signin/reset/logout and cross-tab invalidation; disabled billing; browser-only album upload/reload/picker/backup/import/corruption/isolation; retired album APIs; no page errors.');
 } finally {
  await browser?.close();
  if(app){app.kill('SIGTERM');await new Promise<void>(r=>{if(app!.exitCode!==null)r();else app!.once('exit',()=>r());});}
  await db.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
