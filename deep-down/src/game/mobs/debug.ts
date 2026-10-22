import { debugMutationsAllowed } from '../../debug/DebugApi';
import { SOLID } from '../../config/blocks';
import { raycastVoxels } from '../../world/raycast';
import type { Game } from '../Game';
import type { MobDirector } from './MobDirector';
import type { SimMob } from './MobSim';
import type { MobAffix, MobBiome, MobKind } from './types';
import { rollAffixes } from './elites';
import { openGuard } from './guardian';
import { ROSTERS } from './rosters';
import { ALL_KINDS, SPECIES } from './species';
import { EYE_HEIGHT } from '../fp/constants';

/**
 * window.__DD__.mobs: the creatures for tests and captures (round 2, MOBS). Reading is always
 * allowed; spawning and striking only under automation or ?debug=1 (like the rest of __DD__).
 */
export function installMobDebug(game: Game, mobs: MobDirector): void {
  const w = window as unknown as { __DD__?: Record<string, unknown> };
  if (!w.__DD__) return;
  const allowed = debugMutationsAllowed();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gate = <F extends (...a: any[]) => unknown>(fn: F, none: ReturnType<F>): F => (allowed ? fn : ((() => none) as unknown as F));
  const view = (m: SimMob) => ({
    id: m.id,
    kind: m.kind,
    family: m.family,
    state: m.state,
    hp: m.hp ?? null,
    x: m.position.x,
    y: m.position.y,
    z: m.position.z,
    foot: { ...m.foot },
    radius: m.bounds.radius,
    halfHeight: m.bounds.halfHeight,
    scale: m.scale,
    tappable: m.tappable,
    rarity: m.rarity ?? null,
    crystals: m.crystals,
    open: m.open,
    fade: m.fade,
    brain: m.brain,
    biome: m.biome,
    rank: m.rank,
    mode: m.mode,
    phase: m.phase,
    pattern: m.pattern,
    scanned: m.scanned,
    marker: m.marker,
    affixes: [...m.affixes],
    elite: m.elite,
    tame: m.tame,
    power: m.power,
    maxHp: m.maxHp ?? null,
  });
  // A ring buffer of the creatures' and the weapons' events (tests: "was it caught?"), and a count of
  // each type that is never cut (a long guardian fight outlasts the ring: its sounds alone are many).
  const log: Array<{ type: string; payload: unknown }> = [];
  const counts: Record<string, number> = {};
  const types = ['mob:spawned', 'mob:telegraph', 'mob:attack', 'mob:hit', 'mob:died', 'mob:interact', 'mob:cue', 'mob:shot', 'mob:met', 'mob:sfx', 'mob:guardianAwake', 'mob:guardianPhase', 'mob:guardianReset', 'mob:guardianDefeated', 'mob:guardianOpen', 'mob:elite', 'mob:scanned', 'mob:bestiary', 'companion:trust', 'companion:tamed', 'companion:fed', 'companion:level', 'companion:ore', 'companion:zap', 'weapon:swing', 'weapon:hit', 'weapon:flash', 'player:damaged', 'player:died', 'player:respawned', 'cache:created', 'cache:recovered', 'item:picked'] as const;
  const bus = game.bus as unknown as { on(type: string, fn: (payload: unknown) => void): () => void };
  for (const type of types) {
    bus.on(type, (payload: unknown) => {
      counts[type] = (counts[type] ?? 0) + 1;
      log.push({ type, payload });
      if (log.length > 3000) log.shift();
    });
  }
  const byId = (id: number) => mobs.sim.mobs.find((m) => m.id === id) ?? null;
  /** A point `dist` m ahead of the explorer along the view, on the floor or in the air there. */
  const ahead = (dist: number, up = 0) => {
    const cam = game.cameraRig.camera;
    const yaw = game.cameraRig.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const p = game.player;
    void cam;
    return { x: p.x + fx * dist, y: p.y + up, z: p.z + fz * dist };
  };
  w.__DD__.mobs = {
    list: () => mobs.sim.mobs.map(view),
    events: (type?: string) => (type ? log.filter((e) => e.type === type) : log.slice()),
    /** How many of each type since the last clearEvents (never cut, unlike the ring). */
    counts: () => ({ ...counts }),
    clearEvents: () => {
      log.length = 0;
      for (const k of Object.keys(counts)) delete counts[k];
    },
    /** The tame Lampling's light for VIS (null without one). */
    companionLight: () => {
      const l = mobs.companionLight();
      return l ? { ...l } : null;
    },
    get: (id: number) => {
      const m = byId(id);
      return m ? view(m) : null;
    },
    dim: () => mobs.sim.dim,
    // ---- Round 3
    kinds: () => [...ALL_KINDS],
    roster: (b: MobBiome) => {
      const r = ROSTERS[b];
      return r ? { monsters: r.monsters.map((e) => e.kind), beings: r.beings.map((e) => e.kind), guardian: r.guardian, stratum: r.stratum } : null;
    },
    species: (k: MobKind) => {
      const d = SPECIES[k];
      return d ? { kind: k, brain: d.brain, archetype: d.archetype, biome: d.biome, rank: d.rank, hp: d.hp, damage: d.damage, locomotion: d.locomotion, lift: d.lift, radius: d.radius, height: d.height } : null;
    },
    /** Tame a Lampling at once (captures, tests): the companion, at this much experience. */
    tame: gate((id: number, xp = 0) => {
      const m = byId(id);
      if (!m || m.kind !== 'lampling') return false;
      mobs.tameNow(m, xp);
      return true;
    }, false),
    companion: () => mobs.companion(),
    /** Make a creature an elite (tests, captures): these affixes, or rolled ones. */
    elite: gate((id: number, affixes?: MobAffix[]) => {
      const m = byId(id);
      if (!m) return null;
      mobs.sim.makeElite(m, affixes ?? rollAffixes(mobs.sim.rng, 4, m.kind));
      return [...m.affixes];
    }, null),
    /** Spawn as if in a biome (null: WORLD's map, or the first world's rules). */
    biome: gate((b: MobBiome | null) => {
      mobs.sim.forceBiome = b;
      return b;
    }, null),
    guardian: () => mobs.activeGuardian(),
    guardians: () => mobs.guardians(),
    beaten: () => mobs.guardiansBeaten(),
    markers: () => mobs.sim.markers.map((k) => ({ id: k.id, kind: k.kind, x: k.x, y: k.y, z: k.z, r: k.r, progress: k.progress, owner: k.owner })),
    spits: () => mobs.sim.spits.filter((s) => s.done < 0).length,
    bestiary: () => {
      const v = mobs.bestiaryView();
      return { found: v.found, total: v.total, complete: mobs.bestiary.known() };
    },
    scan: gate((radius = 20) => {
      const e = game.cameraRig.camera.position;
      return mobs.scan(e.x, e.y, e.z, radius);
    }, 0),
    blast: gate((radius: number, dmg: number, dist = 3) => {
      const p = ahead(dist, 0.5);
      return mobs.blast(p.x, p.y, p.z, radius, dmg);
    }, 0),
    drawStats: () => ({ drawn: mobs.renderer.drawnCount, calls: mobs.renderer.drawCalls, alive: mobs.sim.mobs.length }),
    night: () => mobs.night,
    /** Hurt nothing (captures: the creatures may strike, the explorer is not hurt). */
    harmless: gate((on: boolean) => {
      (mobs as unknown as { harmless: boolean }).harmless = on;
      return on;
    }, false),
    /** Captures: a row of creatures in front of the camera (frozen), spaced by their size. @returns their ids. */
    lineup: gate((kinds: MobKind[], dist = 5, spread = 0) => {
      const ids: number[] = [];
      const yaw = game.cameraRig.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const widths = kinds.map((k) => Math.max(0.6, SPECIES[k].radius * 2.4));
      const total = widths.reduce((a, b) => a + b, 0) + spread * (kinds.length - 1);
      let off = -total / 2;
      const world = game.session.world;
      const solid = (x: number, y: number, z: number) => SOLID[world.get(x, y, z)] === 1;
      kinds.forEach((k, i) => {
        const w = widths[i];
        const c = off + w / 2;
        off += w + spread;
        const d = SPECIES[k];
        const x = game.player.x + fx * (dist + d.radius) + rx * c;
        const z = game.player.z + fz * (dist + d.radius) + rz * c;
        let y = Math.floor(game.player.y);
        for (let dy = 3; dy >= -4; dy--) {
          const yy = Math.floor(game.player.y) + dy;
          if (!solid(Math.floor(x), yy, Math.floor(z)) && solid(Math.floor(x), yy - 1, Math.floor(z))) {
            y = yy;
            break;
          }
        }
        const up = d.locomotion === 'fly' ? Math.max(1.2, d.lift) + ((d as { hover?: number }).hover ?? 0) * 0.3 : 0;
        const m = mobs.spawnAt(k, x, y + up, z, { asleep: false });
        if (m) {
          m.fade = 1;
          m.yaw = Math.atan2(game.player.x - m.position.x, game.player.z - m.position.z);
          ids.push(m.id);
        }
      });
      mobs.sim.brains = false;
      return ids;
    }, [] as number[]),
    boost: () => mobs.sim.boost,
    monsterDepth: () => mobs.sim.monsterDepth,
    sentinelSites: () => mobs.sim.sentinelSites.map((s) => ({ ...s })),
    /** Stop (or restart) the spawner; tests place what they need by hand. */
    auto: gate((on: boolean) => {
      mobs.autoSpawn = on;
      return on;
    }, false),
    clear: gate(() => mobs.clear(), undefined),
    /** Hold every creature still (captures); they keep breathing. */
    freeze: gate((on: boolean) => {
      mobs.sim.brains = !on;
      return on;
    }, false),
    spawn: gate((kind: MobKind, x: number, y: number, z: number, opts: { treasure?: boolean; asleep?: boolean } = {}) => {
      const m = mobs.spawnAt(kind, x, y, z, opts);
      return m ? m.id : null;
    }, null),
    /** Spawn `dist` m ahead (walkers on the floor found from there, fliers `up` m above the feet). */
    spawnAhead: gate((kind: MobKind, dist: number, up = 0, opts: { treasure?: boolean; asleep?: boolean } = {}) => {
      const p = ahead(dist, up);
      const m = mobs.spawnAt(kind, p.x, p.y, p.z, opts);
      return m ? m.id : null;
    }, null),
    hit: gate((id: number, dmg: number, light = false) => {
      const m = byId(id);
      return m ? mobs.hit(m, dmg, { light }) : null;
    }, null),
    fireAt: gate((id: number, dmg: number) => {
      const m = byId(id);
      const e = game.cameraRig.camera.position;
      mobs.fire({ x: e.x, y: e.y - 0.15, z: e.z }, m, dmg);
      return !!m;
    }, false),
    flash: gate((radius: number, dmg: number) => {
      const e = game.cameraRig.camera.position;
      return mobs.flash(e.x, e.y, e.z, radius, dmg);
    }, 0),
    wake: gate((relic: string) => mobs.sim.wakeSentinel(relic), false),
    /** Captures: show a creature's wind-up tell now (its glint), as a telegraph would. */
    tell: gate((id: number) => {
      const m = byId(id);
      if (m) mobs.renderer.tell(m);
      return !!m;
    }, false),
    /** Captures and tests: open a guardian's guard for `seconds` (its told window), as after an attack. */
    open: gate((id: number, seconds = 2) => {
      const m = byId(id);
      if (!m || !m.guardian) return false;
      openGuard(mobs.sim, m, seconds);
      return true;
    }, false),
    /** Captures: a guardian's phase-turn ring of light rolling out from it (harmless). */
    ring: gate((id: number) => {
      const m = byId(id);
      if (!m || !m.guardian) return false;
      const fy = m.def.locomotion === 'fly' ? mobs.sim.floorY(m.position.x, m.position.y, m.position.z) : m.foot.y;
      mobs.sim.addRing(m, m.position.x, fy, m.position.z, 16, 13);
      return true;
    }, false),
    /** Captures: set a guardian's phase (the Dark Heart's look follows it). */
    phase: gate((id: number, n: number) => {
      const m = byId(id);
      if (!m || !m.guardian) return false;
      m.phase = Math.max(1, Math.min(3, Math.round(n)));
      return true;
    }, false),
    /** Force a mob's state (tests: skip the wait for a random wind-up). */
    setState: gate((id: number, s: SimMob['state']) => {
      const m = byId(id);
      if (m) m.setState(s);
      return !!m;
    }, false),
    /** Set a creature's animation (captures: an open jaw, a raised fist) . */
    setAnim: gate((id: number, a: { open?: number; strike?: number; alert?: number; glow?: number; speed?: number; face?: boolean }) => {
      const m = byId(id);
      if (!m) return false;
      if (a.face) m.yaw = Math.atan2(game.player.x - m.position.x, game.player.z - m.position.z);
      m.fade = 1;
      if (a.open !== undefined) m.open = a.open;
      if (a.strike !== undefined) m.strike = a.strike;
      if (a.alert !== undefined) m.alert = a.alert;
      if (a.glow !== undefined) m.glow = a.glow;
      if (a.speed !== undefined) m.speedNow = a.speed;
      return true;
    }, false),
    /** Turn the view so the screen centre looks at a point (the eye stays where it is). */
    lookAt: (x: number, y: number, z: number, ndcY = 0) => {
      const rig = game.cameraRig;
      const p = game.player;
      for (let i = 0; i < 40; i++) {
        rig.update(1 / 30, p.x, p.y + EYE_HEIGHT - p.stepOffset, p.z, rig.camera.aspect);
        const e = rig.camera.position;
        const dx = x - e.x;
        const dy = y - e.y;
        const dz = z - e.z;
        const len = Math.max(1e-3, Math.hypot(dx, dy, dz));
        rig.yaw = Math.atan2(-dx, -dz);
        rig.pitch = Math.max(-1.3, Math.min(1.3, Math.asin(dy / len) - ndcY * 0.5));
      }
      return true;
    },
    /** Move a mob (tests: place it where the shot must go). */
    place: gate((id: number, x: number, y: number, z: number) => {
      const m = byId(id);
      if (!m) return false;
      m.position.set(x, y, z);
      m.foot.x = x;
      m.foot.z = z;
      return true;
    }, false),
    /** The pick ray through a screen point (CSS px), as FP's tap resolution uses it. */
    pickAt: (sx: number, sy: number) => {
      const cam = game.cameraRig.camera;
      const ndc = { x: (sx / innerWidth) * 2 - 1, y: 1 - (sy / innerHeight) * 2 };
      cam.updateMatrixWorld();
      const o = cam.position.clone();
      const d = cam.position.clone().set(ndc.x, ndc.y, 0.5).unproject(cam).sub(o).normalize();
      const m = mobs.pick({ ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z, maxDist: 30, slack: 0.3 });
      return m ? m.id : null;
    },
    /** The farthest open line of sight from the eye (a vista for the Deep Worm): a point `at` m along it. */
    vista: (at = 26) => {
      const e = game.cameraRig.camera.position;
      const world = game.session.world;
      let best: [number, number, number] | null = null;
      let bestD = 0;
      for (let i = 0; i < 48; i++) {
        const yaw = (i / 48) * Math.PI * 2;
        for (const pitch of [-0.25, -0.1, 0.05]) {
          const dx = Math.sin(yaw) * Math.cos(pitch);
          const dy = Math.sin(pitch);
          const dz = Math.cos(yaw) * Math.cos(pitch);
          const hit = raycastVoxels(world, e.x, e.y, e.z, dx, dy, dz, 80);
          const d = hit ? hit.distance : 80;
          if (d > bestD) {
            bestD = d;
            const k = Math.min(at, d * 0.7);
            best = [e.x + dx * k, e.y + dy * k, e.z + dz * k];
          }
        }
      }
      return best ? { point: best, free: bestD } : null;
    },
    /** Open floor ahead for a walker: the first standable cell along the view, 2-12 m out. */
    floorAhead: (minD = 3, maxD = 10) => {
      const world = game.session.world;
      const solid = (x: number, y: number, z: number) => SOLID[world.get(x, y, z)] === 1;
      for (let d = minD; d <= maxD; d += 0.5) {
        const p = ahead(d);
        const x = Math.floor(p.x);
        const z = Math.floor(p.z);
        for (let dy = 2; dy >= -3; dy--) {
          const y = Math.floor(game.player.y) + dy;
          // (Never under a lake's water: it would hide the creature.)
          if (!solid(x, y, z) && !solid(x, y + 1, z) && solid(x, y - 1, z)) return mobs.sim.submerged(x, y, z) ? null : [x + 0.5, y, z + 0.5];
        }
      }
      return null;
    },
    /** Whether a point lies under a lake's water (as the spawner sees it). */
    underwater: (x: number, y: number, z: number) => mobs.sim.submerged(x, y, z),
    /**
     * For captures and tests: when the explorer stands in water, in a cramped spot or in a guardian's
     * lair (WORLD's goto can land in one: its sleeper fills the view), move to the nearest dry, open
     * floor of the same biome within `radius` m, out of every lair (every cell of the 5×5 round it
     * standable, none under water). @returns where, or null (already fine, or none found).
     */
    dryGround: gate((radius = 48) => {
      const world = game.session.world;
      const sim = mobs.sim;
      const solid = (x: number, y: number, z: number) => SOLID[world.get(x, y, z)] === 1;
      const stand = (x: number, y: number, z: number) => !solid(x, y, z) && !solid(x, y + 1, z) && !solid(x, y + 2, z) && solid(x, y - 1, z) && !sim.submerged(x, y, z);
      const inLair = (x: number, y: number, z: number) => sim.lairs.some((l) => Math.hypot(x + 0.5 - l.x, z + 0.5 - l.z) < l.radius + 6 && Math.abs(y - l.y) < 12);
      const px = Math.floor(game.player.x);
      const py = Math.floor(game.player.y);
      const pz = Math.floor(game.player.z);
      const biome = sim.env.biomeAt?.(px + 0.5, py + 0.5, pz + 0.5) ?? null;
      const fine = (x: number, y: number, z: number) => {
        if (inLair(x, y, z)) return false;
        if (biome && sim.env.biomeAt?.(x + 0.5, y + 0.5, z + 0.5) !== biome) return false;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!stand(x + dx, y, z + dz)) return false;
        return true;
      };
      if (fine(px, py, pz)) return null;
      for (let r = 1; r <= radius; r++)
        for (let k = 0; k < r * 8; k++) {
          const a = (k / (r * 8)) * Math.PI * 2;
          const x = px + Math.round(Math.sin(a) * r);
          const z = pz + Math.round(Math.cos(a) * r);
          for (let dy = 0; dy <= 8; dy++) {
            const y = py + (dy % 2 ? -(dy + 1) / 2 : dy / 2);
            if (fine(x, y, z)) {
              game.player.teleport(x + 0.5, y, z + 0.5, game.cameraRig.yaw);
              game.cameraRig.snapTo(x + 0.5, y + EYE_HEIGHT, z + 0.5);
              return [x + 0.5, y, z + 0.5] as [number, number, number];
            }
          }
        }
      return null;
    }, null as [number, number, number] | null),
    /**
     * For captures: a stage for a line-up. The nearest spot (within `radius` m, same biome, out of every
     * lair) with a heading (8 tried) whose floor is dry, open and nearly flat over a band `width` m
     * wide from `near` to `far` m ahead; the explorer moves there facing along it.
     * @returns [x, y, z, yaw] or null (none found: the explorer stays).
     */
    stage: gate((width = 7, near = 3, far = 9, radius = 40) => {
      const world = game.session.world;
      const sim = mobs.sim;
      const solid = (x: number, y: number, z: number) => SOLID[world.get(x, y, z)] === 1;
      const px = Math.floor(game.player.x);
      const py = Math.floor(game.player.y);
      const pz = Math.floor(game.player.z);
      const biome = sim.env.biomeAt?.(px + 0.5, py + 0.5, pz + 0.5) ?? null;
      const inLair = (x: number, y: number, z: number) => sim.lairs.some((l) => Math.hypot(x + 0.5 - l.x, z + 0.5 - l.z) < l.radius + 6 && Math.abs(y - l.y) < 12);
      /** The feet height of a dry standing cell in column (x, z) near y0, or null. */
      const floorAt = (x: number, z: number, y0: number): number | null => {
        for (const dy of [0, 1, -1]) {
          const y = y0 + dy;
          if (!solid(x, y, z) && !solid(x, y + 1, z) && !solid(x, y + 2, z) && solid(x, y - 1, z)) return sim.submerged(x, y, z) ? null : y;
        }
        return null;
      };
      const band = (x: number, y: number, z: number, yaw: number): boolean => {
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        for (let d = near; d <= far; d += 1)
          for (let w = -width / 2; w <= width / 2; w += 1) {
            const cx = Math.floor(x + 0.5 + fx * d + rx * w);
            const cz = Math.floor(z + 0.5 + fz * d + rz * w);
            const cy = floorAt(cx, cz, y);
            if (cy === null || inLair(cx, cy, cz)) return false;
          }
        return true;
      };
      for (let r = 0; r <= radius; r += 2)
        for (let k = 0; k < Math.max(1, r * 4); k++) {
          const a = (k / Math.max(1, r * 4)) * Math.PI * 2;
          const x = px + Math.round(Math.sin(a) * r);
          const z = pz + Math.round(Math.cos(a) * r);
          for (let dy = 0; dy <= 8; dy++) {
            const y0 = py + (dy % 2 ? -(dy + 1) / 2 : dy / 2);
            const y = floorAt(x, z, y0);
            if (y === null || y !== y0 || inLair(x, y, z)) continue;
            if (biome && sim.env.biomeAt?.(x + 0.5, y + 0.5, z + 0.5) !== biome) continue;
            for (let h = 0; h < 8; h++) {
              const yaw = game.cameraRig.yaw + (h * Math.PI) / 4;
              if (!band(x, y, z, yaw)) continue;
              game.player.teleport(x + 0.5, y, z + 0.5, yaw);
              game.cameraRig.snapTo(x + 0.5, y + EYE_HEIGHT, z + 0.5);
              game.cameraRig.yaw = yaw;
              game.cameraRig.pitch = -0.1;
              return [x + 0.5, y, z + 0.5, yaw] as [number, number, number, number];
            }
            break;
          }
        }
      return null;
    }, null as [number, number, number, number] | null),
  };
}
