import type { Game } from '../game/Game';
import type { ItemId } from '../config/items';
import type { InputState } from '../input/types';

/**
 * window.__DD__: a small, stable surface for automated tests and on-device debugging.
 * Reading state is always safe; the helpers only perform actions a player could also
 * perform (move, look, mine, interact) plus teleport/give for fast test setup.
 */
export function installDebugApi(game: Game): void {
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
    setQuality: (q: 'battery' | 'balanced' | 'high') => game.updateSettings({ quality: q }),
    debugLight: (fullbright: number, clipY = 9999) => game.session.rig.uniforms.uDebug.value.set(fullbright, clipY, 0),
    game,
  };
  (window as unknown as { __DD__: typeof api }).__DD__ = api;
}
