import { B, BLOCKS, CLIMB, SOLID, UNBREAKABLE_TIER } from '../../../config/blocks';

/**
 * Traps (round 3, WORLD; BRIEF §0.1 "everything reachable must be walkable or climbable", and the
 * pit rescue as a safety net): plain rock never breaks, so a hollow the explorer walks down into
 * with no walk (or climb) back out is a trap. The pit rescue (Progression's PitWatch) lifts the
 * explorer out of a pit after a long fall, but a chain of short drops (3 m or less: a walk) into a
 * basin arms nothing: such a basin must not exist. This module finds them, and `fixTraps` mends
 * them: a ladder up the drop that leads in (Halden's crews left them), or a hollow filled flush.
 *
 * The walk model is the generator's (content.ts walkBfs) plus climbing: a state is a feet cell where
 * the explorer stands (room for the body, solid ground that is not lava) or hangs (room for the body
 * and a ladder or rope cell at the feet or the chest: PlayerController.inClimb). Moves: walk to a
 * 4-neighbour state, step up one (headroom over the current cell), drop up to `maxDrop` into a
 * neighbour column (a rope or a ladder catches the fall), and on a climbable cell climb up or down.
 *
 * Solidity comes from a table (`S`): SOLID for the world as it is, WORST_SOLID for the worst case a
 * player can make (every breakable block mined), so no search copies the world.
 */

export interface Dims {
  sx: number;
  sy: number;
  sz: number;
}

/** The cells a player can open (some pick mines them): config/rarity isBreakable, as a table. */
export const OPENABLE: Uint8Array = (() => {
  const t = new Uint8Array(256);
  for (const def of BLOCKS) if (def && SOLID[def.id] && !def.plain && !def.protectedReason && def.tier < UNBREAKABLE_TIER) t[def.id] = 1;
  return t;
})();

/** Solidity once every breakable block is mined (the worst case a player can make). */
export const WORST_SOLID: Uint8Array = SOLID.map((v, id) => (v && !OPENABLE[id] ? 1 : 0));

/** Standing room with solid ground that is not lava. */
export function standsAt(b: Uint8Array, S: Uint8Array, sx: number, i: number): boolean {
  const below = b[i - sx];
  return S[b[i]] === 0 && S[b[i + sx]] === 0 && S[below] === 1 && below !== B.LAVA;
}

/** Hanging room on a ladder or a rope (at the feet or the chest). */
export function hangsAt(b: Uint8Array, S: Uint8Array, sx: number, i: number): boolean {
  const feet = b[i];
  const chest = b[i + sx];
  return (CLIMB[feet] === 1 || CLIMB[chest] === 1) && S[feet] === 0 && S[chest] === 0;
}

/** A state of the walk model: standing or hanging. Callers keep i inside y 1..sy-3. */
export function isState(b: Uint8Array, S: Uint8Array, sx: number, i: number): boolean {
  const feet = b[i];
  const chest = b[i + sx];
  if (S[feet] !== 0 || S[chest] !== 0) return false;
  if (CLIMB[feet] === 1 || CLIMB[chest] === 1) return true;
  const below = b[i - sx];
  return S[below] === 1 && below !== B.LAVA;
}

/**
 * The forward moves from state i at (x, y, z): calls emit(j) for each state one move away. The rules
 * of content.ts walkBfs (walk, step up one, drop up to maxDrop), plus a rope or a ladder catching a
 * drop, and climbing up and down a climbable column.
 */
export function forEachMove(b: Uint8Array, S: Uint8Array, d: Dims, i: number, x: number, y: number, z: number, maxDrop: number, emit: (j: number) => void): void {
  const { sx, sy, sz } = d;
  const sxy = sx * sy;
  if (y < 1 || y > sy - 3) return;
  for (let k = 0; k < 4; k++) {
    const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
    const nz = k === 2 ? z + 1 : k === 3 ? z - 1 : z;
    if (nx < 1 || nz < 1 || nx >= sx - 1 || nz >= sz - 1) continue;
    const n = nx + sx * y + sxy * nz;
    if (isState(b, S, sx, n)) {
      emit(n);
      continue;
    }
    // Step up one (headroom over the current cell).
    if (y + 1 <= sy - 3 && S[b[i + 2 * sx]] === 0 && isState(b, S, sx, n + sx)) {
      emit(n + sx);
      continue;
    }
    // Drop into the neighbour column (a rope or a ladder catches the fall).
    if (S[b[n]] === 0 && S[b[n + sx]] === 0) {
      for (let dd = 1; dd <= maxDrop; dd++) {
        if (y - dd < 1) break;
        const c = n - dd * sx;
        if (S[b[c]] !== 0) break;
        if (isState(b, S, sx, c)) {
          emit(c);
          break;
        }
      }
    }
  }
  if (hangsAt(b, S, sx, i)) {
    // Climb up (room for the body one cell higher), or down the rope and off its foot.
    if (y + 1 <= sy - 3 && isState(b, S, sx, i + sx)) emit(i + sx);
    for (let dd = 1; dd <= maxDrop; dd++) {
      if (y - dd < 1) break;
      const c = i - dd * sx;
      if (S[b[c]] !== 0) break;
      if (isState(b, S, sx, c)) {
        emit(c);
        break;
      }
    }
  }
}

/** Reusable buffers for the searches (one stratum's volume). */
export class TrapScratch {
  readonly a: Uint8Array;
  readonly b: Uint8Array;
  /** A ring queue (the live frontier is far below its size), and the reached states of the last walk. */
  readonly q = new Int32Array(1 << 21);
  readonly list = new Int32Array(1 << 21);
  constructor(readonly d: Dims) {
    this.a = new Uint8Array(d.sx * d.sy * d.sz);
    this.b = new Uint8Array(d.sx * d.sy * d.sz);
  }
}

/**
 * Every state the explorer can walk (or climb) to from the feet cell `from` (nudged to the nearest
 * state of its column), written into `seen` (cleared first). Returns how many.
 */
export function walkStates(b: Uint8Array, S: Uint8Array, d: Dims, from: readonly [number, number, number], seen: Uint8Array, q: Int32Array, maxDrop = 3): number {
  const { sx, sy } = d;
  const sxy = sx * sy;
  seen.fill(0);
  const x0 = Math.floor(from[0]);
  const z0 = Math.floor(from[2]);
  let y0 = Math.floor(from[1]);
  const at = (y: number) => x0 + sx * y + sxy * z0;
  let found = false;
  for (let k = 0; k <= 6 && !found; k++) {
    for (const y of k ? [y0 - k, y0 + k] : [y0]) {
      if (y >= 1 && y <= sy - 3 && isState(b, S, sx, at(y))) {
        y0 = y;
        found = true;
        break;
      }
    }
  }
  if (!found) return 0;
  const qm = q.length;
  let head = 0;
  let tail = 0;
  const start = at(y0);
  seen[start] = 1;
  q[tail++ % qm] = start;
  const emit = (j: number) => {
    if (seen[j]) return;
    seen[j] = 1;
    q[tail++ % qm] = j;
  };
  while (head < tail) {
    const i = q[head++ % qm];
    const z = (i / sxy) | 0;
    const r = i - z * sxy;
    const y = (r / sx) | 0;
    forEachMove(b, S, d, i, r - y * sx, y, z, maxDrop, emit);
  }
  return tail;
}

/**
 * Every state from which the explorer can walk (or climb) to one of `targets`, written into `home`
 * (cleared first): the reverse of walkStates' moves, with each forward rule of forEachMove inverted
 * (homewardStatesByProbe is the slow oracle: it asks forEachMove itself; the tests hold them equal).
 */
export function homewardStates(b: Uint8Array, S: Uint8Array, d: Dims, targets: Iterable<number>, home: Uint8Array, q: Int32Array, maxDrop = 3): number {
  const { sx, sy, sz } = d;
  const sxy = sx * sy;
  home.fill(0);
  const qm = q.length;
  let head = 0;
  let tail = 0;
  const offer = (u: number) => {
    if (home[u]) return;
    home[u] = 1;
    q[tail++ % qm] = u;
  };
  for (const t of targets) offer(t);
  const state = (i: number) => isState(b, S, sx, i);
  while (head < tail) {
    const v = q[head++ % qm];
    const vz = (v / sxy) | 0;
    const r = v - vz * sxy;
    const vy = (r / sx) | 0;
    const vx = r - vy * sx;
    if (vx < 1 || vz < 1 || vx >= sx - 1 || vz >= sz - 1) continue;
    for (let k = 0; k < 4; k++) {
      // u's column is the neighbour on the side opposite to the move's direction (u steps toward v).
      const ux = k === 0 ? vx - 1 : k === 1 ? vx + 1 : vx;
      const uz = k === 2 ? vz - 1 : k === 3 ? vz + 1 : vz;
      if (ux < 1 || uz < 1 || ux >= sx - 1 || uz >= sz - 1) continue;
      const uc = ux + sxy * uz;
      // (1) Walk in from the same level.
      if (vy >= 1 && vy <= sy - 3) {
        const u = uc + sx * vy;
        if (!home[u] && state(u)) offer(u);
      }
      // (2) Step up from one lower: no state in v's column there (else that is a walk), headroom over u.
      if (vy - 1 >= 1) {
        const u = uc + sx * (vy - 1);
        if (!home[u] && state(u) && !state(v - sx) && S[b[u + 2 * sx]] === 0) offer(u);
      }
      // (3) Drop from dd higher into v's column: v is the first state the fall finds.
      for (let dd = 1; dd <= maxDrop; dd++) {
        const uy = vy + dd;
        if (uy > sy - 3) break;
        const n = v + dd * sx;
        // Every cell the fall passes between n and v is open and no state (else it stops there).
        if (dd > 1) {
          const c = v + (dd - 1) * sx;
          if (S[b[c]] !== 0 || state(c)) break;
        }
        const u = uc + sx * uy;
        if (home[u] || !state(u)) continue;
        if (state(n) || S[b[n]] !== 0 || S[b[n + sx]] !== 0) continue;
        if (S[b[u + 2 * sx]] === 0 && uy + 1 <= sy - 3 && state(n + sx)) continue;
        offer(u);
      }
    }
    // (4) Climb up from the hanging state just below.
    if (vy - 1 >= 1) {
      const u = v - sx;
      if (!home[u] && hangsAt(b, S, sx, u)) offer(u);
    }
    // (5) Climb down or fall off a rope dd higher in the same column: v is the first state below it.
    for (let dd = 1; dd <= maxDrop; dd++) {
      if (vy + dd > sy - 3) break;
      if (dd > 1) {
        const c = v + (dd - 1) * sx;
        if (S[b[c]] !== 0 || state(c)) break;
      }
      const u = v + dd * sx;
      if (!home[u] && hangsAt(b, S, sx, u)) offer(u);
    }
  }
  return tail;
}

/** The slow, obviously right homeward search (it asks forEachMove for every candidate): the tests' oracle. */
export function homewardStatesByProbe(b: Uint8Array, S: Uint8Array, d: Dims, targets: Iterable<number>, home: Uint8Array, q: Int32Array, maxDrop = 3): number {
  const { sx, sy, sz } = d;
  const sxy = sx * sy;
  home.fill(0);
  const qm = q.length;
  let head = 0;
  let tail = 0;
  for (const t of targets) {
    if (home[t]) continue;
    home[t] = 1;
    q[tail++ % qm] = t;
  }
  let target = -1;
  let hit = false;
  const probe = (j: number) => {
    if (j === target) hit = true;
  };
  while (head < tail) {
    const v = q[head++ % qm];
    const vz = (v / sxy) | 0;
    const r = v - vz * sxy;
    const vy = (r / sx) | 0;
    const vx = r - vy * sx;
    for (let k = 0; k < 5; k++) {
      const ux = k === 0 ? vx - 1 : k === 1 ? vx + 1 : vx;
      const uz = k === 2 ? vz - 1 : k === 3 ? vz + 1 : vz;
      if (ux < 1 || uz < 1 || ux >= sx - 1 || uz >= sz - 1) continue;
      for (let dy = -1; dy <= maxDrop; dy++) {
        if (k === 4 && dy === 0) continue;
        const uy = vy + dy;
        if (uy < 1 || uy > sy - 3) continue;
        const u = ux + sx * uy + sxy * uz;
        if (home[u] || !isState(b, S, sx, u)) continue;
        target = v;
        hit = false;
        forEachMove(b, S, d, u, ux, uy, uz, maxDrop, probe);
        if (hit) {
          home[u] = 1;
          q[tail++ % qm] = u;
        }
      }
    }
  }
  return tail;
}

/** A trapped pocket: reachable cells with no way back, one 3D-connected group. */
export interface TrapPocket {
  cells: number[];
  /** Its lowest and highest feet levels, and the centre of its cells. */
  minY: number;
  maxY: number;
  centre: [number, number, number];
}

/**
 * Group the trapped states (in `reached`, the first `n` entries: those with `home` unset) into
 * 26-connected pockets, biggest first.
 */
export function trapPockets(reached: Int32Array, n: number, home: Uint8Array, d: Dims): TrapPocket[] {
  const { sx, sy, sz } = d;
  const sxy = sx * sy;
  const trapped = new Set<number>();
  for (let k = 0; k < n; k++) if (!home[reached[k]]) trapped.add(reached[k]);
  const done = new Set<number>();
  const out: TrapPocket[] = [];
  const stack: number[] = [];
  for (const i of trapped) {
    if (done.has(i)) continue;
    const cells: number[] = [];
    stack.push(i);
    done.add(i);
    let minY = Infinity;
    let maxY = -Infinity;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const z = (c / sxy) | 0;
      const r = c - z * sxy;
      const y = (r / sx) | 0;
      const x = r - y * sx;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      cx += x;
      cy += y;
      cz += z;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        const zz = z + dz;
        if (xx < 0 || yy < 0 || zz < 0 || xx >= sx || yy >= sy || zz >= sz) continue;
        const j = xx + sx * yy + sxy * zz;
        if (trapped.has(j) && !done.has(j)) {
          done.add(j);
          stack.push(j);
        }
      }
    }
    out.push({ cells, minY, maxY, centre: [cx / cells.length, cy / cells.length, cz / cells.length] });
  }
  return out.sort((a, b) => b.cells.length - a.cells.length);
}

/** What fixTraps needs to know about the stratum. */
export interface TrapWorld {
  blocks: Uint8Array;
  d: Dims;
  /** The arrival's feet (the walk starts there). */
  start: readonly [number, number, number];
  /** Home: the arrival's region (box, feet cells); walking back into it is getting home. */
  home: { min: readonly number[]; max: readonly number[] };
  /** Cells the explorer opens on purpose (the works' door, cracked walls, the Heart's door): searched as air. */
  open: readonly number[];
  /** The block a filled cell becomes (the floor of its column's biome). */
  fill(x: number, y: number, z: number): number;
  /** Cells the fix never writes (props' cells). */
  keep?(i: number): boolean;
}

export interface TrapFix {
  /** Ladder columns placed (feet cells, bottom to top). */
  ladders: Array<Array<[number, number, number]>>;
  /** Cells filled flush (a hollow raised to its rim, a breakable block under a pit made plain). */
  filled: number;
  /** Searches run, and the trapped states left after the last (0: the stratum is clean). */
  rounds: number;
  remaining: number;
  /** Trapped states found by the first search of each mode (the tools report them). */
  found: number;
}

/** Pockets this small are hollows: filled flush to their rim rather than given a ladder. */
const SMALL_POCKET = 12;

/**
 * Mend the traps of a stratum in place. Each round searches (the walk from the arrival, the walk back
 * to it) in each mode asked (`modes`: the world as it is, and the worst case a player can make, with
 * every breakable block mined), groups the trapped states into pockets and mends each one:
 * - a hollow (a few cells) is filled flush to the rim the explorer dropped from;
 * - a basin gets a ladder up the drop that leads into it (the walk in stays; Halden's crews left
 *   ladders), in the column the explorer fell down;
 * - a pocket with no drop in from home (an inner one) waits for the next round; at the end it is
 *   filled one level per round.
 * Stops when a round finds nothing in every mode (at most `rounds` rounds).
 */
export function fixTraps(tw: TrapWorld, scratch: TrapScratch, opts: { modes?: ReadonlyArray<'carved' | 'worst'>; rounds?: number; maxDrop?: number; log?: (line: string) => void } = {}): TrapFix {
  const { blocks: b, d } = tw;
  const { sx, sy } = d;
  const sxy = sx * sy;
  const maxDrop = opts.maxDrop ?? 3;
  const modes = opts.modes ?? ['carved'];
  const out: TrapFix = { ladders: [], filled: 0, rounds: 0, remaining: 0, found: 0 };
  const rounds = opts.rounds ?? 5;
  const xyz = (i: number): [number, number, number] => {
    const z = (i / sxy) | 0;
    const r = i - z * sxy;
    const y = (r / sx) | 0;
    return [r - y * sx, y, z];
  };
  // The cells opened on purpose read as air during the searches (restored after each).
  const saved = tw.open.map((i) => b[i]);
  const openSet = new Set(tw.open);
  const openUp = () => {
    for (const i of tw.open) b[i] = B.AIR;
  };
  const restore = () => tw.open.forEach((i, k) => (b[i] = saved[k]));
  const targets = (S: Uint8Array): number[] => {
    const t: number[] = [];
    const h = tw.home;
    for (let z = Math.ceil(h.min[2]); z <= Math.floor(h.max[2]); z++)
      for (let y = Math.max(1, Math.ceil(h.min[1])); y <= Math.min(sy - 3, Math.floor(h.max[1])); y++)
        for (let x = Math.ceil(h.min[0]); x <= Math.floor(h.max[0]); x++) {
          const i = x + sx * y + sxy * z;
          if (isState(b, S, sx, i)) t.push(i);
        }
    return t;
  };
  const fwd = scratch.a;
  const home = scratch.b;
  const reached = scratch.list;
  const firstSeen = new Set<string>();
  /**
   * Fill one cell flush (air or a breakable block becomes its column's floor rock). `openableOnly`
   * (the worst case's mends): only a breakable block, so the world as it is never changes shape.
   */
  let changed = 0;
  const fillCell = (c: number, openableOnly = false): boolean => {
    if (tw.keep?.(c) || openSet.has(c)) return false;
    const id = b[c];
    if (id !== B.AIR && !OPENABLE[id]) return false;
    if (openableOnly && !OPENABLE[id]) return false;
    const [x, y, z] = xyz(c);
    b[c] = tw.fill(x, y, z);
    out.filled++;
    changed++;
    return true;
  };
  for (let round = 0; round < rounds; round++) {
    out.rounds = round + 1;
    let left = 0;
    changed = 0;
    for (const mode of modes) {
      const S = mode === 'worst' ? WORST_SOLID : SOLID;
      openUp();
      const n = walkStates(b, S, d, tw.start, fwd, scratch.q, maxDrop);
      reached.set(scratch.q.subarray(0, Math.min(n, reached.length)));
      homewardStates(b, S, d, targets(S), home, scratch.q, maxDrop);
      restore();
      let count = 0;
      for (let k = 0; k < n; k++) if (!home[reached[k]]) count++;
      if (!firstSeen.has(mode)) {
        firstSeen.add(mode);
        out.found += count;
      }
      left += count;
      if (!count || round === rounds - 1) continue;
      const worst = mode === 'worst';
      for (const p of trapPockets(reached, n, home, d)) {
        const entry = entryOf(p, S);
        const small = p.cells.length <= SMALL_POCKET;
        // The worst case mends breakable blocks only (and ladders): the world as it is keeps its shape.
        const dug = !worst || p.cells.every((c) => OPENABLE[b[c]]);
        let how = 'fill1';
        const rimFill = () => {
          for (const c of p.cells) {
            const [x, y, z] = xyz(c);
            for (let yy = y; yy < entry!.rimY; yy++) if (!fillCell(x + sx * yy + sxy * z, worst)) break;
          }
        };
        if (entry && small && dug) {
          // A hollow (or a pit a pick would dig): filled up to the rim the explorer dropped from.
          how = 'rim';
          rimFill();
        } else if (entry?.ladder) {
          how = 'ladder';
          for (const [x, y, z] of entry.ladder) b[x + sx * y + sxy * z] = B.LADDER;
          out.ladders.push(entry.ladder);
          changed++;
        } else if (entry?.seal.length) {
          // The way in runs through breakable blocks (the worst case mined them): they become plain
          // rock, so mining them never opens the drop.
          how = 'seal';
          for (const c of entry.seal) {
            const [x, y, z] = xyz(c);
            b[c] = tw.fill(x, y, z);
            out.filled++;
            changed++;
          }
        } else if (entry && small) {
          how = 'rim';
          rimFill();
        } else if (!entry && round < rounds - 2) {
          // No way in from home yet: an inner pocket, mended once the outer one is.
          how = 'wait';
        } else if (small) {
          // Still no way to mend it: one level of fill.
          for (const c of p.cells) fillCell(c, worst);
        } else how = 'left';
        opts.log?.(`round ${round} ${mode}: pocket ${p.cells.length} at (${p.centre.map((v) => Math.round(v)).join(',')}) y${p.minY}-${p.maxY}: ${how}${entry ? ` rim ${entry.rimY}` : ' no entry'}`);
      }
    }
    out.remaining = left;
    if (!left) break;
    // Nothing could be mended this round (kept cells in the way): searching again changes nothing.
    if (!changed) break;
  }
  return out;

  /**
   * How the explorer gets into pocket p: the lowest drop from a home state u beside a pocket state v
   * (`rimY` = u's level), and a ladder up that drop (v.y .. u.y in v's column, the column the explorer
   * fell down: plain air all the way), preferring short drops near the pocket's middle. Null when no
   * drop leads in from home.
   */
  function entryOf(p: TrapPocket, S: Uint8Array): { rimY: number; ladder: Array<[number, number, number]> | null; seal: number[] } | null {
    // A drop in from home first; else from another trapped pocket (a chain of pockets: mended in one
    // round, each joined to the one it is entered from, the outer one to home).
    const own = new Set(p.cells);
    openUp();
    let found = scan((u) => home[u] === 1);
    if (!found) found = scan((u) => fwd[u] === 1 && !own.has(u));
    restore();
    return found;

    function scan(from: (u: number) => boolean): { rimY: number; ladder: Array<[number, number, number]> | null; seal: number[] } | null {
      let rimY = -1;
      let ladder: Array<[number, number, number]> | null = null;
      let bestScore = Infinity;
      const seal: number[] = [];
      const [pcx, , pcz] = p.centre;
      for (const v of p.cells) {
        const [vx, vy, vz] = xyz(v);
        // A standing cell under a drop, or a ladder's or rope's top under one (its way off was walled).
        if (!isState(b, S, sx, v)) continue;
        for (let k = 0; k < 4; k++) {
          const ux = k === 0 ? vx + 1 : k === 1 ? vx - 1 : vx;
          const uz = k === 2 ? vz + 1 : k === 3 ? vz - 1 : vz;
          for (let dy = 1; dy <= maxDrop; dy++) {
            const uy = vy + dy;
            if (uy > sy - 3) break;
            const u = ux + sx * uy + sxy * uz;
            if (!from(u) || !isState(b, S, sx, u)) continue;
            if (rimY < 0 || uy < rimY) rimY = uy;
            // The fall column over v (v.y .. u.y + 1) is open in the world as it is (air, a light the
            // ladder replaces, a rope or ladder already there; nothing kept); breakable blocks in it
            // (mined in the worst case) are the ones to seal instead.
            let ok = dy >= 2;
            for (let y = vy; y <= uy + 1; y++) {
              const c = vx + sx * y + sxy * vz;
              if (OPENABLE[b[c]] && !openSet.has(c) && !tw.keep?.(c)) seal.push(c);
              if (SOLID[b[c]] || openSet.has(c) || tw.keep?.(c)) ok = false;
            }
            if (!ok) continue;
            const score = dy * 10 + Math.hypot(vx - pcx, vz - pcz) * 0.1;
            if (score < bestScore) {
              bestScore = score;
              ladder = [];
              for (let y = vy; y <= uy; y++) if (!CLIMB[b[vx + sx * y + sxy * vz]]) ladder.push([vx, y, vz]);
            }
          }
        }
      }
      return rimY < 0 ? null : { rimY, ladder, seal };
    }
  }
}
