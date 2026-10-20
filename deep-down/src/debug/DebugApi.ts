import * as THREE from 'three';
import { raycastVoxels } from '../world/raycast';
import type { Game } from '../game/Game';
import type { ItemId } from '../config/items';
import type { InputState } from '../input/types';
import type { GameEvents } from '../core/events';
import { standable } from '../world/analysis/reachability';
import { SOLID } from '../config/blocks';

/**
 * window.__DD__: a small, stable surface for automated tests and on-device debugging.
 * Reading state is always safe; the helpers only perform actions a player could also
 * perform (move, look, mine, interact) plus teleport/give for fast test setup.
 */
export function installDebugApi(game: Game): void {
  // Ring buffer of recent gameplay events for tests ("did the block break?", "how many hits?").
  const events: Array<{ type: string; payload: unknown; t: number }> = [];
  const types: Array<keyof GameEvents> = [
    'block:hit', 'block:broken', 'block:tooHard', 'prop:hit', 'prop:broken', 'item:picked', 'items:banked', 'craft:done',
    'craft:failed', 'discovery', 'player:damaged', 'player:died', 'player:respawned', 'camp:entered', 'camp:left',
    'lantern:low', 'lantern:empty', 'lantern:refueled', 'game:saved', 'game:saveFailed', 'tool:swing',
    // Loop core (W1). Later waves append theirs.
    'expedition:started', 'expedition:ended', 'cache:created', 'cache:recovered', 'lantern:turnBack', 'player:cold', 'record:depth',
    // World variety (W2).
    'world:ride', 'world:runeWake', 'world:runeOpen', 'world:hoistReleased', 'world:note', 'world:monolith', 'world:regrow', 'world:bloom', 'moths:startled',
  ];
  for (const type of types) {
    game.bus.on(type, (payload) => {
      events.push({ type, payload, t: performance.now() });
      if (events.length > 400) events.shift();
    });
  }
  const w = () => game.session.world;

  /** Find a block of `id` near a point that is exposed to air and has a standable cell within reach. */
  const prepareMining = (id: number, nx: number, ny: number, nz: number, radius = 30) => {
    const world = w();
    let best: { block: [number, number, number]; stand: [number, number, number]; d: number } | null = null;
    for (let z = Math.floor(nz - radius); z <= nz + radius; z++)
      for (let y = Math.max(1, Math.floor(ny - radius / 2)); y <= ny + radius / 2; y++)
        for (let x = Math.floor(nx - radius); x <= nx + radius; x++) {
          if (world.get(x, y, z) !== id) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
            for (const dy of [-1, 0, -2]) {
              const sx = x + dx;
              const sy = y + dy;
              const sz = z + dz;
              if (!standable(world, sx, sy, sz)) continue;
              const d = Math.hypot(x - nx, y - ny, z - nz);
              if (!best || d < best.d) best = { block: [x, y, z], stand: [sx, sy, sz], d };
            }
          }
        }
    if (!best) return null;
    const [sx, sy, sz] = best.stand;
    game.player.teleport(sx + 0.5, sy, sz + 0.5);
    game.cameraRig.snapTo(sx + 0.5, sy + 1.45, sz + 0.5);
    // Look from behind the player toward the block, then aim precisely after the camera settles.
    const [bx, , bz] = best.block;
    game.cameraRig.yaw = Math.atan2(-(bx + 0.5 - (sx + 0.5)), -(bz + 0.5 - (sz + 0.5)));
    game.cameraRig.pitch = -0.15;
    return { block: best.block, stand: best.stand };
  };

  const api = {
    get ready() {
      return game.ready;
    },
    version: game.version,
    state: () => game.snapshot(),
    report: () => ({
      fps: game.fps,
      frameMs: game.frameMs,
      render: { ...game.renderer.gl.info.render },
      memory: { ...game.renderer.gl.info.memory },
      chunks: { ...game.session.chunks.stats },
      timings: { ...game.session.timings },
      particles: { debris: game.debris.activeCount, puffs: game.particles.activeCount, drops: game.drops.count },
      quality: game.renderer.quality,
      pixelRatio: game.renderer.pixelRatio,
      // Walk-home field, reach set and cache field: last recompute times (ms) and size.
      loop: game.progression.fieldTimings(),
      // World variety: the moths' step (ms, smoothed), how many fly, and the last regrowth's cost.
      features: game.features.report(),
    }),
    /** Merge into the live InputState (e.g. { moveY: 1 }). */
    input: (patch: Partial<InputState>) => Object.assign(game.input, patch),
    teleport: (x: number, y: number, z: number, yaw?: number) => {
      game.player.teleport(x, y, z, yaw);
      game.cameraRig.snapTo(x, y + 1.45, z);
    },
    look: (yaw: number, pitch: number) => {
      game.cameraRig.yaw = yaw;
      game.cameraRig.pitch = pitch;
    },
    /** Point the camera so the screen center ray passes through the center of block (x,y,z). */
    /**
     * Turn the camera so the ray through screen point (ndcX, ndcY) (default: the crosshair) hits
     * block x,y,z on a face the camera can see. @returns false if no face is visible.
     */
    aimAt: (x: number, y: number, z: number, ndcX = 0, ndcY = 0) => {
      const rig = game.cameraRig;
      const p = game.player;
      const o = new THREE.Vector3();
      const d = new THREE.Vector3();
      const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
      // Hold the aim still until the rig comes to rest (shoulder swap spring, shoulder slide, boom
      // recovery), as it does while a player holds still before mining.
      const prev = new THREE.Vector3();
      const settle = () => {
        for (let i = 0; i < 300; i++) {
          prev.copy(rig.camera.position);
          rig.update(1 / 30, p.x, p.y + 1.45 - p.stepOffset, p.z, rig.camera.aspect);
          if (i > 10 && prev.distanceToSquared(rig.camera.position) < 1e-10) break;
        }
      };
      // The camera orbits a shoulder pivot, so its position depends on the aim: iterate, letting
      // the rig settle between corrections, so the final aim is one the rig keeps.
      const aim = (tx: number, ty: number, tz: number) => {
        for (let round = 0; round < 4; round++) {
          // Damped corrections: the lens moves with the aim (orbit), so full steps can oscillate.
          for (let i = 0; i < 24; i++) {
            rig.update(0.25, p.x, p.y + 1.45 - p.stepOffset, p.z, rig.camera.aspect);
            rig.rayThrough(ndcX, ndcY, o, d);
            const len = Math.hypot(tx - o.x, ty - o.y, tz - o.z);
            const yawErr = wrap(Math.atan2(-(tx - o.x), -(tz - o.z)) - Math.atan2(-d.x, -d.z));
            const pitchErr = Math.asin((ty - o.y) / len) - Math.asin(d.y);
            // Wrap and clamp like the rig's own look input, or off-centre aims can run away.
            rig.yaw = wrap(rig.yaw + yawErr * 0.6);
            rig.pitch = Math.max(-1.2, Math.min(0.85, wrap(rig.pitch + pitchErr * 0.6)));
          }
          settle();
        }
        rig.rayThrough(ndcX, ndcY, o, d);
      };
      const faces: Array<[number, number, number]> = [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
      for (const [fx, fy, fz] of faces) {
        aim(x + 0.5 + fx * 0.45, y + 0.5 + fy * 0.45, z + 0.5 + fz * 0.45);
        const hit = raycastVoxels(w(), o.x, o.y, o.z, d.x, d.y, d.z, 12);
        if (hit && hit.x === x && hit.y === y && hit.z === z) return true;
      }
      aim(x + 0.5, y + 0.5, z + 0.5);
      return false;
    },
    give: (item: ItemId, count: number) => game.backpack.add(item, count),
    bank: (item: ItemId, count: number) => {
      const s = game.storage as unknown as { add?: (i: ItemId, n: number) => void };
      s.add?.(item, count);
    },
    block: (x: number, y: number, z: number) => game.session.world.get(x, y, z),
    /** Changes the voxels (and light) at once; the chunk mesh follows from the mesh workers a
     *  frame or two later (see meshIdle). */
    setBlock: (x: number, y: number, z: number, id: number) => game.session.setBlock(x, y, z, id),
    /** Resolves once every pending chunk mesh is applied: await it before judging the terrain on
     *  screen right after setBlock or mining. */
    meshIdle: () => game.session.chunks.flush(),
    /** Flush, then compare every chunk's GPU data with a fresh main-thread mesh of the world. */
    meshCheck: async () => {
      await game.session.chunks.flush();
      return game.session.chunks.verify();
    },
    landmarks: () => game.session.layout.landmarks,
    interactFocused: () => {
      game.input.interactPressed = true;
    },
    save: () => game.saveNow('debug'),
    discover: (id: string) => game.discover(id),
    events: (type?: string) => (type ? events.filter((e) => e.type === type) : events.slice()),
    clearEvents: () => {
      events.length = 0;
    },
    prepareMining,
    /** Nearest standable cell to a point (searching up/down a few blocks). */
    standableNear: (x: number, y: number, z: number) => {
      for (let r = 0; r <= 4; r++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++)
            for (let dy = -3; dy <= 3; dy++) {
              const xx = Math.floor(x) + dx;
              const yy = Math.floor(y) + dy;
              const zz = Math.floor(z) + dz;
              if (standable(w(), xx, yy, zz)) return [xx + 0.5, yy, zz + 0.5];
            }
      return null;
    },
    isSolid: (x: number, y: number, z: number) => SOLID[w().get(x, y, z)] === 1,
    step: (frames: number, dt = 1 / 30) => {
      for (let i = 0; i < frames; i++) game.step(dt);
    },
    setQuality: (q: 'battery' | 'balanced' | 'high') => game.updateSettings({ quality: q }),
    /** Loop core: the walk-home field, the cache and the expedition (game/Progression). */
    loop: {
      /** Recompute the walking fields now; @returns their timings in ms. */
      recompute: () => {
        game.progression.recomputeFields();
        return game.progression.fieldTimings();
      },
      timings: () => game.progression.fieldTimings(),
      /** Walking steps to camp from a feet position (-1: no walk home from there). */
      homeSteps: (x: number, y: number, z: number) => {
        const f = game.progression.home;
        const c = f ? f.cellNear(x, y, z) : -1;
        return f && c >= 0 ? f.dist[c] : -1;
      },
      /** Is the cell on the walkable set from the camp spawn? */
      reachable: (x: number, y: number, z: number) => game.progression.reach?.has(Math.floor(x), Math.floor(y), Math.floor(z)) ?? false,
      cache: () => (game.progression.cache ? { ...game.progression.cache, items: { ...game.progression.cache.items } } : null),
      report: () => game.progression.report,
      next: () => ({ ...game.progression.nextStep }),
      hud: () => {
        const h = { fuelState: game.progression.fuelState, homeSeconds: game.progression.homeSeconds, walkToCamp: game.progression.walkToCamp, walkToCache: game.progression.walkToCache };
        return h;
      },
    },
    /** World variety (game/WorldFeatures): rides, rune doors, the epoch, the live renewal sites. */
    features: {
      state: () => game.features.debugState(),
      /** Start a ride ('hoist' | 'riftRope', 'up' | 'down'); with t (0..1) it holds there for a capture. */
      ride: (id: string, dir: 'up' | 'down', t?: number) => game.features.debugRide(id, dir, t),
      /** Let a held ride run on to its end. */
      release: () => game.features.debugRelease(),
      openDoor: (id: string) => game.features.openDoor(id),
      wake: (id: string) => game.features.debugWake(id),
      /** Jump to an epoch (re-rolls the living rock and moves the bloom); @returns the regrowth's ms. */
      setEpoch: (n: number) => game.features.debugSetEpoch(n),
      sites: () => game.features.sites(),
      layout: () => game.session.layout.features ?? null,
    },
    /** Fullbright amount and an optional section clip height (compiles the clip into the terrain shader). */
    debugLight: (fullbright: number, clipY = 9999) => {
      game.session.rig.uniforms.uDebug.value.set(fullbright, clipY, 0);
      const m = game.session.terrainMaterial;
      const clip = clipY < 9999;
      if (clip !== ('DEBUG_CLIP' in m.defines)) {
        if (clip) m.defines.DEBUG_CLIP = '';
        else delete m.defines.DEBUG_CLIP;
        m.needsUpdate = true;
      }
    },
    game,
  };
  (window as unknown as { __DD__: typeof api }).__DD__ = api;
}
