import { beforeAll, describe, expect, it } from 'vitest';

// The shell's screens (the menu at the surface, settings, about) build real DOM. Vitest runs in node here (no DOM package), so a small
// stand-in document covers what the builders use: elements, attributes, classes, text, listeners.

class Node0 {
  parentNode: El | null = null;
  constructor(public text = '') {}
  get textContent(): string {
    return this.text;
  }
}

class El extends Node0 {
  readonly tagName: string;
  children: Array<El | Node0> = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<(e: unknown) => void>>();
  style: Record<string, string> & { setProperty(k: string, v: string): void } = Object.assign(Object.create(null), { setProperty: () => undefined });
  private html = '';
  constructor(tag: string) {
    super();
    this.tagName = tag.toUpperCase();
  }
  get className(): string {
    return this.attrs.get('class') ?? '';
  }
  set className(v: string) {
    this.attrs.set('class', v);
  }
  get classList() {
    const get = () => new Set(this.className.split(/\s+/).filter(Boolean));
    const put = (s: Set<string>) => (this.className = [...s].join(' '));
    return {
      add: (...c: string[]) => put(new Set([...get(), ...c])),
      remove: (...c: string[]) => {
        const s = get();
        for (const x of c) s.delete(x);
        put(s);
      },
      toggle: (c: string, on?: boolean) => {
        const s = get();
        const want = on ?? !s.has(c);
        if (want) s.add(c);
        else s.delete(c);
        put(s);
        return want;
      },
      contains: (c: string) => get().has(c),
    };
  }
  override get textContent(): string {
    return this.html ? this.html.replace(/<[^>]+>/g, '') : this.children.map((c) => c.textContent).join('');
  }
  override set textContent(v: string) {
    this.children = [new Node0(String(v))];
  }
  set innerHTML(v: string) {
    this.html = v;
    this.children = [];
  }
  get innerHTML(): string {
    return this.html;
  }
  get firstElementChild(): El | null {
    return (this.children.find((c) => c instanceof El) as El | undefined) ?? null;
  }
  get content() {
    return this;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  appendChild<T extends El | Node0>(c: T): T {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  append(...cs: Array<El | Node0 | string>): void {
    for (const c of cs) this.appendChild(typeof c === 'string' ? new Node0(c) : c);
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  click(): void {
    for (const fn of this.listeners.get('click') ?? []) fn({ target: this });
  }
  getContext(): null {
    return null;
  }
  /** Every descendant element, depth first. */
  all(): El[] {
    const out: El[] = [];
    for (const c of this.children) if (c instanceof El) out.push(c, ...c.all());
    return out;
  }
  byClass(c: string): El[] {
    return this.all().filter((e) => e.classList.contains(c));
  }
  byKey(k: string): El | undefined {
    return this.all().find((e) => e.getAttribute('data-key') === k);
  }
  /** Class selectors only ('.a'), which is all the widgets ask for. */
  querySelector(sel: string): El | null {
    return sel.startsWith('.') ? (this.byClass(sel.slice(1))[0] ?? null) : null;
  }
}

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.document = { createElement: (tag: string) => new El(tag), createTextNode: (t: string) => new Node0(t) };
  g.window = Object.assign(globalThis, { setTimeout, clearTimeout });
  g.requestAnimationFrame = () => 0;
  g.matchMedia = () => ({ matches: false });
});

// The modules are imported after the shim is installed.
const load = async () => ({
  menu: await import('../../src/ui/screens/menu'),
  settings: await import('../../src/ui/screens/settings'),
  about: await import('../../src/ui/screens/about'),
  types: await import('../../src/save/types'),
});

import type { UiActions } from '../../src/ui/types';
import type { ScreenHost, ScreenState } from '../../src/ui/screens/host';
import type { Settings } from '../../src/save/types';

function host(over: Partial<UiActions> = {}, settings?: Settings) {
  const log: string[] = [];
  let s = settings as Settings;
  const actions: UiActions = {
    play: () => log.push('play'),
    toMenu: () => log.push('toMenu'),
    getSettings: () => s,
    updateSettings: (p) => {
      s = { ...s, ...p };
      log.push(`set:${Object.keys(p).join(',')}`);
    },
    resetSettings: () => log.push('reset'),
    deleteSave: () => log.push('delete'),
    hasSave: () => true,
    saveTimestamp: () => Date.now() - 120_000,
    saveSummary: () => '312 m · Halden Works',
    ...over,
  };
  const state: ScreenState = { aboutTab: 'about' };
  const h: ScreenHost = {
    actions,
    state,
    opening: true,
    show: (id) => log.push(`show:${id}`),
    confirm: (c) => {
      log.push(`confirm:${c.text}`);
      c.onYes();
    },
    settingsBack: () => log.push('back'),
    toast: (text) => log.push(`toast:${text}`),
    rerender: () => log.push('rerender'),
    patchSettings: (p) => actions.updateSettings(p),
    aboutBack: () => log.push('aboutBack'),
  };
  return { h, log, get settings() {
    return s;
  } };
}

describe('the menu at the surface', () => {
  it('offers Descend (with the save line), Settings and About, and nothing of the old game', async () => {
    const { menu, types } = await load();
    const { h, log } = host({}, { ...types.DEFAULT_SETTINGS });
    const el = menu.buildMenu(h) as unknown as El;
    const keys = el.all().map((e) => e.getAttribute('data-key')).filter(Boolean);
    expect(keys).toEqual(['continue', 'settings', 'about']);
    const cont = el.byKey('continue')!;
    expect(cont.textContent).toContain('Descend');
    expect(cont.textContent).toContain('312 m · Halden Works');
    cont.click();
    el.byKey('settings')!.click();
    el.byKey('about')!.click();
    expect(log).toEqual(['play', 'show:settings', 'show:about']);
    expect(el.textContent).not.toMatch(/backpack|workbench|inventory|camp/i);
  });
});

describe('settings', () => {
  it('lists the W1 rows: sound, haptics and their strength, shake, left-handed, quality, brightness, show FPS, text size, contrast, motion, flashes, notation', async () => {
    const { settings, types } = await load();
    const { h } = host({}, { ...types.DEFAULT_SETTINGS });
    const el = settings.buildSettings(h) as unknown as El;
    const keys = new Set(el.all().map((e) => e.getAttribute('data-key')).filter(Boolean));
    for (const k of ['masterVolume', 'musicVolume', 'sfxVolume', 'vibration', 'shake', 'leftHanded', 'quality:battery', 'quality:balanced', 'quality:high', 'brightness', 'showFps', 'textSize:normal', 'textSize:large', 'contrast', 'hapticStrength:light', 'hapticStrength:strong', 'motion:full', 'motion:reduced', 'motion:off', 'flashes:on', 'flashes:soft', 'flashes:off', 'notation:letters', 'notation:scientific', 'reset', 'delete', 'about', 'close']) {
      expect(keys.has(k), k).toBe(true);
    }
    // No look sensitivity, invert Y or camera follow: there is no camera to drive.
    for (const k of ['look', 'invertY', 'cameraFollow']) expect(keys.has(k), k).toBe(false);
  });

  it('applies a toggle and a segment at once', async () => {
    const { settings, types } = await load();
    const ctx = host({}, { ...types.DEFAULT_SETTINGS });
    const el = settings.buildSettings(ctx.h) as unknown as El;
    el.byKey('leftHanded')!.click();
    el.byKey('quality:high')!.click();
    el.byKey('motion:reduced')!.click();
    el.byKey('flashes:soft')!.click();
    expect(ctx.settings.leftHanded).toBe(true);
    expect(ctx.settings.quality).toBe('high');
    expect(ctx.settings.motion).toBe('reduced');
    expect(ctx.settings.flashes).toBe('soft');
    expect(ctx.log).toContain('set:leftHanded');
  });

  it('asks before erasing the descent', async () => {
    const { settings, types } = await load();
    const ctx = host({}, { ...types.DEFAULT_SETTINGS });
    const el = settings.buildSettings(ctx.h) as unknown as El;
    el.byKey('delete')!.click();
    expect(ctx.log.some((l) => l.startsWith('confirm:'))).toBe(true);
    expect(ctx.log).toContain('delete');
  });
});

describe('about', () => {
  it('shows the version, then privacy and licences tabs', async () => {
    const { about, types } = await load();
    const ctx = host({}, { ...types.DEFAULT_SETTINGS });
    const el = about.buildAbout(ctx.h) as unknown as El;
    const tabs = el.all().filter((e) => e.getAttribute('role') === 'tab');
    expect(tabs.map((tb) => tb.getAttribute('data-key'))).toEqual(['atab:about', 'atab:privacy', 'atab:licences']);
    expect(el.textContent).toContain('DEEP DOWN');
    tabs[1].click();
    expect(ctx.h.state.aboutTab).toBe('privacy');
  });
});
