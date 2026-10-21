import { beforeAll, describe, expect, it } from 'vitest';
import { B, BLOCKS, SOLID, isEmitter } from '../../src/config/blocks';
import { CONTENT } from '../../src/config/content';
import { ITEMS, RELIC_ITEMS } from '../../src/config/items';
import { DISCOVERIES } from '../../src/gameplay/discoveries';
import { FEATS, NO_LIFE, buildFeatsView, newFeats, normalizeLife, rewardText, type FeatSnapshot } from '../../src/gameplay/Feats';
import { StuckWatch, stuckKey } from '../../src/gameplay/Hints';
import { buildJournalView } from '../../src/gameplay/Journal';
import { hasText } from '../../src/i18n';
import { nearReachable, reachableCells } from '../../src/world/analysis/reachability';
import { lootFor } from '../../src/world/gen/content';
import { DEEP } from '../../src/world/gen/features/deep';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';
import { emptyFloor, openWorld } from '../../tools/poi-density';

/**
 * The content pass (finished game): the deep beyond the rift, the finds on every stretch of floor,
 * the secrets, lanternstone, the relics, the feats and the hints for when the player is stuck.
 */
let layout: WorldLayout;

beforeAll(() => {
  layout = generateWorld();
});

describe('the content pass: never empty', () => {
  it('leaves no reachable floor more than 10 m from something to find', () => {
    const e = emptyFloor(layout);
    expect(e.columns).toBeGreaterThan(6000);
    expect(e.over10).toBe(0);
  });

  it('is deterministic', () => {
    const again = generateWorld();
    expect(again.content!.pois).toEqual(layout.content!.pois);
    expect(again.props.map((p) => p.id)).toEqual(layout.props.map((p) => p.id));
  });

  it('spreads secret alcoves over the whole descent, each sealed until its loose masonry is mined', () => {
    const C = layout.content!;
    expect(C.secrets.length).toBeGreaterThanOrEqual(8);
    const bands = { roots: 0, hollow: 0, deep: 0 };
    for (const s of C.secrets) {
      const y = s.mouth[0][1];
      bands[y >= 86 ? 'roots' : y >= 36 ? 'hollow' : 'deep']++;
    }
    expect(bands.roots).toBeGreaterThanOrEqual(2);
    expect(bands.hollow).toBeGreaterThanOrEqual(2);
    expect(bands.deep).toBeGreaterThanOrEqual(2);
    const w = layout.world;
    for (const s of C.secrets) {
      for (const [x, y, z] of s.mouth) expect(w.get(x, y, z), `${s.id} mouth`).toBe(B.CRUMBLING_BRICK);
      const prop = layout.props.find((p) => p.id === s.prop)!;
      expect(prop.secret).toBe(s.id);
      expect(prop.feature?.kind).toBe('cache');
      // Flood the pocket from the cache's cell through open cells: it must stay inside a few cells.
      const start = w.index(Math.floor(prop.x), Math.floor(prop.y), Math.floor(prop.z));
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length && seen.size < 40) {
        const i = queue.pop()!;
        const x = i % w.sx;
        const y = Math.floor(i / w.sx) % w.sy;
        const z = Math.floor(i / (w.sx * w.sy));
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const j = w.index(x + dx, y + dy, z + dz);
          if (seen.has(j) || SOLID[w.blocks[j]]) continue;
          seen.add(j);
          queue.push(j);
        }
      }
      expect(seen.size, `${s.id} pocket is sealed`).toBeLessThanOrEqual(12);
      // ...and its warm lamp is inside.
      expect([...seen].some((i) => isEmitter(w.blocks[i])), `${s.id} lamp`).toBe(true);
    }
  });

  it('gives every cache, crate and secret loot, and puts each on reachable floor', () => {
    const open = openWorld(layout);
    const s = layout.spawn;
    const reach = reachableCells(open, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z), 3, layout.features!.links);
    const caches = layout.props.filter((p) => p.feature?.kind === 'cache');
    expect(caches.length).toBeGreaterThanOrEqual(15);
    for (const p of caches) {
      const n = Object.values(p.loot ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      expect(n, p.id).toBeGreaterThan(0);
      for (const item of Object.keys(p.loot ?? {})) expect(ITEMS[item as keyof typeof ITEMS]?.keyItem, item).toBe(false);
      expect(nearReachable(open, reach, p.x, p.y, p.z, 2, 1), `${p.id} reachable`).toBe(true);
    }
  });

  it('never touches living rock, rune doors or prop anchors, and adds no cold light outside the deep', () => {
    const bare = generateWorld(undefined, { content: false });
    const w = layout.world;
    const keep = new Set<number>();
    for (const s of layout.features!.living) for (const i of s.cells) keep.add(i);
    for (const d of layout.features!.runeDoors) for (const [x, y, z] of d.cells) keep.add(w.index(x, y, z));
    for (const p of bare.props) if (p.anchor) keep.add(w.index(...p.anchor));
    let changed = 0;
    let cold = 0;
    for (let i = 0; i < w.blocks.length; i++) {
      if (w.blocks[i] === bare.world.blocks[i]) continue;
      changed++;
      expect(keep.has(i), `cell ${i}`).toBe(false);
      const e = BLOCKS[w.blocks[i]].emission;
      if (e && e[2] > e[0]) cold++;
    }
    expect(changed).toBeGreaterThan(50);
    expect(cold).toBe(0);
  });

  it('lays out ambient anchors for drips and glow caps (no gameplay), spread out and on real surfaces', () => {
    const a = layout.content!.ambient;
    const drips = a.filter((x) => x.kind === 'drip');
    const caps = a.filter((x) => x.kind === 'fungus');
    expect(drips.length).toBeGreaterThanOrEqual(15);
    expect(caps.length).toBeGreaterThanOrEqual(20);
    const w = layout.world;
    for (const d of drips) {
      if (d.kind !== 'drip') continue;
      expect(SOLID[w.get(Math.floor(d.p[0]), d.p[1], Math.floor(d.p[2]))], 'roof').toBe(1);
      expect(SOLID[w.get(Math.floor(d.p[0]), d.p[1] - d.drop - 1, Math.floor(d.p[2]))], 'floor').toBe(1);
    }
    for (const c of caps) expect(SOLID[w.get(Math.floor(c.p[0]), c.p[1] - 1, Math.floor(c.p[2]))], 'cap on floor').toBe(1);
  });

  it('deals loot deterministically, never empty, never a key item', () => {
    for (const band of ['roots', 'hollow', 'deep'] as const)
      for (const kind of ['crate', 'cache', 'secret'] as const)
        for (let k = 0; k < 30; k++) {
          const a = lootFor(`c_x_${k}`, band, kind);
          expect(lootFor(`c_x_${k}`, band, kind)).toEqual(a);
          expect(Object.values(a).reduce((s, n) => s + (n ?? 0), 0)).toBeGreaterThan(0);
          if (kind !== 'crate') expect(a.glimmerShard ?? 0).toBeGreaterThan(0);
        }
  });
});

describe('the deep beyond the rift', () => {
  it('has three caverns, each with its own discovery, light and finds', () => {
    for (const id of ['glowroot', 'choir', 'emberDeep', 'lanternstone']) {
      expect(DISCOVERIES.some((d) => d.id === id), id).toBe(true);
      expect(hasText(`discovery.${id}.title`) && hasText(`discovery.${id}.body`) && hasText(`journal.hint.${id}`), id).toBe(true);
    }
    const w = layout.world;
    const count = (box: { min: number[]; max: number[] }, pred: (id: number) => boolean) => {
      let n = 0;
      for (let z = box.min[2]; z <= box.max[2]; z++) for (let y = box.min[1]; y <= box.max[1]; y++) for (let x = box.min[0]; x <= box.max[0]; x++) if (pred(w.get(x, y, z))) n++;
      return n;
    };
    const boxes = Object.fromEntries(layout.features!.boxes.filter((b) => b.id.startsWith('deep.')).map((b) => [b.id, b]));
    expect(count(boxes['deep.glowroot'], (id) => id === B.LIGHT_GLOWROOT)).toBeGreaterThanOrEqual(6);
    expect(count(boxes['deep.glowroot'], (id) => id === B.COPPER_ORE)).toBeGreaterThanOrEqual(10);
    expect(count(boxes['deep.choir'], (id) => id === B.ECHO_CRYSTAL)).toBeGreaterThanOrEqual(40);
    expect(count(boxes['deep.choir'], (id) => id === B.IRONBOUND)).toBeGreaterThanOrEqual(9);
    expect(count(boxes['deep.ember'], (id) => id === B.LIGHT_MAGMA)).toBeGreaterThanOrEqual(6);
    expect(count(boxes['deep.ember'], (id) => id === B.LANTERNSTONE)).toBeGreaterThanOrEqual(15);
    expect(count(boxes['deep.ember'], (id) => id === B.EMBER_GLASS)).toBeGreaterThanOrEqual(6);
    expect(count(boxes['deep.ember'], (id) => id === B.IRON_ORE)).toBeGreaterThanOrEqual(15);
    // Roots hang in the Glowroot, well over head height.
    const roots = layout.structures.filter((s) => s.kind === 'beam' && s.id.startsWith('f_deep_root_'));
    expect(roots.length).toBeGreaterThanOrEqual(15);
    for (const r of roots) if (r.kind === 'beam') expect(r.b[1] - DEEP.glowroot.floor, r.id).toBeGreaterThanOrEqual(2.3);
  });

  it('keeps a relic in each cavern, each a key item with a journal page', () => {
    const relics = layout.props.filter((p) => p.feature?.kind === 'relic' && ['glowroot', 'choir', 'ember'].includes(p.feature.id));
    expect(relics.map((p) => p.feature!.id).sort()).toEqual(['choir', 'ember', 'glowroot']);
    for (const id of RELIC_ITEMS) {
      expect(ITEMS[id].keyItem).toBe(true);
      expect(hasText(`item.${id}`) && hasText(`item.${id}.desc`), id).toBe(true);
    }
    const view = buildJournalView({ discoveries: ['glowroot'], keyItems: ['relicGlowroot'], foundAt: {}, finale: false, expeditions: 3, deepest: 146, playTime: 1 });
    expect(view.relics.find((r) => r.id === 'relicGlowroot')?.found).toBe(true);
    expect(view.relics.find((r) => r.id === 'relicEmber')?.found).toBe(false);
    expect(view.zones.find((z) => z.id === 'beyond')).toMatchObject({ found: 1, total: 3 });
  });

  it('makes lanternstone a warm, minable stone that drops nothing (its ember goes to the lantern)', () => {
    const d = BLOCKS[B.LANTERNSTONE];
    expect(d.solid && d.visible).toBe(true);
    expect(d.drop).toBeNull();
    expect(d.tier).toBe(1);
    expect(d.emission![0]).toBeGreaterThan(d.emission![2]);
    expect(CONTENT.emberSeconds).toBe(30);
    expect(BLOCKS[B.EMBER_GLASS].tier).toBe(4);
    expect(BLOCKS[B.LIGHT_GLOWROOT].solid || BLOCKS[B.LIGHT_MAGMA].solid).toBe(false);
  });
});

describe('feats', () => {
  const snap = (patch: Partial<FeatSnapshot> = {}): FeatSnapshot => ({
    life: { ...NO_LIFE, firsts: [] },
    deepest: 0,
    expeditions: 0,
    biggestHaul: 0,
    bestStreak: 0,
    discoveries: new Set(),
    keyItems: new Set(),
    runes: 0,
    runesTotal: 8,
    relics: 0,
    relicsTotal: 5,
    discoveryIds: DISCOVERIES.map((d) => d.id),
    secretsTotal: 10,
    treeBuilt: 0,
    treeTotal: 12,
    finale: false,
    recovered: false,
    ...patch,
  });

  it('has a name, a line and a reward of materials for each, unique ids', () => {
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(FEATS.length);
    expect(FEATS.length).toBeGreaterThanOrEqual(25);
    for (const f of FEATS) {
      expect(hasText(`feat.${f.id}.name`) && hasText(`feat.${f.id}.desc`), f.id).toBe(true);
      for (const item of Object.keys(f.reward)) expect(ITEMS[item as keyof typeof ITEMS].keyItem, `${f.id} ${item}`).toBe(false);
    }
  });

  it('earns each once, at its threshold, in table order', () => {
    expect(newFeats(new Set(), snap())).toEqual([]);
    const life = { ...NO_LIFE, blocksMined: 120, firsts: ['copperOre'] };
    const got = newFeats(new Set(), snap({ life, deepest: 101 })).map((f) => f.id);
    expect(got).toEqual(['firstStone', 'firstCopper', 'depth50', 'depth100', 'mined100']);
    expect(newFeats(new Set(got), snap({ life, deepest: 101 }))).toEqual([]);
    expect(newFeats(new Set(), snap({ deepest: 148 })).map((f) => f.id)).toEqual(['depth50', 'depth100', 'depth144', 'depth148']);
    const all = snap({ discoveries: new Set(DISCOVERIES.map((d) => d.id)), finale: true, relics: 5, runes: 8, treeBuilt: 12 });
    expect(newFeats(new Set(), all).map((f) => f.id)).toEqual(expect.arrayContaining(['discoveries', 'answer', 'relics', 'runes4', 'tree', 'logs', 'beyond']));
  });

  it('builds the Journal page with lifetime numbers, and survives junk in a save', () => {
    const v = buildFeatsView(new Set(['firstStone']), { ...NO_LIFE, blocksMined: 7, walked: 123.4, firsts: [] }, { expeditions: 2, deepest: 64, blackouts: 1 }, (i) => i);
    expect(v.earned).toBe(1);
    expect(v.total).toBe(FEATS.length);
    expect(v.stats.find((r) => r.id === 'walked')?.value).toBe('123 m');
    expect(rewardText({ copperOre: 2, stone: 0 }, (i) => i)).toBe('2 copperOre');
    expect(normalizeLife({ blocksMined: -4, embers: 'x', firsts: ['a', 3] })).toEqual({ ...NO_LIFE, firsts: ['a'] });
  });
});

describe('hints when stuck', () => {
  it('waits, then hints, then repeats a few times at most; any progress resets the clock', () => {
    const s = new StuckWatch();
    expect(s.update(1, 'findCopper', 'Find copper ore (2/8)', null)).toBeNull();
    let hint = null;
    for (let t = 0; t < CONTENT.stuckSeconds - 2; t++) hint = s.update(1, 'findCopper', 'Find copper ore (2/8)', null) ?? hint;
    expect(hint).toBeNull();
    for (let t = 0; t < 3; t++) hint = s.update(1, 'findCopper', 'Find copper ore (2/8)', null) ?? hint;
    expect(hint).toBe('stuck.findCopper');
    // Progress (the count moved) resets it.
    expect(s.update(1, 'findCopper', 'Find copper ore (3/8)', null)).toBeNull();
    let n = 0;
    for (let t = 0; t < 2000; t++) if (s.update(1, 'findCopper', 'Find copper ore (3/8)', null)) n++;
    expect(n).toBe(CONTENT.stuckMaxHints);
  });

  it('has a hint for every step of the tutorial and every material', () => {
    for (const id of ['look', 'walk', 'mineStone', 'findCopper', 'returnToCamp', 'craftPickaxe', 'breakSeal', 'goDeeper', 'runes', 'deeper', 'recoverPack']) {
      const k = stuckKey(id, null);
      expect(k && hasText(k), id).toBe(true);
    }
    for (const m of ['stone', 'rootFibre', 'copperOre', 'ironOre', 'glimmerShard', 'echoShard'] as const) expect(hasText(stuckKey('craft:forge', m)!), m).toBe(true);
  });
});
