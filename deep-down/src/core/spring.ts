// Springs (SPEC §10.4): the closed-form step response of a damped harmonic oscillator. JS springs integrate it
// analytically (exact at any dt, no per-frame allocation); `springKeyframes` samples it at 60 Hz into WAAPI
// keyframes, because Chromium 88 has no CSS `linear()` easing. A retriggered spring keeps its value and velocity.

export interface SpringConfig {
  /** Natural angular frequency (rad/s). */
  omega: number;
  /** Damping ratio (< 1 overshoots). */
  zeta: number;
}

/** The named springs of SPEC §10.4. */
export const SPRINGS = {
  snap: { omega: 30, zeta: 0.55 },
  bounce: { omega: 22, zeta: 0.35 },
  jelly: { omega: 34, zeta: 0.28 },
  soft: { omega: 16, zeta: 0.85 },
  kick: { omega: 40, zeta: 0.45 },
  follow: { omega: 9, zeta: 0.7 },
  heavy: { omega: 12, zeta: 0.5 },
} as const satisfies Record<string, SpringConfig>;

export type SpringName = keyof typeof SPRINGS;

/**
 * Advance a displacement `x` (from the target) and its velocity `v` by `dt` seconds, exactly.
 * Writes into `out` ([x, v]) so the hot path allocates nothing.
 */
export function springStep(cfg: SpringConfig, x: number, v: number, dt: number, out: Float64Array | number[]): void {
  const w = cfg.omega;
  const z = cfg.zeta;
  if (dt <= 0) {
    out[0] = x;
    out[1] = v;
    return;
  }
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w * dt);
    const c = Math.cos(wd * dt);
    const s = Math.sin(wd * dt);
    const b = (v + z * w * x) / wd;
    out[0] = e * (x * c + b * s);
    // d/dt of e^(−zwt)(x cos + b sin)
    out[1] = e * ((-z * w) * (x * c + b * s) + (-x * wd * s + b * wd * c));
  } else if (z === 1) {
    const e = Math.exp(-w * dt);
    const b = v + w * x;
    out[0] = e * (x + b * dt);
    out[1] = e * (b - w * (x + b * dt));
  } else {
    const r = w * Math.sqrt(z * z - 1);
    const r1 = -z * w + r;
    const r2 = -z * w - r;
    const c2 = (v - r1 * x) / (r2 - r1);
    const c1 = x - c2;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    out[0] = c1 * e1 + c2 * e2;
    out[1] = c1 * r1 * e1 + c2 * r2 * e2;
  }
}

/** The step response from 0 to 1 at time t (s): 1 − displacement of a unit start at rest. */
export function springResponse(cfg: SpringConfig, t: number): number {
  const out = [0, 0];
  springStep(cfg, -1, 0, t, out);
  return 1 + out[0];
}

/** Overshoot (fraction above 1), the time of the peak (s) and the 2 % settle time (s) of a unit step. */
export function springStats(cfg: SpringConfig): { overshoot: number; peak: number; settle: number } {
  let peakV = -Infinity;
  let peakT = 0;
  let settle = 0;
  for (let ms = 1; ms <= 5000; ms++) {
    const t = ms / 1000;
    const y = springResponse(cfg, t);
    if (y > peakV) {
      peakV = y;
      peakT = t;
    }
    if (Math.abs(y - 1) > 0.02) settle = t;
  }
  return { overshoot: Math.max(0, peakV - 1), peak: peakT, settle };
}

/**
 * Sampled values from `from` to `to` at `fps` until the 2 % settle (at least 2 samples), for WAAPI
 * keyframes. @returns the values and the duration in ms.
 */
export function springSamples(name: SpringName | SpringConfig, from: number, to: number, fps = 60): { values: number[]; duration: number } {
  const cfg = typeof name === 'string' ? SPRINGS[name] : name;
  const settle = Math.max(1 / fps, springStats(cfg).settle);
  const n = Math.max(2, Math.ceil(settle * fps) + 1);
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(settle, i / fps);
    values.push(from + (to - from) * springResponse(cfg, t));
  }
  values[n - 1] = to;
  return { values, duration: Math.round(settle * 1000) };
}

/** A JS spring toward a target. Retargeting keeps the current value and velocity. */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private readonly tmp = new Float64Array(2);

  constructor(public cfg: SpringConfig = SPRINGS.snap, value = 0) {
    this.value = value;
    this.target = value;
  }

  /** Jump to a value at rest. */
  set(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  /** Add an instantaneous velocity (a kick). */
  impulse(v: number): void {
    this.velocity += v;
  }

  step(dt: number): number {
    springStep(this.cfg, this.value - this.target, this.velocity, dt, this.tmp);
    this.value = this.target + this.tmp[0];
    this.velocity = this.tmp[1];
    if (Math.abs(this.value - this.target) < 1e-5 && Math.abs(this.velocity) < 1e-4) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }

  get atRest(): boolean {
    return this.value === this.target && this.velocity === 0;
  }
}
