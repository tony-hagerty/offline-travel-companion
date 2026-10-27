export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Wikimedia asks API clients to identify themselves; browsers can't set User-Agent. */
export const WIKIMEDIA_HEADERS = { 'Api-User-Agent': 'TravelCompanionPWA/0.1 (https://github.com/tony-hagerty/offline-travel-companion)' };

/**
 * fetch() that rejects on non-2xx responses and gives up after `timeoutMs`.
 * Also stops when `init.signal` is aborted (that rejection stays an AbortError).
 */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const outer = init.signal;
  const onAbort = () => ctrl.abort();
  if (outer?.aborted) ctrl.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new HttpError(`${new URL(url).hostname} returned ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError' && !outer?.aborted) {
      throw new HttpError(`${new URL(url).hostname} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  return sp.toString();
}

/** Splits an array into chunks of `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
