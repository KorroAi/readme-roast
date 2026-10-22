import type { ScoreDef } from './scores';

/**
 * The cues follow the music's key (round 3, AUDIO). Every reward, quest beat, discovery, pickup,
 * sonar echo and menu chime is written in D major; the scores are in twelve keys and modes. Heard
 * together on a phone, a D-major fanfare over the Mushroom Forest's E lydian waltz clashes. So the
 * AudioSystem transposes these cues (by the oscillators' detune: their contour, rhythm and timbre
 * stay, only the pitch moves) into the major key whose scale holds the score playing now: its
 * relative major for a mode (G mixolydian -> C major, C# aeolian -> E major), the tonic's major for
 * phrygian dominant, and right after a victory the tonic major the victory sting resolved to.
 * Pure, so it is unit tested: every note of a D-major cue lands in the score's scale.
 */

/** Where the mode's tonic sits in its parent major scale (semitones above that major key's tonic). */
const MODE_ROOT: Record<ScoreDef['mode'], number> = {
  ionian: 0,
  dorian: 2,
  phrygian: 4,
  lydian: 5,
  mixolydian: 7,
  aeolian: 9,
  // Not a mode of the major scale: its tonic chord is major, so cues sit on the tonic's major.
  phrygianDominant: 0,
  // The harmonic minor's relative major (its leading tone aside).
  harmonicMinor: 9,
  // No parent major scale: the tonic (the abyss is alien anyway).
  wholeTone: 0,
};

/** The cues' written key (D4). */
export const CUE_KEY = 62;

/** The major key (a MIDI note, any octave) whose scale the score's mode is a mode of. */
export function majorKeyOf(score: Pick<ScoreDef, 'tonic' | 'mode'>): number {
  return score.tonic - MODE_ROOT[score.mode];
}

/** Semitones from the cues' key (D) to `key`, folded into [-6, +5] (the smallest move). */
export function shiftTo(key: number): number {
  if (!Number.isFinite(key)) return 0;
  const d = ((((Math.round(key) - CUE_KEY) % 12) + 12) % 12);
  return d > 5 ? d - 12 : d;
}

/**
 * The cues written in D major (every pitch in the D major scale), which the AudioSystem transposes
 * into the music's key. Noise-only sounds (clicks, whooshes, footsteps), creatures and the dissonant
 * warnings stay where they are; MOBS' guardian fall rings the shard (B, E) and follows the victory's key.
 */
export const KEYED: ReadonlySet<string> = new Set([
  // Rewards, quests, guidance.
  'quest.step', 'quest.done', 'feat.fanfare', 'discovery', 'site.found', 'camp.upgrade', 'world.worksOpened', 'place.outpost',
  'tutorial.step', 'ui.hint', 'guide.way', 'page.read', 'loop.shard', 'loop.unlock', 'loop.order', 'loop.heart', 'loop.gate', 'gem.socket',
  'bestiary.page', 'bestiary.complete', 'travel.whoosh', 'banked', 'craft', 'camp', 'respawned', 'loop.combo',
  // Crafting per station (their completion chimes).
  'craft.workbench', 'craft.furnace', 'craft.forge', 'craft.alchemy', 'craft.hand', 'craft.trader',
  // Pickups and the sonar's echoes.
  'pickup.common', 'pickup.uncommon', 'pickup.rare', 'pickup.relic', 'sonar.pulse', 'sonar.ping', 'sonar.rare', 'sonar.chest', 'sonar.lair', 'sonar.gate',
  // Menus.
  'ui.open', 'ui.close', 'ui.confirm', 'ui.card',
  // The guardian's fall ends on the shard's ring (MOBS' voice): it rings in the victory's key.
  'guardian.fall',
]);
