import { B } from '../../../config/blocks';
import { STRATUM_SIZE, STRATUM_TOP_Y, stratumDef, type StratumIndex } from '../../../config/biomes';
import { STRATA_GEN } from '../../../config/balance';
import { hash32 } from '../../../core/math';
import { Noise } from '../../../core/noise';
import { VoxelWorld } from '../../VoxelWorld';
import { carveEdges, carveGalleries, carveNode, carveWorms, dilateGuard, fillHost, type CarveState } from './carve';
import { Rng } from '../../../core/rng';
import { buildPlaces, placeContent, reachNear, walkBfs } from './content';
import { dressBiomes, floors } from './dress';
import { planStratum } from './plan';
import type { StratumLayout, V3 } from './types';
import { withBiomeAt } from './types';

/** The seed of one stratum of an expedition (each stratum is its own deterministic world). */
export const stratumSeed = (seed: number, stratum: number): number => hash32((seed >>> 0) ^ Math.imul(stratum + 1, 0x9e3779b1)) >>> 0;

export interface StratumTimings {
  totalMs: number;
  phases: Record<string, number>;
  attempts: number;
}

/**
 * Generate stratum `stratum` (1..6) of the expedition `seed` (round 3, WORLD; BRIEF §0.1-0.2):
 * deterministic per (seed, stratum), pure (no DOM), run in the zone worker.
 *
 * Passes: plan (regions, nodes, planar tunnel graph, relaxed floor heights) → host rock → chambers →
 * tunnels → floor guard → worm caves → fixed places (gate, lairs, heart, camp or lift) → floors →
 * biome dressing → walk BFS from the arrival → content on the walkable floor (veins, chests, pages,
 * props, lights, nests, spawn points, outposts, hazards) → bedrock shell.
 *
 * Every key place (each lair, the gate's stand, the heart) must be walkable from the arrival (gates
 * open); a plan that fails is redrawn with the next salt (deterministic, at most 6 tries).
 */
export function generateStratum(seed: number, stratumIn: number): StratumLayout & { timings: StratumTimings } {
  const t0 = performance.now();
  const stratum = Math.max(1, Math.min(6, Math.floor(stratumIn))) as StratumIndex;
  let last: (StratumLayout & { timings: StratumTimings }) | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const out = attemptStratum(seed, stratum, attempt);
    out.timings.attempts = attempt + 1;
    last = out;
    if (out.ok) break;
  }
  last!.timings.totalMs = Math.round(performance.now() - t0);
  return last!;
}

function attemptStratum(seed: number, stratum: StratumIndex, attempt: number): StratumLayout & { timings: StratumTimings; ok: boolean } {
  const phases: Record<string, number> = {};
  let tp = performance.now();
  const phase = (name: string) => {
    const now = performance.now();
    phases[name] = Math.round((phases[name] ?? 0) + now - tp);
    tp = now;
  };
  const def = stratumDef(stratum);
  const s = hash32(stratumSeed(seed, stratum) + attempt * 0x1f123bb5) >>> 0;
  const [sx, sy, sz] = STRATUM_SIZE;
  const world = new VoxelWorld(sx, sy, sz, 16);
  const plan = planStratum(s, stratum, def.biomes, sx, sz);
  phase('plan');
  const st: CarveState = {
    world,
    plan,
    noise: new Noise(s ^ 0xca5e),
    floorY: new Int16Array(sx * sz).fill(-1),
    corridor: new Uint8Array(sx * sz),
    biomeCol: new Uint8Array(sx * sz),
    chamberOf: new Uint16Array(sx * sz),
  };
  fillHost(st);
  phase('host');
  for (const n of plan.nodes) carveNode(st, n);
  carveEdges(st);
  const pockets = carveGalleries(st, new Rng(s ^ 0x9a11e7));
  dilateGuard(st, 2);
  phase('carve');
  const wormCells = carveWorms(st, s);
  phase('worms');
  const places = buildPlaces(st, stratum, s);
  floors(st);
  const decor = dressBiomes(st, s);
  phase('dress');
  // The bedrock shell (the worms and the dressing never reach it, but keep it exact).
  shell(world);

  const arrivalNode = plan.nodes[plan.arrival];
  const from: V3 = [Math.floor(arrivalNode.x) + 0.5, arrivalNode.y, Math.floor(arrivalNode.z) + 0.5];
  const sealIdx = new Set(places.seal.map(([x, y, z]) => x + sx * (y + sy * z)));
  const seen = walkBfs({ world }, from, sealIdx);
  phase('walk');

  // The key places must be reachable (gates open).
  const keys: V3[] = [places.gateStand, ...plan.lairs.map((li) => [plan.nodes[li].x, plan.nodes[li].y, plan.nodes[li].z] as V3)];
  if (plan.heart !== null) keys.push([plan.nodes[plan.heart].x, plan.nodes[plan.heart].y, plan.nodes[plan.heart].z]);
  const ok = keys.every((k) => reachNear(seen, world, k, 4, 3) !== null);

  const content = placeContent(st, stratum, s, seen, decor, places);
  phase('content');
  // A heart's chamber is the Heart biome in the region map (2).
  const regionMap = plan.regionMap;
  if (content.heart) {
    const [hx, , hz] = content.heart.centre;
    const r = content.heart.radius;
    for (let z = Math.max(0, Math.floor(hz - r)); z < Math.min(sz, hz + r); z++) for (let x = Math.max(0, Math.floor(hx - r)); x < Math.min(sx, hx + r); x++) if (Math.hypot(x + 0.5 - hx, z + 0.5 - hz) < r) regionMap[x + z * sx] = 2;
  }
  shell(world);
  phase('shell');

  const caverns = plan.nodes.filter((n) => n.kind === 'cavern' || n.kind === 'lair' || n.kind === 'heart').map((n) => ({ id: `cavern_${n.id}`, biome: n.biome, centre: [n.x, n.y, n.z] as V3, radius: [n.rx, n.ry, n.rz] as V3 }));
  const discoveries = plan.nodes
    .filter((n) => n.kind === 'cavern' || n.kind === 'lair')
    .map((n) => ({ id: `s${stratum}_${n.kind}_${n.biome}_${n.id}`, min: [n.x - n.rx * 0.6, n.y - 1, n.z - n.rz * 0.6] as [number, number, number], max: [n.x + n.rx * 0.6, n.y + 6, n.z + n.rz * 0.6] as [number, number, number] }));
  void discoveries;
  const layout = withBiomeAt({
    world,
    seed: s,
    spawn: content.arrival,
    camp: content.camp,
    // Discovery regions are the old world's journal entries; the strata announce biomes and lairs by events.
    discoveries: [],
    props: content.props,
    route: [],
    landmarks: content.landmarks,
    structures: [],
    features: {
      boxes: [],
      pois: [],
      links: [],
      runeDoors: [],
      mothAnchors: caverns.slice(0, 8).map((c, k) => ({ id: `motes_${k}`, p: [c.centre[0], c.centre[1] + 3, c.centre[2]] as V3, count: 10, radius: 3 })),
      living: [],
      blooms: [],
      areas: [],
      sockets: { fossil: [] },
      eventSites: content.spawnPoints.filter((p, k) => p.open && k % 9 === 0).slice(0, 24).map((p, k) => ({ id: `ev_${k}`, p: p.p, r: 6, tag: k % 3 === 0 ? 'rockfall' : k % 3 === 1 ? 'geyser' : 'migration' }) as const),
      lakes: decor.lakes,
    },
    stratum,
    expeditionSeed: seed >>> 0,
    biomes: def.biomes,
    regionMap,
    regionBlend: plan.regionBlend,
    lairs: content.lairs,
    gate: content.gate,
    arrival: content.arrival,
    outpostSites: content.outpostSites,
    pages: content.pages,
    chests: content.chests,
    nests: content.nests,
    spawnPoints: content.spawnPoints,
    caverns,
    hazards: content.hazards,
    sites: content.sites,
    campSite: content.campSite,
    heart: content.heart,
    stats: content.stats,
  });
  phases.wormCells = wormCells;
  phases.galleries = pockets.length;
  void STRATUM_TOP_Y;
  void STRATA_GEN;
  return Object.assign(layout, { timings: { totalMs: 0, phases, attempts: 1 }, ok });
}

function shell(w: VoxelWorld): void {
  const { sx, sy, sz } = w;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    w.blocks[x + sx * sy * z] = B.BEDROCK;
    w.blocks[x + sx * (sy - 1 + sy * z)] = B.BEDROCK;
  }
  for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) {
    w.blocks[sx * (y + sy * z)] = B.BEDROCK;
    w.blocks[sx - 1 + sx * (y + sy * z)] = B.BEDROCK;
  }
  for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
    w.blocks[x + sx * y] = B.BEDROCK;
    w.blocks[x + sx * (y + sy * (sz - 1))] = B.BEDROCK;
  }
}
