// Browser-only credentials. Never include key values in events, URLs or error messages.
export const VENICE_API_KEY_STORAGE_KEY = 'venice-api-key';
export const API_KEYS_CHANGED_EVENT = 'fetishui-api-keys-changed';

export function readBrowserApiKey(storageKey = VENICE_API_KEY_STORAGE_KEY): string | null {
  try { return localStorage.getItem(storageKey)?.trim() || null; }
  catch { return null; }
}

export function saveBrowserApiKey(storageKey: string, value: string): void {
  const key = value.trim();
  if (!key) throw new Error('Enter an API key first.');
  try {
    localStorage.setItem(storageKey, key);
  } catch {
    // Never reclaim space by deleting generations or other personal content.
    throw new Error('Browser storage is full or unavailable. Allow site storage or back up your data before freeing space. Nothing was deleted.');
  }
  window.dispatchEvent(new Event(API_KEYS_CHANGED_EVENT));
}
