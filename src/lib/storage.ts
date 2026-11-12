/** Storage access can throw (private mode, blocked site data), so every call is guarded. */

export function readStored<T>(key: string, fallback: T, store: 'local' | 'session' = 'local'): T {
  try {
    const raw = (store === 'local' ? localStorage : sessionStorage).getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown, store: 'local' | 'session' = 'local'): void {
  try {
    const target = store === 'local' ? localStorage : sessionStorage;
    if (value === null || value === undefined) target.removeItem(key);
    else target.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore — persistence is a convenience only */
  }
}
