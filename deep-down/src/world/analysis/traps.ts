import { SOLID } from '../../config/blocks';
import type { Region } from '../gen/types';
import type { VoxelWorld } from '../VoxelWorld';
import { reachableCells, standable } from './reachability';

/**
 * Traps (round 2, WORLD): only interesting things are minable, so a player can no longer dig out
 * of a pit. A cell is a trap when a walk (step up 1 m, drop up to 3 m, the rides) reaches it from
 * the camp but no walk leads from it back to the camp.
 */

type Links = ReadonlyArray<{ top: readonly number[]; bottom: readonly number[] }>;

/** Cells from which the camp box can be reached: the reverse of reachableCells' moves (maxDrop 3, stepUp 1). */
export function homeward(w: VoxelWorld, links: Links, camp: Region): Uint8Array {
  const N = w.sx * w.sy * w.sz;
  const seen = new Uint8Array(N);
  // Only standable cells enter the queue (tens of thousands): a growable list, not N slots.
  const q: number[] = [];
  let h = 0;
  const push = (i: number) => {
    if (!seen[i]) {
      seen[i] = 1;
      q.push(i);
    }
  };
  for (let z = camp.min[2]; z <= camp.max[2]; z++)
    for (let y = camp.min[1]; y <= camp.max[1]; y++)
      for (let x = camp.min[0]; x <= camp.max[0]; x++) if (standable(w, x, y, z)) push(w.index(x, y, z));
  const jump = new Map<number, number[]>();
  for (const l of links) {
    const a = w.index(Math.floor(l.top[0]), Math.floor(l.top[1]), Math.floor(l.top[2]));
    const b = w.index(Math.floor(l.bottom[0]), Math.floor(l.bottom[1]), Math.floor(l.bottom[2]));
    jump.set(a, [...(jump.get(a) ?? []), b]);
    jump.set(b, [...(jump.get(b) ?? []), a]);
  }
  /** reachableCells' forward rules: does one move take u to v? */
  const moves = (ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): boolean => {
    if (vy === uy) return standable(w, vx, vy, vz);
    if (vy === uy + 1) return !SOLID[w.get(ux, uy + 2, uz)] && standable(w, vx, vy, vz);
    if (vy < uy && vy >= uy - 3) {
      if (SOLID[w.get(vx, uy, vz)] || SOLID[w.get(vx, uy + 1, vz)]) return false;
      for (let d = 1; d <= 3; d++) {
        if (SOLID[w.get(vx, uy - d, vz)]) return false;
        if (standable(w, vx, uy - d, vz)) return uy - d === vy;
      }
    }
    return false;
  };
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (h < q.length) {
    const i = q[h++];
    const vz = Math.floor(i / (w.sx * w.sy));
    const vy = Math.floor(i / w.sx) % w.sy;
    const vx = i % w.sx;
    for (const j of jump.get(i) ?? []) push(j);
    for (const [dx, dz] of dirs) {
      const ux = vx - dx;
      const uz = vz - dz;
      for (let uy = vy - 1; uy <= vy + 3; uy++) {
        if (!w.inBounds(ux, uy, uz) || seen[w.index(ux, uy, uz)] || !standable(w, ux, uy, uz)) continue;
        if (moves(ux, uy, uz, vx, vy, vz)) push(w.index(ux, uy, uz));
      }
    }
  }
  return seen;
}

/** Reachable cells with no walk home (feet cells), from the spawn's feet cell. */
export function trappedCells(w: VoxelWorld, start: readonly [number, number, number], links: Links, camp: Region): Array<[number, number, number]> {
  const fwd = reachableCells(w, start[0], start[1], start[2], 3, links);
  const home = homeward(w, links, camp);
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < fwd.length; i++) {
    if (!fwd[i] || home[i]) continue;
    out.push([i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / (w.sx * w.sy))]);
  }
  return out;
}

/**
 * Fill the traps (round 2): in a copy where every barrier and every minable block is open (the
 * worst case a player can make), find the trapped cells and make each one plain rock in `w`, then
 * look again, until none is left (at most `rounds` times). A trapped pocket becomes floor; a
 * minable block whose loss would leave a pit becomes plain rock. Cells in `keep` (rune doors,
 * living rock) and cells a prop stands on are left alone (the reachability test reports them).
 * @param open the world as a player can open it (barriers, minable blocks and rune doors as air).
 * @returns the cells filled.
 */
export function untrap(
  w: VoxelWorld,
  open: VoxelWorld,
  start: readonly [number, number, number],
  links: Links,
  camp: Region,
  opts: { keep?: ReadonlySet<number>; props?: ReadonlyArray<{ x: number; y: number; z: number }>; fill: number; put?: (x: number, y: number, z: number, id: number) => void; rounds?: number },
): Array<[number, number, number]> {
  const filled: Array<[number, number, number]> = [];
  const put = opts.put ?? ((x: number, y: number, z: number, id: number) => (w.blocks[w.index(x, y, z)] = id));
  for (let round = 0; round < (opts.rounds ?? 10); round++) {
    const t = trappedCells(open, start, links, camp);
    let n = 0;
    for (const [x, y, z] of t) {
      const i = w.index(x, y, z);
      if (opts.keep?.has(i)) continue;
      if (opts.props?.some((p) => Math.abs(p.x - x - 0.5) < 0.9 && Math.abs(p.z - z - 0.5) < 0.9 && p.y > y - 0.5 && p.y < y + 1.2)) continue;
      put(x, y, z, opts.fill);
      open.blocks[i] = opts.fill;
      filled.push([x, y, z]);
      n++;
    }
    if (n === 0) break;
  }
  return filled;
}
