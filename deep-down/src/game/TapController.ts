import { BLOCKS, SOLID } from '../config/blocks';
import type { EventBus, GameEvents } from '../core/events';
import { t } from '../i18n';
import type { InputState, MineLock } from '../input/types';
import { standable } from '../world/analysis/reachability';
import { raycastVoxels } from '../world/raycast';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { PropSpec } from '../world/gen/types';
import type { MiningController, MiningTarget } from './MiningController';
import { EYE_HEIGHT, REACH } from './fp/constants';

/**
 * Tap to act (touch). One tap does what the player obviously means:
 * - a block (or crystal) in reach is mined until it breaks, with nothing held;
 * - a block out of reach: the explorer walks up to it, then mines it;
 * - ground further than reach: the explorer walks there;
 * - an object with an action (workbench, note, rope...): walk up to it and use it.
 * A tap a little off a block still finds the minable block nearest the finger. The joystick
 * takes over at once (walking stops; a locked block in reach is still finished). Walking follows a
 * short path over the same moves as the reachability analysis (walk, step up 1, drop up to 3).
 */

export interface TapHost {
  readonly world: VoxelWorld;
  player(): { x: number; y: number; z: number };
  hand(): { x: number; y: number; z: number };
  cameraYaw(): number;
  focusedPropId(): string | null;
  propById(id: string): PropSpec | null;
  viewport(): { width: number; height: number };
  hint(text: string): void;
  /** Small mark where a walk ends. */
  ping(x: number, y: number, z: number): void;
  /**
   * A tap that found nothing to act on (the dark, the far roof, rock no pick can break): the view
   * turns a little toward it and the lantern is raised, so no tap does nothing.
   */
  nudge(ndcX: number, ndcY: number): void;
}

type Goal = { kind: 'walk' } | { kind: 'mine' } | { kind: 'use'; id: string };

/** Furthest a tap reaches into the scene (m from the camera). */
const TAP_RANGE = 48;
/** Fat-finger search radius (CSS px) for a minable block in reach near the tap. */
const FAT_FINGER_PX = 30;
/** Nodes searched for a path (about a 25 m radius of open cave). */
const PATH_NODES = 7000;
/** Stand this much inside reach before mining (so a step does not drop it out of reach). */
const REACH_MARGIN = 0.35;

/**
 * Breadth-first path over standable cells from (sx, sy, sz) to the first cell where `goal` holds.
 * @returns the cells to walk through (start excluded, goal included, flattened x,y,z), [] when the
 * start already satisfies the goal, or null. With `toward`, an unreachable goal falls back to the
 * visited cell nearest that point, if it gets at least 1.5 m closer.
 */
export function findPath(
  w: VoxelWorld,
  sx: number,
  sy: number,
  sz: number,
  goal: (x: number, y: number, z: number) => boolean,
  toward?: readonly [number, number, number],
  maxNodes = PATH_NODES,
  maxDrop = 3,
): number[] | null {
  const start = w.index(sx, sy, sz);
  const parent = new Map<number, number>([[start, -1]]);
  const queue: number[] = [start];
  const sxy = w.sx * w.sy;
  const unpack = (i: number): [number, number, number] => [i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / sxy)];
  const build = (end: number): number[] => {
    const cells: number[] = [];
    for (let i = end; i !== start && i !== -1; i = parent.get(i)!) cells.push(i);
    cells.reverse();
    const out: number[] = [];
    for (const i of cells) out.push(...unpack(i));
    return out;
  };
  if (goal(sx, sy, sz)) return [];
  let best = start;
  let bestD = toward ? Math.hypot(sx + 0.5 - toward[0], sy - toward[1], sz + 0.5 - toward[2]) : Infinity;
  const startD = bestD;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let head = 0; head < queue.length && parent.size < maxNodes; head++) {
    const i = queue[head];
    const [x, y, z] = unpack(i);
    for (const [dx, dz] of dirs) {
      const nx = x + dx;
      const nz = z + dz;
      if (!w.inBounds(nx, y, nz)) continue;
      const tryCell = (yy: number): boolean => {
        const j = w.index(nx, yy, nz);
        if (parent.has(j)) return false;
        parent.set(j, i);
        if (goal(nx, yy, nz)) {
          queue.length = 0;
          best = j;
          bestD = -1;
          return true;
        }
        queue.push(j);
        if (toward) {
          const d = Math.hypot(nx + 0.5 - toward[0], yy - toward[1], nz + 0.5 - toward[2]);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        return false;
      };
      if (standable(w, nx, y, nz)) {
        if (tryCell(y)) return build(best);
        continue;
      }
      // Step up one (the auto-step), with headroom over the current cell.
      if (!SOLID[w.get(x, y + 2, z)] && standable(w, nx, y + 1, nz)) {
        if (tryCell(y + 1)) return build(best);
        continue;
      }
      // Drop into the neighbour column (a safe fall).
      if (!SOLID[w.get(nx, y, nz)] && !SOLID[w.get(nx, y + 1, nz)]) {
        for (let d = 1; d <= maxDrop; d++) {
          if (SOLID[w.get(nx, y - d, nz)]) break;
          if (standable(w, nx, y - d, nz)) {
            if (tryCell(y - d)) return build(best);
            break;
          }
        }
      }
    }
  }
  if (toward && best !== start && startD - bestD >= 1.5) return build(best);
  return null;
}

/** Stick input (camera-relative, as PlayerController reads it) that walks along world (dx, dz). */
export function stickToward(dx: number, dz: number, camYaw: number): [number, number] {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return [0, 0];
  const ux = dx / len;
  const uz = dz / len;
  // PlayerController: forward f = (-sin yaw, -cos yaw), right r = (cos yaw, -sin yaw).
  const my = -Math.sin(camYaw) * ux - Math.cos(camYaw) * uz;
  const mx = Math.cos(camYaw) * ux - Math.sin(camYaw) * uz;
  return [mx, my];
}

export class TapController {
  private goal: Goal | null = null;
  private path: number[] = [];
  private idx = 0;
  private bestD = Infinity;
  private stuckT = 0;
  private jumped = false;
  private repaths = 0;
  private outOfReachT = 0;
  private last = { x: 0, y: 0, z: 0 };
  private tooHardKey: string | null = null;
  private readonly offs = new Float32Array(16);

  constructor(private readonly host: TapHost, private readonly mining: MiningController, bus: EventBus<GameEvents>) {
    bus.on('block:tooHard', ({ x, y, z }) => {
      this.tooHardKey = `${x},${y},${z}`;
    });
    bus.on('player:respawned', () => {
      this.stopWalk();
      this.tooHardKey = 'respawn';
    });
  }

  /** True while the explorer walks on its own. */
  get walking(): boolean {
    return this.goal !== null && this.path.length > 0;
  }

  /** Run before the player and mining updates. `blocked`: a screen is open or a ride runs. */
  update(dt: number, input: InputState, blocked: boolean): void {
    input.autoMoveX = 0;
    input.autoMoveY = 0;
    const p = this.host.player();
    // A teleport, respawn or ride end: whatever was planned no longer applies.
    if (Math.hypot(p.x - this.last.x, p.y - this.last.y, p.z - this.last.z) > 4 || this.tooHardKey === 'respawn') {
      this.stopWalk();
      input.lock = null;
      this.tooHardKey = null;
    }
    this.last = { x: p.x, y: p.y, z: p.z };
    if (blocked) {
      this.stopWalk();
      return;
    }
    // The joystick takes over: no more walking on its own (a locked block in reach is finished).
    if (Math.abs(input.moveX) + Math.abs(input.moveY) > 0.2 && this.goal) this.stopWalk();

    if (input.lockAssistPressed) {
      const tg = this.mining.target;
      if (tg && tg.inReach && tg.protectedReason === null) this.lockOn(input, tg);
    }
    if (input.tapPressed) this.onTap(input);
    this.keepLock(input, dt);
    if (this.goal) this.follow(input, dt);
  }

  /** Forget everything (menu, death). */
  reset(input: InputState): void {
    this.stopWalk();
    input.lock = null;
    input.autoMoveX = 0;
    input.autoMoveY = 0;
  }

  // ------------------------------------------------------------------------------------

  private onTap(input: InputState): void {
    const hand = this.host.hand();
    const r = this.mining.pick(input.tapX, input.tapY, hand.x, hand.y, hand.z, TAP_RANGE);
    // An object with an action, in front of any block: walk up to it and use it.
    if (r.prop && r.prop.interact && r.target?.prop !== r.prop) {
      this.use(input, r.prop);
      return;
    }
    const tg = r.target && this.minable(r.target) ? r.target : null;
    // Plain ground (not ore or crystal) is for walking on, unless it is right at the boots: then
    // the tap digs down.
    if (tg && tg.kind === 'block' && tg.ny === 1 && !isOre(tg.block) && standable(this.host.world, tg.x, tg.y + 1, tg.z)) {
      const p = this.host.player();
      if (Math.hypot(tg.x + 0.5 - p.x, tg.z + 0.5 - p.z) > 1.6) {
        this.walkTo(tg.x, tg.y + 1, tg.z);
        return;
      }
    }
    if (tg && tg.inReach) {
      this.lockOn(input, tg);
      return;
    }
    // A little off a block in reach still finds it.
    const near = this.nearbyInReach(input.tapX, input.tapY);
    if (near) {
      this.lockOn(input, near);
      return;
    }
    if (tg) {
      // A wall, ceiling or ore further away than reach: go and mine it.
      this.approach(input, tg);
      return;
    }
    const hit = r.hit;
    if (hit && hit.ny === 1 && standable(this.host.world, hit.x, hit.y + 1, hit.z)) {
      this.walkTo(hit.x, hit.y + 1, hit.z);
      return;
    }
    // Nothing to act on: look that way, lantern raised.
    this.host.nudge(input.tapX, input.tapY);
  }

  /** The way the current walk goes (world x, z unit vector), or null when not walking. */
  heading(): [number, number] | null {
    if (!this.goal || this.idx >= this.path.length / 3) return null;
    const p = this.host.player();
    // Look a couple of cells ahead along the path, so corners are turned smoothly.
    const j = Math.min(this.path.length / 3 - 1, this.idx + 2);
    const dx = this.path[j * 3] + 0.5 - p.x;
    const dz = this.path[j * 3 + 2] + 0.5 - p.z;
    const len = Math.hypot(dx, dz);
    return len > 0.4 ? [dx / len, dz / len] : null;
  }

  /** What the walk is for: 'walk', 'mine', 'use', or null. */
  get goalKind(): 'walk' | 'mine' | 'use' | null {
    return this.goal?.kind ?? null;
  }

  /** Something the pick may try (protected and invisible blocks are not targets). */
  private minable(tg: MiningTarget): boolean {
    if (tg.protectedReason !== null) return false;
    return tg.kind === 'prop' || !!BLOCKS[tg.block]?.visible;
  }

  private nearbyInReach(ndcX: number, ndcY: number): MiningTarget | null {
    const { width, height } = this.host.viewport();
    if (width <= 0 || height <= 0) return null;
    const hand = this.host.hand();
    const ox = (FAT_FINGER_PX / width) * 2;
    const oy = (FAT_FINGER_PX / height) * 2;
    const o = this.offs;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      o[k * 2] = Math.cos(a) * ox;
      o[k * 2 + 1] = Math.sin(a) * oy;
    }
    let best: MiningTarget | null = null;
    let bestD = Infinity;
    for (const ring of [0.5, 1]) {
      for (let k = 0; k < 8; k++) {
        const r = this.mining.pick(ndcX + o[k * 2] * ring, ndcY + o[k * 2 + 1] * ring, hand.x, hand.y, hand.z, TAP_RANGE);
        const tg = r.target;
        if (!tg || !tg.inReach || !this.minable(tg)) continue;
        const d = Math.hypot(tg.point.x - hand.x, tg.point.y - hand.y, tg.point.z - hand.z) + ring;
        if (d < bestD) {
          bestD = d;
          best = tg;
        }
      }
      if (best) break;
    }
    return best;
  }

  private lockOn(input: InputState, tg: MiningTarget): void {
    input.lock = toLock(tg);
    this.tooHardKey = null;
    this.outOfReachT = 0;
    this.stopWalk();
  }

  /** Lock a target out of reach and walk to a cell it can be mined from. */
  private approach(input: InputState, tg: MiningTarget): void {
    const lock = toLock(tg);
    const cx = tg.kind === 'block' ? tg.x + 0.5 : tg.x;
    const cy = tg.kind === 'block' ? tg.y + 0.5 : tg.y + 0.4;
    const cz = tg.kind === 'block' ? tg.z + 0.5 : tg.z;
    const w = this.host.world;
    const reach = REACH - REACH_MARGIN;
    const from = (x: number, y: number, z: number): boolean => {
      const hx = x + 0.5;
      const hy = y + EYE_HEIGHT;
      const hz = z + 0.5;
      const d = Math.hypot(cx - hx, cy - hy, cz - hz);
      if (d > reach) return false;
      const hit = raycastVoxels(w, hx, hy, hz, cx - hx, cy - hy, cz - hz, d + 0.2);
      if (lock.kind === 'block') return !!hit && hit.x === lock.x && hit.y === lock.y && hit.z === lock.z;
      return !hit || hit.distance >= d - 0.6;
    };
    if (!this.plan(from, [cx, cy, cz], false)) {
      this.host.hint(t('tap.noPath'));
      this.host.nudge(input.tapX, input.tapY);
      return;
    }
    input.lock = lock;
    this.tooHardKey = null;
    this.outOfReachT = 0;
    this.goal = { kind: 'mine' };
  }

  private walkTo(x: number, y: number, z: number): void {
    const ok = this.plan((a, b, c) => a === x && b === y && c === z, [x + 0.5, y, z + 0.5], true);
    if (!ok) {
      this.host.hint(t('tap.noPath'));
      return;
    }
    this.goal = { kind: 'walk' };
    this.host.ping(x + 0.5, y + 0.05, z + 0.5);
  }

  private use(input: InputState, spec: PropSpec): void {
    if (this.host.focusedPropId() === spec.id) {
      input.interactPressed = true;
      this.stopWalk();
      return;
    }
    const ok = this.plan((x, y, z) => Math.hypot(x + 0.5 - spec.x, z + 0.5 - spec.z) <= 1.4 && Math.abs(y - spec.y) <= 1.5, [spec.x, spec.y, spec.z], true);
    if (!ok) {
      this.host.hint(t('tap.noPath'));
      return;
    }
    this.goal = { kind: 'use', id: spec.id };
  }

  /** Path from the explorer's cell; false when there is none. */
  private plan(goal: (x: number, y: number, z: number) => boolean, toward: readonly [number, number, number], allowNearest: boolean): boolean {
    const start = this.startCell();
    if (!start) return false;
    const path = findPath(this.host.world, start[0], start[1], start[2], goal, allowNearest ? toward : undefined);
    if (!path) return false;
    this.stopWalk();
    this.path = path;
    this.idx = 0;
    this.resetStuck();
    this.repaths = 0;
    return true;
  }

  private startCell(): [number, number, number] | null {
    const p = this.host.player();
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const w = this.host.world;
    for (let y = Math.floor(p.y + 0.3); y >= Math.floor(p.y) - 2; y--) if (standable(w, x, y, z)) return [x, y, z];
    return null;
  }

  private keepLock(input: InputState, dt: number): void {
    const lock = input.lock;
    if (!lock) return;
    const gone = lock.kind === 'block' ? !SOLID[this.host.world.get(lock.x, lock.y, lock.z)] : !this.host.propById(lock.id);
    const key = lock.kind === 'block' ? `${lock.x},${lock.y},${lock.z}` : null;
    if (gone || (key !== null && this.tooHardKey === key)) {
      // Broken (or too hard for this pick, which the mining hint explains): done.
      input.lock = null;
      this.tooHardKey = null;
      if (this.goal?.kind === 'mine') this.stopWalk();
      return;
    }
    // The mining target of the last frame, if it is this lock (it is the hover target until the
    // first frame with the lock has run).
    const lockKey = key ?? (lock.kind === 'prop' ? `prop:${lock.id}` : '');
    const tg = this.mining.target && this.mining.target.key === lockKey ? this.mining.target : null;
    if (this.goal?.kind === 'mine') {
      // Close enough already: stop walking, the swing starts.
      if (tg && tg.inReach) this.stopWalk();
      return;
    }
    // Locked but out of reach and not walking to it (the player steered away): let it go.
    this.outOfReachT = !tg || !tg.inReach ? this.outOfReachT + dt : 0;
    if (this.outOfReachT > 1.2) input.lock = null;
  }

  private follow(input: InputState, dt: number): void {
    const goal = this.goal!;
    if (this.idx >= this.path.length / 3) {
      this.arrive(input, goal);
      return;
    }
    const p = this.host.player();
    const i = this.idx * 3;
    let tx = this.path[i] + 0.5;
    let tz = this.path[i + 2] + 0.5;
    const ty = this.path[i + 1];
    let d = Math.hypot(tx - p.x, tz - p.z);
    if (d < 0.32 && Math.abs(p.y - ty) < 1.1) {
      this.idx++;
      this.resetStuck();
      if (this.idx >= this.path.length / 3) {
        this.arrive(input, goal);
        return;
      }
      tx = this.path[this.idx * 3] + 0.5;
      tz = this.path[this.idx * 3 + 2] + 0.5;
      d = Math.hypot(tx - p.x, tz - p.z);
    }
    const [mx, my] = stickToward(tx - p.x, tz - p.z, this.host.cameraYaw());
    // Ease into the last cell so the explorer stops on it instead of overshooting.
    const last = this.idx === this.path.length / 3 - 1;
    const speed = last ? Math.min(1, 0.35 + d) : 1;
    input.autoMoveX = mx * speed;
    input.autoMoveY = my * speed;
    if (d < this.bestD - 0.04) {
      this.bestD = d;
      this.stuckT = 0;
    } else this.stuckT += dt;
    if (this.stuckT > 0.7 && !this.jumped) {
      input.jumpPressed = true;
      this.jumped = true;
    }
    if (this.stuckT > 2) this.replan(input, goal);
  }

  private replan(input: InputState, goal: Goal): void {
    this.repaths++;
    const end = this.path.length >= 3 ? this.path.slice(-3) : null;
    if (this.repaths > 2 || !end) {
      this.host.hint(t('tap.noPath'));
      this.stopWalk();
      if (goal.kind === 'mine') input.lock = null;
      return;
    }
    const [ex, ey, ez] = end;
    const repaths = this.repaths;
    const path = this.startCell() ? findPath(this.host.world, ...this.startCell()!, (x, y, z) => x === ex && y === ey && z === ez) : null;
    if (!path) {
      this.host.hint(t('tap.noPath'));
      this.stopWalk();
      if (goal.kind === 'mine') input.lock = null;
      return;
    }
    this.path = path;
    this.idx = 0;
    this.goal = goal;
    this.repaths = repaths;
    this.resetStuck();
  }

  private arrive(input: InputState, goal: Goal): void {
    if (goal.kind === 'use') {
      if (this.host.focusedPropId() === goal.id) input.interactPressed = true;
      else {
        // Focus updates a frame behind: give it a moment, then give up quietly.
        this.stuckT += 1 / 30;
        if (this.stuckT < 1) return;
      }
    }
    this.stopWalk();
  }

  private stopWalk(): void {
    this.goal = null;
    this.path = [];
    this.idx = 0;
    this.resetStuck();
  }

  private resetStuck(): void {
    this.bestD = Infinity;
    this.stuckT = 0;
    this.jumped = false;
  }
}

/** Ore, crystal and other finds: mined even when tapped on the floor (plain rock is walked on). */
function isOre(id: number): boolean {
  const item = BLOCKS[id]?.drop?.item;
  return !!item && item !== 'stone' && item !== 'rootFibre';
}

function toLock(tg: MiningTarget): MineLock {
  return tg.kind === 'prop' && tg.prop ? { kind: 'prop', id: tg.prop.id } : { kind: 'block', x: tg.x, y: tg.y, z: tg.z };
}
