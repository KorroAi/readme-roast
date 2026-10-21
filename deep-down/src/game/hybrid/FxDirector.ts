// The FX director (SPEC §8.7–§8.8, BUILD §3.4 MUST 6): every visual cue asks here first, and a cue over budget is refused
// (counted, never queued). The budgets are hard caps:
//   beat:     ≤ 3 foreground moving groups, ≤ 2 ambient, ≤ 80 live particles (High ×1.5, Battery ×0.5) over ≤ 6 % of the
//             screen, ≤ 1 floating number, ≤ 1 UI loop; no camera motion, no hit-stop, local flashes only;
//   ceremony: one at a time (L9), its own ≤ 3 groups, 0–1 ambient, ≤ 120 particles over ≤ 12 %; one 0.4° / 120 ms
//             shake for a seal, Dynamite or a vault door only; a 50–70 ms hit-stop for a seal or a vault only.
// Taps are T1 at most (the tool, the crack, chips, sound, haptic), breaks T2, T3+ only for a chest, a seal or a reveal.
// The live counts come from DepthScene.stats().fx (the renderer's truth) merged with the cues granted here, so a group
// the scene is still animating is never granted twice.

import type { QualityLevel } from '../../render/Renderer';

export type CueGroup = 'fg' | 'ambient' | 'number' | 'loop' | 'none';
/** T0 nothing moves … T5 a biome reveal (SPEC §8.7 tiers, as the cue table uses them). */
export type CueTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface CueSpec {
  group: CueGroup;
  tier: CueTier;
  /** Particles the cue spawns and the screen area they cover (fraction). */
  particles: number;
  area: number;
  /** How long its group stays live (ms). */
  ms: number;
}

/** Every visual cue of W1 and its cost. A new cue must name the group it takes (SPEC §8.7). */
export const CUES: Readonly<Record<string, CueSpec>> = {
  // Strikes (T1): chips at the struck point, the tool's contact pose (the tool is its own fg group).
  'strike.chips': { group: 'fg', tier: 1, particles: 4, area: 0.003, ms: 400 },
  'strike.tunk': { group: 'fg', tier: 1, particles: 2, area: 0.001, ms: 300 },
  'tool.swing': { group: 'fg', tier: 1, particles: 0, area: 0, ms: 220 },
  // Breaks (T2): 6–9 lit shards, ore nuggets rolling into the pool, a loot stream to the gold plate.
  'break.shards': { group: 'fg', tier: 2, particles: 9, area: 0.02, ms: 600 },
  'loot.stream': { group: 'fg', tier: 2, particles: 3, area: 0.004, ms: 550 },
  'slice.crumble': { group: 'fg', tier: 2, particles: 16, area: 0.04, ms: 600 },
  'skin.break': { group: 'fg', tier: 2, particles: 7, area: 0.015, ms: 600 },
  'lamp.relight': { group: 'fg', tier: 2, particles: 0, area: 0, ms: 400 },
  'walk.marker': { group: 'fg', tier: 1, particles: 0, area: 0.002, ms: 400 },
  'lantern.raise': { group: 'fg', tier: 1, particles: 0, area: 0, ms: 1600 },
  'secret.open': { group: 'fg', tier: 2, particles: 12, area: 0.03, ms: 700 },
  'glint.mine': { group: 'fg', tier: 2, particles: 6, area: 0.01, ms: 500 },
  // Ambient (≤ 2): the crew on its shared bar or a cart; the motes or the chamber's one slow wonder animation.
  'crew.bar': { group: 'ambient', tier: 0, particles: 0, area: 0, ms: 1000 },
  'ambient.motes': { group: 'ambient', tier: 0, particles: 12, area: 0.01, ms: 1000 },
  // Numbers and loops.
  'works.haul': { group: 'number', tier: 1, particles: 0, area: 0, ms: 1200 },
  'card.ping': { group: 'loop', tier: 1, particles: 0, area: 0, ms: 600 },
  // Ceremony cues (granted inside a ceremony only).
  'breakthrough.wall': { group: 'fg', tier: 3, particles: 16, area: 0.08, ms: 1200 },
  'chest.open': { group: 'fg', tier: 3, particles: 10, area: 0.03, ms: 1200 },
  'dynamite.blast': { group: 'fg', tier: 3, particles: 40, area: 0.1, ms: 1200 },
  'seal.split': { group: 'fg', tier: 4, particles: 60, area: 0.12, ms: 1200 },
  'reveal.title': { group: 'fg', tier: 5, particles: 0, area: 0, ms: 1600 },
};

/** Ceremonies (SPEC §8.7) and their maximum lengths (ms). Every one is skippable. */
export const CEREMONIES: Readonly<Record<string, number>> = {
  breakthrough: 1200,
  firstLight: 1200,
  chest: 1200,
  relic: 1500,
  star: 600,
  toolForm: 1200,
  seal: 1200,
  reveal: 3000,
  return: 3000,
  dynamite: 1500,
};

/** The beat's caps and the ceremony's (SPEC §8.7). */
export const BUDGET = {
  beat: { fg: 3, ambient: 2, particles: 80, area: 0.06, number: 1, loop: 1 },
  ceremony: { fg: 3, ambient: 1, particles: 120, area: 0.12, number: 1, loop: 0 },
  /** Preset multipliers on the particle cap. */
  preset: { battery: 0.5, balanced: 1, high: 1.5 } as Record<QualityLevel, number>,
  /** The only shakes and hit-stops, by cause. */
  shake: { deg: 0.4, ms: 120 },
  shakeCauses: ['seal', 'dynamite', 'vault'] as const,
  hitStopCauses: ['seal', 'vault'] as const,
  hitStopMs: { min: 50, max: 70 },
} as const;

export type ShakeCause = (typeof BUDGET.shakeCauses)[number] | 'strike' | 'break' | 'breakthrough' | 'crew' | 'other';

interface Live {
  name: string;
  group: CueGroup;
  particles: number;
  area: number;
  until: number;
}

/** What the scene reports each frame (DepthScene.stats().fx). */
export interface SceneFx {
  fg: number;
  ambient: number;
  particles: number;
  shards: number;
  area: number;
}

export interface FxDirectorOpts {
  preset: () => QualityLevel;
  motion: () => 'full' | 'reduced' | 'off';
  /** The camera-shake setting 0..1. */
  shake: () => number;
}

export class FxDirector {
  private readonly live: Live[] = [];
  private scene: SceneFx = { fg: 0, ambient: 0, particles: 0, shards: 0, area: 0 };
  private now = 0;
  private stopUntil = 0;
  private cer: { id: string; t0: number; ms: number; skipped: boolean } | null = null;
  private readonly cerQueue: Array<{ id: string; ms: number; start?: () => void }> = [];
  /** Every ceremony played, with its length (ms) and whether a tap skipped it (U-FX3, the debug surface). */
  readonly played: Array<{ id: string; ms: number; skipped: boolean }> = [];
  /** Shakes allowed, with cause and size (U-FX2). */
  readonly shakes: Array<{ cause: string; deg: number; ms: number }> = [];
  /** Cues refused over budget, by name. */
  readonly refused: Record<string, number> = {};
  /** The peaks seen (U-FX1). */
  readonly peak = { fg: 0, ambient: 0, particles: 0, area: 0, number: 0, loop: 0 };

  constructor(private readonly opts: FxDirectorOpts) {}

  /** Once a frame: drop expired groups, take the scene's live counts, end a ceremony that ran its length. */
  frame(now: number, scene?: SceneFx | null): void {
    this.now = now;
    for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i].until <= now) this.live.splice(i, 1);
    if (scene) this.scene = { ...scene };
    if (this.cer && now - this.cer.t0 >= this.cer.ms) this.endCeremony(false);
    const c = this.counts();
    for (const k of ['fg', 'ambient', 'particles', 'area', 'number', 'loop'] as const) this.peak[k] = Math.max(this.peak[k], c[k]);
  }

  /** The live counts: granted cues merged with the scene's own (the larger of the two per group). */
  counts(withCeremony = true): { fg: number; ambient: number; particles: number; area: number; number: number; loop: number; shards: number } {
    let fg = 0;
    let ambient = 0;
    let particles = 0;
    let area = 0;
    let number = 0;
    let loop = 0;
    for (const l of this.live) {
      if (!withCeremony && (CUES[l.name]?.tier ?? 0) >= 3) continue;
      if (l.group === 'fg') fg++;
      else if (l.group === 'ambient') ambient++;
      else if (l.group === 'number') number++;
      else if (l.group === 'loop') loop++;
      particles += l.particles;
      area += l.area;
    }
    return {
      fg: Math.max(fg, this.scene.fg),
      ambient: Math.max(ambient, this.scene.ambient),
      particles: Math.max(particles, this.scene.particles),
      area: Math.max(area, this.scene.area),
      number,
      loop,
      shards: this.scene.shards,
    };
  }

  /** The caps in force now (a ceremony's while one runs; the preset scales particles). */
  caps(): { fg: number; ambient: number; particles: number; area: number; number: number; loop: number } {
    const b = this.cer ? BUDGET.ceremony : BUDGET.beat;
    const k = BUDGET.preset[this.opts.preset()] ?? 1;
    return { ...b, particles: Math.floor(b.particles * k) };
  }

  /**
   * Ask for a cue. Granted when its group has room and its particles and area fit; a ceremony cue (tier ≥ 3) only inside
   * the ceremony that owns it. A refused cue is counted and never queued. `scale` shrinks a cue's particles (a crit's
   * extra chips, the Battery preset) before the check.
   */
  request(name: string, scale = 1): boolean {
    const spec = CUES[name];
    if (!spec) return this.refuse(name);
    const ceremonyCue = spec.tier >= 3;
    if (ceremonyCue && !this.cer) return this.refuse(name);
    const parts = Math.round(spec.particles * scale * (BUDGET.preset[this.opts.preset()] ?? 1));
    // Every cue fits the caps in force (a ceremony's while one runs); a beat cue also fits the beat's caps on its own,
    // so the ceremony's extra room is the ceremony's alone and nothing is over the beat's caps when it ends.
    const total = this.counts();
    const cap = this.caps();
    if (!this.fits(spec, parts, total, cap, name)) return this.refuse(name);
    if (!ceremonyCue && this.cer) {
      const beat = this.counts(false);
      const k = BUDGET.preset[this.opts.preset()] ?? 1;
      const bcap = { ...BUDGET.beat, ambient: BUDGET.ceremony.ambient, particles: Math.floor(BUDGET.beat.particles * k) };
      if (!this.fits(spec, parts, beat, bcap, name)) return this.refuse(name);
    }
    const same = spec.group === 'fg' ? this.live.find((l) => l.name === name && l.group === 'fg') : undefined;
    if (same && total.fg >= cap.fg) {
      // The same cue already live (a burst of chips) merges into it instead of taking a new group.
      same.until = Math.max(same.until, this.now + spec.ms);
      same.particles += parts;
      return true;
    }
    this.live.push({ name, group: spec.group, particles: parts, area: spec.area, until: this.now + spec.ms });
    return true;
  }

  private fits(spec: CueSpec, parts: number, c: ReturnType<FxDirector['counts']>, cap: ReturnType<FxDirector['caps']>, name: string): boolean {
    if (spec.group === 'fg' && c.fg >= cap.fg && !this.live.some((l) => l.name === name && l.group === 'fg')) return false;
    if (spec.group === 'ambient' && c.ambient >= cap.ambient) return false;
    if (spec.group === 'number' && c.number >= cap.number) return false;
    if (spec.group === 'loop' && c.loop >= cap.loop) return false;
    if (c.particles + parts > cap.particles) return false;
    if (c.area + spec.area > cap.area + 1e-9) return false;
    return true;
  }

  private refuse(name: string): false {
    this.refused[name] = (this.refused[name] ?? 0) + 1;
    return false;
  }

  /**
   * A camera shake. Allowed only for a seal, Dynamite or a vault door, at ≤ 0.4° and ≤ 120 ms, scaled by the shake
   * setting; never under reduced motion (U-FX2). @returns the shake to play, or null.
   */
  shake(cause: ShakeCause, deg: number = BUDGET.shake.deg, ms: number = BUDGET.shake.ms): { deg: number; ms: number } | null {
    if (!(BUDGET.shakeCauses as readonly string[]).includes(cause)) return null;
    if (this.opts.motion() !== 'full') return null;
    const k = Math.max(0, Math.min(1, this.opts.shake()));
    const d = Math.min(BUDGET.shake.deg, deg) * k;
    if (d <= 0) return null;
    const out = { deg: d, ms: Math.min(BUDGET.shake.ms, ms) };
    this.shakes.push({ cause, ...out });
    return out;
  }

  /** A hit-stop (a seal or a vault only, 50–70 ms): the FX clock stops; the model and the camera never do. */
  hitStop(cause: ShakeCause, ms = 60): number {
    if (!(BUDGET.hitStopCauses as readonly string[]).includes(cause)) return 0;
    const d = Math.max(BUDGET.hitStopMs.min, Math.min(BUDGET.hitStopMs.max, ms));
    this.stopUntil = Math.max(this.stopUntil, this.now + d);
    return d;
  }

  /** How many ambient groups may animate now (the scene holds the rest still). */
  ambientAllowed(): number {
    return this.cer ? BUDGET.ceremony.ambient : BUDGET.beat.ambient;
  }

  /** The FX clock's dt (0 during a hit-stop). */
  fxDt(dt: number): number {
    return this.now < this.stopUntil ? 0 : dt;
  }

  // ----- ceremonies (L9: one at a time, ≤ their length, skippable) --------------------------------------------------

  /** The running ceremony's id ('' none). */
  get ceremony(): string {
    return this.cer?.id ?? '';
  }

  /** ms left in the running ceremony (0 none). */
  get ceremonyLeft(): number {
    return this.cer ? Math.max(0, this.cer.ms - (this.now - this.cer.t0)) : 0;
  }

  /**
   * Start a ceremony now, or queue it behind the running one (`start` runs when it begins). Its length is capped at
   * §8.7's. @returns true when it started now.
   */
  ceremonyStart(id: string, ms?: number, start?: () => void): boolean {
    const cap = CEREMONIES[id] ?? 1200;
    const len = Math.min(cap, ms ?? cap);
    if (this.cer) {
      if (this.cerQueue.length < 4) this.cerQueue.push({ id, ms: len, start });
      return false;
    }
    this.cer = { id, t0: this.now, ms: len, skipped: false };
    // A ceremony keeps at most one ambient group (SPEC §8.7): the others pause (the scene reads ambientAllowed()).
    let amb = 0;
    for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i].group === 'ambient' && ++amb > BUDGET.ceremony.ambient) this.live.splice(i, 1);
    start?.();
    return true;
  }

  /** End the running ceremony (a tap skips it, L9). @returns whether one was running. */
  skipCeremony(): boolean {
    if (!this.cer) return false;
    this.endCeremony(true);
    return true;
  }

  private endCeremony(skipped: boolean): void {
    const c = this.cer;
    if (!c) return;
    this.played.push({ id: c.id, ms: Math.round(Math.min(c.ms, this.now - c.t0)), skipped });
    if (this.played.length > 64) this.played.shift();
    this.cer = null;
    // Ceremony cues end with it.
    for (let i = this.live.length - 1; i >= 0; i--) if ((CUES[this.live[i].name]?.tier ?? 0) >= 3) this.live.splice(i, 1);
    const next = this.cerQueue.shift();
    if (next) this.ceremonyStart(next.id, next.ms, next.start);
  }

  reset(): void {
    this.live.length = 0;
    this.cer = null;
    this.cerQueue.length = 0;
    this.stopUntil = 0;
  }
}
