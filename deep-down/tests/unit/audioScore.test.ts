import { describe, expect, it } from 'vitest';
import { integratedLoudness, maxMomentaryLoudness, phoneFilter } from '../../src/audio/analysis';
import { CALIBRATION, TIMBRE_NAMES } from '../../src/audio/instruments';
import { renderSfxOfflineChannels } from '../../src/audio/offline';
import { installSimAudio } from '../../src/audio/sim/webAudioSim';
import { INTENSITY, IntensityTracker, MIXES } from '../../src/audio/intensity';
import { TIMBRES } from '../../src/audio/instruments';
import { MUSIC_VOICES, musicPriority } from '../../src/audio/MusicPlayer';
import { CALM_MIX, MusicScheduler, type LayerMix, type MusicNote } from '../../src/audio/MusicScheduler';
import { SCORES, SCORE_IDS, isGuardianScore, type ScoreId } from '../../src/audio/scores';
import { CALM, renderMusicScene } from '../../src/audio/sim/scenes';
import { degreeToMidi, inMode } from '../../src/audio/theory';
import { VoiceLimiter } from '../../src/audio/voices';

// The score's direction (round 3, AUDIO): the intensity's hysteresis, the fights' stabs and phases,
// the Dark Heart's last phase, the calm movements' shape, the crossfades, polyphony.

const FIGHT: LayerMix = { bed: 0.7, motif: 0.85, tension: 0.75, combat: 1 };
const GUARDIANS: ScoreId[] = ['guardian1', 'guardian2', 'guardian3', 'guardian4', 'guardian5', 'guardian6', 'heartBoss'];

interface Got {
  note: MusicNote;
  at: number;
}

/** Drive a scheduler with a 60 fps clock; `hook(t)` runs before each frame (phases, snapshots). */
function run(s: MusicScheduler, from: number, to: number, mix: (t: number) => LayerMix = () => CALM_MIX, hook?: (t: number) => void): Got[] {
  const out: MusicNote[] = [];
  const got: Got[] = [];
  for (let t = from; t < to; t += 1 / 60) {
    hook?.(t);
    const n = s.advance(t, t + 0.35, mix(t), out);
    for (let i = 0; i < n; i++) got.push({ note: out[i], at: t });
  }
  return got;
}

describe('IntensityTracker (the danger and the blows choose the layers)', () => {
  const step = (t: IntensityTracker, seconds: number, danger: number, each?: (time: number) => void) => {
    for (let i = 0; i < Math.round(seconds * 15); i++) {
      t.update(1 / 15, danger);
      each?.(i / 15);
    }
  };

  it('turns tense within a second of monsters near, and not for a passing glimpse', () => {
    const t = new IntensityTracker();
    step(t, 4, 0);
    expect(t.state).toBe('calm');
    // A glimpse: half a second of danger, then nothing (the smoothed danger never reaches the threshold).
    step(t, 0.3, 0.6);
    step(t, 3, 0);
    expect(t.state).toBe('calm');
    let at = -1;
    step(t, 3, 0.6, (time) => {
      if (at < 0 && t.state === 'tension') at = time;
    });
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(1.2);
  });

  it('holds tension through a dip, steps down only after its minimum stay and below the low threshold', () => {
    const t = new IntensityTracker();
    step(t, 3, 0.6);
    expect(t.state).toBe('tension');
    // Between the thresholds: still tense, however long.
    step(t, 10, 0.2);
    expect(t.state).toBe('tension');
    // Gone: calm once the danger has ebbed below the low threshold (3 s time constant).
    let calmAt = -1;
    step(t, 15, 0, (time) => {
      if (calmAt < 0 && t.state === 'calm') calmAt = time;
    });
    expect(calmAt).toBeGreaterThan(1);
    expect(calmAt).toBeLessThan(6);
    // A monster that came and went at once: tension holds its minimum stay all the same.
    const u = new IntensityTracker();
    let tenseAt = -1;
    step(u, 1.5, 0.7, (time) => {
      if (tenseAt < 0 && u.state === 'tension') tenseAt = time;
    });
    let back = -1;
    step(u, 20, 0, (time) => {
      if (back < 0 && u.state === 'calm') back = time + 1.5;
    });
    expect(back - tenseAt).toBeGreaterThanOrEqual(INTENSITY.minTension - 0.1);
  });

  it('fights on blows, keeps the fight at least its minimum, then goes through tension when monsters linger', () => {
    const t = new IntensityTracker();
    t.impulse('telegraph');
    t.impulse('hurt');
    step(t, 1 / 15, 0);
    expect(t.state).toBe('combat');
    // One more blow two seconds in; then nothing but monsters still near.
    step(t, 2, 0.4);
    t.impulse('hit');
    let left = -1;
    step(t, 30, 0.4, (time) => {
      if (left < 0 && t.state !== 'combat') left = time;
    });
    expect(left).toBeGreaterThanOrEqual(INTENSITY.minCombat - 2.1);
    expect(t.state).toBe('tension');
  });

  it('never flickers at a threshold (danger wobbling round it changes the state once at most)', () => {
    const t = new IntensityTracker();
    let changes = 0;
    let last = t.state;
    for (let i = 0; i < 15 * 60; i++) {
      t.update(1 / 15, 0.3 + 0.06 * Math.sin(i / 5));
      if (t.state !== last) {
        changes++;
        last = t.state;
      }
    }
    expect(changes).toBeLessThanOrEqual(1);
  });

  it('ignores non-finite input and lets the tension layer follow the danger', () => {
    const t = new IntensityTracker();
    t.update(Number.NaN, Number.POSITIVE_INFINITY);
    t.impulse('hit', Number.NaN);
    expect(Number.isFinite(t.danger) && Number.isFinite(t.heat)).toBe(true);
    step(t, 3, 0.35);
    const low = t.layerMix().tension;
    step(t, 3, 0.9);
    const high = t.layerMix().tension;
    expect(high).toBeGreaterThan(low);
    expect(MIXES.combat.combat).toBe(1);
    expect(MIXES.calm.tension + MIXES.calm.combat).toBe(0);
  });
});

describe('the fights in the score', () => {
  it('stabs chords in a fight for the scores that have them (the deeper strata and the guardians), never while calm', () => {
    for (const id of SCORE_IDS) {
      const s = SCORES[id];
      const got = run(new MusicScheduler(id, 5), 0, 50, (t) => (t < 20 ? CALM_MIX : FIGHT));
      const stabs = got.filter((g) => g.note.layer === 'combat' && s.combat.stab && g.note.voice === s.combat.stab && TIMBRES[g.note.voice].family !== 'drum');
      if (!s.combat.stab) continue;
      expect(stabs.some((g) => g.note.time < 20), id).toBe(false);
      expect(stabs.length, id).toBeGreaterThan(6);
      for (const g of stabs) {
        expect(g.note.midi, id).toBeGreaterThanOrEqual(52);
        expect(g.note.midi, id).toBeLessThanOrEqual(76);
        if (s.mode !== 'wholeTone') expect(inMode(g.note.midi, s.tonic, s.mode), `${id} ${g.note.midi}`).toBe(true);
      }
    }
    // The first strata stay lighter: no stabs.
    for (const id of ['amberHollows', 'mushroomForest', 'rootGalleries', 'floodedGrottoes', 'crystalGeode', 'haldenMines'] as const) expect(SCORES[id].combat.stab, id).toBeUndefined();
  });

  it('swells low under the tension in the deeper strata (root and fifth, sustained), never while calm', () => {
    let withSwell = 0;
    for (const id of SCORE_IDS) {
      const s = SCORES[id];
      if (!s.tension.swell) continue;
      withSwell++;
      const sched = new MusicScheduler(id, 6);
      const got = run(sched, 0, 60, (t) => (t < 20 ? CALM_MIX : { bed: 0.8, motif: 0.5, tension: 1, combat: 0 }));
      const swell = got.filter((g) => g.note.layer === 'tension' && g.note.voice === s.tension.swell);
      expect(swell.some((g) => g.note.time < 20), id).toBe(false);
      expect(swell.length, id).toBeGreaterThanOrEqual(6);
      for (const g of swell) {
        expect(g.note.midi, id).toBeGreaterThanOrEqual(45);
        expect(g.note.midi, id).toBeLessThanOrEqual(60);
        expect(g.note.duration, id).toBeGreaterThan(sched.barDur);
        if (s.mode !== 'wholeTone') expect(inMode(g.note.midi, s.tonic, s.mode), `${id} ${g.note.midi}`).toBe(true);
      }
    }
    expect(withSwell).toBe(7);
    for (const id of ['amberHollows', 'mushroomForest', 'rootGalleries', 'floodedGrottoes', 'crystalGeode'] as const) expect(SCORES[id].tension.swell, id).toBeUndefined();
  });

  it("tightens a guardian's fight from its second phase: its own skins, a busier bass, a stab every bar", () => {
    for (const id of GUARDIANS) {
      const def = SCORES[id];
      expect(def.phase2, id).toBeDefined();
      const s = new MusicScheduler(id, 7);
      const got = run(s, 0, 64, () => FIGHT, (t) => {
        if (t >= 32 && s.phase === 1) s.setPhase(2);
      });
      const skins = new Set(def.phase2!.drums.map((p) => `${p.timbre}@${p.midi ?? 48}`));
      const base = new Set(def.combat.drums.map((p) => `${p.timbre}@${p.midi ?? 48}`));
      const extra = (g: Got) => g.note.layer === 'combat' && skins.has(`${g.note.voice}@${g.note.midi}`) && !base.has(`${g.note.voice}@${g.note.midi}`);
      expect(got.filter((g) => g.note.time < 32 && extra(g)).length, id).toBe(0);
      expect(got.filter((g) => g.note.time > 33 && extra(g)).length, id).toBeGreaterThan(8);
      const stabs = (a: number, b: number) => got.filter((g) => g.note.voice === 'brass' && g.note.layer === 'combat' && g.note.time >= a && g.note.time < b).length;
      expect(stabs(36, 60), id).toBeGreaterThan(stabs(6, 30) * 1.5);
    }
  });

  it("sings the game's theme above the guardian motif in the Dark Heart's last phase, and only then", () => {
    const def = SCORES.heartBoss;
    const s = new MusicScheduler('heartBoss', 3);
    const got = run(s, 0, 96, () => FIGHT, (t) => {
      if (t >= 32 && s.phase === 1) s.setPhase(2, 3);
      if (t >= 64 && s.phase === 2) s.setPhase(3, 3);
    });
    const theme = got.filter((g) => g.note.layer === 'motif' && g.note.voice === def.finale!.voice && g.note.prio === 3);
    expect(theme.some((g) => g.note.time < 64)).toBe(false);
    expect(theme.length).toBeGreaterThanOrEqual(def.finale!.theme.length * 4);
    // The theme's contour (its degrees) over the guardian's motif, in the score's mode, above the brass.
    const first = theme.slice(0, def.finale!.theme.length).map((g) => g.note.midi);
    const base = def.tonic + 12 * ((def.leadOctave ?? 0) + def.finale!.octave);
    const expected = def.finale!.theme.map((m) => {
      let midi = degreeToMidi(base, def.mode, m.d);
      while (midi > 88) midi -= 12;
      while (midi < 55) midi += 12;
      return midi;
    });
    expect(first).toEqual(expected);
    const brass = got.filter((g) => g.note.layer === 'motif' && g.note.voice === def.lead && g.note.time > 64);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(theme.map((g) => g.note.midi))).toBeGreaterThan(mean(brass.map((g) => g.note.midi)));
    // A sung theme note outranks the counter-lines and the drums.
    expect(musicPriority(theme[0].note, def.lead)).toBe(3);
    // The other guardians have no finale.
    for (const id of GUARDIANS.slice(0, 6)) expect(SCORES[id].finale, id).toBeUndefined();
  });
});

describe('calm movements', () => {
  it('shape each movement: a swell and an easing back, home to the tonic before each breather, the bed alone after it', () => {
    for (const id of ['amberHollows', 'frostCaverns', 'sunkenCity'] as const) {
      const def = SCORES[id];
      const s = new MusicScheduler(id, 4);
      const snaps: Array<{ t: number; dyn: number; chord: number; resting: boolean }> = [];
      const got = run(s, 0, 1200, () => CALM_MIX, (t) => snaps.push({ t, dyn: s.dynamics, chord: s.chordDegree, resting: t < s.restingUntil }));
      // The arc stays between its floor and full.
      for (const x of snaps) {
        expect(x.dyn, id).toBeGreaterThanOrEqual(0.84 - 1e-9);
        expect(x.dyn, id).toBeLessThanOrEqual(1 + 1e-9);
      }
      // Breathers: where resting begins and ends.
      const starts: number[] = [];
      const ends: number[] = [];
      for (let i = 1; i < snaps.length; i++) {
        if (snaps[i].resting && !snaps[i - 1].resting) starts.push(i);
        if (!snaps[i].resting && snaps[i - 1].resting) ends.push(i);
      }
      expect(starts.length, id).toBeGreaterThanOrEqual(3);
      for (const i of starts) {
        // The chord the movement ended on is the tonic (the coda's cadence).
        const before = snaps[Math.max(0, i - Math.round(60 * s.barDur * 0.5))];
        expect(before.chord, `${id} at ${before.t.toFixed(1)}`).toBe(def.progression[0]);
      }
      // Each movement swells: its loudest moment is louder than how it started and how it ended.
      for (let k = 1; k < starts.length; k++) {
        const a = ends[k - 1];
        const b = starts[k];
        if (a === undefined || b === undefined || b <= a) continue;
        const seg = snaps.slice(a, b).map((x) => x.dyn);
        const peak = Math.max(...seg);
        expect(peak - seg[seg.length - 1], id).toBeGreaterThan(0.08);
        expect(peak - seg[2], id).toBeGreaterThan(0.03);
      }
      // After a breather: the bed returns first, the lead only two bars later.
      for (const i of ends) {
        const t0 = snaps[i].t;
        const firstBed = got.find((g) => g.note.layer === 'bed' && g.note.time >= t0 - 0.5);
        const firstLead = got.find((g) => g.note.layer === 'motif' && g.note.voice === def.lead && g.note.time >= t0 - 0.5);
        if (!firstBed || !firstLead) continue;
        expect(firstLead.note.time - firstBed.note.time, id).toBeGreaterThan(s.barDur * 1.9);
      }
    }
  });
});

describe('crossfades', () => {
  it('crossfades between biomes with no hole and no burst: two decks while the old one fades, then one', () => {
    const r = renderMusicScene('amberHollows', [
      { name: 'amber', seconds: 14, mix: CALM },
      { name: 'mushroom', seconds: 24, mix: CALM, score: 'mushroomForest' },
    ], { sampleRate: 8000 });
    expect(r.maxDecks).toBe(2);
    expect(r.finalDecks).toBe(1);
    expect(r.whole.nonFinite).toBe(0);
    expect(r.whole.clipped).toBe(0);
    // Loudness in 1 s windows from 3 s before the switch to 8 s after it: never a hole, never a burst.
    const [l, rr] = r.channels;
    const sr = r.sampleRate;
    const at = 14 * sr;
    const window = (s: number) => integratedLoudness([l.subarray(at + s * sr, at + (s + 1) * sr), rr.subarray(at + s * sr, at + (s + 1) * sr)], sr);
    const before = [-3, -2, -1].map(window).filter(Number.isFinite);
    const across = [0, 1, 2, 3, 4, 5, 6, 7].map(window);
    const ref = Math.max(...before);
    for (const v of across) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(ref - 18);
      expect(v).toBeLessThan(ref + 6);
    }
  });

  it("starts no note on a fading deck (two keys never begin notes together)", () => {
    let atSwitch: Array<{ id: string; fading: boolean; started: number }> = [];
    let atEnd: Array<{ id: string; fading: boolean; started: number }> = [];
    renderMusicScene('crystalGeode', [
      { name: 'geode', seconds: 10, mix: CALM },
      { name: 'mines', seconds: 8, mix: CALM, score: 'haldenMines', enter: (_now, player) => {
        atSwitch = player.deckInfo();
      } },
      { name: 'after', seconds: 0.1, mix: CALM, enter: (_now, player) => {
        atEnd = player.deckInfo();
      } },
    ], { sampleRate: 8000 });
    const oldAt = atSwitch.find((d) => d.id === 'crystalGeode');
    const oldEnd = atEnd.find((d) => d.id === 'crystalGeode');
    expect(oldAt?.fading).toBe(true);
    expect(oldAt!.started).toBeGreaterThan(8);
    expect(oldEnd?.started).toBe(oldAt!.started);
    expect(atEnd.find((d) => d.id === 'haldenMines')!.started).toBeGreaterThan(10);
  });
});

describe('music polyphony with the fights\' new layers', () => {
  it('never steals a held chord, the lead, or the Dark Heart\'s sung theme (only drums, counters, stabs and tails)', () => {
    let heldStolen = 0;
    let bed = 0;
    let leadStolen = 0;
    let lead = 0;
    let themeStolen = 0;
    let theme = 0;
    let t = 0;
    for (const [id, phase] of [['guardian6', 2], ['heartBoss', 3], ['magmaVeins', 1], ['sunkenCity', 1]] as const) {
      const scheduler = new MusicScheduler(id, 3);
      scheduler.setPhase(phase, isGuardianScore(id) && id === 'heartBoss' ? 3 : 2);
      const voices = new VoiceLimiter<MusicNote>(MUSIC_VOICES, (n) => {
        const held = n.time + n.duration > t;
        if (!held) return;
        if (n.layer === 'bed') heldStolen++;
        if (n.layer === 'motif' && n.voice === scheduler.score.lead) leadStolen++;
        if (n.prio === 3 && n.layer === 'motif') themeStolen++;
      });
      const out: MusicNote[] = [];
      for (t = 0; t < 240; t += 1 / 30) {
        const n = scheduler.advance(t, t + 0.35, FIGHT, out);
        for (let i = 0; i < n; i++) {
          const note = out[i];
          const priority = musicPriority(note, scheduler.score.lead);
          if (note.layer === 'bed') bed++;
          if (note.layer === 'motif' && note.voice === scheduler.score.lead) lead++;
          if (note.prio === 3) theme++;
          if (!voices.admit(t, priority)) continue;
          voices.add(note, note.time, note.time + note.duration + TIMBRES[note.voice].tail, priority);
          expect(voices.size).toBeLessThanOrEqual(MUSIC_VOICES);
        }
      }
    }
    expect(bed).toBeGreaterThan(50);
    expect(lead).toBeGreaterThan(100);
    expect(theme).toBeGreaterThan(50);
    expect(heldStolen / bed).toBeLessThan(0.02);
    expect(leadStolen / lead).toBeLessThan(0.02);
    expect(themeStolen / theme).toBeLessThan(0.02);
  });
});

describe('the instruments\' calibration (through a phone speaker)', () => {
  it('holds every timbre within 2 dB of its target loudness, so the layers keep their balance', async () => {
    // The rate the gains were set at (tools/audio-calibrate.ts): a slow pad's tremolo meets the 400 ms window the same way.
    const rate = 24000;
    const sim = installSimAudio(rate);
    try {
      for (const name of TIMBRE_NAMES) {
        const ch = await renderSfxOfflineChannels(`music.${name}`, rate);
        const phone = maxMomentaryLoudness(ch.map((c) => phoneFilter(c, rate)), rate);
        expect(Math.abs(phone - CALIBRATION[name].target), `${name}: ${phone.toFixed(1)} vs ${CALIBRATION[name].target}`).toBeLessThan(2);
      }
    } finally {
      sim.restore();
    }
  });
});
