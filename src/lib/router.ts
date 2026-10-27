import { useSyncExternalStore } from 'react';

// Hash routes (#/trip/123/eat) so the phone's back button/gesture works and no server config is needed.

function parts(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

let cached = parts();
let cachedHash = location.hash;

export function useRoute(): string[] {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => {
      if (location.hash !== cachedHash) {
        cachedHash = location.hash;
        cached = parts();
      }
      return cached;
    },
  );
}

export function href(...segments: string[]): string {
  return `#/${segments.map(encodeURIComponent).join('/')}`;
}

// Entries pushed by go() carry { inApp: true } so back() knows the previous entry is ours,
// not the page she came from. Hash links (<a href="#/...">) are marked on arrival.
window.addEventListener('hashchange', (e) => {
  if (!history.state && e.oldURL.split('#')[0] === e.newURL.split('#')[0]) history.replaceState({ inApp: true }, '');
});

export function go(segments: string[], replace = false): void {
  const target = href(...segments);
  if (replace) {
    // replaceState keeps the current entry's marker; it doesn't fire hashchange, so do that ourselves.
    const oldURL = location.href;
    history.replaceState(history.state, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.href }));
  } else {
    location.hash = target;
  }
}

/** Goes back if the previous entry is in the app, else to `fallback`. */
export function back(fallback: string[] = []): void {
  if (history.state?.inApp) history.back();
  else go(fallback, true);
}
