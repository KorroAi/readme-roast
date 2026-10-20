import { beforeAll, describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { RUNE_ITEMS } from '../../src/config/items';
import { RUNES, RUNES_BY_GLYPH, RUNE_GLYPH } from '../../src/config/runes';
import { EventBus, type GameEvents } from '../../src/core/events';
import { ENDING_DELAY, FINALE_RANGE, Runes } from '../../src/game/Runes';
import { Journal, buildJournalView } from '../../src/gameplay/Journal';
import { DISCOVERIES } from '../../src/gameplay/discoveries';
import { en } from '../../src/i18n/en';
import { reachFor } from '../../src/world/analysis/economy';
import { reachableCells } from '../../src/world/analysis/reachability';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { PropSpec, RuneSite, WorldLayout } from '../../src/world/gen/types';

let layout: WorldLayout;
beforeAll(() => {
  layout = generateWorld();
}, 60_000);

/** Is a walkable cell next to the stone's own cell (it can be taken from there)? */
function takeable(seen: Uint8Array, r: RuneSite): boolean {
  const w = layout.world;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = Math.floor(r.x) + dx;
        const y = r.y + dy;
        const z = Math.floor(r.z) + dz;
        if (w.inBounds(x, y, z) && seen[w.index(x, y, z)]) return true;
      }
  return false;
}

describe('the eight runes in the world', () => {
  it('seven rune stones plus the Ancient Tablet, one per glyph', () => {
    const sites = layout.progression!.runes;
    expect(sites.length).toBe(7);
    expect(new Set([...sites.map((s) => s.item), 'ancientTablet'])).toEqual(new Set(RUNE_ITEMS));
    expect(new Set(Object.values(RUNE_GLYPH))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(RUNES.length).toBe(8);
    expect(RUNES_BY_GLYPH.map((id) => RUNE_GLYPH[id])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const s of sites) {
      const p = layout.props.find((q) => q.id === s.prop)!;
      expect(p, s.item).toMatchObject({ kind: 'runeStone', interact: 'rune', rune: { item: s.item, glyph: RUNE_GLYPH[s.item] }, modelVariant: RUNE_GLYPH[s.item] });
    }
    expect(layout.props.some((p) => p.kind === 'tablet' && p.interact === 'relic')).toBe(true);
  });

  it('every rune is reachable with exactly its gate (none, the rope, an iron pick, or both)', () => {
    const w = layout.world;
    const sp = layout.spawn;
    const without = (open: (id: number) => boolean, rope: boolean, lantern = 2) => {
      const saved = w.blocks.slice();
      for (let i = 0; i < w.blocks.length; i++) if (open(w.blocks[i])) w.blocks[i] = B.AIR;
      for (const d of layout.features!.runeDoors) if (d.minLanternTier <= lantern) for (const [x, y, z] of d.cells) w.blocks[w.index(x, y, z)] = B.AIR;
      const s = reachableCells(w, Math.floor(sp.x), Math.floor(sp.y) + 1, Math.floor(sp.z), 3, rope ? layout.features!.links : layout.features!.links.filter((l) => l.id !== 'riftRope'));
      w.blocks.set(saved);
      return s;
    };
    const copper = (id: number) => id === B.CRUMBLING_BRICK || id === B.HARDENED_SLATE;
    const iron = (id: number) => copper(id) || id === B.IRONBOUND;
    const sets = {
      none: without(copper, false),
      rope: without(copper, true),
      tier3: without(iron, false),
      'tier3+rope': without(iron, true),
    } as const;
    for (const r of layout.progression!.runes) {
      const need = r.gate;
      for (const [gate, seen] of Object.entries(sets)) {
        const parts = (g: string) => (g === 'none' ? [] : g.split('+'));
        const enough = parts(need).every((k) => parts(gate).includes(k));
        expect(takeable(seen, r), `${r.item} (gate ${need}) with ${gate}`).toBe(enough);
      }
      // Ironbound seals stand in the way of the iron-gated ones.
      if (need.startsWith('tier3')) {
        expect(r.seal.length).toBe(4);
        for (const [x, y, z] of r.seal) expect(w.get(x, y, z)).toBe(B.IRONBOUND);
      } else expect(r.seal).toEqual([]);
    }
    // The tier-1 runes need nothing but a lantern (the shrine's crumbling wall aside).
    expect(layout.progression!.runes.filter((r) => r.gate === 'none').map((r) => r.item).sort()).toEqual(['runeDescent', 'runeEye', 'runeSpire', 'runeStar']);
    expect(layout.progression!.runes.find((r) => r.item === 'runeWaves')!.gate).toBe('rope');
    expect(layout.progression!.runes.find((r) => r.item === 'runeChasm')!.gate).toBe('tier3+rope');
    expect(reachFor(layout, { pickaxe: 1, lantern: 1 })).toBeDefined();
  });

  it('keeps clear of the living rock and the bloom sites', () => {
    const w = layout.world;
    const living = new Set<number>();
    for (const s of layout.features!.living) for (const i of s.cells) living.add(i);
    for (const r of layout.progression!.runes) {
      const cells = [[Math.floor(r.x), r.y, Math.floor(r.z)], [Math.floor(r.x), r.y - 1, Math.floor(r.z)], ...r.seal];
      for (const [x, y, z] of cells) expect(living.has(w.index(x, y, z)), `${r.item} on living rock`).toBe(false);
      for (const b of layout.features!.blooms) expect(Math.hypot(b.p[0] - r.x, b.p[1] - r.y, b.p[2] - r.z), `${r.item} near bloom ${b.id}`).toBeGreaterThan(3.5);
    }
  });

  it('each rune has a name, a page line and a hint, in the mystery tone (glimmer is never explained)', () => {
    for (const id of RUNE_ITEMS) {
      expect(en).toHaveProperty(`item.${id}`);
      expect(en).toHaveProperty(`item.${id}.line`);
      expect(en).toHaveProperty(`item.${id}.hint`);
      const line = (en as Record<string, string>)[`item.${id}.line`];
      expect(line.length).toBeLessThan(90);
      expect(line).not.toMatch(/glimmer/i);
    }
    expect((en as Record<string, string>)['discovery.answer.body']).not.toMatch(/glimmer/i);
  });
});

/** A small stand-in for Game: what Runes reads and calls. */
function fakeGame() {
  const bus = new EventBus<GameEvents>();
  const journal = new Journal();
  const discovered: string[] = [];
  const saves: string[] = [];
  const banners: string[] = [];
  const stone: PropSpec = { id: 'abyssMonolith_29', kind: 'abyssMonolith', x: 123.5, y: 5.75, z: 135.5, rotY: 0, scale: 1, anchor: null, emitters: [], seed: 1 };
  const liveProps = new Map<string, PropSpec>([[stone.id, stone]]);
  let distance = 20;
  const progression = {
    finale: false,
    hintsShown: new Set<string>(),
    relics: [] as string[],
    shelf: false,
    relicPlaced: (i: string) => progression.relics.includes(i),
    placeRelic: (i: string) => progression.relics.push(i),
    markFound: () => undefined,
    ensureShelf: () => (progression.shelf ? false : (progression.shelf = true)),
    syncShelf: () => undefined,
  };
  const game = {
    bus,
    journal,
    progression,
    player: { x: 0, y: 0, z: 0 },
    session: { liveProps, layout: { progression: { runes: [] } }, removeProp: (id: string) => liveProps.delete(id), props: { add: () => undefined } },
    features: { stoneAwake: () => false, focusDistance: () => distance, flock: { spiral: () => undefined } },
    ui: { showDiscovery: (n: { id: string }) => banners.push(n.id), toast: () => undefined, hint: () => undefined, isBlockingInput: () => false },
    grant: (item: string) => journal.addKeyItem(item),
    discover: (id: string) => {
      if (journal.addDiscovery(id)) discovered.push(id);
    },
    saveNow: (r: string) => saves.push(r),
    cameraRig: { addTrauma: () => undefined },
    renderer: { post: { params: { flash: 0, flashColor: { setRGB: () => undefined } } } },
    particles: { sparkle: () => undefined },
    rng: { next: () => 0.5 },
    clearFocus: () => undefined,
    markHalosDirty: () => undefined,
  };
  return { game, stone, discovered, saves, banners, bus, setDistance: (d: number) => (distance = d) };
}

describe('the finale', () => {
  it('wakes the stone at 8/8 only, and reaches "The Answer" then the end card exactly once', () => {
    const f = fakeGame();
    const runes = new Runes(f.game as never);
    runes.attach();
    const found: Array<GameEvents['relic:found']> = [];
    let finales = 0;
    f.bus.on('relic:found', (e) => found.push(e));
    f.bus.on('finale:reached', () => finales++);
    for (const id of RUNE_ITEMS.slice(0, 7)) {
      f.game.grant(id);
      runes.onFound(id);
    }
    expect(runes.count).toBe(7);
    expect(f.game.features.stoneAwake()).toBe(false);
    expect(f.stone.modelVariant ?? 0).toBe(0);
    // Close to the stone with seven: nothing.
    f.setDistance(1);
    runes.update(0.1);
    runes.onStoneTouched();
    expect(f.game.progression.finale).toBe(false);
    expect(f.discovered).not.toContain('answer');
    // The eighth: the niche turns cyan; standing within range brings the Answer.
    f.setDistance(30);
    f.game.grant(RUNE_ITEMS[7]);
    runes.onFound(RUNE_ITEMS[7]);
    runes.onFound(RUNE_ITEMS[7]); // twice: no second page
    expect(found.map((e) => e.count)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(found.every((e) => e.total === 8)).toBe(true);
    expect(f.game.features.stoneAwake()).toBe(true);
    expect(f.stone.modelVariant).toBe(1);
    expect(f.banners.filter((b) => b.startsWith('rune.')).length).toBe(8);
    f.setDistance(FINALE_RANGE - 0.5);
    runes.update(0.1);
    expect(f.game.progression.finale).toBe(true);
    expect(f.discovered).toEqual(['answer']);
    expect(finales).toBe(0); // the Answer shows first
    for (let t = 0; t < ENDING_DELAY + 1; t += 0.5) runes.update(0.5);
    expect(finales).toBe(1);
    runes.onStoneTouched();
    for (let t = 0; t < ENDING_DELAY + 1; t += 0.5) runes.update(0.5);
    expect(finales).toBe(1);
    expect(f.discovered).toEqual(['answer']);
    expect(f.saves).toContain('ending');
  });

  it('touching the awake stone also brings it (and a reload before the end card shows it)', () => {
    const f = fakeGame();
    const runes = new Runes(f.game as never);
    for (const id of RUNE_ITEMS) f.game.grant(id);
    runes.attach();
    expect(f.stone.modelVariant).toBe(1);
    let finales = 0;
    f.bus.on('finale:reached', () => finales++);
    runes.onStoneTouched();
    expect(f.game.progression.finale).toBe(true);
    // The game closes during the Answer: on the next load the end card still comes.
    const g = fakeGame();
    g.game.progression.finale = true;
    for (const id of RUNE_ITEMS) g.game.grant(id);
    const again = new Runes(g.game as never);
    let shown = 0;
    g.bus.on('finale:reached', () => shown++);
    again.attach();
    for (let t = 0; t < 3; t += 0.5) again.update(0.5);
    expect(shown).toBe(1);
    expect(finales).toBe(0);
  });

  it('the Journal lists every discovery, the eight runes in glyph order and the end card numbers', () => {
    const v = buildJournalView({ discoveries: ['hollow', 'crystals'], keyItems: ['runeEye', 'ancientTablet'], foundAt: { hollow: [1, 62], runeEye: [2, 62] }, finale: false, expeditions: 3, deepest: 96, playTime: 1500 });
    expect(v.total).toBe(DISCOVERIES.length);
    expect(v.found).toBe(2);
    expect(v.discoveries.find((d) => d.id === 'hollow')).toMatchObject({ found: true, expedition: 1, depth: 62, zone: 'hollow' });
    expect(v.discoveries.find((d) => d.id === 'answer')).toMatchObject({ found: false, major: true, hint: 'Bring every rune to the black stone.' });
    expect(v.runes.map((r) => r.glyph)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(v.runesFound).toBe(2);
    expect(v.runes.find((r) => r.item === 'runeEye')).toMatchObject({ found: true, expedition: 2 });
    expect(v.runes.find((r) => r.item === 'runeChasm')).toMatchObject({ found: false, line: '' });
    expect(v.zones.reduce((n, z) => n + z.total, 0)).toBe(v.total);
    expect(v.ending).toMatchObject({ reached: false, expeditions: 3, deepest: 96, playTime: 1500 });
    for (const d of v.discoveries) expect(d.hint, d.id).not.toBe('');
  });
});
