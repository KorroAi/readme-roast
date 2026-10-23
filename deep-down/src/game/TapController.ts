import { BLOCKS, SOLID } from '../config/blocks';
import { isBreakable, rarityOf, RARITY_RANK } from '../config/rarity';
import type { EventBus, GameEvents } from '../core/events';
import { t } from '../i18n';
import type { InputState, MineLock } from '../input/types';
import { standable } from '../world/analysis/reachability';
import { raycastVoxels } from '../world/raycast';
import type { VoxelWorld } from '../world/VoxelWorld';
import type { PropSpec } from '../world/gen/types';
import type { MiningController, MiningTarget } from './MiningController';
import { EYE_HEIGHT, REACH } from './fp/constants';
import './fp/events';

/**
 * Tap to act (touch), with no aiming dot: you tap the thing itself. One tap does what the player
 * obviously means:
 * - a creature (game/mobs): the host's tapMob answers first (attack a monster, catch or harvest a
 *   being, walking up to it when it is out of reach);
 * - a minable find (ore, crystal, rubble, roots, a seal, a cracked wall) in reach is mined until it
 *   breaks, with nothing held; out of reach, the explorer walks up to it, then mines it;
 * - an object with an action (workbench, note, rope, chest...): walk up to it and use it;
 * - ground: the explorer walks there;
 * - ordinary rock in reach: a soft "tunk" (one strike, a tiny chip, nothing breaks);
 * - anything else (the far dark, the roof, far plain rock): the view turns a little toward it and the
 *   lantern is raised, so no tap does nothing.
 * The hit test is generous: when the finger is not on a find, the nearest minable or usable thing
 * within SNAP_PX of it is taken, the rarer first, then the nearer the finger. The joystick
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
  /** Whether a tap on this prop should walk up and use it (an opened cache is scenery). */
  usable(spec: PropSpec): boolean;
  viewport(): { width: number; height: number };
  hint(text: string): void;
  /** Small mark where a walk ends. */
  ping(x: number, y: number, z: number): void;
  /**
   * A tap that found nothing to act on (the dark, the far roof, rock no pick can break): the view
   * turns a little toward it and the lantern is raised, so no tap does nothing.
   */
  nudge(ndcX: number, ndcY: number): void;
  /** A creature under (or near) the tap: act on it and return true (game/fp/Combat). */
  tapMob?(ndcX: number, ndcY: number): boolean;
}

type Goal = { kind: 'walk' } | { kind: 'mine' } | { kind: 'use'; id: string };
type TapAction = { kind: 'use'; prop: PropSpec } | { kind: 'mine'; target: MiningTarget };

/** A rarity as a preference rank (things with none, e.g. a workbench, rank with the commons). */
function rankOf(r: ReturnType<typeof rarityOf>): number {
  return r ? RARITY_RANK[r] : 0;
}

/** Furthest a tap reaches into the scene (m from the camera). */
const TAP_RANGE = 48;
/** Generous hit test (ROUND2 §0.4): a tap snaps to the best find within this many CSS px of the finger. */
export const SNAP_PX = 56;
/** The rings searched round the finger (fractions of SNAP_PX) and the samples on each. */
const SNAP_RINGS = [0.25, 0.5, 0.75, 1];
const SNAP_SAMPLES = 8;
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

  constructor(private readonly host: TapHost, private readonly mining: MiningController, bus: EventBus<GameEvents>) {
    bus.on('block:tooHard', ({ x, y, z }) => {
      this.tooHardKey = `${x},${y},${z}`;
    });
    // One strike on ordinary rock is all a tap does there.
    bus.on('block:tunk', ({ x, y, z }) => {
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

  /**
   * Walk until within `within` m (horizontal, and 1.5 m vertical) of a point: the way to a creature
   * (game/fp/Combat). False when there is no way; true (and nothing to walk) when already there.
   */
  walkNear(x: number, y: number, z: number, within: number): boolean {
    const p = this.host.player();
    if (Math.hypot(x - p.x, z - p.z) <= within && Math.abs(y - p.y - 0.8) <= 1.8) {
      if (this.goal?.kind === 'walk') this.stopWalk();
      return true;
    }
    const ok = this.plan((a, b, c) => Math.hypot(a + 0.5 - x, c + 0.5 - z) <= within && Math.abs(b - y) <= 2.2, [x, y, z], true);
    if (ok) this.goal = { kind: 'walk' };
    return ok;
  }

  /** Stop walking on its own (a strike starts). */
  stop(): void {
    this.stopWalk();
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
    // A creature first (it moves: the generous pick and the action are game/fp/Combat's).
    if (this.host.tapMob?.(input.tapX, input.tapY)) {
      this.stopWalk();
      input.lock = null;
      return;
    }
    const hand = this.host.hand();
    const r = this.mining.pick(input.tapX, input.tapY, hand.x, hand.y, hand.z, TAP_RANGE);
    // The thing under the finger, else the best find near it.
    const act = this.actionOf(r) ?? this.snap(input.tapX, input.tapY)?.act ?? null;
    if (act?.kind === 'use') {
      this.use(input, act.prop);
      return;
    }
    if (act?.kind === 'mine') {
      if (act.target.inReach) this.lockOn(input, act.target);
      else this.approach(input, act.target);
      return;
    }
    // Ground: walk there.
    const hit = r.hit;
    if (hit && hit.ny === 1 && standable(this.host.world, hit.x, hit.y + 1, hit.z)) {
      const p = this.host.player();
      if (Math.hypot(hit.x + 0.5 - p.x, hit.z + 0.5 - p.z) > 0.9 || Math.abs(hit.y + 1 - p.y) > 0.5) {
        this.walkTo(hit.x, hit.y + 1, hit.z);
        return;
      }
    }
    // Ordinary rock in reach: one strike, a soft tunk (MiningController), nothing breaks.
    const tg = r.target;
    if (tg && tg.kind === 'block' && tg.inReach && BLOCKS[tg.block]?.visible && !isBreakable(tg.block)) {
      input.lock = toLock(tg);
      this.tooHardKey = null;
      this.stopWalk();
      return;
    }
    // Nothing to act on: look that way, lantern raised.
    this.host.nudge(input.tapX, input.tapY);
  }

  /** What a tap on this pick result means, if it is a find or something to use (else null). */
  private actionOf(r: ReturnType<MiningController['pick']>): TapAction | null {
    // An object with an action, in front of any block: walk up to it and use it.
    if (r.prop && r.prop.interact && r.target?.prop !== r.prop && this.host.usable(r.prop)) return { kind: 'use', prop: r.prop };
    if (r.target && this.minable(r.target)) return { kind: 'mine', target: r.target };
    return null;
  }

  /**
   * The generous hit test: the minable or usable things within SNAP_PX of the finger; the rarest
   * wins, then the one nearest the finger, then the nearest to the explorer.
   */
  private snap(ndcX: number, ndcY: number): { act: TapAction; rank: number; px: number } | null {
    const { width, height } = this.host.viewport();
    if (width <= 0 || height <= 0) return null;
    const hand = this.host.hand();
    let best: { act: TapAction; rank: number; px: number; d: number } | null = null;
    for (const ring of SNAP_RINGS) {
      const px = SNAP_PX * ring;
      for (let k = 0; k < SNAP_SAMPLES; k++) {
        const a = (k / SNAP_SAMPLES) * Math.PI * 2 + ring * 0.7;
        const x = ndcX + ((Math.cos(a) * px) / width) * 2;
        const y = ndcY + ((Math.sin(a) * px) / height) * 2;
        const r = this.mining.pick(x, y, hand.x, hand.y, hand.z, TAP_RANGE);
        const act = this.actionOf(r);
        if (!act) continue;
        const rank = act.kind === 'use' ? rankOf(rarityOf(act.prop)) : act.target.kind === 'prop' && act.target.prop ? rankOf(rarityOf(act.target.prop)) : rankOf(rarityOf(act.target.block));
        const pt = act.kind === 'use' ? act.prop : act.target.point;
        const d = Math.hypot(pt.x - hand.x, pt.y - hand.y, pt.z - hand.z);
        if (!best || rank > best.rank || (rank === best.rank && (px < best.px - 1e-6 || (Math.abs(px - best.px) < 1e-6 && d < best.d)))) best = { act, rank, px, d };
      }
    }
    return best;
  }

  /**
   * What a tap at (ndcX, ndcY) would do now, without doing it (tests, debug), as onTap decides it: use
   * a thing or mine a find under the finger or near it (the snap), walk to the ground there, tunk on
   * ordinary rock in reach, or look that way. Creatures are not asked (Combat's pick answers first).
   */
  intentAt(ndcX: number, ndcY: number): 'use' | 'mine' | 'walk' | 'tunk' | 'look' {
    const hand = this.host.hand();
    const r = this.mining.pick(ndcX, ndcY, hand.x, hand.y, hand.z, TAP_RANGE);
    const act = this.actionOf(r) ?? this.snap(ndcX, ndcY)?.act ?? null;
    if (act) return act.kind;
    const hit = r.hit;
    if (hit && hit.ny === 1 && standable(this.host.world, hit.x, hit.y + 1, hit.z)) {
      const p = this.host.player();
      if (Math.hypot(hit.x + 0.5 - p.x, hit.z + 0.5 - p.z) > 0.9 || Math.abs(hit.y + 1 - p.y) > 0.5) return 'walk';
    }
    const tg = r.target;
    if (tg && tg.kind === 'block' && tg.inReach && BLOCKS[tg.block]?.visible && !isBreakable(tg.block)) return 'tunk';
    return 'look';
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

  /** The prop a tapped walk will use on arrival (it wears the selection outline), or null. */
  get useTarget(): string | null {
    return this.goal?.kind === 'use' ? this.goal.id : null;
  }

  /** What the walk is for: 'walk', 'mine', 'use', or null. */
  get goalKind(): 'walk' | 'mine' | 'use' | null {
    return this.goal?.kind ?? null;
  }

  /**
   * A find the pick may try: a minable prop, or a block some pick can break (ore, crystal, rubble,
   * roots, a seal, a cracked wall). Ordinary rock, masonry and invisible blocks are not targets.
   */
  private minable(tg: MiningTarget): boolean {
    if (tg.protectedReason !== null) return false;
    return tg.kind === 'prop' || (!!BLOCKS[tg.block]?.visible && isBreakable(tg.block));
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

function toLock(tg: MiningTarget): MineLock {
  return tg.kind === 'prop' && tg.prop ? { kind: 'prop', id: tg.prop.id } : { kind: 'block', x: tg.x, y: tg.y, z: tg.z };
}
