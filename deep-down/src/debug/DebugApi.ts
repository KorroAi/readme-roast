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
    aimAt: (x: number, y: number, z: number) => {
      const cam = game.cameraRig.camera.position;
      const dx = x + 0.5 - cam.x;
      const dy = y + 0.5 - cam.y;
      const dz = z + 0.5 - cam.z;
      game.cameraRig.yaw = Math.atan2(-dx, -dz);
      game.cameraRig.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    give: (item: ItemId, count: number) => game.backpack.add(item, count),
    bank: (item: ItemId, count: number) => {
      const s = game.storage as unknown as { add?: (i: ItemId, n: number) => void };
      s.add?.(item, count);
    },
    block: (x: number, y: number, z: number) => game.session.world.get(x, y, z),
    setBlock: (x: number, y: number, z: number, id: number) => game.session.setBlock(x, y, z, id),
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
    debugLight: (fullbright: number, clipY = 9999) => game.session.rig.uniforms.uDebug.value.set(fullbright, clipY, 0),
    game,
  };
  (window as unknown as { __DD__: typeof api }).__DD__ = api;
}
