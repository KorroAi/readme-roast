// What a ceremony may touch (the "stage"): the post chain through CameraFx's limiter (dim, iris, shock, bloom pulses,
// flashes), trauma and hit-stops through the budget, the FX canvas, sounds and haptics, a DOM layer of its own in the
// ceremony layer (z 3), the HUD's fade and stamps, and the scene's bursts, impact lights and camera moves. IdleGame
// builds one stage; every ceremony reads it. Motion levels are honoured here and in each ceremony (SPEC §10.13).

import type { HapticKind } from '../../../ui/haptics';
import type { FxCanvas } from '../../../ui/fx/FxCanvas';
import type { StopContext, Tier } from '../juiceBudget';
import type { CeremonyPost } from './Ceremony';

export interface CeremonyHud {
  /** Fade the HUD to `v` (1 = fully shown) except the element named by `keep` ('pick', 'gold', 'depth', '' none). */
  fade(v: number, keep?: string): void;
  /** A big stamp at the world window's centre. */
  stamp(text: string, sub: string, tone: 'amber' | 'rune' | 'white' | 'violet'): void;
  /** Keep the stamp up while a held (frozen) ceremony shows it. */
  holdStamp?(): void;
  announce(text: string): void;
  /** Screen rects of HUD parts ('pick' card, 'gold' socket, 'gems', 'depth', 'rank', 'tab:<id>'). */
  rect(id: string): { x: number; y: number; w: number; h: number } | null;
  /** A "new" dot on a tab. */
  tabDot(id: string, on: boolean): void;
}

export interface CeremonyScene {
  trauma(t: number): void;
  burst(kind: 'dust' | 'chips' | 'sparks' | 'gold' | 'gem' | 'crumble' | 'star', row: number, col: number, n: number): void;
  impactLight(row: number, col: number, radius: number, hex: number, intensity: number, ms: number): void;
  screenOf(row: number, col: number): { x: number; y: number };
  /** The Vista dolly (B; a no-op until it lands). */
  dolly(on: boolean): void;
}

export interface CeremonyStage {
  post: CeremonyPost;
  /** Trauma and hit-stops through the ladder's budget. */
  trauma(add: number, tier: Tier, big?: boolean): void;
  stop(ms: number, tier: Tier, heavy?: boolean): number;
  /** A timed bloom pulse (+strength over ms). */
  bloom(add: number, ms: number): void;
  /** Back to rest: dim 0, iris open, no shock, no held pulse. */
  restPost(): void;
  fx: FxCanvas;
  audio: { play(name: string, params?: { pitch?: number; gain?: number; intensity?: number; count?: number }): void };
  haptics: { play(kind: HapticKind): void };
  /** The ceremony layer (z 3): ceremonies mount their DOM here once. */
  layer: HTMLElement;
  hud: CeremonyHud;
  scene: CeremonyScene;
  motion(): 'full' | 'reduced' | 'off';
  /** The world region and its centre (CSS px). */
  region(): { top: number; bottom: number; left: number; right: number };
  centre(): { x: number; y: number };
  /** The floor's depth now. */
  depth(): number;
  /** Gains held for a chest's open moment fly now from (x, y) (JuiceDirector's hold). */
  releaseHeld(x: number, y: number): void;
  stopCtx(): StopContext;
  /** Text for a key ('' when it has none: the ceremony then leaves that line out). */
  text(key: string, params?: Record<string, string | number>): string;
}

/** A time-ordered tween value: u (0..1) on an ease name, for tracks. */
export function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export function easeOutCubic(u: number): number {
  return 1 - Math.pow(1 - u, 3);
}

export function easeOutExpo(u: number): number {
  return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u);
}
