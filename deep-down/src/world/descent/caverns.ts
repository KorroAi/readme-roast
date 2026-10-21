import { B, SOLID } from '../../config/blocks';
import { hash32 } from '../../core/math';
import { biomeAt, biomeStart, nextBiomeStart, baseBiome, AUTHORED_BIOMES, ECHO_START, ECHO_SPACING } from '../../idle/config/biomes';
import type { PropKind } from '../../render/props/types';
import { RING_SX, SLAB_ROWS } from './RingWorld';
import type { BiomeKit } from './biomeKits';
import { BACK_Z, CUT, SHAFT_X0, SHAFT_X1, addProp, carvedAt, get, inFootprint, set, type CavernSpec, type Ctx } from './slab';

/**
 * The cavern grammar's dressing and the big rooms (SPEC §6.6, §6.7; BUILD W2 MUST 2): every cavern a slab carves
 * gets its fill here, under the fill rules that tools/fill-scan.ts checks:
 *   1. no open volume ≥ 27 m³ without a prop or tappable;   2. ≥ 1 dressing prop per 6 m² of floor (≤ 12 medium);
 *   3. ≥ 1 emitter in the key colour and ≥ 1 tappable;       4. vein or crystal cover ≥ 8 % of the wall faces;
 *   5. an ambient particle emitter in every cavern ≥ 50 m³; 7. nothing decorative in the shaft footprint and clear
 *      air within 1.5 m of the dig face (props keep out of the view column in front of the back wall).
 * Plus the Vista of each biome (35 % into it, 26 m tall, its back opened onto 2D's backdrops) and geodes.
 */

const h01 = (a: number, b: number, c: number, seed: number) => hash32(hash32(hash32(a ^ seed) ^ (b * 0x9e3779b1)) ^ (c * 0x85ebca6b)) / 4294967296;

/** Pick a weighted prop kind. */
export function pick(list: ReadonlyArray<[PropKind, number]>, h: number): PropKind {
  let total = 0;
  for (const [, w] of list) total += w;
  let t = h * total;
  for (const [kind, w] of list) {
    t -= w;
    if (t <= 0) return kind;
  }
  return list[0][0];
}

/** Keep the view from the shaft clear (rule 7): no dressing in the column the camera looks through (the shaft and
 *  the 2.5 m behind its back wall). */
export function inViewColumn(x: number, z: number): boolean {
  return x >= SHAFT_X0 - 0.3 && x <= SHAFT_X1 + 1.3 && z >= BACK_Z - 2.5;
}

/** Rule 7's dig face: nothing flush with the cut within 1.5 m of the shaft. */
export function nearDigFace(x: number, z: number): boolean {
  return z >= CUT - 0.5 && x >= SHAFT_X0 - 1.5 && x <= SHAFT_X1 + 2.5;
}

/**
 * Ledges with a tappable on the side walls of a tall room (a Reveal Hall, a Vista), every `every` rows beside the
 * shaft, so a reward is always within 6 rows of the floor while the dig goes down its pillar.
 */
export function ledges(ctx: Ctx, cav: CavernSpec, kit: BiomeKit, every: number, seed: number): void {
  const { d0, out } = ctx;
  for (let d = cav.top + 3, i = 0; d <= cav.bottom - 2; d += every, i++) {
    if (d < d0 || d >= d0 + SLAB_ROWS) continue;
    const left = i % 2 === 0;
    const x0 = left ? SHAFT_X0 - 4 : SHAFT_X1 + 2;
    for (let x = x0; x < x0 + 3; x++) for (let z = BACK_Z - 4; z <= BACK_Z - 1; z++) set(out.blocks, x, d - d0, z, kit.hostB);
    const [kind, tap, n] = i % 3 === 2 ? (['chest', 'cache', 1] as const) : kit.tappable;
    addProp(ctx, kind, x0 + 1.5, d, BACK_Z - 2.5, { tap, taps: n, scale: kind === 'crystalCluster' ? 1.1 : 0.9 });
    // The ledge's lip glows in the biome's colour (its light, and the room's key hue near the shaft).
    embed(ctx, left ? x0 : x0 + 2, d, BACK_Z - 1, kit.emitter);
    void seed;
  }
}

/** Put a biome emitter voxel into rock touching air near (x, row, z). */
export function embed(ctx: Ctx, x: number, row: number, z: number, id: number): boolean {
  const r = row - ctx.d0;
  if (r < 0 || r >= SLAB_ROWS || inFootprint(x, z)) return false;
  if (!SOLID[get(ctx.out.blocks, x, r, z)]) return false;
  set(ctx.out.blocks, x, r, z, id);
  ctx.protect.add(x + RING_SX * (r + SLAB_ROWS * z));
  return true;
}

export interface DressOptions {
  /** Medium props (before the floor-area rule), tappables. */
  medium?: number;
  tappables?: number;
  /** A liquid on the floor (if the kit has one). */
  liquid?: boolean;
  /** Emitters in the walls in the key colour. */
  emitters?: number;
  /** Hanging lanterns (people worked here). */
  lamps?: number;
  /** The hero prop at the back. */
  hero?: boolean;
}

/**
 * Dress a carved cavern (its floor row is `cav.bottom + 1`): the floor is scanned for standing room, medium props
 * follow the floor-area rule, the small scatter covers the floor on a jittered 2.6 m grid (empty floor ≤ 35 %),
 * then tappables, lights, an ambient emitter, a liquid and veins on its walls.
 */
export function dressCavern(ctx: Ctx, cav: CavernSpec, kit: BiomeKit, _biome: number, seed: number, o: DressOptions = {}): void {
  const { d0, out } = ctx;
  // Floor cells: per (x, z) column, the lowest air voxel of the cavern with solid ground under it (a rounded cavern's
  // floor is a bowl: it is not all on its bottom row). Below this slab, the row under the cavern counts as solid
  // ground; a cavern that goes on into the next slab has no floor here (its props are that slab's).
  const floor: Array<[number, number, number]> = [];
  for (let z = Math.max(0, cav.z0); z <= Math.min(CUT - 1, cav.z1); z++)
    for (let x = Math.max(0, cav.x0); x <= Math.min(RING_SX - 1, cav.x1); x++) {
      if (inFootprint(x, z)) continue;
      for (let d = Math.min(cav.bottom, d0 + SLAB_ROWS - 1); d >= Math.max(cav.top, d0); d--) {
        if (get(out.blocks, x, d - d0, z) !== B.AIR) continue;
        const below = belowFloor(ctx, cav, x, d, z);
        if (SOLID[below]) floor.push([x, z, d + 1]);
        break;
      }
    }
  const area = floor.length;
  const placeable = floor.filter(([x, z]) => !inViewColumn(x + 0.5, z + 0.5) && !nearDigFace(x + 0.5, z + 0.5));
  const pickCell = (i: number, salt: number): [number, number, number] | null => (placeable.length ? placeable[Math.floor(h01(i, salt, 7, seed) * placeable.length)] : null);
  const floorRow = cav.bottom + 1;
  // Medium dressing: ≥ 1 per 6 m² (≤ 12), at least what the caller asked.
  const medium = Math.min(12, Math.max(o.medium ?? 2, Math.ceil(area / 6)));
  for (let i = 0; i < medium && placeable.length; i++) {
    const c = pickCell(i, 1)!;
    addProp(ctx, pick(kit.props, h01(i, 2, 7, seed)), c[0] + 0.5, c[2], c[1] + 0.5, { scale: 0.9 + 0.5 * h01(i, 3, 7, seed) });
  }
  // The small scatter on a jittered grid, so no floor is farther than ~2 m from something.
  if (area >= 6) {
    const at = new Map<number, number>();
    for (const [x, z, f] of floor) at.set(x + z * RING_SX, f);
    for (let gz = cav.z0; gz <= cav.z1; gz += 2.6)
      for (let gx = cav.x0; gx <= cav.x1; gx += 2.6) {
        const x = gx + 0.4 + h01(gx, gz, 11, seed) * 1.8;
        const z = gz + 0.4 + h01(gz, gx, 12, seed) * 1.8;
        const f = at.get(Math.floor(x) + Math.floor(z) * RING_SX);
        if (f === undefined || inViewColumn(x, z) || nearDigFace(x, z)) continue;
        addProp(ctx, pick(kit.small, h01(Math.floor(x), Math.floor(z), 13, seed)), x, f, z, { scale: 0.7 + 0.5 * h01(Math.floor(x), Math.floor(z), 14, seed) });
      }
  }
  // The hero at the back of the cavern.
  if (o.hero && placeable.length) {
    let best: [number, number, number] = placeable[0];
    for (const c of placeable) if (c[1] < best[1] || (c[1] === best[1] && Math.abs(c[0] - 31.5) < Math.abs(best[0] - 31.5))) best = c;
    addProp(ctx, kit.hero[0], best[0] + 0.5, best[2], best[1] + 0.5, { scale: kit.hero[1] });
  }
  // Tappables (rule 3: at least one), near the front so they are in view and reach.
  const taps = Math.max(1, o.tappables ?? 1);
  const front = placeable.filter(([, z]) => z >= cav.z1 - 6);

  const pool = front.length ? front : placeable;
  for (let i = 0; i < taps && pool.length; i++) {
    const c = pool[Math.floor(h01(i, 21, 7, seed) * pool.length)];
    const [kind, tap, n] = i === 0 && h01(9, 9, 9, seed) < 0.25 ? (['chest', 'cache', 1] as const) : kit.tappable;
    addProp(ctx, kind, c[0] + 0.5, c[2], c[1] + 0.5, { tap, taps: n, scale: kind === 'crystalCluster' ? 1.1 + 0.4 * h01(i, 22, 7, seed) : 1 });
  }
  // Lights: lamps if people worked here, emitters in the key colour in the walls (rule 3).
  for (let i = 0; i < (o.lamps ?? 0) && placeable.length; i++) {
    const c = pickCell(i, 41)!;
    const top = cav.top;
    addProp(ctx, 'hangingLantern', c[0] + 0.5, c[2], c[1] + 0.5, { emitter: [c[0], -top - 1 - Math.min(2, cav.bottom - top), c[1]] });
  }
  const ne = Math.max(1, o.emitters ?? 2);
  let placed = 0;
  for (let i = 0; i < ne * 6 && placed < ne; i++) {
    const side = h01(i, 51, 7, seed);
    const d = cav.top + Math.floor(h01(i, 52, 7, seed) * (cav.bottom - cav.top + 1));
    const z = cav.z0 + Math.floor(h01(i, 53, 7, seed) * (cav.z1 - cav.z0 + 1));
    const x = cav.x0 + Math.floor(h01(i, 54, 7, seed) * (cav.x1 - cav.x0 + 1));
    let ok = false;
    if (side < 0.33) ok = embed(ctx, cav.x0 - 1, d, z, kit.emitter) || embed(ctx, cav.x0, d, z, kit.emitter);
    else if (side < 0.66) ok = embed(ctx, cav.x1 + 1, d, z, kit.emitter) || embed(ctx, cav.x1, d, z, kit.emitter);
    else ok = embed(ctx, x, d, cav.z0 - 1, kit.emitter) || embed(ctx, x, d, cav.z0, kit.emitter) || embed(ctx, x, cav.top - 1, z, kit.emitter);
    if (ok) placed++;
  }
  // Rule 5: an ambient particle emitter in every cavern ≥ 50 m³.
  const vol = (cav.x1 - cav.x0 + 1) * (cav.bottom - cav.top + 1) * (cav.z1 - cav.z0 + 1);
  // (One per 8 m of height, so a tall room breathes all the way up while the dig goes down its pillar.)
  if (vol >= 50) {
    const h = cav.bottom - cav.top + 1;
    const n = Math.max(1, Math.floor(h / 8));
    for (let i = 0; i < n; i++) {
      const cy = cav.top + ((i + 0.5) * h) / n;
      if (cy < d0 || cy >= d0 + SLAB_ROWS) continue;
      out.motes.push({ x: (cav.x0 + cav.x1 + 1) / 2, y: -cy, z: (cav.z0 + cav.z1 + 1) / 2, rx: (cav.x1 - cav.x0) / 2, ry: h / n / 2, rz: (cav.z1 - cav.z0) / 2, kind: kit.mote, color: kit.moteColor });
    }
  }
  // A liquid on part of the floor (30 % of caverns, decided by the caller).
  if (o.liquid && kit.liquid && area >= 12 && cav.bottom >= d0 && cav.bottom < d0 + SLAB_ROWS) {
    // Toward the front of the cavern: the frontal camera sees a floor plane only near the cut (a pool 9 m back
    // at eye height is edge-on), and a cavern open at the cut shows its pool in the section's mouth.
    const x0 = Math.max(cav.x0 + 1, Math.floor((cav.x0 + cav.x1) / 2) - 4);
    const z1 = Math.min(CUT - 1, cav.z1) - 0.6;
    const z0 = Math.max(cav.z0 + 1, z1 - 8);
    if (z1 - z0 >= 2) out.liquids.push({ id: `liq:${cav.id}`, kind: kit.liquid, y: -floorRow + 0.06, x0, x1: Math.min(cav.x1, x0 + 8), z0, z1 });
  }
  veinWalls(ctx, cav, kit, seed);
}

/**
 * Rule 4: veins and crystals on ≥ 8 % of a cavern's wall faces (the solid voxels touching its air), by a hashed
 * threshold so seams cluster: ore in rock, the biome's gem and its emitter here and there.
 */
export function veinWalls(ctx: Ctx, cav: CavernSpec, kit: BiomeKit, seed: number): void {
  const { d0, out } = ctx;
  const b = out.blocks;
  const walls: number[] = [];
  let veined = 0;
  for (let d = Math.max(d0, cav.top - 1); d <= Math.min(d0 + SLAB_ROWS - 1, cav.bottom + 1); d++) {
    const r = d - d0;
    for (let z = Math.max(0, cav.z0 - 1); z <= Math.min(CUT - 1, cav.z1 + 1); z++)
      for (let x = Math.max(0, cav.x0 - 1); x <= Math.min(RING_SX - 1, cav.x1 + 1); x++) {
        const id = get(b, x, r, z);
        if (!SOLID[id] || inFootprint(x, z)) continue;
        // Touching air?
        if (get(b, x + 1, r, z) && get(b, x - 1, r, z) && get(b, x, r, z + 1) && get(b, x, r, z - 1) && get(b, x, r + 1, z) && get(b, x, r - 1, z)) continue;
        const slot = id >= 64 && id < 176 ? (id - 64) % 8 : -1;
        if (slot >= 4 && slot <= 6) veined++;
        else if (id >= 176) veined++;
        else if (slot >= 0) walls.push(x + RING_SX * (r + SLAB_ROWS * z));
      }
  }
  // Seams by a hashed 2 x 2 x 2 threshold (they cluster), then topped up to 10 % of the wall faces.
  const total = walls.length + veined;
  const conv = (i: number, w: number) => (b[i] = w < 0.7 ? kit.ore : w < 0.92 ? kit.rich : kit.gem);
  const rest: number[] = [];
  for (const i of walls) {
    const z = Math.floor(i / (RING_SX * SLAB_ROWS));
    const r = Math.floor(i / RING_SX) % SLAB_ROWS;
    const x = i % RING_SX;
    if (h01(x >> 1, (d0 + r) >> 1, z >> 1, seed ^ 0x55) < 0.11) {
      conv(i, h01(x, r, z, seed ^ 0x77));
      veined++;
    } else rest.push(i);
  }
  for (let j = 0, conv0 = 0; (veined < 0.2 * total || conv0 < 4) && j < rest.length; j++, conv0++) {
    const i = rest[(j * 7919 + (seed & 0xff)) % rest.length];
    if (b[i] === kit.ore || b[i] === kit.rich || b[i] === kit.gem) continue;
    conv(i, h01(i, 3, 5, seed));
    veined++;
  }
}

/** Where biome b's Vista opens (35 % into it), or null for the surface biome (its Vista is the surface itself). */
export function vistaRows(b: number): { top: number; bottom: number } | null {
  if (b <= 0) return null;
  const s = biomeStart(b);
  const e = b < AUTHORED_BIOMES - 1 ? biomeStart(b + 1) : b === AUTHORED_BIOMES - 1 ? ECHO_START : s + ECHO_SPACING;
  const top = s + Math.round(0.35 * (e - s));
  return { top, bottom: top + 25 };
}

/** The Vista rows of every biome overlapping depth rows [a, b]. */
export function vistasNear(a: number, b: number): Array<{ biome: number; top: number; bottom: number }> {
  const out: Array<{ biome: number; top: number; bottom: number }> = [];
  for (let k = Math.max(1, biomeAt(Math.max(0, a - 30))); k <= biomeAt(b) + 1; k++) {
    const v = vistaRows(k);
    if (v && v.bottom >= a && v.top <= b) out.push({ biome: k, ...v });
  }
  return out;
}

/**
 * The Vista (SPEC §6.6/§6.7): a 26 m-tall room across the slab (x 10..53), open at the cut beside the shaft (the
 * dig continues down a pillar of cells through it) and open at the back onto 2D's backdrop layers (the ring reads
 * AIR behind z = 0 in its rows); 8-14 tappables, a Royal Chest, lamps, motes. The set piece stands in it
 * (DescentScene places 2D's `buildSetPiece`).
 */
export function carveVista(ctx: Ctx, v: { biome: number; top: number; bottom: number }, kit: BiomeKit, seed: number): void {
  const { d0, out } = ctx;
  if (v.bottom < d0 - 1 || v.top > d0 + SLAB_ROWS) return;
  const x0 = 10;
  const x1 = 53;
  const cy = (v.top + v.bottom) / 2;
  const ry = (v.bottom - v.top) / 2 + 0.5;
  for (let d = Math.max(v.top, d0); d <= Math.min(v.bottom, d0 + SLAB_ROWS - 1); d++) {
    const t = (d - cy) / ry;
    // An arched room: widest at its middle, the walls bulging with noise.
    const half = ((x1 - x0) / 2) * Math.sqrt(Math.max(0, 1 - t * t * 0.85));
    for (let z = 0; z < CUT; z++)
      for (let x = 0; x < RING_SX; x++) {
        if (inFootprint(x, z)) continue;
        const wob = 1.5 * (h01(Math.floor(x / 3), Math.floor(d / 3), Math.floor(z / 4), seed) - 0.5);
        if (Math.abs(x + 0.5 - (x0 + x1 + 1) / 2) > half + wob) continue;
        out.blocks[x + RING_SX * (d - d0 + SLAB_ROWS * z)] = B.AIR;
      }
  }
  const cav: CavernSpec = { id: `v${v.biome}`, kind: 'vista', top: v.top, bottom: v.bottom, x0, x1, z0: 0, z1: CUT - 1 };
  out.caverns.push(cav);
  out.vistas.push({ id: `vista:${v.biome}`, biome: v.biome, top: v.top, bottom: v.bottom, x0, x1 });
  dressCavern(ctx, cav, kit, v.biome, seed, { medium: 12, tappables: 10, emitters: 4, lamps: 4, hero: true, liquid: true });
  ledges(ctx, cav, kit, 5, seed);
}

/**
 * A geode (SPEC §6.6): a sphere of crystal-lined air beside the shaft, just touching the cut so its glitter shows in
 * the section, 1 per 80-120 m, touching no other cavern.
 */
export function carveGeodes(ctx: Ctx, seed: number): void {
  const { d0, out } = ctx;
  const n0 = Math.max(0, Math.floor((d0 - 120) / 100));
  const n1 = Math.ceil((d0 + SLAB_ROWS + 4) / 100);
  for (let n = n0; n <= n1; n++) {
    const cy = 130 + 100 * n + Math.floor(h01(n, 1, 0, seed) * 30) - 15;
    const r = 2 + h01(n, 2, 0, seed) * 1.5;
    if (cy + r < d0 - 1 || cy - r > d0 + SLAB_ROWS) continue;
    const s = nextBiomeStart(Math.floor(cy - r));
    if (cy + r >= s - 3 && cy - r <= s + 18) continue;
    const left = n % 2 === 0;
    const cx = left ? SHAFT_X0 - 2 - r : SHAFT_X1 + 3 + r;
    const cz = CUT - r + 0.6;
    // Skip it where another cavern already opened the rock (it touches no other cavern).
    let clash = false;
    for (const c of out.caverns) if (c.bottom >= cy - r - 1 && c.top <= cy + r + 1 && c.x1 >= cx - r - 1 && c.x0 <= cx + r + 1 && c.z1 >= cz - r - 1) clash = true;
    if (clash) continue;
    const kit = ctx.kitAt(Math.floor(cy));
    for (let d = Math.max(d0, Math.floor(cy - r - 1)); d <= Math.min(d0 + SLAB_ROWS - 1, Math.ceil(cy + r + 1)); d++)
      for (let z = Math.floor(cz - r - 1); z < CUT; z++)
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          if (x < 0 || x >= RING_SX || inFootprint(x, z)) continue;
          const e = Math.hypot(x + 0.5 - cx, d + 0.5 - cy, z + 0.5 - cz);
          const i = x + RING_SX * (d - d0 + SLAB_ROWS * z);
          if (e < r - 0.6) out.blocks[i] = B.AIR;
          else if (e < r + 0.5) out.blocks[i] = h01(x, d, z, seed) < 0.025 ? kit.emitter : kit.gem;
        }
    out.caverns.push({ id: `geo${n}`, kind: 'geode', top: Math.floor(cy - r), bottom: Math.ceil(cy + r), x0: Math.floor(cx - r), x1: Math.ceil(cx + r), z0: Math.floor(cz - r), z1: CUT - 1 });
  }
}

/** The biome of a depth row's kit (Echo strata: their base). */
export const kitBiome = (d: number): number => baseBiome(biomeAt(d));

/**
 * Finish an authored cavern (the tutorial's): veins on its walls, an ambient emitter when it is ≥ 50 m³ and the
 * small scatter so its floor meets rule 2 (its props and tappables are authored).
 */
/** The voxel under (x, d, z): this slab's; below the slab, solid unless the cavern's own carve opens it there
 *  (`carvedAt`, pure), so a bowl's floor is found in either slab and no prop floats at a slab boundary. */
function belowFloor(ctx: Ctx, cav: CavernSpec, x: number, d: number, z: number): number {
  const r = d + 1 - ctx.d0;
  if (r < SLAB_ROWS) return get(ctx.out.blocks, x, r, z);
  if (d >= cav.bottom) return B.BEDROCK;
  // Vistas and halls carve with their own code (and are open below): treat them as open.
  if (cav.kind === 'vista' || cav.kind === 'hall' || cav.kind === 'geode') return B.AIR;
  return carvedAt(cav, x, d + 1, z) ? B.AIR : B.BEDROCK;
}

export function finishCavern(ctx: Ctx, cav: CavernSpec, kit: BiomeKit, seed: number): void {
  veinWalls(ctx, cav, kit, seed);
  const vol = (cav.x1 - cav.x0 + 1) * (cav.bottom - cav.top + 1) * (cav.z1 - cav.z0 + 1);
  const { d0, out } = ctx;
  // Every finished cavern breathes (rule 5 asks it from 50 m³; the small ones get it too: 4 moving things a screen).
  if (vol >= 20 && cav.top >= Math.max(0, d0 - 2) && cav.top < d0 + SLAB_ROWS && !out.motes.some((m) => Math.abs(m.y + (cav.top + cav.bottom + 1) / 2) < 0.01 && Math.abs(m.x - (cav.x0 + cav.x1 + 1) / 2) < 0.01))
    out.motes.push({ x: (cav.x0 + cav.x1 + 1) / 2, y: -(cav.top + cav.bottom + 1) / 2, z: (cav.z0 + cav.z1 + 1) / 2, rx: (cav.x1 - cav.x0) / 2, ry: (cav.bottom - cav.top) / 2, rz: (cav.z1 - cav.z0) / 2, kind: kit.mote, color: kit.moteColor });
  if (cav.bottom >= d0 && cav.bottom < d0 + SLAB_ROWS) scatter(ctx, cav, kit, seed);
  topUp(ctx, cav, seed);
}

function scatter(ctx: Ctx, cav: CavernSpec, kit: BiomeKit, seed: number): void {
  const { d0, out } = ctx;
  const step = (cav.x1 - cav.x0 + 1) * (cav.z1 - cav.z0 + 1) < 40 ? 1.5 : 2.2;
  for (let gz = cav.z0; gz <= cav.z1; gz += step)
    for (let gx = cav.x0; gx <= cav.x1; gx += step) {
      const x = gx + 0.25 + h01(gx, gz, 61, seed) * (step - 0.5);
      const z = gz + 0.25 + h01(gz, gx, 62, seed) * (step - 0.5);
      const xi = Math.floor(x);
      const zi = Math.floor(z);
      if (inViewColumn(x, z) || nearDigFace(x, z) || inFootprint(xi, zi)) continue;
      if (get(out.blocks, xi, cav.bottom - d0, zi) !== B.AIR) continue;
      const below = cav.bottom + 1 - d0 < SLAB_ROWS ? get(out.blocks, xi, cav.bottom + 1 - d0, zi) : B.BEDROCK;
      if (!SOLID[below]) continue;
      addProp(ctx, pick(kit.small, h01(xi, zi, 63, seed)), x, cav.bottom + 1, z, { scale: 0.6 + 0.4 * h01(xi, zi, 64, seed) });
    }
}

/** Top up to rule 2 (≥ 1 prop per 6 m² of floor): pebbles on the floor cells still bare (this slab's part). */
function topUp(ctx: Ctx, cav: CavernSpec, seed: number): void {
  const { d0, out } = ctx;
  const cells: Array<[number, number, number]> = [];
  for (let z = cav.z0; z <= cav.z1; z++)
    for (let x = cav.x0; x <= cav.x1; x++) {
      if (inViewColumn(x + 0.5, z + 0.5) || nearDigFace(x + 0.5, z + 0.5) || inFootprint(x, z)) continue;
      for (let d = Math.min(cav.bottom, d0 + SLAB_ROWS - 1); d >= Math.max(cav.top, d0); d--) {
        if (get(out.blocks, x, d - d0, z) !== B.AIR) continue;
        const below = belowFloor(ctx, cav, x, d, z);
        if (SOLID[below]) cells.push([x, z, d + 1]);
        break;
      }
    }
  const inBox = out.props.filter((p) => p.x >= cav.x0 - 0.6 && p.x <= cav.x1 + 1.6 && -p.y >= cav.top - 1 && -p.y <= cav.bottom + 1.5 && p.z >= cav.z0 - 0.6 && p.z <= cav.z1 + 1.6).length;
  const need = Math.min(12, Math.ceil((cells.length + 2) / 6)) + 1;
  for (let i = 0; inBox + i < need && i < cells.length; i++) {
    const [x, z, f] = cells[Math.floor(h01(i, 71, 7, seed) * cells.length)];
    addProp(ctx, 'pebbles', x + 0.5, f, z + 0.5, { scale: 0.7 });
  }
}

/** True when rows [top, bottom] overlap a Reveal Hall (s + 2 .. s + 17 under each biome start) or a Vista (± 2): the
 *  small caverns keep out of the big rooms (they would be carved away and leave their fill floating). */
export function inBigRoom(top: number, bottom: number): boolean {
  for (let k = Math.max(1, biomeAt(Math.max(0, top - 20))); k <= biomeAt(bottom + 20) + 1; k++) {
    const s = biomeStart(k);
    if (bottom >= s + 2 && top <= s + 17) return true;
    const v = vistaRows(k);
    if (v && bottom >= v.top - 2 && top <= v.bottom + 2) return true;
  }
  return false;
}

/**
 * The treasure niche above each seal (rows s − 7 .. s − 5): a small pocket beside the shaft with a crystal to tap,
 * lit in the next biome's colour, so the approach to a seal (where alcoves keep out of the seal frame and the hall)
 * keeps a reward and a light within reach.
 */
export function sealNiche(ctx: Ctx, s: number, kitNext: BiomeKit, kitHere: BiomeKit): void {
  const { d0, out } = ctx;
  const top = s - 7;
  const bottom = s - 5;
  if (bottom < d0 - 1 || top > d0 + SLAB_ROWS || top < 2) return;
  const left = (s >> 3) % 2 === 0;
  const x0 = left ? SHAFT_X0 - 4 : SHAFT_X1 + 1;
  const x1 = x0 + 3;
  for (let d = Math.max(top, d0); d <= Math.min(bottom, d0 + SLAB_ROWS - 1); d++)
    for (let z = CUT - 4; z < CUT; z++) for (let x = x0; x <= x1; x++) if (!inFootprint(x, z)) set(out.blocks, x, d - d0, z, B.AIR);
  const cav: CavernSpec = { id: `n${s}`, kind: 'pocket', top, bottom, x0, x1, z0: CUT - 4, z1: CUT - 1 };
  out.caverns.push(cav);
  addProp(ctx, 'crystalCluster', left ? x1 - 0.1 : x0 + 0.6, bottom + 1, CUT - 1.6, { tap: 'gem', taps: 2, scale: 0.85 });
  addProp(ctx, pick(kitHere.small, 0.5), (x0 + x1 + 1) / 2, bottom + 1, CUT - 3.2);
  for (let d = top; d <= bottom; d++) if (embed(ctx, left ? x0 - 1 : x1 + 1, d, CUT - 2, kitNext.emitter)) break;
  finishCavern(ctx, cav, kitHere, s * 7);
}
