import { beforeAll, describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { BIOMES, PAGE_PLAN, STRATUM_SIZE, allOres, stratumDef, type StratumIndex } from '../../src/config/biomes';
import { hash32 } from '../../src/core/math';
import { FOOT, OWN_RULES, reachNear, walkBfs } from '../../src/world/gen/strata/content';
import { generateStratum } from '../../src/world/gen/strata/generateStratum';
import { SET_PIECES } from '../../src/world/gen/strata/structures';
import { withBiomeAt, type StratumLayout, type V3 } from '../../src/world/gen/strata/types';
import { BLOCKS, SOLID } from '../../src/config/blocks';
import { TrapScratch, WORST_SOLID, homewardStates, isState, walkStates } from '../../src/world/gen/strata/traps';

/**
 * Round 3 (WORLD): the strata generator's promises (BRIEF §0.1, §6), checked on every stratum of one
 * expedition: determinism, the walk from the arrival to every key place and back, the structures
 * (the vista, the river, the Halden works and their real lock, set pieces, secret rooms), props that
 * stand on rock, Halden's pages by the plan, and the density the brief asks for.
 */
const SEED = 12345;
const layouts = new Map<number, StratumLayout & { timings: { totalMs: number } }>();
/** CPU milliseconds each stratum took (the machine is shared: wall time under load is not the budget's measure). */
const cpuMs = new Map<number, number>();
/** Node's CPU clock (the project has no Node types: reached through globalThis); wall time where absent. */
type CpuUsage = { user: number; system: number };
const proc = (globalThis as { process?: { cpuUsage?: (prev?: CpuUsage) => CpuUsage } }).process;
const cpuNow = (): number => {
  const c = proc?.cpuUsage?.();
  return c ? (c.user + c.system) / 1000 : performance.now();
};

beforeAll(() => {
  for (let n = 1; n <= 6; n++) {
    const c0 = cpuNow();
    layouts.set(n, generateStratum(SEED, n));
    cpuMs.set(n, cpuNow() - c0);
  }
}, 240_000);

const L = (n: number) => layouts.get(n)!;
const hashBlocks = (b: Uint8Array) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i += 7) h = Math.imul(h ^ b[i], 0x01000193);
  return h >>> 0;
};
const openOf = (l: StratumLayout, extra: V3[] = []) => new Set([...l.gate.seal, ...(l.dungeon?.door ?? []), ...extra].map(([x, y, z]) => l.world.index(x, y, z)));
const near = (seen: Uint8Array, l: StratumLayout, p: readonly number[], r = 4) => reachNear(seen, l.world, [p[0], p[1], p[2]], r, 3) !== null;
const arrivalOf = (l: StratumLayout): V3 => [l.arrival.x, l.arrival.y, l.arrival.z];

/**
 * Trapped states of a stratum (traps.ts): reached by the walk (or a climb) from the arrival with no walk
 * or climb back to it, the works' door, the cracked walls and the Heart's door open; `worst`: every
 * breakable block mined too (the worst a pick can do).
 */
function trapsOf(l: StratumLayout, worst: boolean): number {
  const w = l.world;
  const d = { sx: w.sx, sy: w.sy, sz: w.sz };
  const b = w.blocks.slice();
  for (const [x, y, z] of [...(l.dungeon?.door ?? []), ...(l.stratum === 6 ? l.gate.seal : [])]) b[w.index(x, y, z)] = B.AIR;
  for (let i = 0; i < b.length; i++) if (b[i] === B.CRACKED_WALL) b[i] = B.AIR;
  const S = worst ? WORST_SOLID : SOLID;
  const sc = new TrapScratch(d);
  const n = walkStates(b, S, d, [l.arrival.x, l.arrival.y, l.arrival.z], sc.a, sc.q);
  const reached = sc.q.slice(0, n);
  const targets: number[] = [];
  const c = l.camp;
  for (let z = Math.ceil(c.min[2]); z <= Math.floor(c.max[2]); z++)
    for (let y = Math.max(1, Math.ceil(c.min[1])); y <= Math.min(w.sy - 3, Math.floor(c.max[1])); y++)
      for (let x = Math.ceil(c.min[0]); x <= Math.floor(c.max[0]); x++) if (isState(b, S, w.sx, w.index(x, y, z))) targets.push(w.index(x, y, z));
  homewardStates(b, S, d, targets, sc.b, sc.q);
  let trapped = 0;
  for (const i of reached) if (!sc.b[i]) trapped++;
  expect(n).toBeGreaterThan(20000);
  return trapped;
}

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
    // Generated within the budget (BRIEF §4: generation and light under 7 s on this container), in CPU
    // time: about 1.5 s on a quiet core, up to 4 s with the other specialists' jobs on the same CPUs.
    expect(cpuMs.get(n)!, `stratum ${n}: ${cpuMs.get(n)!.toFixed(0)} ms cpu, ${l.timings.totalMs} ms wall`).toBeLessThan(5500);
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
    // The vista's fall first (from the balcony's edge into its plunge pool), then the river's spring.
    expect(l.falls[0].id).toMatch(/^fall_/);
    expect(l.falls[0].top[1] - l.falls[0].bottom[1]).toBeGreaterThan(12);
    expect(l.falls[0].kind).toBe(l.vista!.lava ? 'lava' : 'water');
    // The hall's dressing: the island's rock spire in the lake, lit at its tip; lamp posts down the
    // ramp; stalactites from the dome.
    const V = l.vista!;
    const [ix, iy, iz] = [Math.floor(V.island![0]), V.island![1], Math.floor(V.island![2])];
    expect(iy - V.centre[1], 'spire height').toBeGreaterThanOrEqual(8);
    expect(SOLID[l.world.get(ix, iy - 1, iz)], 'spire rock').toBe(1);
    expect(BLOCKS[l.world.get(ix, iy, iz)].emission, 'the spire\'s light').not.toBeNull();
    const lamps = V.lamps!.filter((lp) => l.props.some((p) => p.kind === 'lanternPost' && Math.hypot(p.x - lp[0], p.z - lp[2]) < 1 && Math.abs(p.y - lp[1]) < 1));
    expect(lamps.length, 'ramp lamps').toBeGreaterThanOrEqual(3);
    expect(V.stalactites!, 'stalactites').toBeGreaterThanOrEqual(6);
    // A strata fall shows by the light round it: lights by its lip, halfway down and over its pool.
    const f0 = l.falls[0];
    const litNear = (p: readonly number[], r: number) => {
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const id = l.world.get(Math.floor(p[0]) + dx, Math.floor(p[1]) + dy, Math.floor(p[2]) + dz);
        if (!SOLID[id] && BLOCKS[id].emission) return true;
      }
      return false;
    };
    expect(litNear([f0.top[0], f0.top[1] + 1, f0.top[2]], 4), 'the fall\'s lip lit').toBe(true);
    expect(litNear([f0.top[0], (f0.top[1] + f0.bottom[1]) / 2, f0.top[2]], 4), 'the fall lit halfway down').toBe(true);
    expect(litNear([f0.bottom[0], f0.bottom[1] + 1, f0.bottom[2]], 4), 'the fall\'s pool lit').toBe(true);
    // And the hall is lit all round: at least 30 lights inside it.
    let hallLights = 0;
    const R0 = Math.ceil(V.radius);
    for (let dz = -R0; dz <= R0; dz++) for (let dx = -R0; dx <= R0; dx++) for (let y = V.centre[1] - 1; y < V.centre[1] + 30; y++) {
      if (dx * dx + dz * dz > R0 * R0) continue;
      const id = l.world.get(Math.floor(V.centre[0]) + dx, y, Math.floor(V.centre[2]) + dz);
      if (!SOLID[id] && BLOCKS[id].emission) hallLights++;
    }
    expect(hallLights, 'lights in the hall').toBeGreaterThanOrEqual(30);
    for (const f of l.falls.slice(1)) {
      expect(f.id).toMatch(/^spring_/);
      expect(f.kind).toBe(l.rivers[0].kind);
      // It lands in its pool (water or lava under its foot).
      const [x, y, z] = [Math.floor(f.bottom[0]), Math.round(f.bottom[1] + 0.25), Math.floor(f.bottom[2])];
      expect(SOLID[l.world.get(x, y - 1, z)], `${f.id} pool`).toBe(0);
      expect(litNear([f.bottom[0], f.bottom[1] + 1, f.bottom[2]], 3), `${f.id} lit`).toBe(true);
    }
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

  it.each([1, 2, 3, 4, 5, 6])('stratum %i: no trap: everything walked into has a walk or a climb back, as carved and with every breakable block mined', (n) => {
    const l = L(n);
    expect(trapsOf(l, false), 'as carved').toBe(0);
    expect(trapsOf(l, true), 'every breakable block mined').toBe(0);
    // Every ladder the mending put in stands on its own column, and every ravine's rope has its landing.
    for (const r of l.ravines) {
      const [tx, ty, tz] = r.rope[r.rope.length - 1];
      const landing = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isState(l.world.blocks, SOLID, l.world.sx, l.world.index(tx + dx, ty, tz + dz)) && SOLID[l.world.get(tx + dx, ty - 1, tz + dz)] === 1);
      expect(landing, `${r.id} landing`).toBe(true);
    }
  });

  it('the river pours out of its spring in most strata (a fall from the spring chamber\'s wall)', () => {
    const springs = [1, 2, 3, 4, 5, 6].filter((n) => L(n).falls.some((f) => f.id.startsWith('spring_'))).length;
    expect(springs).toBeGreaterThanOrEqual(4);
  });

  it('stands its big props on rock (VIS\'s props probe): the gate\'s monolith whole and in reach of its stand, wide decor never over a drop', () => {
    for (let n = 1; n <= 6; n++) {
      const l = L(n);
      const w = l.world;
      const m = l.props.find((p) => p.id === `gate_${n}`)!;
      expect(m, `gate_${n}`).toBeTruthy();
      // The monolith's base (a square 15 x scale across): on rock, out of the rock.
      const half = 7.52 * m.scale;
      let cells = 0;
      let held = 0;
      let inRock = 0;
      for (let dz = -half; dz <= half + 1e-6; dz += 0.5) for (let dx = -half; dx <= half + 1e-6; dx += 0.5) {
        cells++;
        const cx = Math.floor(m.x + dx);
        const cz = Math.floor(m.z + dz);
        if (SOLID[w.get(cx, m.y, cz)]) inRock++;
        else if (SOLID[w.get(cx, m.y - 1, cz)]) held++;
      }
      expect(held / cells, `gate_${n} base on rock`).toBeGreaterThanOrEqual(0.8);
      expect(inRock / cells, `gate_${n} base in rock`).toBeLessThanOrEqual(0.08);
      // Used from its plinth's edge (WorldFeatures.focusDistance): the stand is within reach.
      const st = l.gate.stand;
      expect(Math.hypot(Math.max(0, Math.abs(st[0] - m.x) - half), Math.max(0, Math.abs(st[2] - m.z) - half)), `gate_${n} reach`).toBeLessThanOrEqual(1.6);
      // Decor wider than its cell: three quarters of its base disc over rock.
      for (const p of l.props) {
        const R = (FOOT[p.kind] ?? 0.5) * p.scale;
        if (R <= 0.72 || p.interact || p.minable || p.feature || OWN_RULES.has(p.kind)) continue;
        let k = 0;
        let on = 0;
        for (let dz = -R; dz <= R + 1e-6; dz += 0.5) for (let dx = -R; dx <= R + 1e-6; dx += 0.5) {
          if (dx * dx + dz * dz > R * R) continue;
          k++;
          if (!SOLID[w.get(Math.floor(p.x + dx), Math.round(p.y), Math.floor(p.z + dz))] && SOLID[w.get(Math.floor(p.x + dx), Math.round(p.y) - 1, Math.floor(p.z + dz))]) on++;
        }
        expect(on / k, `${p.id} footing`).toBeGreaterThanOrEqual(0.75);
      }
    }
  });

  it('keeps its hazard pockets where the hazard is, and off the places the explorer must use (and Halden\'s pages)', () => {
    for (let n = 1; n <= 6; n++) {
      const l = L(n);
      const places: [string, readonly number[], number][] = [
        ['arrival', arrivalOf(l), 3],
        ['gate stand', l.gate.stand, 2],
        ...l.outpostSites.map((o): [string, readonly number[], number] => [o.id, o.p, 2]),
        ...l.lairs.map((a): [string, readonly number[], number] => [`lair ${a.biome}`, a.centre, 4]),
        ...l.pages.map((pg): [string, readonly number[], number] => [pg.id, pg.p, 0]),
      ];
      for (const h of l.hazards.filter((z) => z.kind === 'gas' || z.kind === 'lava')) {
        for (const [id, p, r] of places) expect(Math.hypot(p[0] - h.centre[0], (p[1] - h.centre[1]) * 1.5, p[2] - h.centre[2]), `${id} in ${h.kind} ${h.id}`).toBeGreaterThanOrEqual(h.radius + r);
        // A gas pocket over a toxic pool, a lava zone over lava.
        const want = h.kind === 'lava' ? B.LAVA : B.TOXIC_POOL;
        let real = 0;
        const R = Math.ceil(h.radius);
        for (let dz = -R; dz <= R && !real; dz++) for (let dx = -R; dx <= R; dx++) for (let dy = -4; dy <= 2; dy++) if (dx * dx + dz * dz <= R * R && l.world.get(Math.floor(h.centre[0]) + dx, Math.floor(h.centre[1]) + dy, Math.floor(h.centre[2]) + dz) === want) real++;
        expect(real, `${h.id} ${h.kind} has its ${h.kind}`).toBeGreaterThan(0);
      }
    }
  });

  it('dresses the Halden Mines\' drifts with mine sets across the passage, and lays its rails along the walls', () => {
    const l = L(3);
    const sets = l.props.filter((p) => p.kind === 'mineSet');
    expect(sets.length).toBeGreaterThan(8);
    for (const p of sets) expect(l.biomeAt(p.x, p.y, p.z)).toBe('haldenMines');
    // A rail's two metres run along open floor (its ends are not in the rock).
    for (const p of l.props.filter((q) => q.kind === 'rail' && q.id.includes('_rail_'))) {
      const dx = Math.cos(p.rotY);
      const dz = -Math.sin(p.rotY);
      for (const s2 of [-0.9, 0.9]) expect(SOLID[l.world.get(Math.floor(p.x + dx * s2), Math.floor(p.y), Math.floor(p.z + dz * s2))], `${p.id}`).toBe(0);
    }
    // Nests breed one of their biome's roster swarmers.
    for (let k = 1; k <= 6; k++) for (const ne of L(k).nests) expect(ne.kind === null || BIOMES[ne.biome].mobs.monsters.includes(ne.kind), ne.id).toBe(true);
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
