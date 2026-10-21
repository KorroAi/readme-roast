// The calm first-person HUD (src/ui/hybrid/Hud.ts; SPEC §3.4, §8.9, E21, F10) on a minimal stand-in DOM (the unit
// suite runs in Node): the plates and their ids, the depth's number/unit split, ≤ 5 persistent numbers, the cards
// standing aside for a ceremony, F10 (a steady frame writes nothing: no text, no attribute, no class, no style),
// hold-to-buy (a press buys, 380 ms → 8/s, 1.88 s → 16/s, release stops), the objective line's card flash, and the
// sheet (rows kept across refreshes, the open/close hook).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ----- a stand-in DOM that counts writes the way a MutationObserver would see them ---------------------------------
let writes = 0;
const log: string[] = [];
const wrote = (what: string) => {
  writes++;
  if (log.length < 40) log.push(what);
};

type Fn = (e: unknown) => void;

class FakeNode {
  parentElement: FakeEl | null = null;
  constructor(public text = '') {}
  get textContent(): string {
    return this.text;
  }
}

class FakeClassList {
  constructor(private readonly el: FakeEl) {}
  private get set(): Set<string> {
    return new Set((this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
  }
  private write(s: Set<string>) {
    this.el.setAttribute('class', [...s].join(' '));
  }
  contains(c: string): boolean {
    return this.set.has(c);
  }
  // The DOM spec runs the update steps (an attribute write) on every add/remove, changed or not.
  add(...c: string[]) {
    const s = this.set;
    for (const x of c) s.add(x);
    this.write(s);
  }
  remove(...c: string[]) {
    const s = this.set;
    for (const x of c) s.delete(x);
    this.write(s);
  }
  // toggle(c, force) writes only when it changes something.
  toggle(c: string, force?: boolean): boolean {
    const s = this.set;
    const on = force ?? !s.has(c);
    if (on === s.has(c)) return on;
    if (on) s.add(c);
    else s.delete(c);
    this.write(s);
    return on;
  }
}

class FakeEl extends FakeNode {
  readonly childNodes: Array<FakeEl | FakeNode> = [];
  readonly attrs = new Map<string, string>();
  readonly classList = new FakeClassList(this);
  readonly listeners: Record<string, Fn[]> = {};
  readonly style: Record<string, string>;
  readonly dataset: Record<string, string>;
  offsetWidth = 0;
  constructor(public readonly tagName: string) {
    super();
    const style: Record<string, string> = {};
    this.style = new Proxy(style, {
      set: (o, k: string, v: string) => {
        if (o[k] !== v) wrote(`style.${k}`);
        o[k] = v;
        return true;
      },
      get: (o, k: string) => o[k] ?? '',
    });
    this.dataset = new Proxy({} as Record<string, string>, {
      set: (_o, k: string, v: string) => {
        this.setAttribute(`data-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, String(v));
        return true;
      },
      get: (_o, k: string) => this.getAttribute(`data-${String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`) ?? undefined,
    });
  }
  get className(): string {
    return this.getAttribute('class') ?? '';
  }
  set className(v: string) {
    this.setAttribute('class', v);
  }
  setAttribute(k: string, v: string) {
    wrote(`@${k}`);
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  get children(): FakeEl[] {
    return this.childNodes.filter((c): c is FakeEl => c instanceof FakeEl);
  }
  get childElementCount(): number {
    return this.children.length;
  }
  override get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  override set textContent(v: string) {
    wrote('text');
    this.childNodes.length = 0;
    if (v) this.childNodes.push(new FakeNode(v));
  }
  appendChild<T extends FakeEl | FakeNode>(c: T): T {
    wrote('child');
    c.parentElement = this;
    this.childNodes.push(c);
    return c;
  }
  append(...cs: Array<FakeEl | FakeNode | string>) {
    for (const c of cs) this.appendChild(typeof c === 'string' ? new FakeNode(c) : c);
  }
  replaceChildren(...cs: Array<FakeEl | FakeNode>) {
    wrote('children');
    this.childNodes.length = 0;
    for (const c of cs) {
      c.parentElement = this;
      this.childNodes.push(c);
    }
  }
  remove() {
    const p = this.parentElement;
    if (p) p.childNodes.splice(p.childNodes.indexOf(this), 1);
  }
  addEventListener(k: string, f: Fn) {
    (this.listeners[k] ??= []).push(f);
  }
  removeEventListener(k: string, f: Fn) {
    this.listeners[k] = (this.listeners[k] ?? []).filter((x) => x !== f);
  }
  fire(k: string, e: Record<string, unknown> = {}) {
    for (const f of this.listeners[k] ?? []) f({ pointerId: 1, preventDefault() {}, stopPropagation() {}, target: this, ...e });
  }
  getBoundingClientRect() {
    const n = (k: string) => parseFloat(this.style[k] || '0');
    return { x: n('left'), y: n('top'), width: n('width'), height: n('height'), left: n('left'), top: n('top'), right: n('left') + n('width'), bottom: n('top') + n('height') };
  }
  focus() {}
  /** Depth-first search by an attribute value. */
  find(k: string, v: string): FakeEl | null {
    if (this.getAttribute(k) === v) return this;
    for (const c of this.children) {
      const r = c.find(k, v);
      if (r) return r;
    }
    return null;
  }
}

const fakeDocument = {
  createElement: (tag: string) => new FakeEl(tag.toUpperCase()),
  createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
  createTextNode: (text: string) => new FakeNode(text),
};

// ----- the HUD under test ------------------------------------------------------------------------------------------
import type { Hud as HudT, HudCard, HudFrame, HudHooks } from '../../../src/ui/hybrid/Hud';

let Hud: typeof HudT;
let root: FakeEl;
let hooks: HudHooks & { bought: Array<[string, boolean]>; sheets: Array<string | null>; goals: number };

const card = (slot: 'pick' | 'best', id: string, price: string, ready = true): HudCard => ({ slot, id, title: id, sub: 'Lv 3', price, ready, progress: ready ? 1 : 0.4, best: slot === 'best' });
const frame = (over: Partial<HudFrame> = {}): HudFrame => ({
  depth: '12 m',
  biome: 'Topsoil',
  gold: '1.24K',
  rate: '',
  goal: { id: 'lamps', text: 'Relight the lamps · 1/2', fill: 0.5, icon: 'lamp', reward: '', ring: null },
  cards: [card('pick', 'pick', '980'), card('best', 'crew:0', '1.6K', false)],
  badge: false,
  skip: false,
  ceremony: false,
  ...over,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('window', globalThis);
  ({ Hud } = await import('../../../src/ui/hybrid/Hud'));
  root = new FakeEl('DIV');
  const bought: Array<[string, boolean]> = [];
  const sheets: Array<string | null> = [];
  hooks = {
    bought,
    sheets,
    goals: 0,
    buy: (id, repeat) => {
      bought.push([id, repeat]);
      return true;
    },
    goal: () => hooks.goals++,
    sheet: (tab) => sheets.push(tab),
    skip: () => {},
    rows: (tab) => [0, 1, 2].map((i) => ({ id: `${tab}:${i}`, title: `Row ${i}`, sub: 'sub', level: `Lv ${i}`, price: `${i + 1}0`, ready: i === 0, locked: false, best: i === 0 })),
    settings: () => [],
    setSetting: () => {},
    collect: () => {},
    toCamp: () => {},
  };
  writes = 0;
  log.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function make(): HudT {
  const hud = new Hud(root as unknown as HTMLElement, hooks);
  hud.setLayout(390, 844, 0, 0, false);
  return hud;
}

describe('the calm HUD (E21)', () => {
  it('builds row A, the objective line, two cards, Skip, the note, the focus panel, the sheet and the return plate', () => {
    make();
    for (const id of ['depth', 'gold', 'menu', 'goal', 'card-pick', 'card-best', 'skip', 'note', 'focus', 'sheet', 'return']) expect(root.find('data-hud', id), id).not.toBeNull();
  });

  it('splits the depth into its number and its unit; shows gold; the plates stay under 17 % of the screen', () => {
    const hud = make();
    hud.update(frame(), 0);
    const depth = root.find('data-hud', 'depth')!;
    expect(depth.children[0].children.map((c) => c.textContent)).toEqual(['12', ' m']);
    expect(root.find('data-hud', 'gold')!.textContent).toContain('1.24K');
    expect(hud.plateArea()).toBeLessThanOrEqual(0.17);
  });

  it('shows at most 5 persistent numbers (depth, gold, the goal count, two prices); a ceremony stands the cards aside', () => {
    const hud = make();
    hud.update(frame(), 0);
    const n = hud.numbers();
    expect(n.persistent.length).toBeLessThanOrEqual(5);
    expect(n.persistent).toContain('980');
    hud.update(frame({ ceremony: true }), 16);
    expect(hud.numbers().persistent.length).toBe(3);
    expect(hud.cardViews().every((c) => !c.visible)).toBe(true);
    expect(root.find('data-hud', 'card-pick')!.classList.contains('hy-hidden')).toBe(true);
  });

  it('F10: a steady frame writes nothing to the DOM (text, attributes, classes, styles)', () => {
    const hud = make();
    hud.update(frame(), 0);
    hud.update(frame(), 16);
    writes = 0;
    log.length = 0;
    for (let i = 2; i < 30; i++) hud.update(frame(), i * 16);
    expect(log).toEqual([]);
    expect(writes).toBe(0);
    // A real change writes only what changed.
    hud.update(frame({ gold: '1.25K' }), 500);
    expect(writes).toBe(1);
  });

  it('F10 with the sheet open: the 4 Hz row refresh writes nothing when the rows did not change', () => {
    const hud = make();
    hud.update(frame(), 0);
    hud.toggleSheet('dig');
    hud.update(frame(), 300);
    writes = 0;
    log.length = 0;
    for (let i = 1; i < 12; i++) hud.update(frame(), 300 + i * 260);
    expect(log).toEqual([]);
  });
});

describe('the cards: hold to buy (SPEC §2.2)', () => {
  it('a press buys once; held 380 ms it repeats at 8/s, after 1.88 s at 16/s; the release stops it', () => {
    const hud = make();
    hud.update(frame(), 0);
    const el = root.find('data-hud', 'card-pick')!;
    el.fire('pointerdown');
    expect(hooks.bought).toEqual([['pick', false]]);
    vi.advanceTimersByTime(379);
    expect(hooks.bought.length).toBe(1);
    // 380 ms → 1,880 ms: 8/s (125 ms apart) → about 12 repeats.
    vi.advanceTimersByTime(1501);
    const at188 = hooks.bought.length - 1;
    expect(at188).toBeGreaterThanOrEqual(11);
    expect(at188).toBeLessThanOrEqual(13);
    // Then 16/s: 1 s → about 16 more.
    vi.advanceTimersByTime(1000);
    const more = hooks.bought.length - 1 - at188;
    expect(more).toBeGreaterThanOrEqual(14);
    expect(more).toBeLessThanOrEqual(17);
    expect(hooks.bought.slice(1).every(([id, rep]) => id === 'pick' && rep)).toBe(true);
    el.fire('pointerup');
    const n = hooks.bought.length;
    vi.advanceTimersByTime(1000);
    expect(hooks.bought.length).toBe(n);
  });

  it('a hidden card buys nothing', () => {
    const hud = make();
    hud.update(frame({ cards: [null, null] }), 0);
    root.find('data-hud', 'card-pick')!.fire('pointerdown');
    expect(hooks.bought).toEqual([]);
  });

  it('the objective line flashes a card on screen (and says so); a hidden one is not flashed', () => {
    const hud = make();
    hud.update(frame(), 0);
    expect(hud.flashCard('pick')).toBe(true);
    expect(root.find('data-hud', 'card-pick')!.classList.contains('hy-flash')).toBe(true);
    vi.advanceTimersByTime(700);
    expect(root.find('data-hud', 'card-pick')!.classList.contains('hy-flash')).toBe(false);
    expect(hud.flashCard('crew:9')).toBe(false);
    root.find('data-hud', 'goal')!.fire('click');
    expect(hooks.goals).toBe(1);
  });
});

describe('the sheet', () => {
  it('≡ opens the Dig tab and closes it; rows are built once and kept across refreshes', () => {
    const hud = make();
    hud.update(frame(), 0);
    root.find('data-hud', 'menu')!.fire('click');
    expect(hooks.sheets).toEqual(['dig']);
    expect(hud.sheetOpen).toBe(true);
    const body = root.find('class', 'hy-sheet-body')!;
    expect(body.childElementCount).toBe(3);
    const first = body.children[0];
    hud.update(frame(), 400);
    expect(body.children[0]).toBe(first);
    expect(first.getAttribute('data-id')).toBe('dig:0');
    expect(hud.plates().some((p) => p.id === 'sheet')).toBe(true);
    root.find('data-hud', 'menu')!.fire('click');
    expect(hooks.sheets).toEqual(['dig', null]);
    expect(hud.sheetOpen).toBe(false);
  });
});
