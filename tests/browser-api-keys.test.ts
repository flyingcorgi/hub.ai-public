import assert from 'node:assert/strict';
import { test } from 'node:test';
import { API_KEYS_CHANGED_EVENT, readBrowserApiKey, saveBrowserApiKey } from '../src/lib/browser-api-keys';

test('browser key reads tolerate blocked storage; writes never delete personal data or emit credentials', () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const items = new Map([['venice-generations', 'history-canary'], ['fal-ai-generations', 'legacy-canary']]);
  let blocked = false;
  let removals = 0;
  const events: Event[] = [];
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem(key: string) { if (blocked) throw new Error('read-secret-canary'); return items.get(key) ?? null; },
    setItem(key: string, value: string) { if (blocked) throw new Error('write-secret-canary'); items.set(key, value); },
    removeItem() { removals++; },
    clear() { removals++; },
  }});
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {dispatchEvent(event: Event) { events.push(event); }}});
  try {
    assert.equal(readBrowserApiKey(), null);
    assert.throws(() => saveBrowserApiKey('venice-api-key', '  '), /Enter an API key/);
    saveBrowserApiKey('venice-api-key', ' synthetic-key ');
    assert.equal(readBrowserApiKey(), 'synthetic-key');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, API_KEYS_CHANGED_EVENT);
    assert.equal('detail' in events[0], false);
    blocked = true;
    assert.equal(readBrowserApiKey(), null);
    assert.throws(() => saveBrowserApiKey('venice-api-key', 'replacement-secret'), /Nothing was deleted/);
    assert.equal(items.get('venice-api-key'), 'synthetic-key');
    assert.equal(items.get('venice-generations'), 'history-canary');
    assert.equal(items.get('fal-ai-generations'), 'legacy-canary');
    assert.equal(removals, 0);
    assert.equal(events.length, 1);
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
