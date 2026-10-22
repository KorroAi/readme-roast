import { beforeAll, describe, expect, it } from 'vitest';
import { B, SOLID } from '../../src/config/blocks';
import { BIOMES, PAGE_PLAN, STRATUM_SIZE, allOres, stratumDef, type StratumIndex } from '../../src/config/biomes';
import { hash32 } from '../../src/core/math';
import { reachNear, walkBfs } from '../../src/world/gen/strata/content';
import { generateStratum } from '../../src/world/gen/strata/generateStratum';
import { SET_PIECES } from '../../src/world/gen/strata/structures';
import { withBiomeAt, type StratumLayout, type V3 } from '../../src/world/gen/strata/types';

/**
 * Round 3 (WORLD): the strata generator's promises (BRIEF §0.1, §6), checked on every stratum of one
 * expedition: determinism, the walk from the arrival to every key place and back, the structures
 * (the vista, the river, the Halden works and their real lock, set pieces, secret rooms), props that
 * stand on rock, Halden's pages by the plan, and the density the brief asks for.
 */
const SEED = 12345;
const layouts = new Map<number, StratumLayout & { timings: { totalMs: number } }>();

beforeAll(() => {
  for (let n = 1; n <= 6; n++) layouts.set(n, generateStratum(SEED, n));
}, 180_000);

const L = (n: number) => layouts.get(n)!;
const hashBlocks = (b: Uint8Array) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i += 7) h = Math.imul(h ^ b[i], 0x01000193);
  return h >>> 0;
};
const openOf = (l: StratumLayout, extra: V3[] = []) => new Set([...l.gate.seal, ...(l.dungeon?.door ?? []), ...extra].map(([x, y, z]) => l.world.index(x, y, z)));
const near = (seen: Uint8Array, l: StratumLayout, p: readonly number[], r = 4) => reachNear(seen, l.world, [p[0], p[1], p[2]], r, 3) !== null;
const arrivalOf = (l: StratumLayout): V3 => [l.arrival.x, l.arrival.y, l.arrival.z];

describe('the strata generator (round 3)', () => {
  it('is deterministic per (seed, stratum), and another seed is another world', () => {
    const again = generateStratum(SEED, 1);
    expect(hashBlocks(again.world.blocks)).toBe(hashBlocks(L(1).world.blocks));
    expect(again.props.map((p) => p.id)).toEqual(L(1).props.map((p) => p.id));
    expect(again.chests.map((c) => c.p)).toEqual(L(1).chests.map((c) => c.p));
    const other = generateStratum(SEED + 1, 1);
    expect(hashBlocks(other.world.blocks)).not.toBe(hashBlocks(L(1).world.blocks));
  }, 60_000);

  it.each([1, 2, 3, 4, 5, 6])('stratum %i: the zone, its two biomes, its depth band and its timing', (n) => {
    const l = L(n);
    expect([l.world.sx, l.world.sy, l.world.sz]).toEqual(STRATUM_SIZE);
    expect(l.stratum).toBe(n);
    expect(l.biomes).toEqual(stratumDef(n).biomes);
    // Both biomes hold real ground (and the Heart in VI).
    const counts: Record<string, number> = {};
    for (let z = 0; z < l.world.sz; z += 4) for (let x = 0; x < l.world.sx; x += 4) {
      const b = l.biomeAt(x, 40, z);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    for (const b of l.biomes) expect(counts[b]).toBeGreaterThan(500);
    if (n === 6) expect(counts.heart).toBeGreaterThan(10);
    // Generated well within the budget (BRIEF §4: generation and light under 7 s on this container).
    expect(l.timings.totalMs).toBeLessThan(6000);
  });

  it.each([1, 2, 3, 4, 5, 6])('stratum %i: every key place is walkable from the arrival, and the arrival from each of them', (n) => {
    const l = L(n);
    const seen = walkBfs({ world: l.world }, arrivalOf(l), openOf(l));
    const keys: Array<[string, readonly number[]]> = [['gate', l.gate.stand], ...l.lairs.map((a) => [a.id, a.centre] as [string, V3])];
    if (l.heart) keys.push(['heart', l.heart.centre]);
    if (l.vista) keys.push(['balcony', l.vista.balcony], ['vista floor', l.vista.rampFoot]);
    if (l.dungeon) keys.push(['works vault', l.dungeon.vault]);
    for (const p of l.pages) keys.push([p.id, p.p]);
    for (const [id, p] of keys) expect(near(seen, l, p), `${id} reachable`).toBe(true);
    for (const lair of l.lairs) expect(near(walkBfs({ world: l.world }, lair.centre, openOf(l)), l, arrivalOf(l)), `back from ${lair.id}`).toBe(true);
    if (l.vista) expect(near(walkBfs({ world: l.world }, l.vista.rampFoot, openOf(l)), l, l.vista.balcony), 'the ramp climbs back to the balcony').toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6])('stratum %i: every chest is reachable (vaults and secret rooms through their cracked walls, ravine pockets by their rope)', (n) => {
    const l = L(n);
    const cracked: V3[] = [];
    for (let i = 0; i < l.world.blocks.length; i++) if (l.world.blocks[i] === B.CRACKED_WALL) cracked.push([i % l.world.sx, Math.floor(i / l.world.sx) % l.world.sy, Math.floor(i / (l.world.sx * l.world.sy))]);
    // A tier-1 pick opens every cracked wall: walk with them open.
    const seen = walkBfs({ world: l.world }, arrivalOf(l), openOf(l, cracked));
    const ravineChests = new Set(l.ravines.map((r) => `${Math.floor(r.bottom[0])},${Math.floor(r.bottom[2])}`));
    let missing = 0;
    for (const c of l.chests) {
      if (c.kind === 'ravine' && ravineChests.has(`${Math.floor(c.p[0])},${Math.floor(c.p[2])}`)) continue;
      if (!near(seen, l, c.p, 2)) missing++;
    }
    expect(missing).toBe(0);
    // Each ravine has its rope from the pocket to the rim.
    for (const r of l.ravines) {
      expect(r.rope.length).toBeGreaterThan(8);
      for (const [x, y, z] of r.rope) expect(l.world.get(x, y, z)).toBe(B.ROPE);
    }
  });

  it.each([1, 2, 3, 4, 5, 6])('stratum %i: the Halden works open only through their lock (the door is the one way into the vault)', (n) => {
    const l = L(n);
    const d = l.dungeon;
    if (!d) return expect.fail('no works in this stratum');
    expect(d.sockets.length).toBe([2, 3, 3, 3, 3, 4][n - 1]);
    expect(d.door.every(([x, y, z]) => l.world.get(x, y, z) === B.HALDEN_DOOR)).toBe(true);
    for (const c of d.sockets) expect(l.world.get(c[0], c[1], c[2])).toBe(B.AIR);
    if (d.puzzle === 'levers') expect(d.levers.length).toBe(d.sockets.length);
    else {
      expect(d.plates.length).toBe(d.sockets.length);
      for (const cells of d.plates) for (const [x, y, z] of cells) expect(l.world.get(x, y, z)).toBe(B.PRESSURE_PLATE);
    }
    // With the door shut (and the cracked walls open) the vault is out of reach; open, it is in reach.
    const cracked: V3[] = [];
    for (let i = 0; i < l.world.blocks.length; i++) if (l.world.blocks[i] === B.CRACKED_WALL) cracked.push([i % l.world.sx, Math.floor(i / l.world.sx) % l.world.sy, Math.floor(i / (l.world.sx * l.world.sy))]);
    const shut = walkBfs({ world: l.world }, arrivalOf(l), new Set([...l.gate.seal, ...cracked].map(([x, y, z]) => l.world.index(x, y, z))));
    expect(near(shut, l, d.vault, 3)).toBe(false);
    const open = walkBfs({ world: l.world }, arrivalOf(l), openOf(l, cracked));
    expect(near(open, l, d.vault, 3)).toBe(true);
    // Each lever (or plate) can be reached (a lever room may hide behind a cracked wall).
    for (const id of d.levers) {
      const p = l.props.find((q) => q.id === id)!;
      expect(near(open, l, [p.x, p.y, p.z], 3), id).toBe(true);
    }
    for (const cells of d.plates) expect(near(open, l, [cells[0][0], cells[0][1] + 1, cells[0][2]], 2)).toBe(true);
    // Its reward chests stand in the vault.
    expect(d.chests.length).toBe(3);
  });

  it.each([1, 2, 3, 4, 5, 6])('stratum %i: the landmark vista, the river, the set pieces and the secret rooms are there', (n) => {
    const l = L(n);
    expect(l.vista).not.toBeNull();
    expect(l.vista!.radius).toBeGreaterThanOrEqual(27);
    expect(l.falls.length).toBe(1);
    expect(l.falls[0].top[1] - l.falls[0].bottom[1]).toBeGreaterThan(12);
    expect(l.falls[0].kind).toBe(l.vista!.lava ? 'lava' : 'water');
    expect(l.rivers.length).toBe(1);
    expect(l.rivers[0].points.length).toBeGreaterThan(20);
    // Downstream, the water never climbs (a step of half a block at most, the channel's rounding).
    const pts = l.rivers[0].points;
    for (let k = 1; k < pts.length; k++) expect(pts[k][1]).toBeLessThanOrEqual(pts[k - 1][1] + 1.01);
    for (const b of l.biomes) {
      const name = SET_PIECES[b as keyof typeof SET_PIECES];
      expect(l.sites.some((s) => s.kind === 'setPiece' && s.name === name), `${b}: ${name}`).toBe(true);
      expect(l.secrets.filter((s) => s.biome === b).length).toBe(1);
    }
    for (const s of l.secrets) for (const [x, y, z] of s.wall) expect(l.world.get(x, y, z)).toBe(B.CRACKED_WALL);
    // Every named place has its text.
    for (const s of l.sites) if (s.name) expect(typeof s.name).toBe('string');
  });

  it.each([1, 2, 3, 4, 5, 6])('stratum %i: props stand on rock and hang from it (nothing falls or breaks when the session loads)', (n) => {
    const l = L(n);
    for (const p of l.props) {
      if (p.anchor) expect(SOLID[l.world.get(p.anchor[0], p.anchor[1], p.anchor[2])], `${p.id} anchor`).toBe(1);
      const hangs = !!p.anchor && p.anchor[1] >= Math.floor(p.y);
      expect(SOLID[l.world.get(Math.floor(p.x), Math.floor(p.y - (hangs ? 0.05 : 0)), Math.floor(p.z))], `${p.id} body`).toBe(0);
      for (const [x, y, z] of p.emitters) expect(SOLID[l.world.get(x, y, z)]).toBe(0);
    }
    // Unique ids (saves name removed props by id).
    expect(new Set(l.props.map((p) => p.id)).size).toBe(l.props.length);
  });

  it('places Halden pages by the page plan: four per stratum, 1..24 once each, the guardian pages pointing at their lairs', () => {
    const all = [1, 2, 3, 4, 5, 6].flatMap((n) => L(n).pages);
    expect(all.map((p) => p.n).sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    for (let n = 1; n <= 6; n++) expect(L(n).pages.length).toBe(4);
    for (const p of all) {
      const plan = PAGE_PLAN.find((q) => q.n === p.n)!;
      expect(p.biome).toBe(plan.biome);
      expect(p.revealsLair).toBe(plan.lair ? `lair_${plan.biome}` : null);
      const prop = [1, 2, 3, 4, 5, 6].map((n) => L(n).props.find((q) => q.id === p.prop)).find(Boolean)!;
      expect(prop.feature).toEqual({ kind: 'note', id: p.id });
    }
  });

  it('is dense (BRIEF §0.1): ore veins 3x the old world per floor area, about a chest per 25 m of tunnel, things everywhere, rarity rising with depth', () => {
    // The old hand-made world (1.1.0): 425 veins over 9645 m² of walkable floor reachable from its camp
    // (tools/strata-density.ts): 44 veins per 1000 m².
    const OLD_VEINS_PER_K = 44.06;
    for (let n = 1; n <= 6; n++) {
      const l = L(n);
      for (const b of l.biomes) {
        const s = l.stats[b];
        expect(s.oreVeins / s.floorCells * 1000, `${b} veins`).toBeGreaterThan(OLD_VEINS_PER_K * 3);
        expect(s.props / s.floorCells * 100, `${b} props per 100 m²`).toBeGreaterThan(3);
        expect(s.lights, `${b} light pockets`).toBeGreaterThan(30);
      }
      const tunnel = Object.values(l.stats).reduce((a, s) => a + (s.tunnelMetres ?? 0), 0);
      const per25 = (l.chests.length / tunnel) * 25;
      expect(per25, `stratum ${n} chests per 25 m`).toBeGreaterThan(0.9);
      expect(per25).toBeLessThan(2);
    }
    // Rarity rises with depth: the deepest stratum's ores are rarer than the first's.
    const rank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
    const meanRank = (n: number) => {
      const ores = stratumDef(n).biomes.flatMap((b) => BIOMES[b].ores);
      return ores.reduce((a, o) => a + rank[o.rarity], 0) / ores.length;
    };
    expect(meanRank(6)).toBeGreaterThan(meanRank(1) + 1);
    // And every ore of a stratum is minable with that stratum's pick (tier-appropriate gear).
    for (const o of allOres()) if (o.biome !== 'heart') expect(o.tier, `${o.biome} ore ${o.block}`).toBeLessThanOrEqual(BIOMES[o.biome].stratum);
  });

  it('keeps its biome lookup through the worker (biomeAt is rebuilt from the region map)', () => {
    const l = L(2);
    const { biomeAt: _drop, ...rest } = l;
    void _drop;
    const copy = withBiomeAt(structuredClone({ ...rest, world: { sx: l.world.sx, sz: l.world.sz } }) as never) as StratumLayout;
    for (let k = 0; k < 200; k++) {
      const x = (hash32(k) >>> 0) % 256;
      const z = (hash32(k + 999) >>> 0) % 256;
      expect(copy.biomeAt(x, 40, z)).toBe(l.biomeAt(x, 40, z));
    }
  });
});

void (0 as unknown as StratumIndex);
