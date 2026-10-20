import { beforeAll, describe, expect, it } from 'vitest';

// The progression screens build real DOM. Vitest runs in node here (no DOM package), so a small
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
  ...(await import('../../src/ui/screens/summary')),
  ...(await import('../../src/ui/screens/journal')),
  ...(await import('../../src/ui/screens/workbench')),
  ...(await import('../../src/ui/screens/board')),
  ...(await import('../../src/ui/screens/ending')),
  ...(await import('../../src/ui/screens/progress')),
  ...(await import('../../src/ui/notices')),
  ...(await import('../../src/gameplay/discoveries')),
  ...(await import('../../src/gameplay/Journal')),
  ...(await import('../../src/gameplay/Tree')),
  ...(await import('../../src/gameplay/Equipment')),
  ...(await import('../../src/gameplay/Inventory')),
  ...(await import('../../src/gameplay/Storage')),
  ...(await import('../../src/config/recipes')),
  ...(await import('../../src/i18n')),
});

import type { CraftReason, ExpeditionReport, JournalView, NodeId, Place, UiActions } from '../../src/ui/types';
import type { ScreenHost, ScreenState } from '../../src/ui/screens/host';

const baseReport: ExpeditionReport = {
  n: 3,
  outcome: 'returned',
  duration: 252,
  deepest: 96,
  newBest: true,
  previousBest: 71,
  mined: 58,
  found: { stone: 31, copperOre: 9 },
  banked: { stone: 31, copperOre: 9 },
  bankedTotal: 40,
  cached: null,
  cacheDepth: null,
  lostCount: 0,
  damage: 0,
  fuelLeft: 61,
  discoveries: ['hollow'],
  runes: ['runeDescent'],
  records: ['deepest'],
  show: true,
  next: { id: 'copperPickaxe', name: 'Copper Pickaxe', cost: [{ item: 'copperOre', have: 3, need: 8 }], ready: false },
  craftableNow: false,
  overnight: null,
};

function hostFor(actions: Partial<UiActions>, state: Partial<ScreenState> = {}, opening = true): ScreenHost & { closed: number; opened: number } {
  const host = {
    actions: actions as UiActions,
    state: { invTab: 'backpack', invSlot: 0, loadingProgress: 0, loadingLabel: '', deathLost: {}, treeTab: 'workbench', treeSel: null, treeCrafted: null, journalTab: 'discoveries', aboutTab: 'about', reportAt: -1e9, ...state } as ScreenState,
    opening,
    closed: 0,
    opened: 0,
    show: () => undefined,
    confirm: () => undefined,
    settingsBack: () => undefined,
    toast: () => undefined,
    rerender: () => undefined,
    patchSettings: () => undefined,
    closeReport: () => void host.closed++,
    openFromReport: () => void host.opened++,
    aboutBack: () => undefined,
  };
  return host;
}

describe('progress helpers', () => {
  it('formats trip clocks and whole-descent times', async () => {
    const m = await load();
    expect(m.clock(252)).toBe('4:12');
    expect(m.clock(61)).toBe('1:01');
    expect(m.clock(0)).toBe('0:00');
    expect(m.clock(Number.NaN)).toBe('0:00');
    expect(m.hoursMinutes(4210)).toBe('1:10');
    expect(m.hoursMinutes(59)).toBe('0:00');
  });

  it('counts banked items up over the window and lands exactly', async () => {
    const m = await load();
    expect(m.countUp(40, 0, 600)).toBe(0);
    expect(m.countUp(40, 300, 600)).toBeGreaterThan(20);
    expect(m.countUp(40, 300, 600)).toBeLessThan(40);
    expect(m.countUp(40, 600, 600)).toBe(40);
    let last = 0;
    for (let t = 0; t <= 600; t += 50) {
      const v = m.countUp(17, t, 600);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('measures how much of a cost is on hand, each material capped at its need', async () => {
    const m = await load();
    expect(m.costFraction([{ have: 8, need: 8 }, { have: 30, need: 12 }])).toBe(1);
    expect(m.costFraction([{ have: 4, need: 8 }, { have: 0, need: 12 }])).toBeCloseTo(0.2);
    expect(m.costFraction([])).toBe(1);
  });

  it('opens the tree on the requested node, else the Next node of the tab, else one that can be made', async () => {
    const m = await load();
    const nodes: Array<{ id: NodeId; state: CraftReason; place: Place }> = [
      { id: 'copperPickaxe', state: 'owned', place: 'workbench' },
      { id: 'sturdyPack', state: 'missing', place: 'workbench' },
      { id: 'copperLantern', state: 'ok', place: 'workbench' },
      { id: 'ironPickaxe', state: 'ok', place: 'forge' },
    ];
    expect(m.pickNode(nodes, 'workbench', 'ironPickaxe', null)?.id).toBe('ironPickaxe');
    expect(m.pickNode(nodes, 'workbench', null, 'sturdyPack')?.id).toBe('sturdyPack');
    expect(m.pickNode(nodes, 'workbench', null, 'ironPickaxe')?.id).toBe('copperLantern');
    expect(m.pickNode(nodes, 'forge', null, null)?.id).toBe('ironPickaxe');
    expect(m.tabOf('field')).toBe('camp');
  });
});

describe('Expedition Report', () => {
  it('shows the ledger, the NEW BEST stamp, the haul, the finds and the Next card; summary-close closes it', async () => {
    const m = await load();
    const host = hostFor({ getReport: () => baseReport });
    const el = m.buildSummary(host) as unknown as El;
    const text = el.textContent;
    expect(text).toContain('Expedition 3 · 4:12');
    expect(text).toContain(m.t('ui.report.newBest'));
    expect(text).toContain('-96 m');
    expect(el.byClass('dd-report-chip').length).toBe(2);
    expect(text).toContain(m.t('discovery.hollow.title'));
    expect(text).toContain(m.t('item.runeDescent'));
    expect(text).toContain('Copper Pickaxe');
    expect(el.byClass('sec-cached')).toHaveLength(0);
    // Nothing can be made: the call to action heads out again.
    expect(el.byKey('summary-go')).toBeDefined();
    expect(el.byKey('summary-workbench')).toBeUndefined();
    el.byKey('summary-close')!.click();
    expect(host.closed).toBe(1);
  });

  it('renders the black-out variant: what waits in the pack, where, and what was lost', async () => {
    const m = await load();
    const report: ExpeditionReport = { ...baseReport, outcome: 'blackout', banked: {}, bankedTotal: 0, cached: { stone: 6, copperOre: 3 }, cacheDepth: 84, lostCount: 12, newBest: false, records: [] };
    const el = m.buildSummary(hostFor({ getReport: () => report })) as unknown as El;
    const text = el.textContent;
    expect(el.byClass('sec-banked')).toHaveLength(0);
    const cached = el.byClass('sec-cached')[0];
    expect(cached).toBeDefined();
    expect(cached.textContent).toContain(m.t('item.stone'));
    expect(cached.textContent).toContain('×6');
    expect(cached.textContent).toContain('×3');
    expect(text).toContain(m.t('death.cacheAt', { depth: 84, count: 9 }));
    expect(text).toContain(m.t('ui.report.lost', { count: 12 }));
    expect(text).toContain(m.t('ui.report.outcome.blackout'));
    expect(text).not.toContain(m.t('ui.report.newBest'));
  });

  it('offers Open Workbench when something can be made', async () => {
    const m = await load();
    const host = hostFor({ getReport: () => ({ ...baseReport, craftableNow: true }) });
    const el = m.buildSummary(host) as unknown as El;
    el.byKey('summary-workbench')!.click();
    expect(host.opened).toBe(1);
  });

  it('takes sections from later waves through the registry, in their column and order', async () => {
    const m = await load();
    m.registerReportSection({ id: 'test-contract', column: 'ahead', order: 5, build: (r) => m.reportSection('test-contract', 'Contract', `paid ${r.n}`) });
    try {
      const ids = m.reportSections().map((s) => s.id);
      expect(ids.indexOf('test-contract')).toBeLessThan(ids.indexOf('next'));
      expect(ids.indexOf('test-contract')).toBeGreaterThan(ids.indexOf('found'));
      const el = m.buildSummary(hostFor({ getReport: () => baseReport })) as unknown as El;
      const col = el.byClass('col-ahead')[0];
      expect(col.byClass('sec-test-contract')[0].textContent).toContain('paid 3');
    } finally {
      m.registerReportSection({ id: 'test-contract', column: 'ahead', order: 5, build: () => null });
    }
  });
});

describe('Journal', () => {
  const view = async (found: string[]): Promise<JournalView> => {
    const m = await load();
    const discoveries = m.DISCOVERIES.map((d) => ({
      id: d.id,
      title: d.id,
      body: '',
      found: found.includes(d.id),
      hint: `hint ${d.id}`,
      major: d.major,
      log: d.log === true,
      zone: d.log ? 'logs' : 'hall',
      zoneName: 'Hall',
      expedition: null,
      depth: null,
    }));
    return {
      discoveries,
      zones: [{ id: 'hall', name: 'Hall', found: 0, total: 0 }],
      found: discoveries.filter((e) => e.found).length,
      total: discoveries.length,
      runes: [],
      runesFound: 0,
      runesTotal: 8,
      relics: [],
      ending: { reached: false, expeditions: 0, deepest: 0, playTime: 0, answer: '' },
      focus: 'discoveries',
    };
  };

  it('counts every discovery of the table: a card each, found or not, k/N from the list', async () => {
    const m = await load();
    const v = await view(['hollow', 'note.landing', 'crystals']);
    const el = m.buildJournal(hostFor({ getJournal: () => v })) as unknown as El;
    expect(el.byClass('dd-lore')).toHaveLength(m.DISCOVERY_TOTAL);
    expect(el.byClass('found')).toHaveLength(3);
    expect(el.byClass('unfound')).toHaveLength(m.DISCOVERY_TOTAL - 3);
    expect(el.byClass('dd-journal-total')[0].textContent).toContain(`3/${m.DISCOVERY_TOTAL}`);
  });

  it('shows the game’s own journal view: N is the discovery table, every entry a card, k the ones found', async () => {
    const m = await load();
    const found = ['crystals', 'hollow', 'note.office', 'note.rift'];
    const v = m.buildJournalView({ discoveries: found, keyItems: ['runeDescent'], foundAt: {}, finale: false, expeditions: 2, deepest: 80, playTime: 600 });
    expect(v.total).toBe(m.DISCOVERY_TOTAL);
    expect(v.discoveries.map((d) => d.id)).toEqual(m.DISCOVERIES.map((d) => d.id));
    const el = m.buildJournal(hostFor({ getJournal: () => v })) as unknown as El;
    expect(el.byClass('dd-lore')).toHaveLength(m.DISCOVERY_TOTAL);
    expect(el.byClass('found')).toHaveLength(found.length);
    expect(el.byClass('dd-journal-total')[0].textContent).toContain(`${found.length}/${m.DISCOVERY_TOTAL}`);
    // Zone headers add up to the table.
    const zoneTotals = el.byClass('dd-journal-zone-n').map((z) => Number(z.textContent.split('/')[1]));
    expect(zoneTotals.reduce((a, b) => a + b, 0)).toBe(m.DISCOVERY_TOTAL);
    // The runes tab: eight plates, the found one inked.
    const runes = m.buildJournal(hostFor({ getJournal: () => ({ ...v, focus: 'runes' }) })) as unknown as El;
    expect(runes.byClass('dd-rune-plate')).toHaveLength(8);
    expect(runes.byClass('inked')).toHaveLength(1);
  });

  it('groups the four Halden logs together, in table order', async () => {
    const m = await load();
    const v = await view(['note.yard']);
    const j = m.buildJournal(hostFor({ getJournal: () => v })) as unknown as El;
    const logs = j.byClass('g-logs')[0];
    const tableLogs = m.DISCOVERIES.filter((d) => d.log).map((d) => d.id);
    expect(tableLogs).toHaveLength(4);
    const cards = logs.byClass('dd-lore');
    expect(cards).toHaveLength(4);
    // The found one shows its title; the others their hints, in table order.
    expect(cards.map((c) => c.textContent)).toEqual(tableLogs.map((id) => (id === 'note.yard' ? id : `?hint ${id}`)));
    expect(logs.byClass('dd-journal-zone-n')[0].textContent).toBe('1/4');
  });
});

describe('the upgrade tree screen', () => {
  it('draws every node with its key, and crafts the selected one through craft:{id}', async () => {
    const m = await load();
    const storage = new m.CampStorage();
    storage.add('stone', 20);
    storage.add('copperOre', 9);
    const ctx = { backpack: new m.Backpack(6), storage, equipment: new m.Equipment(), built: new Set<string>(), atCamp: true, rift: false, rune: false };
    const crafted: string[] = [];
    const host = hostFor({ getCraftTree: () => m.buildTreeView(ctx, { next: 'copperPickaxe' }), craft: (id) => void crafted.push(id) });
    const el = m.buildTree(host) as unknown as El;
    for (const n of m.NODE_LIST) expect(el.byKey(`node:${n.id}`), n.id).toBeDefined();
    expect(el.byClass('dd-node')).toHaveLength(m.NODE_LIST.length);
    // It opens on the Next node, which can be made: its Craft button carries data-key craft:{id}.
    expect(host.state.treeSel).toBe('copperPickaxe');
    const craft = el.byKey('craft:copperPickaxe')!;
    expect(craft.getAttribute('disabled')).toBeNull();
    craft.click();
    expect(crafted).toEqual(['copperPickaxe']);
    expect(host.state.treeCrafted?.id).toBe('copperPickaxe');
  });

  it('keeps the button but disables it, with the reason, when the node cannot be made', async () => {
    const m = await load();
    const ctx = { backpack: new m.Backpack(6), storage: new m.CampStorage(), equipment: new m.Equipment(), built: new Set<string>(), atCamp: true, rift: false, rune: false };
    const host = hostFor({ getCraftTree: () => m.buildTreeView(ctx), craft: () => undefined }, { treeSel: 'ironPickaxe' }, false);
    const el = m.buildTree(host) as unknown as El;
    const b = el.byKey('craft:ironPickaxe')!;
    expect(b.getAttribute('disabled')).not.toBeNull();
    expect(el.byKey('node:ironPickaxe')!.classList.contains('locked')).toBe(true);
  });
});

describe('Survey board', () => {
  it('lists the records and the rumours; a tap points the compass, a second points it home', async () => {
    const m = await load();
    let target: string | null = null;
    const survey = () => ({
      records: { deepest: 96, biggestHaul: 47, expeditions: 7, blackouts: 1, bestStreak: 5, streak: 2 },
      day: 6,
      rumours: [{ id: 'r1', kind: 'living' as const, area: 'adit', areaName: 'the Halden Face', text: 'Fresh copper at the Halden Face', ore: [], distance: 61, present: true, target: target === 'r1' }],
      target,
      built: true,
    });
    const actions = { getSurvey: survey, setCompassTarget: (id: string | null) => void (target = id) };
    let el = m.buildBoard(hostFor(actions)) as unknown as El;
    expect(el.textContent).toContain('-96 m');
    expect(el.textContent).toContain('61 m');
    el.byKey('rumour:r1')!.click();
    expect(target).toBe('r1');
    el = m.buildBoard(hostFor(actions)) as unknown as El;
    el.byKey('rumour:r1')!.click();
    expect(target).toBeNull();
  });
});

describe('end card and banners', () => {
  it('shows the whole descent: expeditions, deepest, time, and Continue plays on', async () => {
    const m = await load();
    let continued = 0;
    const el = m.buildEnding(hostFor({ getJournal: () => ({ ending: { reached: true, expeditions: 14, deepest: 144, playTime: 4210, answer: 'x' } }) as JournalView, continueAfterEnding: () => void continued++ })) as unknown as El;
    const text = el.textContent;
    expect(text).toContain(m.t('ui.ending.place'));
    expect(text).toContain(m.t('ui.ending.coda'));
    expect(text).toContain('14');
    expect(text).toContain('-144 m');
    expect(text).toContain('1:10');
    el.byKey('ending-continue')!.click();
    expect(continued).toBe(1);
  });

  it('labels a Halden log banner HALDEN LOG and any other discovery DISCOVERY', async () => {
    const m = await load();
    const banner = new m.DiscoveryBanner();
    const el = banner.el as unknown as El;
    banner.show({ id: 'note.office', title: 'Log', body: '', index: 3, total: 18, major: false });
    expect(el.byClass('dd-discovery-kind')[0].textContent).toBe(m.t('ui.banner.haldenLog'));
    expect(el.classList.contains('log')).toBe(true);
    banner.dispose();
    const b2 = new m.DiscoveryBanner();
    b2.show({ id: 'hollow', title: 'Hollow', body: '', index: 2, total: 18, major: true });
    expect((b2.el as unknown as El).byClass('dd-discovery-kind')[0].textContent).toBe(m.t('discovery.label'));
    b2.dispose();
  });
});
