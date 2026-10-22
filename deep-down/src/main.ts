import { Game } from './game/Game';
import type { UiFactory } from './game/GameUi';
import { Renderer } from './render/Renderer';
import { GOVERNOR, QualityGovernor, initialQuality } from './render/QualityGovernor';
import { LocalStorageStore, SAVE_KEYS, SaveSystem } from './save/SaveSystem';
import { UI } from './ui/UI';
import { detectLanguage, language, setLanguage, t } from './i18n';
import { languageOf, loadControlPrefs } from './ui/controlPrefs';
import { BUILD, VERSION, VERSION_CODE } from './version';

// Entry point and the release shell around the game: the crash panel, the Android bridge
// (Back, lifecycle), the context-loss notice and the automatic quality governor. Everything
// here talks to the game through its public API only.

/** What the Android shell (android/.../MainActivity.java) injects as window.DeepDownAndroid. */
interface AndroidBridge {
  keepScreenOn?(on: boolean): void;
  setBackHandled?(handled: boolean): void;
}

type ReleaseWindow = Window & {
  DeepDownAndroid?: AndroidBridge;
  deepDownBack?: () => boolean;
  deepDownLifecycle?: (phase: 'pause' | 'resume') => boolean;
  __DD_RELEASE__?: unknown;
};
const win = window as ReleaseWindow;

let game: Game | null = null;
let booted = false;

// ---------------------------------------------------------------------------------------
// Crash panel: one panel for boot failures and for errors after boot. Nothing is sent anywhere;
// [Copy details] puts a short technical report on the clipboard for the player to share.

const panel = (() => {
  let el: HTMLElement | null = null;
  let firstError: unknown = null;
  let message = '';
  let mode = 'boot';
  let at = '';
  /** Read once after boot: getParameter is a synchronous GPU round trip, too slow mid-crash. */
  let renderer = 'unavailable';

  const describe = (err: unknown): string => {
    if (err instanceof Error) return err.stack && err.stack.includes(err.message) ? err.stack : `${err.name}: ${err.message}\n${err.stack ?? ''}`;
    if (err === null || err === undefined) return 'no error object';
    try {
      return typeof err === 'string' ? err : JSON.stringify(err);
    } catch {
      return String(err);
    }
  };

  const details = (): string =>
    [
      `DEEP DOWN ${VERSION} (versionCode ${VERSION_CODE}, build ${BUILD})`,
      `message: ${message}`,
      `mode: ${mode}`,
      `time: ${at}`,
      `user agent: ${navigator.userAgent}`,
      `GL renderer: ${renderer}`,
      '',
      describe(firstError).split('\n').slice(0, 24).join('\n'),
    ].join('\n');

  const copy = async (note: HTMLElement, area: HTMLTextAreaElement): Promise<void> => {
    try {
      await navigator.clipboard.writeText(details());
      note.textContent = t('release.crash.copied');
      return;
    } catch {
      // Clipboard API refused (no permission, an old WebView): show the text to copy by hand.
    }
    area.hidden = false;
    area.focus();
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    note.textContent = t(ok ? 'release.crash.copied' : 'release.crash.copyManual');
  };

  return {
    get visible(): boolean {
      return el !== null;
    },
    get details(): string {
      return details();
    },
    /** The GPU's name for the report (UNMASKED_RENDERER where the browser exposes it). */
    readRenderer(g: Game): void {
      try {
        const gl = g.renderer.gl.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? 'unknown');
      } catch {
        renderer = 'unavailable';
      }
    },
    /** Remember the first error even if the panel is already up (it is the one that matters). */
    record(err: unknown): void {
      if (firstError === null && err !== undefined && err !== null) firstError = err;
    },
    show(err: unknown, text = t('release.crash.message')): void {
      this.record(err);
      if (el) return;
      message = text;
      mode = game?.mode ?? 'boot';
      at = new Date().toISOString();
      el = document.createElement('div');
      el.className = 'dd-crash';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'dd-crash-message');
      const box = document.createElement('div');
      box.className = 'dd-crash-box';
      const msg = document.createElement('p');
      msg.id = 'dd-crash-message';
      msg.className = 'dd-crash-message';
      msg.textContent = text;
      const actions = document.createElement('div');
      actions.className = 'dd-crash-actions';
      const restart = document.createElement('button');
      restart.type = 'button';
      restart.className = 'dd-crash-restart';
      restart.textContent = t('release.crash.restart');
      restart.addEventListener('click', () => location.reload());
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'dd-crash-copy';
      copyBtn.textContent = t('release.crash.copy');
      const note = document.createElement('p');
      note.className = 'dd-crash-note';
      note.setAttribute('aria-live', 'polite');
      const area = document.createElement('textarea');
      area.className = 'dd-crash-details';
      area.readOnly = true;
      area.hidden = true;
      area.setAttribute('aria-label', t('release.crash.detailsLabel'));
      copyBtn.addEventListener('click', () => {
        area.value = details();
        void copy(note, area);
      });
      actions.append(restart, copyBtn);
      box.append(msg, actions, note, area);
      el.append(box);
      document.body.appendChild(el);
      // The game's own Android bridge must not keep the screen awake behind the panel.
      win.DeepDownAndroid?.keepScreenOn?.(false);
      restart.focus();
    },
  };
})();

/** Errors the platform raises on its own (a refused fullscreen, an aborted fetch) are not crashes. */
function isCrash(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) return false;
  return true;
}

/** An error after boot: stop the game where it stands (no autosave from here on) and show the panel. */
function crash(err: unknown): void {
  if (game && game.mode !== 'crashed') {
    try {
      game.crash(err); // stops the loop and saving, then dispatches 'dd:crash' (the panel)
    } catch (e) {
      console.error('[deep-down] crash()', e);
    }
  }
  panel.show(err);
}

/** Boot failure: the same panel with Restart, and Back exits the app. */
function fatal(message: string, err?: unknown): void {
  console.error(message, err);
  win.deepDownBack = () => false;
  panel.show(err ?? null, message);
}

// The frame guard in Game dispatches 'dd:crash' (detail: the error) after repeated failures.
window.addEventListener('dd:crash', (e) => panel.show((e as CustomEvent<unknown>).detail));
window.addEventListener('error', (e) => {
  console.error('[deep-down]', e.error ?? e.message);
  // ResizeObserver notices and cross-origin "Script error." carry no error object.
  if (booted && e.error && isCrash(e.error)) crash(e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  if (booted && isCrash(e.reason)) {
    console.error('[deep-down] unhandled rejection', e.reason);
    crash(e.reason);
  }
});

// ---------------------------------------------------------------------------------------
// Android Back. Before boot: ignore while loading. After a fatal error or on the crash panel: exit.

win.deepDownBack = () => !panel.visible;

/** Back belongs to the page everywhere except the main menu root (and the crash panel). */
function backHandled(): boolean {
  if (panel.visible) return false;
  if (!game || !booted) return true;
  return !(game.mode === 'menu' && game.ui.screen === 'menu');
}

{
  // Predictive Back (API 33+): the shell registers its callback only while the page handles Back,
  // so the system can animate back-to-home at the menu root. Pushed on change, polled every 250 ms.
  let sent: boolean | null = null;
  const push = () => {
    const bridge = win.DeepDownAndroid;
    if (!bridge || typeof bridge.setBackHandled !== 'function') return;
    const handled = backHandled();
    if (handled === sent) return;
    sent = handled;
    bridge.setBackHandled(handled);
  };
  push();
  window.setInterval(push, 250);
}

// ---------------------------------------------------------------------------------------
// Android lifecycle (MainActivity.onPause/onResume): save, pause and go quiet before the shell
// stops the page's timers. The game's own visibilitychange save may follow: one save per second.

let lastSaveAt = -Infinity;
win.deepDownLifecycle = (phase) => {
  const g = game;
  if (!g || !booted || panel.visible) return false;
  if (phase === 'pause') {
    if (performance.now() - lastSaveAt > 1000) g.saveNow('background');
    g.pause();
    g.audio.suspend();
  } else {
    g.audio.resume();
  }
  return true;
};

// ---------------------------------------------------------------------------------------
// Context loss: the browser drops the GPU context (driver reset, memory pressure). three.js
// restores it on its own; meanwhile the game pauses behind a notice, and after 10 s without the
// context back the crash panel takes over.

function watchContext(g: Game): void {
  const canvas = g.renderer.gl.domElement;
  let notice: HTMLElement | null = null;
  let timer = 0;
  canvas.addEventListener('webglcontextlost', () => {
    g.pause();
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'dd-gl-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = t('release.gl.restoring');
      document.body.appendChild(notice);
    }
    // Only visible time counts: a browser restores a hidden page's context when it comes back.
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!notice) return;
        if (document.hidden) {
          document.addEventListener('visibilitychange', arm, { once: true });
          return;
        }
        notice.remove();
        notice = null;
        crash(new Error('WebGL context lost and not restored within 10 s'));
      }, 10_000);
    };
    arm();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    window.clearTimeout(timer);
    notice?.remove();
    notice = null;
  });
}

// ---------------------------------------------------------------------------------------
// Automatic quality. Off in automated browsers (tests, captures) unless the URL has ?autoq=1.

const AUTOQ_KEY = 'deepdown.autoquality';
interface AutoQState {
  auto: boolean;
  toasted: boolean;
}

function governorWanted(): boolean {
  return !navigator.webdriver || new URLSearchParams(location.search).get('autoq') === '1';
}

function readAutoQ(store: LocalStorageStore): AutoQState | null {
  try {
    const raw = store.getItem(AUTOQ_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AutoQState>;
    return { auto: v.auto !== false, toasted: v.toasted === true };
  } catch {
    return null;
  }
}

function writeAutoQ(store: LocalStorageStore, s: AutoQState): void {
  try {
    store.setItem(AUTOQ_KEY, JSON.stringify(s));
  } catch {
    // No storage (private mode): the governor still works for this session.
  }
}

/**
 * Before the game exists (so the renderer starts on the right preset): on the very first launch
 * pick Battery for small devices. An older install keeps auto on only if quality is untouched.
 */
function prepareAutoQuality(): AutoQState | null {
  try {
    return governorWanted() ? firstLaunch() : null;
  } catch (e) {
    console.warn('[deep-down] automatic quality unavailable', e);
    return null;
  }
}

function firstLaunch(): AutoQState {
  const store = new LocalStorageStore();
  const known = readAutoQ(store);
  if (known) return known;
  const saves = new SaveSystem(store);
  const settings = saves.loadSettings();
  let state: AutoQState;
  if (store.getItem(SAVE_KEYS.settings) === null) {
    const nav = navigator as Navigator & { deviceMemory?: number };
    saves.saveSettings({ ...settings, quality: initialQuality(nav.deviceMemory, nav.hardwareConcurrency) });
    state = { auto: true, toasted: false };
  } else {
    state = { auto: settings.quality === 'balanced' && settings.renderScale === null, toasted: false };
  }
  writeAutoQ(store, state);
  return state;
}

function startGovernor(g: Game, state: AutoQState): QualityGovernor {
  const store = new LocalStorageStore();
  const gov = new QualityGovernor(state.auto);
  let expected = { quality: g.settings.quality, renderScale: g.settings.renderScale };
  let last = performance.now();
  const tick = (now: number) => {
    const interval = now - last;
    last = now;
    if (!gov.auto) return; // off for good: stop the loop
    requestAnimationFrame(tick);
    const s = g.settings;
    if (s.quality !== expected.quality || s.renderScale !== expected.renderScale) {
      // The player (Settings) changed it: never touch it again.
      gov.disable();
      writeAutoQ(store, { auto: false, toasted: state.toasted });
      return;
    }
    if (g.mode !== 'playing' || document.hidden) {
      gov.reset();
      return;
    }
    const action = gov.sample(interval, s.quality, s.renderScale);
    if (action === 'none') return;
    g.updateSettings(action === 'battery' ? { quality: 'battery' } : { renderScale: GOVERNOR.lowScale });
    expected = { quality: g.settings.quality, renderScale: g.settings.renderScale };
    if (!state.toasted) {
      state.toasted = true;
      g.bus.emit('toast', { text: t('release.quality.lowered'), tone: 'info' });
    }
    writeAutoQ(store, { auto: true, toasted: state.toasted });
  };
  if (gov.auto) requestAnimationFrame(tick);
  return gov;
}

// ---------------------------------------------------------------------------------------
// Boot

const createUi: UiFactory = (root, actions, bus, input) => new UI(root, actions, bus, input);

async function boot(): Promise<void> {
  // The language first (the device's, or the one chosen in Settings): every word is built in it.
  setLanguage(languageOf(loadControlPrefs(), () => detectLanguage()));
  document.documentElement.lang = language();
  // index.html found the engine too old and already shows the 'update your WebView' message.
  if ((window as { __DD_UNSUPPORTED__?: boolean }).__DD_UNSUPPORTED__) return;
  if (!Renderer.isSupported()) {
    fatal(t('error.webgl'));
    return;
  }
  const autoq = prepareAutoQuality();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  game = new Game(canvas, ui, createUi);
  await game.boot();
  const g = game;
  booted = true;
  panel.readRenderer(g);
  // Game installs its own Back handler during boot; the crash panel takes precedence.
  const gameBack = win.deepDownBack;
  win.deepDownBack = () => (panel.visible ? false : gameBack ? gameBack() : true);
  g.bus.on('game:saved', () => {
    lastSaveAt = performance.now();
  });
  watchContext(g);
  const gov = autoq ? startGovernor(g, autoq) : null;
  // Test and support surface for the release shell (the game's own is window.__DD__).
  win.__DD_RELEASE__ = {
    version: { version: VERSION, build: BUILD, versionCode: VERSION_CODE },
    crashPanel: () => panel.visible,
    crashDetails: () => panel.details,
    backHandled,
    governor: () => (gov ? { auto: gov.auto, lastMedianMs: gov.lastMedianMs } : null),
  };
}

boot().catch((e) => fatal(t('error.generic'), e));
