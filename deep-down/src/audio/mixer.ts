import type { BusName, SfxName } from './sfx';

/**
 * Mixing rules (round 3, AUDIO): ducking for the cues that matter, and voice budgets per category so
 * a dense fight never mud-piles (eight creatures' voices, the blows, the steps and the beds at once).
 * Pure, so the rules are unit tested; AudioSystem applies them (the duck gains sit after each bus's
 * EQ in graph.ts, the master's limiter after them all).
 */

/** How deep (0..1 gain) and how long (s) a cue ducks the score and the beds. */
export interface DuckSpec {
  music: number;
  ambience: number;
  hold: number;
}

/** Story beats and big moments step the score and the beds back while they speak. */
const STORY: DuckSpec = { music: 0.45, ambience: 0.55, hold: 2.2 };
const BIG: DuckSpec = { music: 0.6, ambience: 0.7, hold: 1.2 };
const BLOW: DuckSpec = { music: 0.78, ambience: 0.8, hold: 0.35 };

export const DUCKS: Partial<Record<SfxName, DuckSpec>> = {
  discovery: { music: 0.4, ambience: 0.5, hold: 3.2 },
  'loop.shard': { ...STORY, hold: 2.6 },
  'loop.gate': { ...STORY, hold: 3.4 },
  // The Heart relit: the score's own 'heartLit' sting carries it, so the music only steps back a little.
  'loop.heart': { music: 0.8, ambience: 0.45, hold: 4.5 },
  'quest.done': STORY,
  'world.descent': { ...STORY, hold: 3 },
  'world.worksOpened': { ...STORY, hold: 3.2 },
  'camp.upgrade': { ...STORY, hold: 2.6 },
  'feat.fanfare': { music: 0.6, ambience: 0.75, hold: 1.4 },
  'site.found': BIG,
  'lair.revealed': BIG,
  'guardian.roar': BIG,
  'guardian.phase': BIG,
  'guardian.fall': { ...STORY, hold: 3 },
  'mob.boom': { ...BLOW, hold: 0.6 },
  'act.bomb': { ...BLOW, hold: 0.6 },
  damaged: BLOW,
  died: { music: 0.3, ambience: 0.5, hold: 3 },
};

/** The duck targets now, from the active ducks (the deepest wins, each until its end). */
export class Ducker {
  private readonly until: Record<BusName, number[]> = { music: [], sfx: [], ambience: [] };
  private readonly depth: Record<BusName, number[]> = { music: [], sfx: [], ambience: [] };

  /** Duck for `spec` from `now` (call when the cue starts). */
  add(spec: DuckSpec, now: number): void {
    this.push('music', spec.music, now + spec.hold);
    this.push('ambience', spec.ambience, now + spec.hold);
  }

  /** The gain each bus should duck to at `now` (1 = no duck). */
  target(bus: BusName, now: number): number {
    const u = this.until[bus];
    const d = this.depth[bus];
    let g = 1;
    let w = 0;
    for (let i = 0; i < u.length; i++) {
      if (u[i] <= now) continue;
      u[w] = u[i];
      d[w] = d[i];
      w++;
      g = Math.min(g, d[i]);
    }
    u.length = w;
    d.length = w;
    return g;
  }

  clear(): void {
    for (const b of ['music', 'sfx', 'ambience'] as const) {
      this.until[b].length = 0;
      this.depth[b].length = 0;
    }
  }

  private push(bus: BusName, depth: number, end: number): void {
    if (depth >= 1) return;
    this.until[bus].push(end);
    this.depth[bus].push(depth);
  }
}

/**
 * A dense fight: the score and the beds ease back as the creatures' voices and the blows pile up
 * (nothing for one, -3 dB on the score and -4 dB on the beds from six on), so every wind-up reads over
 * the music on a phone speaker. `busy`: creature and blow voices sounding now.
 */
export function densityDuck(busy: number): { music: number; ambience: number } {
  const d = Number.isFinite(busy) ? Math.max(0, Math.min(1, (busy - 1) / 5)) : 0;
  return { music: 1 - 0.29 * d, ambience: 1 - 0.37 * d };
}

/** Voice categories with their own caps (inside the global SFX cap). */
export type VoiceCategory = 'step' | 'creature' | 'blow' | 'mining' | 'ambient' | 'ui' | 'pickup' | 'echo' | 'other';

export const CATEGORY_CAP: Record<VoiceCategory, number> = {
  step: 2,
  creature: 7,
  blow: 4,
  mining: 4,
  ambient: 3,
  ui: 3,
  pickup: 3,
  echo: 5,
  other: 6,
};

export function categoryOf(name: string): VoiceCategory {
  if (name.startsWith('step.') || name.startsWith('climb.') || name === 'land' || name === 'jump') return 'step';
  if (name.startsWith('mob.') || name.startsWith('guardian.') || name.startsWith('companion.')) return name.startsWith('mob.hit.') ? 'blow' : 'creature';
  if (name.startsWith('weapon.') || name === 'hit.crit' || name === 'swing' || name === 'damaged' || name === 'act.bomb') return 'blow';
  if (name.startsWith('hit.') || name.startsWith('break.') || name === 'tooHard' || name === 'block.tunk' || name === 'loop.combo') return 'mining';
  if (name.startsWith('amb.')) return 'ambient';
  if (name.startsWith('ui.')) return 'ui';
  if (name.startsWith('pickup.') || name === 'rejected') return 'pickup';
  if (name.startsWith('sonar.') && name !== 'sonar.pulse') return 'echo';
  return 'other';
}
