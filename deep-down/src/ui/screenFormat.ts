/**
 * Phone screen format. In a mobile browser the game asks for fullscreen (no address bar, no
 * navigation bar) and a landscape lock when an expedition starts, so the cave fills the screen
 * the way the controls are laid out for. Both requests need a user gesture, so they are made
 * synchronously from the Start / Continue tap, and any refusal is ignored: the game also plays in
 * portrait and in a windowed browser. The Android shell is already fullscreen and landscape.
 */

/** True when the game runs inside the Android WebView shell (it injects window.DeepDownAndroid). */
export function inAndroidShell(): boolean {
  return typeof window !== 'undefined' && 'DeepDownAndroid' in window;
}

/** A touch-first device (phone or tablet): coarse pointer and no fine one as the primary. */
export function touchFirst(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
}

interface LockableOrientation {
  lock?: (o: 'landscape') => Promise<void>;
}

/** Call from a tap handler. Fullscreen + landscape where the browser allows it; never throws. */
export function enterGameScreen(): void {
  if (!touchFirst() || inAndroidShell()) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const lock = () => {
    const o = (screen as Screen & { orientation?: LockableOrientation }).orientation;
    o?.lock?.('landscape').catch(() => {});
  };
  try {
    if (document.fullscreenElement) {
      lock();
    } else if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
    } else {
      el.webkitRequestFullscreen?.();
    }
  } catch {
    // Fullscreen is a convenience; refusing it changes nothing else.
  }
}
