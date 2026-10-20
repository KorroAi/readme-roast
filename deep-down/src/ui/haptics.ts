// Haptics (SPEC §10.11): short vibrations for the moments a thumb should feel. navigator.vibrate exists on Android
// browsers and the WebView shell (iOS has none, so it is simply absent). A limiter keeps the phone from turning
// into a buzzer: ≤ 20 calls a second, ≤ 40 % duty over any 1 s, a minimum gap per pattern, and a priority
// order (a biome reveal beats a tap). JuiceDirector calls `play(kind)`; the gate is the setting, a touch as the
// last input, the page visible and play mode.

export const HAPTIC_PATTERNS = {
  tap: [10],
  break: [18],
  ore: [22],
  crit: [14],
  row: [16],
  gem: [10, 30, 18],
  purchase: [8],
  ready: [6],
  star: [20, 30, 30],
  crown: [20, 40, 20, 40, 60],
  pickTier: [40, 30, 60],
  chestStep: [12],
  chestOpen: [16],
  chestBig: [40, 30, 60],
  seal: [40, 60, 40, 60, 120],
  biome: [50, 40, 80],
  surge: [20, 30, 20, 30, 40],
  dynamite: [30, 20, 40],
  combo: [12],
  plungeLand: [30, 30, 60],
  rekindle: [60, 40, 120],
  feast: [20, 40, 20, 40, 40],
  no: [14],
  ui: [6],
  // Wave 2 (SPEC §10.3, §10.11)
  rank: [16, 40, 24],
  feat: [12, 40, 18],
  gate: [20, 40, 30],
  event: [12, 40, 12],
  creature: [16],
  sealHit: [8],
  weak: [14, 20, 14],
  strike: [22],
  perfect: [30, 30, 50],
  facet: [12],
  skill: [24],
  cataclysm: [40, 30, 60],
  catch: [12],
} as const satisfies Record<string, readonly number[]>;

export type HapticKind = keyof typeof HAPTIC_PATTERNS;

/** Minimum gap between two plays of one pattern (ms). */
const MIN_GAP: Partial<Record<HapticKind, number>> = { tap: 60, break: 70, ore: 90, crit: 120, row: 150, gem: 200, purchase: 80, star: 200, ready: 400, ui: 60, no: 120, sealHit: 70, catch: 80, creature: 120 };

/** Priority (higher wins a contested window): biome > seal > chest > crit > row > break > tap. */
const PRIORITY: Record<HapticKind, number> = {
  biome: 9, rekindle: 9, seal: 8, plungeLand: 7, chestBig: 7, chestOpen: 6, chestStep: 6, pickTier: 7, crown: 6, star: 5, surge: 5, dynamite: 5, feast: 5,
  crit: 4, gem: 4, ore: 3, row: 3, combo: 3, break: 2, purchase: 2, ready: 1, no: 1, ui: 1, tap: 0,
  rank: 5, feat: 5, gate: 6, event: 5, creature: 3, sealHit: 2, weak: 6, strike: 5, perfect: 7, facet: 2, skill: 5, cataclysm: 8, catch: 4,
};

export type HapticStrength = 'off' | 'light' | 'normal' | 'strong';
export const STRENGTH: Record<HapticStrength, number> = { off: 0, light: 0.7, normal: 1, strong: 1.4 };

/** Limits over any 1 s window. */
export const HAPTIC_LIMITS = { callsPerSecond: 20, duty: 0.4 } as const;

/**
 * Scale a pattern by strength: on-pulses (even indexes) ×k, raised to 10 ms (shorter pulses are not felt on ERM
 * motors); gaps unchanged. Writes into `out`.
 */
export function scalePattern(p: readonly number[], k: number, out: number[]): number[] {
  out.length = 0;
  for (let i = 0; i < p.length; i++) out.push(i % 2 === 0 ? Math.max(10, Math.round(p[i] * k)) : p[i]);
  return out;
}

/** Total on-time of a pattern (ms). */
export function onTime(p: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 2) s += p[i];
  return s;
}

export class Haptics {
  private readonly last = new Map<HapticKind, number>();
  /** Recent calls: time, on-ms and priority (the 1 s window). */
  private readonly window: Array<{ t: number; on: number; pri: number }> = [];
  private readonly buf: number[] = [];
  strength: HapticStrength = 'normal';
  /** Calls made since creation (tests, F9). */
  calls = 0;

  constructor(
    /** Vibration is wanted right now (the setting, a touch as the last input, page visible, play mode). */
    private readonly enabled: () => boolean,
    private readonly vibrate: ((p: number[]) => boolean) | null = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? (p) => navigator.vibrate(p) : null,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** @returns true when a vibration was requested. */
  play(kind: HapticKind): boolean {
    if (!this.vibrate || this.strength === 'off' || !this.enabled()) return false;
    const t = this.now();
    const gap = MIN_GAP[kind] ?? 0;
    const prev = this.last.get(kind);
    if (prev !== undefined && t - prev < gap) return false;
    while (this.window.length && t - this.window[0].t >= 1000) this.window.shift();
    const pattern = scalePattern(HAPTIC_PATTERNS[kind], STRENGTH[this.strength], this.buf);
    const on = onTime(pattern);
    const pri = PRIORITY[kind];
    let used = 0;
    for (const w of this.window) used += w.on;
    // Hard limits: never more than 20 calls or 40 % on-time in any second.
    if (this.window.length >= HAPTIC_LIMITS.callsPerSecond || used + on > HAPTIC_LIMITS.duty * 1000) return false;
    // Headroom for what matters: past 70 % of either budget, only priority ≥ 3 (row and up) still plays.
    if (pri < 3 && (this.window.length >= HAPTIC_LIMITS.callsPerSecond * 0.7 || used + on > HAPTIC_LIMITS.duty * 700)) return false;
    this.last.set(kind, t);
    this.window.push({ t, on, pri });
    this.calls++;
    try {
      return this.vibrate(pattern.slice());
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.window.length = 0;
  }
}
