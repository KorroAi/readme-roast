import { B } from '../../../config/blocks';
import { BIOMES, STRATUM_SIZE, stratumDef, type BiomeId, type StratumIndex } from '../../../config/biomes';
import { hash32 } from '../../../core/math';
import { Noise } from '../../../core/noise';
import { VoxelWorld } from '../../VoxelWorld';
import { carveEdges, carveGalleries, carveNode, carveWorms, dilateGuard, fillHost, type CarveState } from './carve';
import { Rng } from '../../../core/rng';
import { buildPlaces, liftBuried, placeContent, reachNear, validateProps, walkBfs } from './content';
import { dressBiomes, floors } from './dress';
import { planStratum, type StratumPlan } from './plan';
import { SECOND_PIECES, SET_PIECES, carveRavines, carveRiver, carveVista, finishDungeon, stampDungeon, stampSetPiece, type SetPieceOut } from './structures';
import type { StratumLayout, V3 } from './types';
import { withBiomeAt } from './types';
import { TrapScratch, fixTraps, type TrapWorld } from './traps';

/** The seed of one stratum of an expedition (each stratum is its own deterministic world). */
export const stratumSeed = (seed: number, stratum: number): number => hash32((seed >>> 0) ^ Math.imul(stratum + 1, 0x9e3779b1)) >>> 0;

/** Tools only: a line per trap mended (tools/strata-traps.ts sets it). */
export const genDebug: { trapLog?: (line: string) => void; noTraps?: boolean; phaseHook?: (phase: string, world: VoxelWorld) => void } = {};

export interface StratumTimings {
  totalMs: number;
  phases: Record<string, number>;
  attempts: number;
}

/**
 * The set pieces' caverns (before any carving: their caverns skip the biome's columns): each biome's
 * first great cavern gets its set piece (SET_PIECES), a second one its second piece where it has one.
 * Never the river's chambers (their pools) nor the vista.
 */
function assignSetPieces(plan: StratumPlan): void {
  const arrival = plan.nodes[plan.arrival];
  for (const biome of plan.biomes) {
    // Great caverns first, then the biome's biggest rooms (away from the camp).
    const caverns = plan.nodes.filter((n) => n.kind === 'cavern' && n.biome === biome && !n.river);
    const rooms = plan.nodes
      .filter((n) => n.kind === 'room' && n.biome === biome && !n.river && n.role === null && Math.hypot(n.x - arrival.x, n.z - arrival.z) > 30)
      .sort((a, b) => Math.min(b.rx, b.rz) - Math.min(a.rx, a.rz));
    const hosts = [...caverns, ...rooms];
    const names = [SET_PIECES[biome as Exclude<BiomeId, 'heart'>], SECOND_PIECES[biome]].filter((x): x is string => !!x);
    names.forEach((name, k) => {
      // The second piece only in a great cavern.
      const host = k === 0 ? hosts[0] : caverns[1];
      if (host && host.role === null) host.role = `set:${name}`;
    });
  }
}

/**
 * Generate stratum `stratum` (1..6) of the expedition `seed` (round 3, WORLD; BRIEF §0.1-0.2 and §6):
 * deterministic per (seed, stratum), pure (no DOM), run in the zone worker.
 *
 * Passes: plan (regions, nodes, planar tunnel graph, relaxed floor heights, the vista, the works, the
 * river) → host rock → chambers → tunnels → side galleries → floor guard → worm caves → the vista
 * (hall, balcony, ramp, fall) → the river's channel → the works (stamped) → ravines → fixed places
 * (gate, lairs, heart, camp or lift) → floors → biome dressing → set pieces → bedrock shell → walk BFS
 * from the arrival (the gate's seal and the works' door open) → content on the walkable floor.
 *
 * Every key place (each lair, the gate's stand, the heart, the works' vault, the vista's balcony and
 * its floor) must be walkable from the arrival; a plan that fails is redrawn with the next salt
 * (deterministic, at most 6 tries).
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

export function attemptStratum(seed: number, stratum: StratumIndex, attempt: number): StratumLayout & { timings: StratumTimings; ok: boolean; failed: string[]; worksNote: string } {
  const phases: Record<string, number> = {};
  let tp = performance.now();
  const phase = (name: string) => {
    const now = performance.now();
    phases[name] = Math.round((phases[name] ?? 0) + now - tp);
    genDebug.phaseHook?.(name, world);
    tp = performance.now();
  };
  const def = stratumDef(stratum);
  const s = hash32(stratumSeed(seed, stratum) + attempt * 0x1f123bb5) >>> 0;
  const [sx, sy, sz] = STRATUM_SIZE;
  const world = new VoxelWorld(sx, sy, sz, 16);
  const plan = planStratum(s, stratum, def.biomes, sx, sz);
  assignSetPieces(plan);
  phase('plan');
  const st: CarveState = {
    world,
    plan,
    noise: new Noise(s ^ 0xca5e),
    floorY: new Int16Array(sx * sz).fill(-1),
    corridor: new Uint8Array(sx * sz),
    biomeCol: new Uint8Array(sx * sz),
    chamberOf: new Uint16Array(sx * sz),
    edgeOf: new Int16Array(sx * sz),
  };
  fillHost(st);
  phase('host');
  for (const n of plan.nodes) if (n.kind !== 'vista') carveNode(st, n);
  carveEdges(st);
  const pockets = carveGalleries(st, new Rng(s ^ 0x9a11e7));
  dilateGuard(st, 2);
  phase('carve');
  const wormCells = carveWorms(st, s);
  phase('worms');
  // The great structures (after the worms: nothing hollows them afterwards).
  const reserved = new Uint8Array(sx * sz);
  const vista = carveVista(st, s, reserved);
  const lavaRiver = stratum === 6 && (vista?.lava ?? false);
  const river = carveRiver(st, reserved, lavaRiver);
  const works = stampDungeon(st, s, reserved);
  const ravines = carveRavines(st, s, reserved);
  phase('structures');
  const places = buildPlaces(st, stratum, s);
  floors(st);
  if (works) finishDungeon(st, works);
  const decor = dressBiomes(st, s, reserved);
  const pieces: Array<SetPieceOut & { node: number }> = [];
  for (const n of plan.nodes) if (n.role?.startsWith('set:')) pieces.push({ ...stampSetPiece(st, n, n.role.slice(4), s, reserved), node: n.id });
  phase('dress');
  // The bedrock shell (the worms and the dressing never reach it, but keep it exact).
  shell(world);

  const arrivalNode = plan.nodes[plan.arrival];
  const from: V3 = [Math.floor(arrivalNode.x) + 0.5, arrivalNode.y, Math.floor(arrivalNode.z) + 0.5];
  // Traps (traps.ts): no hollow the explorer walks down into without a walk or a climb back out. The
  // world as carved first (a ladder up the drop into each basin, small hollows filled flush), then,
  // after the content, the worst case a player can make (every breakable block mined).
  const scratch = new TrapScratch({ sx, sy, sz });
  const trapWorld = (keep?: (i: number) => boolean): TrapWorld => {
    const openCells: number[] = [];
    for (const [x, y, z] of works?.door ?? []) openCells.push(x + sx * (y + sy * z));
    if (stratum === 6) for (const [x, y, z] of places.seal) openCells.push(x + sx * (y + sy * z));
    for (let i = world.blocks.indexOf(B.CRACKED_WALL); i >= 0; i = world.blocks.indexOf(B.CRACKED_WALL, i + 1)) openCells.push(i);
    return {
      blocks: world.blocks,
      d: { sx, sy, sz },
      start: from,
      home: arrivalRegion(plan, stratum),
      open: openCells,
      fill: (x, _y, z) => BIOMES[plan.biomes[st.biomeCol[x + z * sx]]].floor,
      keep,
    };
  };
  const carvedFix = fixTraps(trapWorld(), scratch, { modes: ['carved'], log: genDebug.trapLog, rounds: genDebug.noTraps ? 1 : undefined });
  phases.trapsFound = carvedFix.found;
  phases.ladders = carvedFix.ladders.length;
  phases.trapFilled = carvedFix.filled;
  // The ladders and the floor round their tops are curated: the content keeps off them (a shrine's
  // pillar or a chest on a ladder's landing would close the way back up).
  for (const lad of carvedFix.ladders) {
    if (!lad.length) continue;
    const [tx, , tz] = lad[lad.length - 1];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (tx + dx >= 0 && tz + dz >= 0 && tx + dx < sx && tz + dz < sz) reserved[tx + dx + (tz + dz) * sx] = 1;
  }
  phase('traps');
  const open = new Set(places.seal.map(([x, y, z]) => x + sx * (y + sy * z)));
  for (const [x, y, z] of works?.door ?? []) open.add(x + sx * (y + sy * z));
  const seen = walkBfs({ world }, from, open);
  phase('walk');

  // The key places must be reachable (gates and the works' door open).
  const keys: Array<[string, V3]> = [['gate', places.gateStand], ...plan.lairs.map((li) => [`lair_${plan.nodes[li].biome}`, [plan.nodes[li].x, plan.nodes[li].y, plan.nodes[li].z]] as [string, V3])];
  if (plan.heart !== null) keys.push(['heart', [plan.nodes[plan.heart].x, plan.nodes[plan.heart].y, plan.nodes[plan.heart].z]]);
  if (works) keys.push(['works', works.vault]);
  if (vista) keys.push(['balcony', vista.balcony], ['vistaFloor', vista.rampFoot]);
  const failed = keys.filter(([, k]) => reachNear(seen, world, k, 4, 3) === null).map(([id]) => id);
  const ok = failed.length === 0;

  const content = placeContent(st, stratum, s, seen, decor, places, { reserved, vista, river: river?.river ?? null, works, ravines, pieces, pockets, lakes: [...(vista?.lakes ?? []), ...(river?.lakes ?? []), ...pieces.flatMap((p) => p.lakes)] });
  phase('content');
  // A heart's chamber is the Heart biome in the region map (2).
  const regionMap = plan.regionMap;
  if (content.heart) {
    const [hx, , hz] = content.heart.centre;
    const r = content.heart.radius;
    for (let z = Math.max(0, Math.floor(hz - r)); z < Math.min(sz, hz + r); z++) for (let x = Math.max(0, Math.floor(hx - r)); x < Math.min(sx, hx + r); x++) if (Math.hypot(x + 0.5 - hx, z + 0.5 - hz) < r) regionMap[x + z * sx] = 2;
  }
  shell(world);
  // The worst case: every breakable block mined (a vein down into a floor would leave a pit). Its
  // fixes never touch a prop's cells (a breakable block under a pit becomes plain rock instead).
  const propCells = new Set<number>();
  for (const p of content.props) {
    // A fill may bury dressing (validateProps drops it below) or a chest, a page or a crystal
    // cluster (liftBuried raises it onto the new floor); the gate, the lift, the levers and the
    // camp's stations are never filled under.
    const fixed = p.interact && p.interact !== 'feature' ? true : p.feature ? p.feature.kind !== 'cache' && p.feature.kind !== 'note' : false;
    if (!fixed) continue;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const z = Math.floor(p.z);
    for (let k = -1; k <= 1; k++) propCells.add(x + sx * (y + k + sy * z));
    for (const [ex, ey, ez] of p.emitters) propCells.add(ex + sx * (ey + sy * ez));
  }
  const worstFix = fixTraps(trapWorld((i) => propCells.has(i)), scratch, { modes: ['carved', 'worst'], log: genDebug.trapLog, rounds: genDebug.noTraps ? 1 : undefined });
  phases.worstFound = worstFix.found;
  phases.ladders += worstFix.ladders.length;
  phases.trapFilled += worstFix.filled;
  phases.trapsLeft = worstFix.remaining;
  phases.propsLifted = liftBuried(world, content);
  phase('traps');
  phases.propsDropped = validateProps(world, content.props);
  phase('shell');

  const caverns = plan.nodes.filter((n) => n.kind === 'cavern' || n.kind === 'lair' || n.kind === 'heart' || n.kind === 'vista').map((n) => ({ id: `cavern_${n.id}`, biome: n.biome, centre: [n.x, n.y, n.z] as V3, radius: [n.rx, n.ry, n.rz] as V3 }));
  const lakes = [...decor.lakes, ...(vista?.lakes ?? []), ...(river?.lakes ?? []), ...pieces.flatMap((p) => p.lakes)];
  // The vista's fall first (Game's old-world landmark reads falls[0]), then the river's spring.
  const falls = [...(vista?.falls ?? []), ...(river?.falls ?? [])];
  const landmarks = content.landmarks;
  if (falls[0]) {
    landmarks.fallTop = falls[0].top;
    landmarks.fallBottom = falls[0].bottom;
  }
  const layout = withBiomeAt({
    world,
    seed: s,
    spawn: content.arrival,
    camp: content.camp,
    // Discovery regions are the old world's journal entries; the strata announce their sites themselves.
    discoveries: [],
    props: content.props,
    route: [],
    landmarks,
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
      lakes,
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
    vista: vista ? { id: vista.id, name: vista.name, biome: vista.biome, centre: vista.centre, radius: vista.radius, balcony: vista.balcony, rampFoot: vista.rampFoot, lava: vista.lava, island: vista.island, lamps: vista.rampLamps, stalactites: vista.stalactites } : null,
    falls,
    rivers: river ? [river.river] : [],
    dungeon: content.dungeon,
    ravines: ravines.map((r) => ({ id: r.id, biome: r.biome, top: r.top, bottom: r.bottom, rope: r.rope })),
    secrets: content.secrets,
  });
  phases.wormCells = wormCells;
  phases.galleries = pockets.length;
  return Object.assign(layout, { timings: { totalMs: 0, phases, attempts: 1 }, ok, failed, worksNote: plan.worksNote });
}

/**
 * The arrival's home box (feet cells): the camp's region in stratum I, the lift's landing below
 * (content.ts builds the same boxes): walking back into it is getting home.
 */
export function arrivalRegion(plan: StratumPlan, stratum: StratumIndex): { min: V3; max: V3 } {
  const an = plan.nodes[plan.arrival];
  const ax = Math.floor(an.x) + 0.5;
  const az = Math.floor(an.z) + 0.5;
  const ay = an.y;
  if (stratum === 1) return { min: [ax - an.rx, ay - 1, az - an.rz], max: [ax + an.rx, ay + 7, az + an.rz] };
  return { min: [ax - 6, ay - 1, az - 6], max: [ax + 6, ay + 6, az + 6] };
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
