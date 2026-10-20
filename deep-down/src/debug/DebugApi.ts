// The engine helpers that remain after the pivot: the mutation gate shared by every debug surface. The idle game's
// own surface is window.__DD__.idle (src/debug/idle.ts); the release shell's is window.__DD_RELEASE__ (main.ts).

/**
 * Mutating helpers (give, setDepth, offline…) work only under automation (navigator.webdriver: Playwright, the
 * capture tools) or with ?debug=1 in the address. In a normal session they do nothing, so the console cannot hand
 * out gold.
 */
export function debugMutationsAllowed(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
}
