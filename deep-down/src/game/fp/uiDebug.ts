/**
 * Round 3 (UI): `window.__DD__.ui`, the action layout's test and capture surface. It records the
 * round 3 bus events (the controls, the tutorial, crafting, quests, strata) in a ring buffer, and
 * reads what the HUD shows (the reticle, the hotbar, cooldowns, the tracker, the guardian bar, the
 * tutorial step) and where each control sits on screen (`[data-ui-target]`). Reading is always
 * safe; nothing here changes the game (tests drive it with real touches).
 */
import * as THREE from 'three';
import type { GameEvents } from '../../core/events';
import { raycastVoxels } from '../../world/raycast';
import type { Game } from '../Game';
import './events';
import '../craft/types';
import '../quests/types';
import '../mobs/types';

/** The round 3 events recorded for tests. */
export const UI_EVENT_TYPES: ReadonlyArray<keyof GameEvents> = [
  'ui:used', 'ui:opened', 'player:dash', 'player:sonar', 'player:placed', 'player:travelled', 'player:jump',
  'hotbar:selected', 'mine:combo', 'tutorial:step', 'craft:made', 'item:used', 'gear:equipped', 'station:placed',
  'quest:step', 'quest:done', 'quest:shard', 'guide:arrival', 'guide:hint', 'feat:earned', 'reward:paid',
  'world:stratum', 'world:biome', 'world:gateOpened', 'world:lairRevealed',
  'mob:guardianAwake', 'mob:guardianDefeated', 'mob:hit', 'weapon:swing', 'weapon:hit', 'weapon:flash',
  'block:broken', 'item:picked', 'player:damaged', 'player:died', 'player:respawned',
];

export interface UiDebug {
  events(type?: string): Array<{ type: string; payload: unknown; t: number }>;
  clear(): void;
  /** What the HUD shows now (a copy of the round 3 fields). */
  hud(): Record<string, unknown>;
  /** The screen rect of a control (CSS px), or null when it is not shown. */
  rect(target: string): { x: number; y: number; w: number; h: number } | null;
  /** The control the tutorial rings now (its data-ui-target), or null. */
  ringed(): string | null;
  /**
   * The first solid cell on the camera's ray through a screen point (NDC, the centre by default),
   * within `max` metres: what a tap there or the reticle meets first ([x, y, z, block]), or null.
   */
  ray(ndcX?: number, ndcY?: number, max?: number): [number, number, number, number] | null;
}

export function installUiDebug(game: Game): UiDebug {
  const log: Array<{ type: string; payload: unknown; t: number }> = [];
  for (const type of UI_EVENT_TYPES) {
    game.bus.on(type, (payload: unknown) => {
      log.push({ type, payload, t: performance.now() });
      if (log.length > 3000) log.shift();
    });
  }
  const api: UiDebug = {
    events: (type) => (type ? log.filter((e) => e.type === type) : log.slice()),
    clear: () => {
      log.length = 0;
    },
    hud: () => {
      const h = (game as unknown as { hud: Record<string, unknown> }).hud;
      const pick = ['biomeName', 'stratum', 'depth', 'reticle', 'reticleProgress', 'tracker', 'objectiveArrow', 'guardian', 'hotbar', 'hotbarSelected', 'canPlace', 'dashCooldown', 'sonarCooldown', 'interact', 'sprinting', 'tutorial', 'hazard', 'companion', 'health', 'maxHealth', 'lantern'];
      const out: Record<string, unknown> = {};
      for (const k of pick) out[k] = JSON.parse(JSON.stringify(h[k] ?? null));
      return out;
    },
    rect: (target) => {
      const list = document.querySelectorAll<HTMLElement>(`[data-ui-target="${CSS.escape(target)}"]`);
      for (const el of list) {
        if (el.hidden || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
      }
      return null;
    },
    ringed: () => {
      const tut = document.querySelector('.dd-tut');
      if (!tut?.classList.contains('on')) return null;
      return document.querySelector('.dd-tut-on')?.getAttribute('data-ui-target') ?? null;
    },
    ray: (ndcX = 0, ndcY = 0, max = 12) => {
      const cam = game.cameraRig.camera;
      cam.updateMatrixWorld();
      const o = cam.getWorldPosition(new THREE.Vector3());
      const d = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(o).normalize();
      const hit = raycastVoxels(game.session.world, o.x, o.y, o.z, d.x, d.y, d.z, max);
      return hit ? [hit.x, hit.y, hit.z, hit.block] : null;
    },
  };
  const w = window as unknown as { __DD__?: Record<string, unknown> };
  if (w.__DD__) w.__DD__.ui = api;
  return api;
}
