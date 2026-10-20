/**
 * Phone screen format. In a mobile browser the game asks for fullscreen (no address bar, no
 * navigation bar) and an upright (portrait) lock when an expedition starts, so the cave fills the screen
 * the way the controls are laid out for. Both requests need a user gesture, so they are made
 * synchronously from the Start / Continue tap, and any refusal is ignored: the game also plays in
 * landscape and in a windowed browser. The Android shell is already fullscreen and upright.
 */

/** True when the game runs inside the Android WebView shell (it injects window.DeepDownAndroid). */
export function inAndroidShell(): boolean {
  return typeof window !== 'undefined' && 'DeepDownAndroid' in window;
}

/**
 * A touch-first device (phone or tablet): the primary pointer is coarse and cannot hover.
 * Touch-screen laptops (a fine, hovering primary pointer) keep their window.
 */
export function touchFirst(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse) and (hover: none)').matches;
}

interface LockableOrientation {
  lock?: (o: 'portrait') => Promise<void>;
}

/** Call from a tap handler. Fullscreen + upright where the browser allows it; never throws. */
export function enterGameScreen(): void {
  // Automated browsers (end-to-end tests, captures) keep their fixed viewport.
  if (!touchFirst() || inAndroidShell() || navigator.webdriver) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const lock = () => {
    const o = (screen as Screen & { orientation?: LockableOrientation }).orientation;
    o?.lock?.('portrait').catch(() => {});
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
