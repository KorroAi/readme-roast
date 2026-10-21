import { B, SOLID } from '../../config/blocks';
import { RUNE_GLYPH } from '../../config/runes';
import type { Rng } from '../../core/rng';
import type { VoxelWorld } from '../VoxelWorld';
import type { PlotDef, ProgressionLayout, PropSpec, Region, RuneSite } from './types';

type V3 = [number, number, number];

/**
 * The progression pass (final pass W3): what the upgrade tree and the runes need in the world.
 *
 * - Three camp plots (a chalk outline and a stake each) where the stations rise once built.
 * - Seven rune stones (the Lantern rune is the shrine's tablet) at the sites of plan §2.6; two sit
 *   in niches closed by Ironbound stone (an iron pick opens them), two on the rift floor (the rope).
 * - Echo crystal: the rift's two crystal formations turn to Echo, and their clusters drop echo
 *   shards (an iron pick for both).
 * - Iron for a tier: more veins beyond the seal (gate +4, the corridor's gallery) and in the rift (+2).
 *
 * It runs after the key lights and before the feature pass (world/gen/features), with its own
 * forked random stream; its props come before the feature pass's, so every earlier prop id stays.
 */
export interface ProgressionContext {
  world: VoxelWorld;
  rng: Rng;
  props: PropSpec[];
  addProp: (p: Omit<PropSpec, 'id' | 'seed' | 'emitters' | 'rotY' | 'scale' | 'anchor'> & Partial<PropSpec>) => PropSpec;
  landmarks: Record<string, V3>;
}

/** Plot centres (feet height) and the stations' turns: the plan's sites, the Table moved 3 m clear of the fallen beam. */
export const PLOTS: ReadonlyArray<Omit<PlotDef, 'cells'>> = [
  { station: 'surveyTable', x: 34, y: 101, z: 50, rotY: Math.PI },
  { station: 'forge', x: 42, y: 101, z: 33, rotY: 0 },
  { station: 'relicShelf', x: 31, y: 101, z: 33, rotY: 0 },
];

const PLOT_SKETCH: Record<PlotDef['station'], number> = { forge: 0, surveyTable: 1, relicShelf: 2 };

/** A niche closed by Ironbound: approach cell (feet), the direction into the wall, its width along the wall. */
interface NicheDef {
  item: string;
  at: V3;
  into: 'x+' | 'x-' | 'z+' | 'z-';
  gate: RuneSite['gate'];
}

/** The open rune stones: feet position and the way the stone faces. */
const OPEN_RUNES: ReadonlyArray<{ item: string; p: V3; rotY: number; gate: RuneSite['gate'] }> = [
  // 1 Descent: the back of the tunnel's crystal pocket, minute 2 to 3.
  { item: 'runeDescent', p: [76.5, 96, 52.5], rotY: 0.2, gate: 'none' },
  // 2 Eye: on a brink crag of the ledge, looking out over the Hollow.
  { item: 'runeEye', p: [92.5, 90, 83.5], rotY: Math.PI, gate: 'none' },
  // 3 Star: the stair landing's north corner, mid-stairs, clear of the path between the flights.
  { item: 'runeStar', p: [120.5, 65, 68.5], rotY: 0, gate: 'none' },
  // 5 Spire: the Spindle's foot, by the lamp the earlier expedition left there.
  { item: 'runeSpire', p: [103.5, 43, 118.5], rotY: Math.PI * 0.85, gate: 'none' },
  // 7 Waves: the Glimmerfall's foot on the rift floor (down the rope).
  { item: 'runeWaves', p: [112.5, 9, 126.5], rotY: Math.PI * 0.6, gate: 'rope' },
];

const NICHES: readonly NicheDef[] = [
  // 6 Gate: off the corridor beyond the seal, in its north wall.
  { item: 'runeGate', at: [141, 42, 99], into: 'z-', gate: 'tier3' },
  // 8 Chasm: in the rift's south wall, past the black stone.
  { item: 'runeChasm', at: [124, 10, 147], into: 'z+', gate: 'tier3+rope' },
];

/** The rift's crystal formations (generateWorld section 8): their crystal turns to Echo. */
const ECHO_FORMATIONS: ReadonlyArray<{ base: V3; r: number }> = [
  { base: [110, 12, 128], r: 7 },
  { base: [137, 16, 140], r: 6 },
];

export function buildProgression(ctx: ProgressionContext): ProgressionLayout {
  const w = ctx.world;
  const { rng } = ctx;
  const get = (x: number, y: number, z: number) => w.get(x, y, z);
  const put = (x: number, y: number, z: number, id: number) => {
    if (x > 0 && y > 0 && z > 0 && x < w.sx - 1 && y < w.sy - 1 && z < w.sz - 1) w.blocks[w.index(x, y, z)] = id;
  };
  const isAir = (x: number, y: number, z: number) => !SOLID[get(x, y, z)];

  // ------------------------------------------------------------------------------------
  // Camp plots.
  const plots: PlotDef[] = [];
  for (const p of PLOTS) {
    const cells: Array<[number, number, number]> = [];
    for (const dz of [-1, 0]) for (const dx of [-1, 0]) cells.push([p.x + dx, p.y, p.z + dz]);
    plots.push({ ...p, cells });
    ctx.addProp({
      kind: 'plotStake',
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY,
      anchor: [Math.floor(p.x), p.y - 1, Math.floor(p.z)],
      interact: 'station',
      station: p.station,
      modelVariant: PLOT_SKETCH[p.station],
    });
    ctx.landmarks[`plot_${p.station}`] = [p.x, p.y, p.z];
  }

  // ------------------------------------------------------------------------------------
  // Rune stones.
  const runes: RuneSite[] = [];
  const stone = (item: string, p: V3, rotY: number, gate: RuneSite['gate'], seal: Array<[number, number, number]>) => {
    const glyph = RUNE_GLYPH[item];
    const spec = ctx.addProp({
      kind: 'runeStone',
      x: p[0],
      y: p[1],
      z: p[2],
      rotY,
      anchor: [Math.floor(p[0]), p[1] - 1, Math.floor(p[2])],
      interact: 'rune',
      rune: { item, glyph },
      modelVariant: glyph,
    });
    runes.push({ item, glyph, prop: spec.id, gate, x: p[0], y: p[1], z: p[2], seal });
    ctx.landmarks[`rune_${item}`] = [p[0], p[1], p[2]];
  };
  for (const r of OPEN_RUNES) {
    // Stand it on the floor under its point (the site's floor may sit a cell lower or higher).
    const x = Math.floor(r.p[0]);
    const z = Math.floor(r.p[2]);
    let y = r.p[1];
    while (y > 2 && !SOLID[get(x, y - 1, z)]) y--;
    while (y < w.sy - 2 && SOLID[get(x, y, z)]) y++;
    stone(r.item, [r.p[0], y, r.p[2]], r.rotY, r.gate, []);
  }
  for (const n of NICHES) {
    const [ax, ay, az] = n.at;
    const d: V3 = n.into === 'x+' ? [1, 0, 0] : n.into === 'x-' ? [-1, 0, 0] : n.into === 'z+' ? [0, 0, 1] : [0, 0, -1];
    const across: V3 = d[0] !== 0 ? [0, 0, 1] : [1, 0, 0];
    const seal: Array<[number, number, number]> = [];
    // Two wide, two tall, two deep: the first layer is the Ironbound seal, the second the niche.
    for (let k = 1; k <= 2; k++)
      for (let a = 0; a < 2; a++)
        for (let h = 0; h < 2; h++) {
          const x = ax + d[0] * k + across[0] * a;
          const y = ay + h;
          const z = az + d[2] * k + across[2] * a;
          if (k === 1) {
            put(x, y, z, B.IRONBOUND);
            seal.push([x, y, z]);
          } else put(x, y, z, B.AIR);
          // Solid floor, ceiling and back.
          if (h === 0 && !SOLID[get(x, y - 1, z)]) put(x, y - 1, z, B.DEEP_SLATE);
          if (h === 1 && !SOLID[get(x, y + 1, z)]) put(x, y + 1, z, B.DEEP_SLATE);
        }
    for (let a = -1; a <= 2; a++)
      for (let h = -1; h <= 2; h++) {
        // The back wall and the niche's sides stay rock.
        const bx = ax + d[0] * 3 + across[0] * a;
        const bz = az + d[2] * 3 + across[2] * a;
        if (!SOLID[get(bx, ay + h, bz)]) put(bx, ay + h, bz, B.DEEP_SLATE);
        if (a === -1 || a === 2) {
          const sx = ax + d[0] * 2 + across[0] * a;
          const sz = az + d[2] * 2 + across[2] * a;
          if (!SOLID[get(sx, ay + h, sz)]) put(sx, ay + h, sz, B.DEEP_SLATE);
        }
      }
    // The stone stands in the middle of the niche, facing out.
    const cx = ax + d[0] * 2 + across[0] * 1 + (across[0] ? 0 : 0.5);
    const cz = az + d[2] * 2 + across[2] * 1 + (across[2] ? 0 : 0.5);
    const face = n.into === 'z-' ? 0 : n.into === 'z+' ? Math.PI : n.into === 'x-' ? Math.PI / 2 : -Math.PI / 2;
    stone(n.item, [cx, ay, cz], face, n.gate, seal);
  }

  // ------------------------------------------------------------------------------------
  // Echo crystal: the rift formations' crystal turns pale, and their clusters drop echo shards.
  let echoCells = 0;
  for (const f of ECHO_FORMATIONS) {
    const [bx, by, bz] = f.base;
    for (let z = bz - f.r; z <= bz + f.r; z++)
      for (let y = by - f.r; y <= by + f.r + 6; y++)
        for (let x = bx - f.r; x <= bx + f.r; x++) {
          if (get(x, y, z) !== B.CRYSTAL) continue;
          put(x, y, z, B.ECHO_CRYSTAL);
          echoCells++;
        }
  }
  // And a few small seams of it in the bowl's walls, low enough to reach from the floor.
  for (let placed = 0, attempt = 0; placed < 3 && attempt < 400; attempt++) {
    const x = rng.int(106, 142);
    const y = rng.int(6, 12);
    const z = rng.int(114, 150);
    const id = get(x, y, z);
    if ((id !== B.SLATE && id !== B.DEEP_SLATE && id !== B.UMBER) || !(isAir(x + 1, y, z) || isAir(x - 1, y, z) || isAir(x, y, z + 1) || isAir(x, y, z - 1))) continue;
    let cur: V3 = [x, y, z];
    for (let k = rng.int(2, 3); k > 0; k--) {
      const c = get(cur[0], cur[1], cur[2]);
      if (c === B.SLATE || c === B.DEEP_SLATE || c === B.UMBER) {
        put(cur[0], cur[1], cur[2], B.ECHO_CRYSTAL);
        echoCells++;
      }
      cur = [cur[0] + rng.int(-1, 1), cur[1] + rng.int(0, 1), cur[2] + rng.int(-1, 1)];
    }
    placed++;
  }
  const echoClusters: string[] = [];
  for (const p of ctx.props) {
    if (p.kind !== 'crystalCluster' || !p.minable) continue;
    if (!ECHO_FORMATIONS.some((f) => Math.hypot(p.x - f.base[0], p.z - f.base[2]) <= f.r + 2 && Math.abs(p.y - f.base[1]) <= f.r)) continue;
    p.minable = { hardness: 6, tier: 3, drop: 'echoShard', min: 2, max: 3 };
    echoClusters.push(p.id);
  }

  // ------------------------------------------------------------------------------------
  // Iron for a tier (plan §2.3 budget): exposed wall veins, never in the camp or on a plot.
  const exposed = (x: number, y: number, z: number) => isAir(x + 1, y, z) || isAir(x - 1, y, z) || isAir(x, y, z + 1) || isAir(x, y, z - 1) || isAir(x, y + 1, z);
  const host = (id: number) => id === B.SLATE || id === B.DEEP_SLATE || id === B.UMBER;
  const veins = (box: Region, count: number, minSize: number, maxSize: number) => {
    let planted = 0;
    for (let attempt = 0; attempt < count * 80 && planted < count; attempt++) {
      const x = rng.int(box.min[0], box.max[0]);
      const y = rng.int(box.min[1], box.max[1]);
      const z = rng.int(box.min[2], box.max[2]);
      if (!host(get(x, y, z)) || !exposed(x, y, z)) continue;
      const size = rng.int(minSize, maxSize);
      let cur: V3 = [x, y, z];
      for (let k = 0; k < size; k++) {
        const id = get(cur[0], cur[1], cur[2]);
        if (host(id) || id === B.GRAVEL || id === B.MOSS) put(cur[0], cur[1], cur[2], B.IRON_ORE);
        // Grow along the wall's face (a vein you can see), falling back to any neighbour.
        let next: V3 = [cur[0] + rng.int(-1, 1), cur[1] + rng.int(-1, 1), cur[2] + rng.int(-1, 1)];
        for (let tries = 0; tries < 6; tries++) {
          const c: V3 = [cur[0] + rng.int(-1, 1), cur[1] + rng.int(-1, 1), cur[2] + rng.int(-1, 1)];
          if (host(get(c[0], c[1], c[2])) && exposed(c[0], c[1], c[2])) {
            next = c;
            break;
          }
        }
        cur = next;
      }
      planted++;
    }
    return planted;
  };
  veins({ id: 'gateIron', min: [139, 20, 98], max: [154, 48, 132] }, 10, 3, 5);
  veins({ id: 'balconyIron', min: [128, 22, 116], max: [152, 32, 134] }, 4, 3, 5);
  veins({ id: 'galleryIron', min: [139, 40, 98], max: [151, 47, 103] }, 10, 3, 5);
  veins({ id: 'riftIron', min: [106, 6, 112], max: [142, 36, 152] }, 2, 3, 5);

  return { plots, runes, echoCells, echoClusters };
}
