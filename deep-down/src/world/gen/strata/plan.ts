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

export type NodeKind = 'arrival' | 'gate' | 'lair' | 'cavern' | 'room' | 'heart';

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
      if (score > bestScore && free(x, z, 30)) {
        bestScore = score;
        best = [x, z];
      }
    }
    if (!best) {
      // Fallback: any spot of the biome.
      for (let k = 0; k < 4000 && !best; k++) {
        const x = rng.range(MARGIN + 16, sx - MARGIN - 16);
        const z = rng.range(MARGIN + 16, sz - MARGIN - 16);
        if (regions.map[Math.floor(x) + Math.floor(z) * sx] === bi && free(x, z, 20)) best = [x, z];
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
    const hx = Math.max(MARGIN + 22, Math.min(sx - MARGIN - 22, gate.x + (sx / 2 - gate.x) * 0.35));
    const hz = Math.max(MARGIN + 22, Math.min(sz - MARGIN - 22, gate.z + (sz / 2 - gate.z) * 0.35));
    const h = add('heart', hx, hz, [20, 16, 20]);
    h.rot = 0;
    heart = h.id;
  }

  // Great caverns: 2-3 per biome (>= 40 m across), spread over each biome.
  for (let bi = 0; bi < 2; bi++) {
    const knob = BIOMES[biomes[bi]].shape.caverns;
    const want = knob >= 0.85 ? 3 : 2;
    let placed = 0;
    for (let k = 0; k < 2000 && placed < want; k++) {
      const x = rng.range(MARGIN + 22, sx - MARGIN - 22);
      const z = rng.range(MARGIN + 22, sz - MARGIN - 22);
      if (regions.map[Math.floor(x) + Math.floor(z) * sx] !== bi) continue;
      if (!free(x, z, 30)) continue;
      const rx = rng.range(20, 27);
      const rz = rng.range(20, 27);
      add('cavern', x, z, [rx, rng.range(12, 19), rz]);
      placed++;
    }
  }

  // Rooms: a Poisson disc over the rest, so no stretch is long without a place.
  for (let k = 0; k < 6000; k++) {
    const x = rng.range(MARGIN, sx - MARGIN);
    const z = rng.range(MARGIN, sz - MARGIN);
    if (!inside(x, z)) continue;
    if (!free(x, z, 22)) continue;
    add('room', x, z, [rng.range(5, 8.5), rng.range(4.5, 7), rng.range(5, 8.5)]);
  }

  // Floor heights: a smooth field, the arrival high (the camp is up near the surface), the gate low.
  const H = (x: number, z: number) => 41 + 24 * noise.noise2(x / 120 + 40, z / 120 - 12) + 9 * noise.noise2(x / 47 - 3, z / 47 + 9);
  for (const n of nodes) n.y = Math.round(H(n.x, n.z));
  arrival.y = stratum === 1 ? 62 : 58;
  gate.y = 22;
  if (heart !== null) nodes[heart].y = 14;

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
  const leaf = (i: number) => nodes[i].kind === 'lair' || nodes[i].kind === 'heart';
  const deg = new Array(n).fill(0);
  const chosen = new Set<number>();
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < cand.length; c++) {
      const [i, j] = cand[c];
      if (chosen.has(c)) continue;
      if (leaf(i) && leaf(j)) continue;
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
    if (chosen.has(c) || leaf(i) || leaf(j)) continue;
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
      if (j === i || leaf(j)) continue;
      if (nodes[i].kind === 'heart' && nodes[j].kind !== 'gate') continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best >= 0) edgesIdx.push([i, best]);
  }

  const edges: PlanEdge[] = edgesIdx.map(([a, b], id) => {
    const wa = BIOMES[nodes[a].biome].shape.tunnelWidth;
    const wb = BIOMES[nodes[b].biome].shape.tunnelWidth;
    return { id, a, b, bend1: rng.range(-0.11, 0.11), bend2: rng.range(-0.05, 0.05), radius: rng.range(2.4, 3.3) * (wa + wb) / 2, height: rng.range(3.6, 4.8) };
  });
  for (const e of edges) {
    nodes[e.a].edges.push(e.id);
    nodes[e.b].edges.push(e.id);
  }

  // Relax the floor heights so no edge is steeper than MAX_SLOPE (the fixed nodes move least).
  const fixed = (nd: PlanNode) => nd.kind === 'arrival' || nd.kind === 'gate' || nd.kind === 'heart';
  for (let it = 0; it < 60; it++) {
    let worst = 0;
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      // The tunnel runs from rim to rim: the climb happens over the distance between the chambers.
      const run = Math.max(6, Math.hypot(a.x - b.x, a.z - b.z) - Math.max(a.rx, a.rz) * 0.7 - Math.max(b.rx, b.rz) * 0.7);
      const max = run * MAX_SLOPE;
      const dy = b.y - a.y;
      const over = Math.abs(dy) - max;
      if (over <= 0) continue;
      worst = Math.max(worst, over);
      const s = Math.sign(dy);
      const fa = fixed(a) ? 0 : fixed(b) ? 1 : 0.5;
      const fb = 1 - fa;
      a.y += s * over * fa + s * 0.01;
      b.y -= s * over * fb + s * 0.01;
    }
    if (worst < 0.01) break;
  }
  for (const nd of nodes) nd.y = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, Math.round(nd.y)));
  // A chamber's roof must stay inside the zone.
  for (const nd of nodes) nd.ry = Math.min(nd.ry, 90 - nd.y);

  return { stratum, biomes, sx, sz, regionMap: regions.map, regionBlend: regions.blend, nodes, edges, arrival: arrival.id, gate: gate.id, lairs, heart };
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
  const ra = Math.min(0.45, (Math.max(a.rx, a.rz) * 0.7) / len);
  const rb = Math.min(0.45, (Math.max(b.rx, b.rz) * 0.7) / len);
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = (e.bend1 * Math.sin(Math.PI * t) + e.bend2 * Math.sin(2 * Math.PI * t)) * len;
    const u = Math.max(0, Math.min(1, (t - ra) / Math.max(0.05, 1 - ra - rb)));
    out.push([a.x + dx * t + px * off, a.y + (b.y - a.y) * u, a.z + dz * t + pz * off]);
  }
  return out;
}
