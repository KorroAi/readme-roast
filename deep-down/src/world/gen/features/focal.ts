import { B, SOLID, isEmitter } from '../../../config/blocks';
import { Rng } from '../../../core/rng';
import type { VoxelWorld } from '../../VoxelWorld';
import type { PropSpec } from '../types';
import { DEEP } from './deep';
import type { FeatureLayout, V3 } from './types';

/**
 * Focal points (finished game, polish): the four spaces the lead found monotone each get one warm
 * counterpoint and one lit focal point (BRIEF §2: one focal point per frame), and the Choir's dais
 * kerb gives its glow back to the spires.
 *
 * - The seal before the Deep Gate: a Halden lamp in its corner and their pick rack at the other,
 *   so the purple-grey wall reads as the way on.
 * - The rift floor: a lamp the Halden set on the black stone's first step, in front of its portal.
 * - The Glowroot: the Halden's survey camp at the cavern's heart (a lamp, a crate, a bedroll), a warm
 *   pool in the green.
 * - The Ember Deep: the builders' hearth burns again (a lanternstone heart on its bed, an amber flame
 *   over it), with four ways in through its ring, so it is seen from the cavern's mouth.
 * - The Crystal Choir: the dais kerb is dressed stone (its 16 glowing glyph blocks outshone the
 *   spires), with four rune stones inlaid flush in the dais floor instead.
 *
 * It runs last (after the content pass, so no find moves and every earlier id stays), with its own
 * random stream; props are f_focal_<n>, and every voxel it writes lies in a box it declares.
 */
export function focalPoints(ctx: { world: VoxelWorld; seed: number; props: PropSpec[] }, features: FeatureLayout): void {
  const w = ctx.world;
  const rng = new Rng(ctx.seed ^ 0xf0ca1001);
  let n = 0;
  const air = (x: number, y: number, z: number) => !SOLID[w.get(x, y, z)];
  const box = (id: string, min: V3, max: V3) => features.boxes.push({ id: `focal.${id}`, min, max });
  // A clear spot: open air with solid ground under it, and no prop within 0.9 m.
  const clear = (x: number, y: number, z: number) =>
    air(Math.floor(x), y, Math.floor(z)) && air(Math.floor(x), y + 1, Math.floor(z)) && SOLID[w.get(Math.floor(x), y - 1, Math.floor(z))] === 1 &&
    ctx.props.every((p) => Math.hypot(p.x - x, (p.y - y) * 1.5, p.z - z) >= 0.9);
  const prop = (p: Omit<PropSpec, 'id' | 'seed' | 'emitters' | 'anchor' | 'scale'> & Partial<PropSpec>, light?: number): PropSpec | null => {
    if (!clear(p.x, p.y, p.z)) return null;
    const spec: PropSpec = { id: `f_focal_${n++}`, scale: 1, anchor: [Math.floor(p.x), p.y - 1, Math.floor(p.z)], emitters: [], seed: rng.int(0, 1 << 30), ...p };
    for (const [x, y, z] of spec.emitters) if (air(x, y, z) && !isEmitter(w.get(x, y, z))) w.blocks[w.index(x, y, z)] = light ?? B.LIGHT_LAMP;
    ctx.props.push(spec);
    return spec;
  };
  const lamp = (x: number, y: number, z: number, rotY: number, light: number) => {
    const ex = Math.floor(x);
    const ez = Math.floor(z);
    return prop({ kind: 'lanternPost', x, y, z, rotY, emitters: air(ex, y + 1, ez) ? [[ex, y + 1, ez]] : [] }, light);
  };
  const poi = (id: string, p: V3) => features.pois.push({ id: `focal.${id}`, p, kind: 'sight', mustReach: true });

  // The seal before the Deep Gate (hardened slate, x 137..138, z 98..103, walk y 42).
  box('seal', [135, 41, 97], [137, 44, 104]);
  if (lamp(136.5, 42, 98.5, Math.PI * 0.75, B.LIGHT_LAMP)) poi('sealLamp', [136.5, 43, 98.5]);
  prop({ kind: 'pickaxeRack', x: 136.45, y: 42, z: 102.4, rotY: -Math.PI / 2 });

  // The rift floor: on the black stone's second step (feet y 8), at the shaft's corner seen from the rope's foot.
  box('stone', [127, 7, 130], [130, 10, 133]);
  if (lamp(128.5, 8, 131.5, -0.6, B.LIGHT_LAMP)) poi('stoneLamp', [128.5, 9, 131.5]);

  // The Glowroot's heart: the Halden's survey camp.
  const [gx, gz] = DEEP.glowroot.c;
  const gy = DEEP.glowroot.floor;
  box('glowroot', [gx - 2, gy - 1, gz - 2], [gx + 3, gy + 3, gz + 3]);
  if (lamp(gx + 1.3, gy, gz - 0.3, 0.4, B.LIGHT_LAMP)) poi('glowrootCamp', [gx + 1.3, gy + 1, gz - 0.3]);
  prop({ kind: 'crate', x: gx - 0.2, y: gy, z: gz + 1.5, rotY: 0.35, scale: 0.85 });
  prop({ kind: 'bedroll', x: gx + 2.2, y: gy, z: gz + 1.6, rotY: 1.9 });
  prop({ kind: 'ropeCoil', x: gx + 0.4, y: gy, z: gz + 2.3, rotY: 2.6 });

  // The Ember Deep's hearth (ring r 2.3..3.2 round cell (cx, cz), bed of lanternstone under it).
  const [ex, ez] = DEEP.ember.c;
  const ey = DEEP.ember.floor;
  box('hearth', [ex - 4, ey - 1, ez - 4], [ex + 4, ey + 2, ez + 4]);
  for (const [x, z] of [[ex, ez - 3], [ex, ez + 3], [ex - 3, ez], [ex + 3, ez]] as Array<[number, number]>) if (w.get(x, ey, z) === B.ANCIENT_BRICK) w.blocks[w.index(x, ey, z)] = B.AIR;
  if (w.get(ex, ey - 1, ez) === B.LANTERNSTONE && air(ex, ey, ez) && air(ex, ey + 1, ez)) {
    w.blocks[w.index(ex, ey, ez)] = B.LANTERNSTONE;
    w.blocks[w.index(ex, ey + 1, ez)] = B.LIGHT_AMBER;
    poi('hearth', [ex + 0.5, ey + 1, ez + 0.5]);
  }

  // The Choir's dais (kerb of glyph stone at r 3.7..4.6 round the relic): the kerb in dressed stone,
  // and four rune stones inlaid flush in the dais floor at its diagonals, a faint glow at the feet.
  const [cx, cz] = DEEP.choir.c;
  const cy = DEEP.choir.floor;
  box('dais', [cx - 5, cy - 1, cz - 5], [cx + 5, cy, cz + 5]);
  for (let z = cz - 5; z <= cz + 5; z++)
    for (let x = cx - 5; x <= cx + 5; x++) if (w.get(x, cy, z) === B.GLYPH_STONE) w.blocks[w.index(x, cy, z)] = B.ANCIENT_BRICK;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = cx + sx * 2;
    const z = cz + sz * 2;
    if (w.get(x, cy - 1, z) === B.ANCIENT_TILE && air(x, cy, z)) w.blocks[w.index(x, cy - 1, z)] = B.GLYPH_STONE;
  }
}
