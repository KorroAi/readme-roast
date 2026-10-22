import { B, EVENT_LIGHT, SOLID, isEmitter } from '../../config/blocks';
import { WORLD } from '../../config/balance';
import { EVENTS } from '../../config/events';
import { isMinable } from '../../config/rarity';
import { t } from '../../i18n';
import { raycastVoxels } from '../../world/raycast';
import type { Game } from '../Game';
import { EventSchedule, type Placement } from './schedule';
import type { EventContext, EventDirectorApi, EventKind, EventLive, GameEvent, V3 } from './types';

/** Plain rock a tremor may crack open. */
const PLAIN = new Set<number>([B.SLATE, B.DEEP_SLATE, B.UMBER, B.SOIL, B.GRAVEL, B.MOSS]);
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Round 3 (LOOP's 20:23 ask): in a stratum's 'rockfall' zone (the Halden Mines' old camps and works,
 * layout.hazards) a rockfall is this many times likelier, and the next event comes within this many
 * seconds of walking in (the loose roof the zone's line warns of really does drop stones there).
 */
const ROCKFALL_ZONE_BOOST = 3.5;
const ROCKFALL_ZONE_SOON = 25;

/**
 * The events director (round 2, WORLD; ROUND2 §0.7): something happens every 2–4 minutes of
 * exploration, calm but exciting, one at a time, never at the camp.
 *
 * - **tremor**: the ground shakes and a wall nearby cracks: a hidden pocket opens behind loose stone,
 *   with ore or gems in its back wall.
 * - **bloom**: the crystals nearby glow for 60 s; anything crystal broken in it gives a shard more.
 * - **migration**, **treasure**: MOBS draws them (handle(kind) turns them on).
 * - **echo**: a Halden echo light drifts ahead of the explorer to a cracked wall hiding a secret.
 * - **gust**: the flame shrinks to half until the explorer stands by a lamp or a fire.
 * - **geyser**: spores burst from the floor, glowing up; standing in them feeds the lantern.
 * - **rockfall**: dust trickles from the roof, then stones fall where the explorer stood (a mild
 *   knock, never lethal) and stay as a heap of loose stone.
 *
 * It runs in Progression's playing frame. Its lights are LIGHT_EVENT voxels, never saved
 * (WorldSession.worldEdits) and cleared on attach; its other edits (pockets, heaps) are ordinary
 * world edits and persist.
 */
export class EventDirector implements EventDirectorApi {
  readonly schedule = new EventSchedule(WORLD.seed ^ 0xe7e47);
  readonly live: EventLive = { t: 0 };
  private lights: V3[] = [];
  private path: V3[] = [];
  private pathS = 0;
  private rockAt: V3 | null = null;
  private rockLanded = false;
  private fed = false;
  private sparkTimer = 0;
  /** Round 3: the explorer stands in a stratum's rockfall zone. */
  private inRockfallZone = false;

  constructor(private readonly game: Game) {
    // The bloom: a crystal broken in its glow gives a shard more.
    const bonus = (x: number, y: number, z: number, crystal: boolean) => {
      const ev = this.schedule.current;
      if (!ev || ev.kind !== 'bloom' || !crystal) return;
      if (Math.hypot(x - ev.anchor[0], y - ev.anchor[1], z - ev.anchor[2]) > ev.radius + 1) return;
      game.drops.spawn('glimmerShard', 1, x, y + 0.5, z, game.rng);
    };
    game.bus.on('block:broken', (e) => bonus(e.x + 0.5, e.y + 0.5, e.z + 0.5, e.block === B.CRYSTAL || e.block === B.ECHO_CRYSTAL));
    game.bus.on('prop:broken', (e) => bonus(e.x, e.y, e.z, game.session.layout.props.some((p) => p.id === e.propId && p.kind === 'crystalCluster') || e.propId.startsWith('bloom_e')));
  }

  get current(): GameEvent | null {
    return this.schedule.current;
  }

  get untilNext(): number {
    return this.schedule.untilNext;
  }

  /** Another system draws this kind's actors (MOBS: 'migration', 'treasure'): the director may pick it. */
  handle(kind: EventKind): void {
    this.schedule.handled.add(kind);
  }

  /** A world was attached (new game, continue) or the explorer blacked out: no event, no stray light. */
  reset(): void {
    if (this.schedule.current) this.finish(false);
    const w = this.game.session.world;
    for (let i = 0; i < w.blocks.length; i++) {
      if (!EVENT_LIGHT[w.blocks[i]]) continue;
      this.game.session.setBlock(i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / (w.sx * w.sy)), B.AIR);
    }
    this.lights = [];
    this.game.lanternFuel.dim = 1;
  }

  update(dt: number, ctx: EventContext): void {
    const s = this.schedule;
    const exploring = !ctx.inCamp && !ctx.busy;
    const before = s.current;
    // Round 3: a rockfall zone of the strata (the mines' loose roofs) makes a rockfall likelier and sooner.
    const zone = this.rockfallZoneAt(ctx.x, ctx.y, ctx.z);
    if (zone && !this.inRockfallZone && !s.current) s.nextAt = Math.min(s.nextAt, s.clock + ROCKFALL_ZONE_SOON);
    this.inRockfallZone = zone;
    const started = s.step(dt, exploring, ctx.depth, (k) => this.place(k, ctx), zone ? (k) => (k === 'rockfall' ? ROCKFALL_ZONE_BOOST : 1) : undefined);
    // The schedule ended the event on time: clean up (and tell the others).
    if (before && !s.current) this.cleanup(before, false);
    if (started) this.begin(started, ctx);
    const ev = s.current;
    if (!ev) return;
    // At camp the event winds down at once (nothing happens at the camp).
    if (ctx.inCamp) {
      this.finish(false);
      return;
    }
    this.live.t = Math.min(1, (s.clock - ev.start) / Math.max(0.001, ev.end - ev.start));
    if (exploring) this.run(ev, dt, ctx);
  }

  force(kind: EventKind, ctx: EventContext): GameEvent | null {
    const p = this.place(kind, ctx);
    if (!p) return null;
    if (this.schedule.current) this.finish(false);
    const ev = this.schedule.start(kind, p);
    this.begin(ev, ctx);
    return ev;
  }

  // ------------------------------------------------------------------------------------
  // Placement: where each kind can happen near the explorer (null: not here).

  private place(kind: EventKind, ctx: EventContext): Placement | null {
    switch (kind) {
      case 'tremor':
        return this.placePocket(ctx);
      case 'bloom':
        return this.placeBloom(ctx);
      case 'echo':
        return this.placeEcho(ctx);
      case 'gust':
        return ctx.lit ? this.placeGust(ctx) : null;
      case 'geyser':
        return this.placeFloor(ctx, 'geyser', 3, 8);
      case 'rockfall':
        return this.placeRockfall(ctx);
      case 'migration':
      case 'treasure': {
        const f = this.placeFloor(ctx, 'migration', 6, 14);
        if (!f) return null;
        const a = Math.atan2(f.anchor[2] - ctx.z, f.anchor[0] - ctx.x);
        return { ...f, target: [f.anchor[0] + Math.cos(a) * 18, f.anchor[1], f.anchor[2] + Math.sin(a) * 18] };
      }
    }
  }

  private get w() {
    return this.game.session.world;
  }

  /** Round 3: is (x, y, z) inside one of the loaded stratum's 'rockfall' hazard zones? */
  private rockfallZoneAt(x: number, y: number, z: number): boolean {
    const hz = (this.game.session.layout as { hazards?: ReadonlyArray<{ kind: string; centre: readonly number[]; radius: number }> }).hazards;
    if (!hz) return false;
    for (const h of hz) if (h.kind === 'rockfall' && Math.hypot(x - h.centre[0], (y - h.centre[1]) * 1.5, z - h.centre[2]) < h.radius) return true;
    return false;
  }

  private standable(x: number, y: number, z: number): boolean {
    const w = this.w;
    return !SOLID[w.get(x, y, z)] && !SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y - 1, z)] === 1;
  }

  /** Clear line of sight from the eye to a point. */
  private visible(ctx: EventContext, x: number, y: number, z: number): boolean {
    const ey = ctx.y + 1.6;
    const d = Math.hypot(x - ctx.x, y - ey, z - ctx.z);
    if (d < 0.5) return true;
    const hit = raycastVoxels(this.w, ctx.x, ey, ctx.z, x - ctx.x, y - ey, z - ctx.z, d - 0.6);
    return hit === null;
  }

  /** A standable floor cell `lo`..`hi` m away in view (or an event site of `tag` within 25 m). */
  private placeFloor(ctx: EventContext, tag: 'geyser' | 'migration' | 'rockfall', lo: number, hi: number): Placement | null {
    const sites = this.game.session.layout.features?.eventSites ?? [];
    for (const s of sites) {
      if (s.tag !== tag) continue;
      if (Math.hypot(s.p[0] - ctx.x, (s.p[1] - ctx.y) * 1.5, s.p[2] - ctx.z) < 25) return { anchor: [s.p[0], s.p[1], s.p[2]], radius: s.r };
    }
    const rng = this.game.rng;
    for (let k = 0; k < 40; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = lo + rng.next() * (hi - lo);
      const x = Math.floor(ctx.x + Math.cos(a) * r);
      const z = Math.floor(ctx.z + Math.sin(a) * r);
      for (let dy = 2; dy >= -3; dy--) {
        const y = Math.floor(ctx.y) + dy;
        if (!this.standable(x, y, z) || !this.visible(ctx, x + 0.5, y + 0.6, z + 0.5)) continue;
        if (this.nearCamp(x, y, z)) return null;
        return { anchor: [x + 0.5, y, z + 0.5], radius: 2 };
      }
    }
    return null;
  }

  private nearCamp(x: number, y: number, z: number): boolean {
    const c = this.game.session.layout.camp;
    return x >= c.min[0] - 8 && x <= c.max[0] + 8 && z >= c.min[2] - 8 && z <= c.max[2] + 8 && y >= c.min[1] - 6;
  }

  /** A wall of plain rock 4–18 m away with solid rock behind it, a floor in front: a pocket can open there. */
  private placePocket(ctx: EventContext): Placement | null {
    const w = this.w;
    const px = Math.floor(ctx.x);
    const py = Math.floor(ctx.y);
    const pz = Math.floor(ctx.z);
    let best: { cell: V3; out: [number, number]; d: number } | null = null;
    for (let dz = -18; dz <= 18; dz++)
      for (let dx = -18; dx <= 18; dx++) {
        const d = Math.hypot(dx, dz);
        if (d < 4 || d > 18) continue;
        for (let dy = -2; dy <= 2; dy++) {
          const x = px + dx;
          const y = py + dy;
          const z = pz + dz;
          if (!PLAIN.has(w.get(x, y, z)) || !PLAIN.has(w.get(x, y + 1, z))) continue;
          for (const [ox, oz] of DIRS) {
            if (!this.standable(x + ox, y, z + oz)) continue;
            if (!this.enclosed(x, y, z, -ox, -oz)) continue;
            if (this.nearCamp(x, y, z)) continue;
            if (!best || d < best.d) best = { cell: [x, y, z], out: [ox, oz], d };
          }
        }
      }
    if (!best) return null;
    const [x, y, z] = best.cell;
    return { anchor: [x + 0.5, y, z + 0.5], radius: 3, target: [x - best.out[0] * 2 + 0.5, y, z - best.out[1] * 2 + 0.5] };
  }

  /** The pocket behind a wall cell (2 deep along (ix, iz), 3 wide, 2 tall) and a shell of one round it are solid rock. */
  private enclosed(x: number, y: number, z: number, ix: number, iz: number): boolean {
    const w = this.w;
    const px = Math.abs(iz);
    const pz = Math.abs(ix);
    for (let depth = 1; depth <= 3; depth++)
      for (let side = -2; side <= 2; side++)
        for (let h = -1; h <= 2; h++) {
          const cx = x + ix * depth + px * side;
          const cy = y + h;
          const cz = z + iz * depth + pz * side;
          const id = w.get(cx, cy, cz);
          if (!SOLID[id] || isEmitter(id) || !PLAIN.has(id)) return false;
        }
    return true;
  }

  private placeBloom(ctx: EventContext): Placement | null {
    let best: { p: V3; d: number } | null = null;
    for (const spec of this.game.session.liveProps.values()) {
      if (spec.kind !== 'crystalCluster') continue;
      const d = Math.hypot(spec.x - ctx.x, (spec.y - ctx.y) * 1.5, spec.z - ctx.z);
      if (d > 16 || (best && d >= best.d)) continue;
      if (!this.visible(ctx, spec.x, spec.y + 0.5, spec.z)) continue;
      best = { p: [spec.x, spec.y, spec.z], d };
    }
    if (best) return { anchor: best.p, radius: 6 };
    // Or a crystal seam in view.
    const w = this.w;
    for (let r = 2; r <= 10; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (let dy = -2; dy <= 4; dy++) {
            const x = Math.floor(ctx.x) + dx;
            const y = Math.floor(ctx.y) + dy;
            const z = Math.floor(ctx.z) + dz;
            const id = w.get(x, y, z);
            if (id !== B.CRYSTAL && id !== B.ECHO_CRYSTAL) continue;
            if (!this.visible(ctx, x + 0.5, y + 0.5, z + 0.5)) continue;
            return { anchor: [x + 0.5, y + 0.5, z + 0.5], radius: 6 };
          }
        }
    return null;
  }

  /** A cracked wall (loose masonry) within 40 m of walking: the echo light leads there. */
  private placeEcho(ctx: EventContext): Placement | null {
    const w = this.w;
    const sx = Math.floor(ctx.x);
    const sz = Math.floor(ctx.z);
    let sy = Math.floor(ctx.y);
    while (sy > 1 && !this.standable(sx, sy, sz)) sy--;
    if (!this.standable(sx, sy, sz)) return null;
    // Breadth-first over the floor, up to 2500 cells (about 40 m of walking).
    const start = w.index(sx, sy, sz);
    const par = new Map<number, number>([[start, -1]]);
    const q = [start];
    let goal = -1;
    for (let h = 0; h < q.length && q.length < 2500 && goal < 0; h++) {
      const i = q[h];
      const z = Math.floor(i / (w.sx * w.sy));
      const y = Math.floor(i / w.sx) % w.sy;
      const x = i % w.sx;
      for (const [dx, dz] of DIRS) {
        // A crack in front of this cell (at feet or head height): the goal.
        if (w.get(x + dx, y, z + dz) === B.CRUMBLING_BRICK || w.get(x + dx, y + 1, z + dz) === B.CRUMBLING_BRICK) {
          if (Math.hypot(x - sx, z - sz) > 4) {
            goal = i;
            break;
          }
        }
        for (const ny of [y, y + 1, y - 1, y - 2, y - 3]) {
          const nx = x + dx;
          const nz = z + dz;
          if (!this.standable(nx, ny, nz)) continue;
          if (ny === y + 1 && SOLID[w.get(x, y + 2, z)]) continue;
          const j = w.index(nx, ny, nz);
          if (par.has(j)) break;
          par.set(j, i);
          q.push(j);
          break;
        }
      }
    }
    if (goal < 0) return null;
    const path: V3[] = [];
    for (let i = goal; i >= 0; i = par.get(i) ?? -1) path.push([(i % w.sx) + 0.5, Math.floor(i / w.sx) % w.sy, Math.floor(i / (w.sx * w.sy)) + 0.5]);
    path.reverse();
    if (path.length < 5) return null;
    this.path = path;
    const end = path[path.length - 1];
    return { anchor: path[0], radius: 2.5, target: end };
  }

  /** The nearest lamp or fire within 30 m: the flame steadies there. */
  private placeGust(ctx: EventContext): Placement | null {
    const lamp = this.nearestLamp(ctx.x, ctx.y, ctx.z, 30);
    if (!lamp || lamp.d < EVENTS.braziersRange + 2) return null;
    return { anchor: [ctx.x, ctx.y, ctx.z], radius: 4, target: lamp.p };
  }

  private nearestLamp(x: number, y: number, z: number, max: number): { p: V3; d: number } | null {
    let best: { p: V3; d: number } | null = null;
    for (const spec of this.game.session.liveProps.values()) {
      if (spec.kind !== 'lanternPost' && spec.kind !== 'campfire' && spec.kind !== 'hangingLantern') continue;
      if (spec.emitters.length === 0) continue;
      const d = Math.hypot(spec.x - x, (spec.y - y) * 1.5, spec.z - z);
      if (d <= max && (!best || d < best.d)) best = { p: [spec.x, spec.y, spec.z], d };
    }
    return best;
  }

  /** The explorer's own spot, under a roof within 12 m. */
  private placeRockfall(ctx: EventContext): Placement | null {
    const x = Math.floor(ctx.x);
    const z = Math.floor(ctx.z);
    let y = Math.floor(ctx.y);
    if (!this.standable(x, y, z)) return null;
    if (this.nearCamp(x, y, z)) return null;
    let roof = y + 2;
    while (roof < y + 12 && !SOLID[this.w.get(x, roof, z)]) roof++;
    if (roof >= y + 12) return null;
    // Never on a ride's stand.
    for (const l of this.game.session.layout.features?.links ?? []) for (const s of [l.top, l.bottom]) if (Math.hypot(s[0] - ctx.x, s[1] - ctx.y, s[2] - ctx.z) < 3) return null;
    return { anchor: [x + 0.5, y, z + 0.5], radius: EVENTS.rockRadius, target: [x + 0.5, roof, z + 0.5] };
  }

  // ------------------------------------------------------------------------------------
  // Running

  private begin(ev: GameEvent, ctx: EventContext): void {
    const g = this.game;
    this.live.t = 0;
    this.live.light = undefined;
    this.fed = false;
    this.rockLanded = false;
    this.sparkTimer = 0;
    this.pathS = 0;
    const [ax, ay, az] = ev.anchor;
    switch (ev.kind) {
      case 'tremor':
        this.openPocket(ev);
        g.particles.dust(ax, ay + 1, az, 0x8a8f98, 18, g.rng, 0.8);
        break;
      case 'bloom':
        this.lightNear(ev.anchor, B.LIGHT_EVENT, 2);
        g.particles.sparkle(ax, ay + 0.6, az, 0x9ff6ff, 14, g.rng, 1.4);
        break;
      case 'gust':
        g.lanternFuel.dim = EVENTS.gustDim;
        break;
      case 'rockfall':
        this.rockAt = [ax, ay, az];
        g.particles.dust(ax, (ev.target?.[1] ?? ay + 4) - 0.2, az, 0x9a958c, 14, g.rng, 0.7);
        break;
      case 'echo':
        break;
      case 'geyser':
        g.particles.sparkle(ax, ay + 0.3, az, 0xd8f08a, 16, g.rng, 2.4);
        break;
      case 'migration':
      case 'treasure':
        break;
    }
    g.bus.emit('world:event', { event: ev, phase: 'start' });
    const key = `event.${ev.kind}` as const;
    g.ui.toast(t(key), ev.kind === 'rockfall' || ev.kind === 'gust' ? 'warn' : 'info');
    void ctx;
  }

  private run(ev: GameEvent, dt: number, ctx: EventContext): void {
    const g = this.game;
    switch (ev.kind) {
      case 'gust': {
        const lamp = this.nearestLamp(ctx.x, ctx.y, ctx.z, EVENTS.braziersRange);
        if (lamp) this.finish(true);
        break;
      }
      case 'echo':
        this.runEcho(ev, dt, ctx);
        break;
      case 'geyser': {
        this.sparkTimer -= dt;
        const [ax, ay, az] = ev.anchor;
        if (this.sparkTimer <= 0) {
          this.sparkTimer = 0.35;
          g.particles.sparkle(ax, ay + 0.2, az, 0xd8f08a, 6, g.rng, 2.6);
          // The glow rises with the spores: one passing light, a cell higher each beat.
          const k = Math.floor((this.schedule.clock - ev.start) / 0.7) % 5;
          this.moveLight([Math.floor(ax), Math.floor(ay) + 1 + k, Math.floor(az)], B.LIGHT_EVENT_GOLD);
        }
        if (!this.fed && Math.hypot(ctx.x - ax, ctx.z - az) < EVENTS.geyserRadius && Math.abs(ctx.y - ay) < 2) {
          this.fed = true;
          const added = g.lanternFuel.add(EVENTS.geyserFuel);
          if (added > 0) g.bus.emit('lantern:refueled', {});
        }
        break;
      }
      case 'rockfall': {
        const since = this.schedule.clock - ev.start;
        if (!this.rockLanded && since >= EVENTS.rockWarn) {
          this.rockLanded = true;
          this.landRocks(ev, ctx);
        } else if (!this.rockLanded) {
          this.sparkTimer -= dt;
          if (this.sparkTimer <= 0) {
            this.sparkTimer = 0.3;
            g.particles.dust(ev.anchor[0], (ev.target?.[1] ?? ev.anchor[1] + 4) - 0.2, ev.anchor[2], 0x9a958c, 4, g.rng, 0.5);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /** Wind an event down (the player did the thing, or it ran out), tell the others, start the gap. */
  private finish(ok: boolean): void {
    const ev = this.schedule.end();
    if (ev) this.cleanup(ev, ok);
  }

  private cleanup(ev: GameEvent, ok: boolean): void {
    const g = this.game;
    for (const [x, y, z] of this.lights) if (EVENT_LIGHT[g.session.world.get(x, y, z)]) g.session.setBlock(x, y, z, B.AIR);
    this.lights = [];
    this.live.light = undefined;
    if (ev.kind === 'gust') {
      g.lanternFuel.dim = 1;
      if (ok) g.ui.toast(t('event.gustOver'), 'good');
    }
    if (ev.kind === 'echo' && ok) g.ui.toast(t('event.echoFound'), 'good');
    this.path = [];
    this.rockAt = null;
    g.bus.emit('world:event', { event: ev, phase: 'end', ok });
  }

  /** The tremor: a pocket opens behind the wall, its mouth loose stone, ore or gems at its back. */
  private openPocket(ev: GameEvent): void {
    const s = this.game.session;
    const [ax, ay, az] = ev.anchor;
    const x = Math.floor(ax);
    const y = Math.floor(ay);
    const z = Math.floor(az);
    const tx = Math.floor(ev.target![0]);
    const tz = Math.floor(ev.target![2]);
    const ix = Math.sign(tx - x);
    const iz = Math.sign(tz - z);
    const px = Math.abs(iz);
    const pz = Math.abs(ix);
    let cells = 0;
    for (let depth = 1; depth <= 2; depth++)
      for (let side = -1; side <= 1; side++)
        for (let h = 0; h <= 1; h++) {
          s.setBlock(x + ix * depth + px * side, y + h, z + iz * depth + pz * side, B.AIR);
          cells++;
        }
    // The find in its back wall: gems deep down, iron in the Hollow, copper above it.
    const depthM = WORLD.depthOffset - y;
    const ore = depthM > 100 ? B.GEM_ORE : depthM > 50 ? B.IRON_ORE : B.COPPER_ORE;
    for (const side of [-1, 0, 1]) {
      const bx = x + ix * 3 + px * side;
      const bz = z + iz * 3 + pz * side;
      if (side === 0 || this.game.rng.chance(0.5)) s.setBlock(bx, y, bz, ore);
    }
    s.setBlock(x, y, z, B.RUBBLE);
    s.setBlock(x, y + 1, z, B.RUBBLE);
    this.game.bus.emit('world:pocket', { x: x + 0.5, y, z: z + 0.5, cells });
  }

  /** Put up to `n` passing lights in open cells round a point. */
  private lightNear(p: V3, id: number, n: number): void {
    const w = this.w;
    let placed = 0;
    for (let r = 1; r <= 2 && placed < n; r++)
      for (let dy = 0; dy <= 2 && placed < n; dy++)
        for (const [dx, dz] of DIRS) {
          const x = Math.floor(p[0]) + dx * r;
          const y = Math.floor(p[1]) + dy;
          const z = Math.floor(p[2]) + dz * r;
          if (w.get(x, y, z) !== B.AIR || placed >= n) continue;
          this.game.session.setBlock(x, y, z, id);
          this.lights.push([x, y, z]);
          placed++;
        }
  }

  /** Move the event's single passing light to a cell (if open). */
  private moveLight(c: V3, id: number): void {
    const s = this.game.session;
    const w = s.world;
    const cur = this.lights[0];
    if (cur && cur[0] === c[0] && cur[1] === c[1] && cur[2] === c[2]) return;
    if (w.get(c[0], c[1], c[2]) !== B.AIR) return;
    if (cur && EVENT_LIGHT[w.get(cur[0], cur[1], cur[2])]) s.setBlock(cur[0], cur[1], cur[2], B.AIR);
    s.setBlock(c[0], c[1], c[2], id);
    this.lights = [c];
    this.live.light = [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5];
  }

  /** The echo light keeps a few metres ahead of the explorer along the path, and waits. */
  private runEcho(ev: GameEvent, dt: number, ctx: EventContext): void {
    const path = this.path;
    if (path.length === 0) return this.finish(false);
    // How far along the path the explorer is (the nearest path point).
    let near = 0;
    let nd = Infinity;
    for (let k = 0; k < path.length; k++) {
      const d = Math.hypot(path[k][0] - ctx.x, (path[k][1] - ctx.y) * 1.5, path[k][2] - ctx.z);
      if (d < nd) ((nd = d), (near = k));
    }
    const want = Math.min(path.length - 1, near + EVENTS.echoLead);
    if (this.pathS < want) this.pathS = Math.min(want, this.pathS + EVENTS.echoSpeed * dt);
    const p = path[Math.floor(this.pathS)];
    this.moveLight([Math.floor(p[0]), Math.floor(p[1]) + 1, Math.floor(p[2])], B.LIGHT_EVENT);
    const end = ev.target!;
    if (Math.hypot(end[0] - ctx.x, (end[1] - ctx.y) * 1.5, end[2] - ctx.z) < EVENTS.braziersRange) this.finish(true);
  }

  /** The stones land: a heap of loose stone round the spot (never on the explorer), a knock if still under it. */
  private landRocks(ev: GameEvent, ctx: EventContext): void {
    const g = this.game;
    const s = g.session;
    const w = s.world;
    const at = this.rockAt ?? ev.anchor;
    const hit = Math.hypot(ctx.x - at[0], ctx.z - at[2]) < EVENTS.rockRadius && Math.abs(ctx.y - at[1]) < 2;
    let placed = 0;
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.floor(at[0]) + dx;
        const z = Math.floor(at[2]) + dz;
        if (Math.hypot(x + 0.5 - at[0], z + 0.5 - at[2]) > EVENTS.rockRadius) continue;
        // Never where the explorer stands (or a step from it), never on a prop.
        if (Math.hypot(x + 0.5 - ctx.x, z + 0.5 - ctx.z) < 1.1) continue;
        if ([...s.liveProps.values()].some((p) => Math.abs(p.x - x - 0.5) < 1 && Math.abs(p.z - z - 0.5) < 1 && Math.abs(p.y - at[1]) < 2)) continue;
        let y = Math.floor(at[1]) + 1;
        while (y > at[1] - 2 && !(w.get(x, y, z) === B.AIR && SOLID[w.get(x, y - 1, z)])) y--;
        if (w.get(x, y, z) !== B.AIR || SOLID[w.get(x, y + 1, z)] || SOLID[w.get(x, y + 2, z)] || !SOLID[w.get(x, y - 1, z)]) continue;
        if (!isMinable(w.get(x, y - 1, z), 4) && !SOLID[w.get(x, y - 1, z)]) continue;
        if (this.game.rng.chance(0.45)) continue;
        s.setBlock(x, y, z, B.RUBBLE);
        g.debris.burst(x + 0.5, y + 1.2, z + 0.5, [0x5a5f68, 0x3d424b, 0x777b82], g.rng, { count: 3, speed: 1.2, size: [0.06, 0.14], spread: 0.3, dir: [0, -1, 0], life: [0.6, 1] });
        placed++;
      }
    if (hit) {
      const dealt = g.health.damage(Math.min(EVENTS.rockDamage, Math.max(0, g.health.current - 1)));
      if (dealt > 0) g.bus.emit('player:damaged', { amount: dealt, cause: 'hazard' });
    }
    g.bus.emit('world:rockfall', { x: at[0], y: at[1], z: at[2], hit });
    void placed;
  }
}
