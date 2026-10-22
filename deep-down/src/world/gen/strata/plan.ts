import { BIOMES, type BiomeId, type StratumIndex } from '../../../config/biomes';
import { Noise } from '../../../core/noise';
import { Rng } from '../../../core/rng';

/**
 * The plan of a stratum (round 3, WORLD): the two biome regions and the graph of places (nodes)
 * joined by walkable tunnels (edges). Pure data, no voxels.
 *
 * - Regions: a domain-warped dividing line across the zone, biome A on the arrival's side; per column
 *   the distance to the border (a two-pass chamfer transform) gives the looks' blend.
 * - Nodes: the arrival (the camp in stratum I, the lift's foot below), the gate, one guardian lair per
 *   biome deep inside it, 2-3 great caverns per biome, rooms in between (Poisson disc, ~30 m apart).
 * - Edges: the Gabriel graph of the nodes in plan (planar: tunnels only meet at nodes, so a tunnel
 *   never cuts another's floor), trimmed of long edges except those the minimum spanning tree needs;
 *   lairs are leaves (one way in). Floor heights follow a smooth noise field, relaxed so every edge
 *   climbs at most MAX_SLOPE (walkable with the 1 m auto-step).
 */

export const MAX_SLOPE = 0.38;
export const MARGIN = 14;
export const FLOOR_MIN = 8;
export const FLOOR_MAX = 74;

export type NodeKind = 'arrival' | 'gate' | 'lair' | 'cavern' | 'room' | 'heart' | 'vista' | 'overlook' | 'dungeon';

/** The vista's balcony stands this high over its hall's floor (the ramp winds down the wall). */
export const OVERLOOK_RISE = 14;

/**
 * The mini-dungeon of a stratum (a Halden works): an axis-aligned complex entered at `node`, running
 * `dir` (a unit axis) for `length` m, `half` m to each side; `puzzle` opens its reward vault's door.
 */
export interface DungeonPlan {
  node: number;
  dir: [number, number];
  length: number;
  half: number;
  puzzle: 'levers' | 'plates';
  /** How many levers or plates. */
  count: number;
}

export interface PlanNode {
  id: number;
  kind: NodeKind;
  x: number;
  z: number;
  /** Floor height (feet y of the walking level). */
  y: number;
  biome: BiomeId;
  /** Chamber half extents (m): rx, ry (height), rz, and its turn. */
  rx: number;
  ry: number;
  rz: number;
  rot: number;
  /** Dressing role assigned later (mine camp, shrine, ore room, vault host, set piece, nest...). */
  role: string | null;
  edges: number[];
  /** The underground river runs through this chamber (its floor is kept flat: the river pools there). */
  river?: boolean;
}

export interface PlanEdge {
  id: number;
  a: number;
  b: number;
  /** Meander: perpendicular offsets (fractions of the length) for the two bends, and a phase. */
  bend1: number;
  bend2: number;
  /** Tunnel radius (m) and height (m) scale. */
  radius: number;
  height: number;
  /** It crosses the vista's hall: a natural rock bridge spans the hall along it (structures carveVista). */
  bridge?: boolean;
  /**
   * How far from each end's centre the tunnel's floor stays flat at that node's height (m): the node's
   * rim, or farther where another tunnel leaves the same node at a narrow angle (until the two have
   * parted, both keep the node's level: one climbing while the other falls would cut a cliff into
   * the floor they share). Set by planStratum; rimOf when absent.
   */
  flatA?: number;
  flatB?: number;
}

/**
 * How far from a chamber's centre its floor is flat, so a tunnel's climb starts outside it: the whole
 * chamber and its wobble (its rim is flat, and a climb that began inside would leave a two-block step
 * where the tunnel's floor meets the chamber's), the whole hall and its wall for the vista.
 */
export function rimOf(n: PlanNode): number {
  return n.kind === 'vista' ? n.rx + 2 : Math.max(n.rx, n.rz) * 1.12 + 0.5;
}

export interface StratumPlan {
  stratum: StratumIndex;
  biomes: [BiomeId, BiomeId];
  sx: number;
  sz: number;
  regionMap: Uint8Array;
  regionBlend: Uint8Array;
  nodes: PlanNode[];
  edges: PlanEdge[];
  arrival: number;
  gate: number;
  lairs: number[];
  heart: number | null;
  /** The landmark vista (a huge hall) and its balcony, the overlook (null when none fitted). */
  vista: number | null;
  overlook: number | null;
  dungeon: DungeonPlan | null;
  /** The underground river: node ids from its spring down to its mouth (the overlook, where it falls). */
  river: number[];
  /** Why the works are missing (tools): 'room' (no box fitted), 'crossed', 'noWay'; '' when placed. */
  worksNote: string;
}

/** Region map: 0 = A, 1 = B (2 = the Heart, set later); blend = distance to the border (2 per metre, capped). */
function buildRegions(rng: Rng, noise: Noise, sx: number, sz: number, arrival: [number, number]): { map: Uint8Array; blend: Uint8Array } {
  const map = new Uint8Array(sx * sz);
  // The border runs roughly across the middle, at an angle; biome A holds the arrival.
  const ang = rng.range(0, Math.PI * 2);
  const nx = Math.cos(ang);
  const nz = Math.sin(ang);
  const cx = sx / 2 + rng.range(-20, 20);
  const cz = sz / 2 + rng.range(-20, 20);
  const side = (x: number, z: number) => {
    const wx = x + 26 * noise.noise2(x / 70, z / 70 + 3.1);
    const wz = z + 26 * noise.noise2(x / 70 + 7.7, z / 70);
    return (wx - cx) * nx + (wz - cz) * nz + 18 * noise.noise2(x / 45 + 11, z / 45 - 5);
  };
  const flip = side(arrival[0], arrival[1]) > 0;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const s = side(x, z);
    map[x + z * sx] = (s > 0) !== flip ? 1 : 0;
  }
  // Distance to the border (chamfer 3-4 on the grid), in half metres, capped at 255.
  const d = new Uint16Array(sx * sz).fill(65535);
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + z * sx;
    const m = map[i];
    if ((x > 0 && map[i - 1] !== m) || (x < sx - 1 && map[i + 1] !== m) || (z > 0 && map[i - sx] !== m) || (z < sz - 1 && map[i + sx] !== m)) d[i] = 0;
  }
  const relax = (i: number, j: number, c: number) => {
    if (d[j] + c < d[i]) d[i] = d[j] + c;
  };
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + z * sx;
    if (x > 0) relax(i, i - 1, 3);
    if (z > 0) {
      relax(i, i - sx, 3);
      if (x > 0) relax(i, i - sx - 1, 4);
      if (x < sx - 1) relax(i, i - sx + 1, 4);
    }
  }
  for (let z = sz - 1; z >= 0; z--) for (let x = sx - 1; x >= 0; x--) {
    const i = x + z * sx;
    if (x < sx - 1) relax(i, i + 1, 3);
    if (z < sz - 1) {
      relax(i, i + sx, 3);
      if (x < sx - 1) relax(i, i + sx + 1, 4);
      if (x > 0) relax(i, i + sx - 1, 4);
    }
  }
  const blend = new Uint8Array(sx * sz);
  for (let i = 0; i < blend.length; i++) blend[i] = Math.min(255, Math.round((d[i] / 3) * 2));
  return { map, blend };
}

export function planStratum(seed: number, stratum: StratumIndex, biomes: [BiomeId, BiomeId], sx: number, sz: number): StratumPlan {
  const rng = new Rng(seed ^ 0x51a7a001);
  const noise = new Noise(seed ^ 0x51a7);
  // The arrival sits near one edge, the gate near the opposite one.
  const edgeAng = rng.int(0, 3) * (Math.PI / 2) + rng.range(-0.35, 0.35);
  const ax = sx / 2 - Math.cos(edgeAng) * (sx / 2 - MARGIN - 10);
  const az = sz / 2 - Math.sin(edgeAng) * (sz / 2 - MARGIN - 10);
  const regions = buildRegions(rng.fork(1), noise, sx, sz, [ax, az]);
  const biomeOf = (x: number, z: number): BiomeId => biomes[regions.map[Math.floor(x) + Math.floor(z) * sx]];
  const blendAt = (x: number, z: number) => regions.blend[Math.floor(x) + Math.floor(z) * sx];

  const nodes: PlanNode[] = [];
  const add = (kind: NodeKind, x: number, z: number, r: [number, number, number]): PlanNode => {
    const n: PlanNode = { id: nodes.length, kind, x, z, y: 40, biome: biomeOf(x, z), rx: r[0], ry: r[1], rz: r[2], rot: rng.range(0, Math.PI), role: null, edges: [] };
    nodes.push(n);
    return n;
  };
  const free = (x: number, z: number, minD: number) => nodes.every((n) => Math.hypot(n.x - x, n.z - z) >= minD + Math.max(n.rx, n.rz) * 0.6);
  /**
   * Room for a chamber of radius r at (x, z): no other chamber's ellipse (with its wobble) within reach,
   * and a gap for a tunnel between (overlapping halls at two heights would cut a cliff where they meet).
   * The balcony stands on the vista's rim on purpose.
   */
  const roomFor = (x: number, z: number, r: number) => nodes.every((n) => n.kind === 'overlook' || Math.hypot(n.x - x, n.z - z) >= 1.18 * (Math.max(n.rx, n.rz) + r) + 5);
  const inside = (x: number, z: number, m = MARGIN) => x >= m && z >= m && x < sx - m && z < sz - m;

  const arrival = add('arrival', ax, az, stratum === 1 ? [13, 7, 11] : [9, 7, 9]);
  arrival.rot = 0;
  const gx = sx / 2 + Math.cos(edgeAng) * (sx / 2 - MARGIN - 14) + rng.range(-25, 25);
  const gz = sz / 2 + Math.sin(edgeAng) * (sz / 2 - MARGIN - 14) + rng.range(-25, 25);
  const gate = add('gate', Math.max(MARGIN + 12, Math.min(sx - MARGIN - 12, gx)), Math.max(MARGIN + 12, Math.min(sz - MARGIN - 12, gz)), [11, 9, 11]);
  gate.rot = 0;

  // One lair per biome: the column deepest inside it (far from the border), away from arrival and gate.
  const lairs: number[] = [];
  for (let bi = 0; bi < 2; bi++) {
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (let k = 0; k < 900; k++) {
      const x = rng.range(MARGIN + 16, sx - MARGIN - 16);
      const z = rng.range(MARGIN + 16, sz - MARGIN - 16);
      if (regions.map[Math.floor(x) + Math.floor(z) * sx] !== bi) continue;
      const dA = Math.hypot(x - arrival.x, z - arrival.z);
      const dG = Math.hypot(x - gate.x, z - gate.z);
      if (dA < 70 || dG < 40) continue;
      const score = Math.min(blendAt(x, z), 90) + Math.min(dA, 140) * 0.3 + rng.next() * 6;
      if (score > bestScore && free(x, z, 30) && roomFor(x, z, 13)) {
        bestScore = score;
        best = [x, z];
      }
    }
    if (!best) {
      // Fallback: any spot of the biome.
      for (let k = 0; k < 4000 && !best; k++) {
        const x = rng.range(MARGIN + 16, sx - MARGIN - 16);
        const z = rng.range(MARGIN + 16, sz - MARGIN - 16);
        if (regions.map[Math.floor(x) + Math.floor(z) * sx] === bi && free(x, z, 20) && roomFor(x, z, 13)) best = [x, z];
      }
    }
    const n = add('lair', best![0], best![1], [13, 11, 13]);
    n.biome = biomes[bi];
    n.rot = 0;
    lairs.push(n.id);
  }

  // The Heart (stratum VI): a great chamber behind the gate.
  let heart: number | null = null;
  if (stratum === 6) {
    // Toward the zone's middle, past the gate hall's wall: the Heart's door stands in the passage
    // between them, so the two chambers never touch.
    const ux = sx / 2 - gate.x;
    const uz = sz / 2 - gate.z;
    const ul = Math.hypot(ux, uz) || 1;
    const D = Math.max(1.18 * (11 + 20) + 12, ul * 0.35);
    const hx = Math.max(MARGIN + 22, Math.min(sx - MARGIN - 22, gate.x + (ux / ul) * D));
    const hz = Math.max(MARGIN + 22, Math.min(sz - MARGIN - 22, gate.z + (uz / ul) * D));
    const h = add('heart', hx, hz, [20, 16, 20]);
    h.rot = 0;
    heart = h.id;
  }

  // The landmark vista: one huge hall (>= 54 m across) on the way from the arrival to the gate, its
  // balcony (the overlook) on the side the explorer comes from, high over the floor.
  let vista: number | null = null;
  let overlook: number | null = null;
  {
    const R = rng.range(27, 30);
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    const gx0 = gate.x - arrival.x;
    const gz0 = gate.z - arrival.z;
    const gl = Math.hypot(gx0, gz0) || 1;
    for (let k = 0; k < 2500; k++) {
      const x = rng.range(MARGIN + R + 4, sx - MARGIN - R - 4);
      const z = rng.range(MARGIN + R + 4, sz - MARGIN - R - 4);
      if (!free(x, z, R + 12) || !roomFor(x, z, R)) continue;
      const dA = Math.hypot(x - arrival.x, z - arrival.z);
      if (dA < R + 34) continue;
      if (Math.hypot(x - gate.x, z - gate.z) < R + 26) continue;
      // Along the way: the projection on arrival -> gate in its middle, not far off the line.
      const t = ((x - arrival.x) * gx0 + (z - arrival.z) * gz0) / (gl * gl);
      const off = Math.abs((x - arrival.x) * gz0 - (z - arrival.z) * gx0) / gl;
      const score = -Math.abs(t - 0.5) * 120 - Math.max(0, off - 30) * 0.8 + rng.next() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = [x, z];
      }
    }
    if (best) {
      const v = add('vista', best[0], best[1], [R, rng.range(27, 30), R]);
      v.rot = 0;
      vista = v.id;
      // The balcony faces the arrival: the first sight of the hall is from above.
      const ux = arrival.x - v.x;
      const uz = arrival.z - v.z;
      const ul = Math.hypot(ux, uz) || 1;
      const o = add('overlook', v.x + (ux / ul) * (R + 1.5), v.z + (uz / ul) * (R + 1.5), [5, 4.5, 5]);
      o.rot = Math.atan2(uz, ux);
      o.biome = v.biome;
      overlook = o.id;
    }
  }

  // The mini-dungeon: a Halden works entered from a chamber of the graph and running toward the nearest
  // border of the zone (so no tunnel crosses it), its reward vault at the far end.
  let dungeon: DungeonPlan | null = null;
  let worksNote = 'room';
  {
    const length = 30;
    const half = 17;
    const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best: { x: number; z: number; dir: [number, number] } | null = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 1600; k++) {
      const dir = dirs[rng.int(0, 3)];
      // The entry is `length` + a margin in from the border it faces.
      const along = rng.range(length + MARGIN + 4, length + MARGIN + 30);
      const across = rng.range(MARGIN + half + 4, (dir[0] ? sz : sx) - MARGIN - half - 4);
      const x = dir[0] === 1 ? sx - along : dir[0] === -1 ? along : across;
      const z = dir[1] === 1 ? sz - along : dir[1] === -1 ? along : across;
      // The box: from the entry `length` m along dir, `half` m to each side.
      const cx = x + dir[0] * length * 0.5;
      const cz = z + dir[1] * length * 0.5;
      if (!free(cx, cz, 30)) continue;
      if (Math.hypot(x - arrival.x, z - arrival.z) < 60) continue;
      const score = Math.min(90, Math.hypot(x - arrival.x, z - arrival.z)) * 0.2 + rng.next() * 10;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, dir };
      }
    }
    if (best) {
      // The node is the box's centre (for spacing); the entry is its near end.
      const n = add('dungeon', best.x + best.dir[0] * length * 0.5, best.z + best.dir[1] * length * 0.5, [half + 2, 6, half + 2]);
      n.rot = 0;
      const variant = (['levers', 'plates', 'levers', 'plates', 'levers', 'plates'] as const)[stratum - 1];
      dungeon = { node: n.id, dir: best.dir, length, half, puzzle: variant, count: [2, 3, 3, 3, 3, 4][stratum - 1] };
      worksNote = '';
    }
  }
  /** The dungeon's box (plan rectangle, expanded by m): no room inside it, no tunnel through it. */
  const inDungeon = (x: number, z: number, m: number): boolean => {
    if (!dungeon) return false;
    const n = nodes[dungeon.node];
    const [dx, dz] = dungeon.dir;
    const ex = n.x - dx * dungeon.length * 0.5;
    const ez = n.z - dz * dungeon.length * 0.5;
    const u = (x - ex) * dx + (z - ez) * dz;
    const v = Math.abs((x - ex) * -dz + (z - ez) * dx);
    return u > -m && u < dungeon.length + m && v < dungeon.half + m;
  };

  // Great caverns: 2-3 per biome (>= 40 m across), spread over each biome.
  for (let bi = 0; bi < 2; bi++) {
    const knob = BIOMES[biomes[bi]].shape.caverns;
    const want = knob >= 0.85 ? 3 : 2;
    let placed = 0;
    for (let k = 0; k < 2000 && placed < want; k++) {
      const x = rng.range(MARGIN + 22, sx - MARGIN - 22);
      const z = rng.range(MARGIN + 22, sz - MARGIN - 22);
      if (regions.map[Math.floor(x) + Math.floor(z) * sx] !== bi) continue;
      if (!free(x, z, 30) || inDungeon(x, z, 28)) continue;
      const rx = rng.range(20, 27);
      const rz = rng.range(20, 27);
      if (!roomFor(x, z, Math.max(rx, rz))) continue;
      add('cavern', x, z, [rx, rng.range(12, 19), rz]);
      placed++;
    }
  }

  // Rooms: a Poisson disc over the rest, so no stretch is long without a place.
  for (let k = 0; k < 6000; k++) {
    const x = rng.range(MARGIN, sx - MARGIN);
    const z = rng.range(MARGIN, sz - MARGIN);
    if (!inside(x, z)) continue;
    if (!free(x, z, 22) || inDungeon(x, z, 12)) continue;
    const rx = rng.range(5, 8.5);
    const ry = rng.range(4.5, 7);
    const rz = rng.range(5, 8.5);
    if (!roomFor(x, z, Math.max(rx, rz))) continue;
    add('room', x, z, [rx, ry, rz]);
  }

  // Floor heights: a smooth field, the arrival high (the camp is up near the surface), the gate low.
  const H = (x: number, z: number) => 41 + 24 * noise.noise2(x / 120 + 40, z / 120 - 12) + 9 * noise.noise2(x / 47 - 3, z / 47 + 9);
  for (const n of nodes) n.y = Math.round(H(n.x, n.z));
  arrival.y = stratum === 1 ? 62 : 58;
  gate.y = 22;
  if (heart !== null) nodes[heart].y = 14;
  // The vista sits low (room for its height), its balcony OVERLOOK_RISE over the floor.
  if (vista !== null && overlook !== null) {
    nodes[vista].y = Math.round(rng.range(16, 22));
    nodes[overlook].y = nodes[vista].y + OVERLOOK_RISE;
  }

  // Gabriel graph: edge i-j when no other node lies in the circle on i-j as diameter.
  const n = nodes.length;
  const cand: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = nodes[i];
    const b = nodes[j];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const r2 = ((a.x - b.x) ** 2 + (a.z - b.z) ** 2) / 4;
    let ok = true;
    for (let k = 0; k < n && ok; k++) if (k !== i && k !== j && (nodes[k].x - mx) ** 2 + (nodes[k].z - mz) ** 2 < r2) ok = false;
    if (ok) cand.push([i, j, Math.sqrt(r2) * 2]);
  }
  cand.sort((p, q) => p[2] - q[2]);
  // Minimum spanning tree over the candidates (Kruskal), lairs and the heart kept as leaves.
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const leaf = (i: number) => nodes[i].kind === 'lair' || nodes[i].kind === 'heart' || nodes[i].kind === 'dungeon';
  // The balcony and its hall are joined by the ramp inside the hall, not by a tunnel.
  const banned = (i: number, j: number) => (nodes[i].kind === 'overlook' && nodes[j].kind === 'vista') || (nodes[i].kind === 'vista' && nodes[j].kind === 'overlook');
  const deg = new Array(n).fill(0);
  const chosen = new Set<number>();
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < cand.length; c++) {
      const [i, j] = cand[c];
      if (chosen.has(c)) continue;
      if (leaf(i) && leaf(j)) continue;
      if (banned(i, j)) continue;
      if ((leaf(i) && deg[i] > 0) || (leaf(j) && deg[j] > 0)) continue;
      // The heart hangs off the gate only.
      if ((nodes[i].kind === 'heart' && nodes[j].kind !== 'gate') || (nodes[j].kind === 'heart' && nodes[i].kind !== 'gate')) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri === rj) continue;
      parent[ri] = rj;
      chosen.add(c);
      deg[i]++;
      deg[j]++;
    }
  }
  // Loops: the shorter remaining Gabriel edges (forks and second ways round), never into a leaf.
  for (let c = 0; c < cand.length; c++) {
    const [i, j, d] = cand[c];
    if (chosen.has(c) || leaf(i) || leaf(j) || banned(i, j)) continue;
    if (d < 52 && rng.chance(0.62)) {
      chosen.add(c);
      deg[i]++;
      deg[j]++;
    }
  }
  // Any node left unconnected (a leaf whose only Gabriel neighbour was another leaf) joins its nearest non-leaf.
  const edgesIdx: Array<[number, number]> = [...chosen].map((c) => [cand[c][0], cand[c][1]]);
  for (let i = 0; i < n; i++) {
    if (edgesIdx.some(([a, b]) => a === i || b === i)) continue;
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i || leaf(j) || banned(i, j)) continue;
      if (nodes[i].kind === 'heart' && nodes[j].kind !== 'gate') continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best >= 0) edgesIdx.push([i, best]);
  }

  // Plan-segment crossing (crossing tunnels at two heights cut each other's floors).
  const segCross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, ex: number, ez: number) => {
    const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d2 = (bx - ax) * (ez - az) - (bz - az) * (ex - ax);
    const d3 = (ex - cx) * (az - cz) - (ez - cz) * (ax - cx);
    const d4 = (ex - cx) * (bz - cz) - (ez - cz) * (bx - cx);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  // No tunnel through the dungeon (its own edge ends at its entry): crossing edges go; if the graph
  // falls apart, its pieces are joined again by the shortest links that cross neither the box nor
  // another tunnel (when none exists the works give way to an ordinary room).
  if (dungeon) {
    const dn = dungeon.node;
    const throughBox = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 1.5) {
        const f = t / (len || 1);
        if (inDungeon(ax + (bx - ax) * f, az + (bz - az) * f, 6)) return true;
      }
      return false;
    };
    const crosses = ([a, b]: [number, number]) => a !== dn && b !== dn && throughBox(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z);
    const keep = edgesIdx.filter((e) => !crosses(e));
    for (let guard = 0; guard < 12; guard++) {
      const par = nodes.map((_, i) => i);
      const fnd = (i: number): number => (par[i] === i ? i : (par[i] = fnd(par[i])));
      for (const [a, b] of keep) par[fnd(a)] = fnd(b);
      // The works' own node stays a leaf: it joins later (from behind its entry).
      const root = fnd(nodes.findIndex((_, i) => i !== dn));
      const lost = nodes.map((_, i) => i).filter((i) => i !== dn && fnd(i) !== root);
      if (!lost.length) break;
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (const i of lost) for (let j = 0; j < nodes.length; j++) {
        if (j === dn || fnd(j) !== root || leaf(i) && leaf(j) || banned(i, j)) continue;
        const dd = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (dd >= bd || dd > 110) continue;
        if (throughBox(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z)) continue;
        if (!keep.every(([a, b]) => a === i || b === i || a === j || b === j || !segCross(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z))) continue;
        bd = dd;
        best = [i, j];
      }
      if (!best) break;
      keep.push(best);
    }
    const par = nodes.map((_, i) => i);
    const fnd = (i: number): number => (par[i] === i ? i : (par[i] = fnd(par[i])));
    for (const [a, b] of keep) par[fnd(a)] = fnd(b);
    const root = fnd(nodes.findIndex((_, i) => i !== dn));
    if (nodes.every((_, i) => i === dn || fnd(i) === root)) edgesIdx.splice(0, edgesIdx.length, ...keep);
    else {
      nodes[dn].kind = 'room';
      nodes[dn].rx = nodes[dn].rz = 7;
      nodes[dn].ry = 5;
      dungeon = null;
      worksNote = 'crossed';
    }
  }
  if (dungeon) {
    // The dungeon's single tunnel arrives at its entry: re-aim it at the entry point (its node then
    // stands at the entry, the box behind it), from a chamber behind the entry (never across the box).
    const d = dungeon;
    const dn = nodes[d.node];
    dn.x -= d.dir[0] * d.length * 0.5;
    dn.z -= d.dir[1] * d.length * 0.5;
    dn.rx = dn.rz = 3;
    dn.ry = 3.5;
    // In front of the entry (never across the box behind it): a narrow cone first (the approach runs
    // straight in), then wider ones when no chamber there can be joined without crossing a tunnel.
    let cone = 1.1;
    let minU = 9;
    const behind = (j: number) => {
      const u = (nodes[j].x - dn.x) * d.dir[0] + (nodes[j].z - dn.z) * d.dir[1];
      const v = Math.abs((nodes[j].x - dn.x) * -d.dir[1] + (nodes[j].z - dn.z) * d.dir[0]);
      return u < -minU && v < -u * cone;
    };
    const mine = edgesIdx.findIndex(([a, b]) => a === d.node || b === d.node);
    const cur = mine >= 0 ? (edgesIdx[mine][0] === d.node ? edgesIdx[mine][1] : edgesIdx[mine][0]) : -1;
    // A new tunnel must not cross another one in plan.
    const clearTo = (j: number) =>
      edgesIdx.every(([a, b]) => a === d.node || b === d.node || a === j || b === j || !segCross(dn.x, dn.z, nodes[j].x, nodes[j].z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z));
    if (cur < 0 || !behind(cur)) {
      /** The nearest chamber in the cone that a tunnel joins without crossing another, or -1. */
      const nearestIn = (c: number, m: number): number => {
        cone = c;
        minU = m;
        let best = -1;
        let bd = Infinity;
        for (let j = 0; j < nodes.length; j++) {
          if (j === d.node || leaf(j) || nodes[j].kind === 'vista' || nodes[j].kind === 'overlook' || !behind(j) || !clearTo(j)) continue;
          const dd = Math.hypot(nodes[j].x - dn.x, nodes[j].z - dn.z);
          if (dd < bd && dd < 70) {
            bd = dd;
            best = j;
          }
        }
        return best;
      };
      /** A small yard in front of the entry, joined to the nearest chamber it reaches without crossing a tunnel. */
      const yardIn = (): number => {
        let yx = 0;
        let yz = 0;
        let fits = false;
        for (const back of [16, 13, 20, 24]) {
          for (const side of [0, -8, 8]) {
            yx = dn.x - d.dir[0] * back - d.dir[1] * side;
            yz = dn.z - d.dir[1] * back + d.dir[0] * side;
            fits = yx > MARGIN && yz > MARGIN && yx < sx - MARGIN && yz < sz - MARGIN && nodes.every((o) => o.id === d.node || Math.hypot(o.x - yx, o.z - yz) > Math.max(o.rx, o.rz) + 7);
            if (fits) break;
          }
          if (fits) break;
        }
        if (!fits) return -1;
        const yard = add('room', yx, yz, [5, 4.5, 5]);
        yard.y = dn.y;
        let link = -1;
        let ld = Infinity;
        for (let j = 0; j < nodes.length; j++) {
          if (j === yard.id || j === d.node || leaf(j) || nodes[j].kind === 'vista' || nodes[j].kind === 'overlook') continue;
          const dd = Math.hypot(nodes[j].x - yx, nodes[j].z - yz);
          const clear = edgesIdx.every(([a, b]) => a === j || b === j || !segCross(yx, yz, nodes[j].x, nodes[j].z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z));
          if (clear && dd < ld) {
            ld = dd;
            link = j;
          }
        }
        if (link < 0) {
          nodes.pop();
          return -1;
        }
        if (mine >= 0) edgesIdx.splice(mine, 1);
        edgesIdx.push([d.node, yard.id], [yard.id, link]);
        return yard.id;
      };
      // Straight in first; else a yard in front; else a wider and wider approach.
      let best = nearestIn(1.1, 9);
      let yard = false;
      if (best < 0) {
        best = yardIn();
        yard = best >= 0;
      }
      if (best < 0) best = nearestIn(2.2, 7);
      if (best < 0) best = nearestIn(4, 5);
      if (best < 0) {
        // Last: the nearest chamber in front whose tunnel crosses only loop tunnels (the graph stays
        // whole without them): those go, the works' tunnel comes in.
        cone = 4;
        minU = 5;
        const order = nodes
          .map((nd, j) => ({ j, dd: Math.hypot(nd.x - dn.x, nd.z - dn.z) }))
          .filter(({ j, dd }) => j !== d.node && dd < 80 && !leaf(j) && nodes[j].kind !== 'vista' && nodes[j].kind !== 'overlook' && behind(j))
          .sort((a, b) => a.dd - b.dd);
        for (const { j } of order) {
          const crossed = edgesIdx.filter(([a, b]) => a !== d.node && b !== d.node && a !== j && b !== j && segCross(dn.x, dn.z, nodes[j].x, nodes[j].z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z));
          const rest = edgesIdx.filter((e, k) => !crossed.includes(e) && k !== mine);
          rest.push([d.node, j]);
          const par = nodes.map((_, i) => i);
          const fnd = (i: number): number => (par[i] === i ? i : (par[i] = fnd(par[i])));
          for (const [a, b] of rest) par[fnd(a)] = fnd(b);
          if (!nodes.every((_, i) => fnd(i) === fnd(0))) continue;
          for (const e of crossed) edgesIdx.splice(edgesIdx.indexOf(e), 1);
          best = j;
          break;
        }
      }
      if (best >= 0 && !yard) {
        const at = edgesIdx.findIndex(([a, b]) => a === d.node || b === d.node);
        if (at >= 0) edgesIdx.splice(at, 1);
        edgesIdx.push([d.node, best]);
      }
      if (best < 0) {
        // No way in: no works this time (an ordinary room).
        dn.kind = 'room';
        dn.rx = dn.rz = 6;
        dn.ry = 4.5;
        dungeon = null;
        worksNote = 'noWay';
      }
    }
  }
  // Tunnels across the vista's hall: a loop edge goes; an edge the graph needs becomes a rock bridge.
  if (vista !== null) {
    const vn = nodes[vista];
    const crossesHall = ([a, b]: [number, number]) => {
      if (a === vista || b === vista) return false;
      // The balcony stands on the hall's rim: its own tunnels cross only if they run into the hall.
      const reach = nodes[a].kind === 'overlook' || nodes[b].kind === 'overlook' ? vn.rx - 2 : vn.rx + 3;
      const A = nodes[a];
      const Bn = nodes[b];
      const len = Math.hypot(Bn.x - A.x, Bn.z - A.z) || 1;
      for (let t = 0; t <= len; t += 1.5) if (Math.hypot(A.x + ((Bn.x - A.x) * t) / len - vn.x, A.z + ((Bn.z - A.z) * t) / len - vn.z) < reach) return true;
      return false;
    };
    for (let k = edgesIdx.length - 1; k >= 0; k--) {
      if (!crossesHall(edgesIdx[k])) continue;
      const without = edgesIdx.filter((_, i) => i !== k);
      const par = nodes.map((_, i) => i);
      const fnd = (i: number): number => (par[i] === i ? i : (par[i] = fnd(par[i])));
      for (const [a, b] of without) par[fnd(a)] = fnd(b);
      const root = fnd(0);
      if (nodes.every((_, i) => fnd(i) === root)) edgesIdx.splice(k, 1);
    }
  }

  const edges: PlanEdge[] = edgesIdx.map(([a, b], id) => {
    const wa = BIOMES[nodes[a].biome].shape.tunnelWidth;
    const wb = BIOMES[nodes[b].biome].shape.tunnelWidth;
    const e: PlanEdge = { id, a, b, bend1: rng.range(-0.11, 0.11), bend2: rng.range(-0.05, 0.05), radius: rng.range(2.4, 3.3) * (wa + wb) / 2, height: rng.range(3.6, 4.8) };
    if (vista !== null && a !== vista && b !== vista) {
      const vn = nodes[vista];
      const reach = nodes[a].kind === 'overlook' || nodes[b].kind === 'overlook' ? vn.rx - 2 : vn.rx + 3;
      const A = nodes[a];
      const Bn = nodes[b];
      const len = Math.hypot(Bn.x - A.x, Bn.z - A.z) || 1;
      for (let t = 0; t <= len; t += 1.5) if (Math.hypot(A.x + ((Bn.x - A.x) * t) / len - vn.x, A.z + ((Bn.z - A.z) * t) / len - vn.z) < reach) e.bridge = true;
      // A bridge spans straight (no meander over the void).
      if (e.bridge) e.bend1 = e.bend2 = 0;
    }
    return e;
  });
  for (const e of edges) {
    nodes[e.a].edges.push(e.id);
    nodes[e.b].edges.push(e.id);
  }
  // Each end's flat zone: the node's rim, or until a tunnel leaving the same node at a narrow angle
  // has parted from this one (both stay at the node's level that far).
  for (const nd of nodes) {
    const inc = nd.edges.map((id) => edges[id]);
    for (const e of inc) {
      const o = nodes[e.a === nd.id ? e.b : e.a];
      const len = Math.hypot(o.x - nd.x, o.z - nd.z);
      const ang = Math.atan2(o.z - nd.z, o.x - nd.x);
      let flat = rimOf(nd);
      for (const f of inc) {
        if (f === e || e.bridge || f.bridge) continue;
        const p = nodes[f.a === nd.id ? f.b : f.a];
        let phi = Math.abs(ang - Math.atan2(p.z - nd.z, p.x - nd.x));
        if (phi > Math.PI) phi = Math.PI * 2 - phi;
        const part = (e.radius + f.radius + 2) / (2 * Math.sin(Math.max(0.08, phi) / 2));
        flat = Math.max(flat, part);
      }
      // A climb needs some run: never flatter than 40 % of the tunnel from this end.
      flat = Math.min(Math.max(rimOf(nd), flat), Math.max(rimOf(nd), len * 0.4));
      if (e.a === nd.id) e.flatA = flat;
      else e.flatB = flat;
    }
  }

  // Relax the floor heights so no edge is steeper than MAX_SLOPE (the fixed nodes move least): the
  // vista, its balcony and the heart never (the ramp and the fall are cut for that height), the
  // arrival and the gate only against those, every other node first.
  const rank = (nd: PlanNode) => (nd.kind === 'vista' || nd.kind === 'overlook' || nd.kind === 'heart' ? 2 : nd.kind === 'arrival' || nd.kind === 'gate' ? 1 : 0);
  for (let it = 0; it < 60; it++) {
    let worst = 0;
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      // The tunnel runs from rim to rim: the climb happens over the distance between the chambers.
      const run = Math.max(6, Math.hypot(a.x - b.x, a.z - b.z) - (e.flatA ?? rimOf(a)) - (e.flatB ?? rimOf(b)));
      const max = run * MAX_SLOPE;
      const dy = b.y - a.y;
      const over = Math.abs(dy) - max;
      if (over <= 0) continue;
      worst = Math.max(worst, over);
      const s = Math.sign(dy);
      const ra = rank(a);
      const rb = rank(b);
      const fa = ra > rb ? 0 : rb > ra ? 1 : 0.5;
      const fb = 1 - fa;
      // (The small push past the limit moves only the nodes that may move.)
      a.y += s * (over + 0.01) * fa;
      b.y -= s * (over + 0.01) * fb;
    }
    if (worst < 0.01) break;
  }
  for (const nd of nodes) nd.y = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, Math.round(nd.y)));
  // A chamber's roof must stay inside the zone.
  for (const nd of nodes) nd.ry = Math.min(nd.ry, 90 - nd.y);

  // The underground river: from a spring up the graph down to the overlook, where it falls into the
  // vista's hall. Water never runs uphill: each step up the chain is to a chamber at least as high.
  // When no chain climbs from the balcony, the river runs down into the hall's own lake instead.
  const river: number[] = [];
  const nbr = (i: number) => edges.filter((e) => (e.a === i || e.b === i) && !e.bridge).map((e) => (e.a === i ? e.b : e.a));
  const okRiver = (j: number) => nodes[j].kind === 'room' || nodes[j].kind === 'cavern';
  for (const mouth of [overlook, vista]) {
    if (mouth === null || river.length) continue;
    const chain = [mouth];
    let cur = mouth;
    for (let step = 0; step < 6; step++) {
      const cands = nbr(cur).filter((j) => okRiver(j) && !chain.includes(j) && nodes[j].y >= nodes[cur].y && nodes[j].y - nodes[cur].y <= 12);
      if (!cands.length) break;
      // Prefer the long way up: the farthest from the mouth among the gentle climbs.
      cands.sort((p, q) => Math.hypot(nodes[q].x - nodes[mouth].x, nodes[q].z - nodes[mouth].z) - Math.hypot(nodes[p].x - nodes[mouth].x, nodes[p].z - nodes[mouth].z));
      cur = cands[0];
      chain.push(cur);
    }
    if (chain.length >= 3) river.push(...chain.reverse());
  }
  for (const i of river) if (nodes[i].kind !== 'overlook' && nodes[i].kind !== 'vista') nodes[i].river = true;

  return { stratum, biomes, sx, sz, regionMap: regions.map, regionBlend: regions.blend, nodes, edges, arrival: arrival.id, gate: gate.id, lairs, heart, vista, overlook, dungeon, river, worksNote };
}

/** The river's edges in order (spring to mouth). */
export function riverEdges(plan: StratumPlan): PlanEdge[] {
  const out: PlanEdge[] = [];
  for (let k = 0; k + 1 < plan.river.length; k++) {
    const a = plan.river[k];
    const b = plan.river[k + 1];
    const e = plan.edges.find((ed) => (ed.a === a && ed.b === b) || (ed.a === b && ed.b === a));
    if (e) out.push(e);
  }
  return out;
}

/** Points along an edge (feet positions): centre x, z, floor y, every `step` metres, from a's centre to b's. */
export function edgePath(plan: StratumPlan, e: PlanEdge, step = 0.6): Array<[number, number, number]> {
  const a = plan.nodes[e.a];
  const b = plan.nodes[e.b];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const px = -dz / len;
  const pz = dx / len;
  const n = Math.max(2, Math.ceil(len / step));
  // The climb is spread over the stretch between the two chambers' rims.
  const ra = Math.min(a.kind === 'vista' ? 0.7 : 0.48, (e.flatA ?? rimOf(a)) / len);
  const rb = Math.min(b.kind === 'vista' ? 0.7 : 0.48, (e.flatB ?? rimOf(b)) / len);
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = (e.bend1 * Math.sin(Math.PI * t) + e.bend2 * Math.sin(2 * Math.PI * t)) * len;
    const u = Math.max(0, Math.min(1, (t - ra) / Math.max(0.05, 1 - ra - rb)));
    out.push([a.x + dx * t + px * off, a.y + (b.y - a.y) * u, a.z + dz * t + pz * off]);
  }
  return out;
}
