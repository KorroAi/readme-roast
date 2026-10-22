import { bell, blip, burst, chord, coins, glide, grit, partials, sound, st, swell, thump, type SoundDef } from './dsp';
import type { Voice } from './synth';

/**
 * Round 3's action and event sounds (AUDIO): the dash, the sonar and the echoes of what it finds,
 * placing a block, torch, ladder, rope, door or outpost, crafting at each station, equipping and
 * consuming, quest beats, the descent and fast travel, hazard warnings, the camp's upgrades and the
 * trader, the companion's voice, the menus, feats, the Halden works' levers and plates, a lair
 * marked, an elite met. eventMap.ts says which event plays which; AudioSystem schedules the sonar's
 * echoes and the hazard warnings itself.
 *
 * Phone-first like the score: every sound's identity sits between 300 Hz and 5 kHz (a low body may
 * sit under it, for headphones); quick to read, never shrill, rewards brighter than warnings.
 */

const ANVIL = { r: [1, 2.76, 5.4, 8.93], a: [0.32, 0.2, 0.09, 0.04], d: [1.0, 0.55, 0.25, 0.12] };
const GLASS = { r: [1, 2.32, 4.25], a: [0.3, 0.12, 0.05], d: [0.5, 0.25, 0.12] };

/** A wooden knock (planks, ladders, the workbench). */
function knock(v: Voice, t: number, k = 1, level = 1): void {
  thump(v, t, 230 * k, 160 * k, 0.5 * level, 0.08, 'triangle');
  v.osc('sine', 470 * k, t, t + 0.08).connect(v.perc(t, 0.001, 0.18 * level, 0.05)).connect(v.out);
  burst(v, t, 'white', 'bandpass', 900 * k, 4.5, 0.4 * level, 0.04);
}

/** Two notes of a soft completion chime (crafts, quest steps). */
function done(v: Voice, t: number, a: number, b: number, level = 1): void {
  bell(v, t, a, 0.12 * level, 0.9);
  bell(v, t + 0.11, b, 0.11 * level, 1.2);
}

/** A rising major arpeggio on soft bells (rewards). */
function rise(v: Voice, t: number, notes: readonly number[], step: number, amp: number, decay: number): void {
  notes.forEach((f, i) => bell(v, t + i * step, f, amp, decay));
}

/** A whoosh: a band of pink noise sweeping between two frequencies. */
function whoosh(v: Voice, t: number, from: number, to: number, dur: number, peak: number, q = 1.3): BiquadFilterNode {
  const f = swell(v, t, 'pink', 'bandpass', from, q, peak, dur * 0.35, dur * 0.1, dur * 0.55);
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
  return f;
}

/** A chirp of the companion (a Lampling): two quick rising sine glides. */
function chirp(v: Voice, t: number, f: number, amp: number): void {
  glide(v, t, 'sine', f, f * 1.45, 0.07, amp, 0.003);
  glide(v, t + 0.09, 'sine', f * 1.12, f * 1.6, 0.08, amp * 0.85, 0.003);
}

export const ACTION_SFX = {
  // ---- Movement
  /** The dash: a quick air whoosh, the coat's flap, a scuff of the boots. */
  'act.dash': sound('sfx', 0.75, 0.08, 2, 0.6, (v) => {
    const t = v.t;
    const f = whoosh(v, t, 420, 2200, 0.32, 0.5, 1.1);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.3);
    burst(v, t, 'brown', 'lowpass', 600, 0, 0.3, 0.08);
    grit(v, t + 0.02, 0.1, 'bandpass', 1600, 1.2, 0.12, 1.2, 0.3);
  }, 0.15),

  // ---- The sonar and its echoes
  /** The lantern pulse: a felt whum, a bright bloom, the ring of air going out. */
  'sonar.pulse': sound('sfx', 0.7, 0.55, 3, 2.6, (v) => {
    const t = v.t;
    thump(v, t, 170, 85, 0.35, 0.45);
    thump(v, t, 340, 220, 0.22, 0.25, 'triangle');
    bell(v, t, 1046.5, 0.16, 1.1);
    glide(v, t + 0.02, 'sine', 1568, 784, 0.8, 0.07);
    const ring = swell(v, t, 'pink', 'bandpass', 3200, 5, 0.09, 0.04, 0.1, 0.8);
    ring.frequency.setValueAtTime(3200, t);
    ring.frequency.exponentialRampToValueAtTime(700, t + 0.9);
  }, 0.4),
  /** An echo from a find: a soft ping (pitch rises with rarity, eventMap/AudioSystem pass it). */
  'sonar.ping': sound('sfx', 0.55, 0.6, 2, 1.2, (v, p) => {
    const f = 1318.5 * (p.pitch ?? 1);
    v.osc('sine', f, v.t, v.t + 0.5).connect(v.perc(v.t, 0.002, 0.16, 0.42)).connect(v.out);
    v.osc('sine', f * 2, v.t, v.t + 0.2).connect(v.perc(v.t, 0.002, 0.04, 0.15)).connect(v.out);
  }, 0.03),
  /** A rare find's echo: a bright two-note glint. */
  'sonar.rare': sound('sfx', 0.6, 0.65, 3, 1.4, (v, p) => {
    const k = p.pitch ?? 1;
    bell(v, v.t, 1760 * k, 0.12, 0.6);
    bell(v, v.t + 0.07, 2349.3 * k, 0.1, 0.7);
    burst(v, v.t + 0.05, 'white', 'highpass', 6500, 0, 0.04, 0.12);
  }, 0.05),
  /** A lair answering the pulse: a low, ominous bell with a growl in it. */
  'sonar.lair': sound('sfx', 0.75, 0.75, 3, 3.4, (v) => {
    const t = v.t;
    bell(v, t, 146.8, 0.3, 3);
    bell(v, t + 0.02, 220, 0.14, 2.4);
    swell(v, t, 'pink', 'bandpass', 320, 2.5, 0.12, 0.3, 0.4, 1.2);
  }, 0.5),
  /** The gate's echo: a deep resonant ring and its rising fifth. */
  'sonar.gate': sound('sfx', 0.7, 0.75, 3, 3.2, (v) => {
    const t = v.t;
    bell(v, t, 196, 0.24, 2.6);
    bell(v, t + 0.25, 293.7, 0.18, 2.6);
  }, 0.5),
  /** A chest or a page in the rock: a wooden tick and a small chime. */
  'sonar.chest': sound('sfx', 0.55, 0.55, 2, 1.0, (v, p) => {
    knock(v, v.t, 1.4, 0.5);
    bell(v, v.t + 0.03, 1174.7 * (p.pitch ?? 1), 0.1, 0.5);
  }, 0.05),

  // ---- Placing
  /** A brick or stone block set down: a solid set and grit. */
  'place.block': sound('sfx', 0.75, 0.15, 2, 0.6, (v) => {
    const t = v.t;
    thump(v, t, 170 * v.vary(0.05), 95, 0.45, 0.12);
    burst(v, t, 'pink', 'bandpass', 1100, 1.4, 0.4, 0.06);
    grit(v, t, 0.15, 'bandpass', 1500, 1.2, 0.18, 1.1, 0.3);
  }, 0.06),
  /** A plank or a door frame: a wooden knock. */
  'place.plank': sound('sfx', 0.75, 0.15, 2, 0.5, (v) => knock(v, v.t, v.vary(0.05)), 0.06),
  /** A torch set on the wall: the knock, the flame catching with a soft whoosh, first crackles. */
  'place.torch': sound('sfx', 0.75, 0.25, 2, 1.4, (v) => {
    const t = v.t;
    knock(v, t, 1.15, 0.6);
    whoosh(v, t + 0.06, 500, 2600, 0.45, 0.3, 0.9);
    burst(v, t + 0.18, 'brown', 'lowpass', 500, 0, 0.3, 0.3, 0.03);
    for (let i = 0; i < 4; i++) burst(v, t + 0.3 + v.rand(0, 0.6), 'white', 'bandpass', v.rand(2000, 3800), 1, v.rand(0.15, 0.3), 0.02);
  }, 0.06),
  /** A ladder: two wooden clacks and its rungs settling. */
  'place.ladder': sound('sfx', 0.75, 0.15, 2, 0.7, (v) => {
    const t = v.t;
    knock(v, t, 1.05, 0.9);
    knock(v, t + 0.11, 1.25, 0.6);
    for (let i = 0; i < 3; i++) knock(v, t + 0.22 + i * 0.05, 1.5 + i * 0.1, 0.18);
  }, 0.08),
  /** A rope: the anchor knocked in, the coil unrolling down with a swish. */
  'place.rope': sound('sfx', 0.75, 0.25, 2, 1.4, (v) => {
    const t = v.t;
    thump(v, t, 260, 170, 0.35, 0.07, 'triangle');
    burst(v, t, 'white', 'bandpass', 1800, 3, 0.25, 0.03);
    const f = swell(v, t + 0.06, 'pink', 'bandpass', 1500, 1.6, 0.3, 0.08, 0.5, 0.35);
    f.frequency.setValueAtTime(1800, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.9);
    const am = v.gain(0.6);
    swell(v, t + 0.06, 'white', 'bandpass', 2600, 2, 0.08, 0.05, 0.6, 0.3, am);
    am.connect(v.out);
    v.lfo(am.gain, 14, 0.5, t, t + 1.1, 'square');
  }, 0.1),
  /** A door: a wooden thunk and the hinge's creak. */
  'place.door': sound('sfx', 0.75, 0.2, 2, 0.9, (v) => {
    const t = v.t;
    knock(v, t, 0.9);
    const o = v.osc('sawtooth', 320, t + 0.08, t + 0.5);
    o.frequency.setValueAtTime(300, t + 0.08);
    o.frequency.linearRampToValueAtTime(520, t + 0.45);
    o.connect(v.filter('bandpass', 1300, 6)).connect(v.swell(t + 0.08, 0.05, 0.12, 0.2, 0.15)).connect(v.out);
  }, 0.1),
  /** An outpost raised: cloth flaps, two stakes, and a little warm chord (a home away from home). */
  'place.outpost': sound('sfx', 0.75, 0.4, 3, 2.6, (v) => {
    const t = v.t;
    for (let i = 0; i < 3; i++) burst(v, t + i * 0.12, 'pink', 'bandpass', 700 + i * 150, 1.2, 0.3, 0.08);
    thump(v, t + 0.45, 200, 120, 0.4, 0.09, 'triangle');
    thump(v, t + 0.7, 210, 125, 0.35, 0.09, 'triangle');
    chord(v, t + 0.8, [293.7, 370, 440, 659.3], 'triangle', 0.05, 1400, 0.4, 0.3, 1.2);
    done(v, t + 0.9, 587.3, 880, 0.8);
  }, 0.5),
  /** A station set down: a heavy knock with weight, a settle of dust. */
  'place.station': sound('sfx', 0.8, 0.3, 3, 1.3, (v) => {
    const t = v.t;
    thump(v, t, 190, 100, 0.55, 0.18);
    knock(v, t, 0.8, 0.7);
    grit(v, t + 0.05, 0.35, 'bandpass', 1300, 1, 0.15, 0.9, 0.2);
  }, 0.3),

  // ---- Crafting, per station
  /** The workbench: two saw strokes, three taps of the hammer, a chime. */
  'craft.workbench': sound('sfx', 0.75, 0.3, 3, 2.0, (v) => {
    const t = v.t;
    for (const at of [0, 0.28]) {
      const am = v.gain(0.6);
      swell(v, t + at, 'white', 'bandpass', 2600, 2, 0.22, 0.05, 0.12, 0.08, am);
      am.connect(v.out);
      v.lfo(am.gain, 13, 0.5, t + at, t + at + 0.26, 'square');
    }
    for (let i = 0; i < 3; i++) knock(v, t + 0.6 + i * 0.13, 1 + i * 0.04, 0.8);
    done(v, t + 1.05, 659.3, 987.8);
  }, 0.3),
  /** The furnace: the fire's roar opening, molten metal sizzling, a clunk, a chime. */
  'craft.furnace': sound('sfx', 0.75, 0.35, 3, 2.4, (v) => {
    const t = v.t;
    const f = swell(v, t, 'pink', 'lowpass', 300, 0, 0.55, 0.25, 0.2, 0.6);
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(500, t + 1);
    swell(v, t, 'brown', 'lowpass', 400, 0, 0.4, 0.2, 0.3, 0.5);
    swell(v, t + 0.45, 'white', 'highpass', 3800, 0, 0.12, 0.04, 0.25, 0.5);
    thump(v, t + 0.5, 240, 140, 0.35, 0.12, 'triangle');
    partials(v, t + 0.5, 700, ANVIL.r, ANVIL.a, ANVIL.d, 0.5);
    done(v, t + 1.1, 587.3, 880);
  }, 0.3),
  /** The forge: three anvil strikes, the quench's hiss, a chime. */
  'craft.forge': sound('sfx', 0.75, 0.35, 3, 2.6, (v) => {
    const t = v.t;
    [0, 0.26, 0.5].forEach((at, i) => {
      const k = 1 + i * 0.04;
      thump(v, t + at, 180 * k, 80 * k, 0.5, 0.1);
      partials(v, t + at, 840 * k, ANVIL.r, ANVIL.a, ANVIL.d, i === 2 ? 1 : 0.75);
      burst(v, t + at, 'white', 'highpass', 3200, 0, 0.18, 0.02);
    });
    swell(v, t + 0.8, 'white', 'bandpass', 3000, 0.9, 0.22, 0.05, 0.3, 0.6);
    done(v, t + 1.25, 698.5, 1046.5);
  }, 0.3),
  /** The alchemy table: glass clinks, bubbles rising, a shimmer of something made. */
  'craft.alchemy': sound('sfx', 0.75, 0.5, 3, 2.6, (v) => {
    const t = v.t;
    partials(v, t, 2400, GLASS.r, GLASS.a, GLASS.d, 0.8);
    partials(v, t + 0.12, 2850, GLASS.r, GLASS.a, GLASS.d, 0.6);
    for (let i = 0; i < 7; i++) {
      const at = t + 0.25 + i * v.rand(0.06, 0.11);
      const f = v.rand(320, 700);
      glide(v, at, 'sine', f, f * 1.7, 0.05, 0.1, 0.002);
    }
    rise(v, t + 0.95, [1174.7, 1480, 1760, 2349.3], 0.07, 0.07, 0.8);
    swell(v, t + 0.95, 'white', 'highpass', 6500, 0, 0.03, 0.3, 0.2, 0.6);
  }, 0.3),
  /** Made by hand: cloth and cord, a knot pulled tight, a chime. */
  'craft.hand': sound('sfx', 0.7, 0.25, 3, 1.6, (v) => {
    const t = v.t;
    for (let i = 0; i < 3; i++) burst(v, t + i * 0.09, 'pink', 'bandpass', 1800, 1.5, 0.25, 0.07);
    glide(v, t + 0.32, 'triangle', 700, 1100, 0.08, 0.12, 0.003);
    done(v, t + 0.55, 587.3, 880, 0.9);
  }, 0.3),
  /** A barter with the trader: coins changing hands and a bright "done". */
  'craft.trader': sound('sfx', 0.7, 0.35, 3, 1.8, (v) => {
    coins(v, v.t, 6, 0.6);
    bell(v, v.t + 0.45, 1318.5, 0.12, 0.6);
    bell(v, v.t + 0.55, 1760, 0.1, 0.8);
  }, 0.3),
  /** A camp upgrade built: hammering, a saw, and a warm chord that rises (the camp grows). */
  'camp.upgrade': sound('sfx', 0.8, 0.45, 4, 3.4, (v) => {
    const t = v.t;
    for (let i = 0; i < 4; i++) knock(v, t + i * 0.16, 0.95 + i * 0.05, 0.9);
    const am = v.gain(0.6);
    swell(v, t + 0.7, 'white', 'bandpass', 2400, 2, 0.2, 0.05, 0.25, 0.1, am);
    am.connect(v.out);
    v.lfo(am.gain, 12, 0.5, t + 0.7, t + 1.1, 'square');
    chord(v, t + 1.1, [293.7, 370, 440, 587.3], 'triangle', 0.06, 1500, 0.5, 0.6, 1.4);
    rise(v, t + 1.2, [587.3, 740, 880, 1174.7], 0.1, 0.1, 1.1);
  }, 1),
  /** A gem set in a socket: a crystal click, a metal setting, a rising sparkle. */
  'gem.socket': sound('sfx', 0.7, 0.45, 3, 1.6, (v) => {
    const t = v.t;
    partials(v, t, 2900, GLASS.r, GLASS.a, GLASS.d, 0.8);
    partials(v, t + 0.06, 1500, [1, 2.76], [0.2, 0.08], [0.25, 0.1], 1);
    rise(v, t + 0.2, [1760, 2217.5, 2637], 0.06, 0.07, 0.7);
  }, 0.3),

  // ---- Gear and consumables
  /** Armour on: leather and plates settling, a buckle. */
  'equip.armour': sound('sfx', 0.75, 0.15, 3, 0.9, (v) => {
    const t = v.t;
    burst(v, t, 'pink', 'bandpass', 1300, 1.2, 0.3, 0.12);
    partials(v, t + 0.08, 1100, [1, 2.6, 4.1], [0.18, 0.08, 0.04], [0.3, 0.15, 0.08], 1);
    v.osc('sine', 3200, t + 0.2, t + 0.26).connect(v.perc(t + 0.2, 0.001, 0.06, 0.04)).connect(v.out);
  }, 0.1),
  /** A blade drawn: a bright metallic slide and its ring. */
  'equip.weapon': sound('sfx', 0.75, 0.2, 3, 1.0, (v) => {
    const t = v.t;
    const f = swell(v, t, 'white', 'bandpass', 3500, 3, 0.22, 0.05, 0.1, 0.18);
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + 0.25);
    partials(v, t + 0.22, 2200, [1, 2.41, 3.88], [0.14, 0.07, 0.03], [0.6, 0.3, 0.15], 1);
  }, 0.1),
  /** A tool in hand: a handle's knock and the iron's tink. */
  'equip.tool': sound('sfx', 0.75, 0.15, 3, 0.7, (v) => {
    knock(v, v.t, 1, 0.7);
    partials(v, v.t + 0.03, 1500, [1, 2.76], [0.15, 0.06], [0.3, 0.12], 1);
  }, 0.1),
  /** A lantern hooked on: a handle's clink and the flame steadying. */
  'equip.lantern': sound('sfx', 0.7, 0.2, 3, 1.0, (v) => {
    partials(v, v.t, 1800, [1, 2.32], [0.14, 0.06], [0.25, 0.1], 1);
    whoosh(v, v.t + 0.08, 400, 1600, 0.35, 0.18, 0.9);
  }, 0.1),
  /** Eating: two crunchy bites and a swallow. */
  'use.eat': sound('sfx', 0.75, 0.1, 3, 1.0, (v) => {
    const t = v.t;
    for (const at of [0, 0.2]) {
      grit(v, t + at, 0.12, 'bandpass', v.rand(1400, 2400), 1.2, 0.4, v.rand(1, 1.3), 0.05);
      thump(v, t + at, 180, 120, 0.12, 0.05);
    }
    glide(v, t + 0.5, 'sine', 330, 190, 0.12, 0.12, 0.01);
    blip(v, t + 0.62, 784, 0.07, 0.25);
  }, 0.2),
  /** A potion: the cork, two gulps, a shimmer. */
  'use.drink': sound('sfx', 0.75, 0.3, 3, 1.3, (v) => {
    const t = v.t;
    glide(v, t, 'sine', 950, 520, 0.04, 0.18, 0.001);
    burst(v, t, 'white', 'bandpass', 2600, 4, 0.2, 0.025);
    for (const at of [0.18, 0.38]) glide(v, t + at, 'sine', 260, 150, 0.09, 0.2, 0.005);
    glide(v, t + 0.55, 'sine', 880, 1760, 0.5, 0.07, 0.02);
  }, 0.2),
  /** A bandage: cloth torn and wrapped. */
  'use.bandage': sound('sfx', 0.75, 0.15, 3, 1.0, (v) => {
    const t = v.t;
    for (let i = 0; i < 3; i++) burst(v, t + i * 0.11, 'white', 'bandpass', 2600 - i * 300, 1.6, 0.3, 0.07);
    blip(v, t + 0.42, 659.3, 0.07, 0.3);
  }, 0.2),
  /** Oil poured into the lantern: glugs, then the flame rising. */
  'use.oil': sound('sfx', 0.75, 0.25, 3, 1.4, (v) => {
    const t = v.t;
    for (let i = 0; i < 3; i++) glide(v, t + i * 0.12, 'sine', 230 + i * 20, 330 + i * 30, 0.07, 0.2, 0.005);
    whoosh(v, t + 0.4, 300, 2400, 0.5, 0.35, 0.9);
    burst(v, t + 0.6, 'brown', 'lowpass', 500, 0, 0.25, 0.3, 0.04);
  }, 0.2),
  /** A tonic against a hazard: a gulp and a slow warm shimmer settling round you. */
  'use.ward': sound('sfx', 0.75, 0.5, 3, 2.2, (v) => {
    const t = v.t;
    glide(v, t, 'sine', 260, 150, 0.09, 0.2, 0.005);
    chord(v, t + 0.2, [440, 554.4, 659.3, 880], 'sine', 0.06, 2500, 0.5, 0.4, 1);
    rise(v, t + 0.25, [880, 1108.7, 1318.5], 0.09, 0.06, 0.9);
  }, 0.3),
  /** A flare struck: the scrape, the hiss of its light. */
  'use.flare': sound('sfx', 0.75, 0.3, 3, 1.6, (v) => {
    const t = v.t;
    burst(v, t, 'white', 'highpass', 3000, 0, 0.35, 0.05);
    const f = swell(v, t + 0.04, 'white', 'bandpass', 2600, 1, 0.22, 0.08, 0.6, 0.6);
    v.lfo(f.frequency, 9, 400, t, t + 1.3);
    whoosh(v, t + 0.04, 500, 1800, 0.4, 0.2);
  }, 0.3),

  // ---- Quest beats and travel
  /** A quest step: a warm rising three-note figure. */
  'quest.step': sound('sfx', 0.75, 0.45, 3, 2.0, (v) => {
    rise(v, v.t, [587.3, 740, 880], 0.1, 0.12, 1.2);
    chord(v, v.t, [293.7, 440], 'triangle', 0.04, 1200, 0.3, 0.3, 0.9);
  }, 0.8),
  /** A quest done: a resolved four-note cadence over a chord. */
  'quest.done': sound('sfx', 0.8, 0.5, 4, 3.0, (v) => {
    rise(v, v.t, [587.3, 740, 880, 1174.7], 0.11, 0.13, 1.6);
    chord(v, v.t + 0.1, [293.7, 370, 440, 587.3], 'triangle', 0.06, 1600, 0.4, 0.6, 1.4);
  }, 1),
  /** The descent to a new stratum: chains, a deep whoosh falling, a low gong. */
  'world.descent': sound('sfx', 0.8, 0.6, 4, 4.0, (v) => {
    const t = v.t;
    for (let i = 0; i < 10; i++) partials(v, t + i * v.rand(0.07, 0.12), 900 * v.vary(0.1), [1, 2.3], [0.08, 0.03], [0.12, 0.06], 1);
    const f = swell(v, t + 0.3, 'pink', 'bandpass', 1400, 1, 0.45, 0.8, 0.6, 1.4);
    f.frequency.setValueAtTime(1400, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(260, t + 2.4);
    bell(v, t + 1.2, 110, 0.3, 2.6);
    bell(v, t + 1.2, 164.8, 0.14, 2.2);
  }, 2),
  /** Riding back up: chains and a rising whoosh. */
  'world.ascent': sound('sfx', 0.75, 0.5, 3, 3.0, (v) => {
    const t = v.t;
    for (let i = 0; i < 8; i++) partials(v, t + i * v.rand(0.07, 0.12), 1000 * v.vary(0.1), [1, 2.3], [0.08, 0.03], [0.12, 0.06], 1);
    whoosh(v, t + 0.3, 300, 1800, 2, 0.35, 1);
  }, 2),
  /** Fast travel: a magical rush and a soft arrival chime. */
  'travel.whoosh': sound('sfx', 0.8, 0.6, 3, 2.6, (v) => {
    const t = v.t;
    whoosh(v, t, 300, 3200, 0.9, 0.5, 1.1);
    rise(v, t + 0.2, [880, 1108.7, 1318.5, 1760], 0.08, 0.06, 0.8);
    done(v, t + 0.9, 587.3, 880, 0.9);
  }, 1),
  /** The tutorial moving on: a gentle two-note chime. */
  'tutorial.step': sound('sfx', 0.65, 0.35, 3, 1.2, (v) => {
    bell(v, v.t, 1174.7, 0.1, 0.5);
    bell(v, v.t + 0.1, 1568, 0.09, 0.7);
  }, 0.3),
  /** A guide's hint: a soft questioning two-tone. */
  'ui.hint': sound('sfx', 0.6, 0.25, 2, 1.0, (v) => {
    blip(v, v.t, 784, 0.1, 0.25);
    blip(v, v.t + 0.13, 987.8, 0.09, 0.3);
  }, 8),
  /** A journal page found and read: paper and a soft chord. */
  'page.read': sound('sfx', 0.7, 0.45, 3, 2.0, (v) => {
    const t = v.t;
    const f = swell(v, t, 'white', 'bandpass', 2400, 1.5, 0.22, 0.04, 0.05, 0.2);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.25);
    chord(v, t + 0.15, [392, 587.3, 740], 'triangle', 0.05, 1500, 0.35, 0.4, 1.1);
  }, 0.5),

  // ---- Hazard warnings (the meter past half, then near full)
  /** Cold biting: an icy shiver, a trembling breath. */
  'hazard.cold': sound('sfx', 0.75, 0.35, 3, 1.6, (v, p) => {
    const t = v.t;
    const k = 0.7 + 0.3 * (p.intensity ?? 0.5);
    const f = swell(v, t, 'white', 'bandpass', 3400, 4, 0.18 * k, 0.15, 0.3, 0.5);
    v.lfo(f.frequency, 11, 700, t, t + 1.1);
    const am = v.gain(0.5);
    swell(v, t, 'pink', 'bandpass', 600, 2, 0.3 * k, 0.1, 0.4, 0.4, am);
    am.connect(v.out);
    v.lfo(am.gain, 9, 0.45, t, t + 1, 'square');
  }, 2),
  /** Gas in the lungs: two coughs and a hiss. */
  'hazard.gas': sound('sfx', 0.8, 0.25, 3, 1.2, (v, p) => {
    const t = v.t;
    const k = 0.7 + 0.3 * (p.intensity ?? 0.5);
    for (const at of [0, 0.3]) {
      burst(v, t + at, 'pink', 'bandpass', 650, 1.4, 0.45 * k, 0.14);
      burst(v, t + at + 0.01, 'white', 'bandpass', 1500, 1.5, 0.2 * k, 0.1);
    }
    swell(v, t + 0.5, 'white', 'bandpass', 2600, 1.2, 0.08, 0.1, 0.2, 0.3);
  }, 2),
  /** Heat rising: a sizzle and a warning double pulse. */
  'hazard.heat': sound('sfx', 0.8, 0.25, 3, 1.4, (v, p) => {
    const t = v.t;
    const k = 0.7 + 0.3 * (p.intensity ?? 0.5);
    swell(v, t, 'white', 'highpass', 4200, 0, 0.16 * k, 0.08, 0.3, 0.5);
    for (const at of [0, 0.28]) {
      thump(v, t + at, 280, 170, 0.35 * k, 0.12, 'triangle');
      burst(v, t + at, 'pink', 'bandpass', 600, 1.2, 0.25 * k, 0.06);
    }
  }, 2),
  /** The dark closing in: a quickening heartbeat and a breath at the ear. */
  'hazard.dark': sound('sfx', 0.8, 0.35, 3, 1.6, (v, p) => {
    const t = v.t;
    const k = 0.7 + 0.3 * (p.intensity ?? 0.5);
    for (const [at, g] of [[0, 1], [0.2, 0.7], [0.62, 1], [0.82, 0.7]] as const) {
      thump(v, t + at, 85, 48, 0.4 * g * k, 0.18);
      thump(v, t + at, 300, 170, 0.3 * g * k, 0.09, 'triangle');
      burst(v, t + at, 'pink', 'bandpass', 520, 1.3, 0.2 * g * k, 0.05);
    }
    swell(v, t + 0.2, 'pink', 'bandpass', 900, 3, 0.06, 0.3, 0.2, 0.5);
  }, 2),

  // ---- The companion (a tamed Lampling): MOBS emits these through 'mob:sfx'
  'companion.chirp': sound('sfx', 0.6, 0.3, 2, 0.6, (v) => chirp(v, v.t, 1800 * v.vary(0.05), 0.14), 0.3),
  'companion.happy': sound('sfx', 0.6, 0.35, 2, 1.0, (v) => {
    [0, 2, 4, 7, 9].forEach((s, i) => glide(v, v.t + i * 0.06, 'sine', st(s + 15) * 0.98, st(s + 15), 0.05, 0.11, 0.002));
    burst(v, v.t + 0.25, 'white', 'highpass', 6500, 0, 0.03, 0.15);
  }, 0.4),
  /** It senses a rare ore: an excited triple chirp and a bright ping. */
  'companion.alert': sound('sfx', 0.65, 0.4, 3, 1.2, (v) => {
    for (let i = 0; i < 3; i++) chirp(v, v.t + i * 0.13, 2000 + i * 150, 0.12);
    bell(v, v.t + 0.42, 2637, 0.08, 0.6);
  }, 1),
  'companion.levelup': sound('sfx', 0.7, 0.5, 3, 1.8, (v) => {
    rise(v, v.t, [1174.7, 1480, 1760, 2349.3], 0.08, 0.1, 0.9);
    chirp(v, v.t + 0.4, 2200, 0.12);
    swell(v, v.t + 0.3, 'white', 'highpass', 6500, 0, 0.03, 0.3, 0.2, 0.5);
  }, 1),
  'companion.hurt': sound('sfx', 0.6, 0.25, 2, 0.8, (v) => {
    glide(v, v.t, 'sine', 2400, 1300, 0.15, 0.13, 0.003);
    glide(v, v.t + 0.18, 'sine', 2100, 1100, 0.18, 0.1, 0.003);
  }, 0.4),
  /** It zaps a small foe with a mote of light. */
  'companion.zap': sound('sfx', 0.6, 0.3, 2, 0.6, (v) => {
    burst(v, v.t, 'white', 'highpass', 4000, 0, 0.15, 0.03);
    glide(v, v.t, 'sine', 2200, 500, 0.12, 0.12, 0.001);
    bell(v, v.t + 0.02, 2637, 0.04, 0.3);
  }, 0.1),
  'companion.eat': sound('sfx', 0.6, 0.2, 2, 0.9, (v) => {
    for (let i = 0; i < 3; i++) grit(v, v.t + i * 0.1, 0.06, 'bandpass', 2600, 1.5, 0.2, 1.4, 0.05);
    chirp(v, v.t + 0.38, 1900, 0.12);
  }, 0.3),

  // ---- Menus and feedback
  /** The hotbar: a crisp small tick (its pitch climbs with the slot). */
  'ui.hotbar': sound('sfx', 0.7, 0, 3, 0.15, (v, p) => {
    const f = 1700 * (p.pitch ?? 1);
    const o = v.osc('triangle', f, v.t, v.t + 0.05);
    o.frequency.setValueAtTime(f, v.t);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, v.t + 0.025);
    o.connect(v.perc(v.t, 0.001, 0.2, 0.035)).connect(v.out);
    burst(v, v.t, 'white', 'highpass', 5000, 0, 0.05, 0.006);
  }, 0.04),
  /** A page turned (the map, the quests, the bestiary, a menu's tab). */
  'ui.page': sound('sfx', 0.65, 0.1, 3, 0.5, (v) => {
    const t = v.t;
    const f = swell(v, t, 'white', 'bandpass', 1800, 1.4, 0.2, 0.03, 0.04, 0.16);
    f.frequency.setValueAtTime(1600, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.2);
    burst(v, t + 0.17, 'pink', 'bandpass', 900, 1, 0.08, 0.04);
  }, 0.08),
  /** The bag opened: leather and a buckle. */
  'ui.bag': sound('sfx', 0.65, 0.1, 3, 0.5, (v) => {
    burst(v, v.t, 'pink', 'bandpass', 1100, 1.1, 0.25, 0.1);
    v.osc('sine', 2800, v.t + 0.08, v.t + 0.13).connect(v.perc(v.t + 0.08, 0.001, 0.06, 0.035)).connect(v.out);
  }, 0.08),
  /** A biome's arrival card sliding in: a soft airy swell and a bell. */
  'ui.card': sound('sfx', 0.55, 0.5, 2, 1.6, (v) => {
    whoosh(v, v.t, 600, 1800, 0.5, 0.12, 1);
    bell(v, v.t + 0.2, 1318.5, 0.06, 1);
  }, 2),
  /** A feat: a bright little fanfare. */
  'feat.fanfare': sound('sfx', 0.75, 0.45, 4, 2.0, (v) => {
    const t = v.t;
    [[587.3, 0], [740, 0.09], [880, 0.18], [1174.7, 0.3]].forEach(([f, at], i) => {
      const lp = v.filter('lowpass', 2800, 0);
      lp.connect(v.perc(t + at, 0.01, i === 3 ? 0.2 : 0.14, i === 3 ? 0.9 : 0.25)).connect(v.out);
      v.osc('sawtooth', f, t + at, t + at + 1).connect(lp);
      v.osc('triangle', f * 1.003, t + at, t + at + 1).connect(lp);
    });
    bell(v, t + 0.3, 2349.3, 0.06, 1);
    swell(v, t + 0.3, 'white', 'highpass', 6500, 0, 0.04, 0.2, 0.2, 0.6);
  }, 0.5),
  /** A reward paid: a pouch of coins. */
  'reward.pouch': sound('sfx', 0.65, 0.2, 3, 1.0, (v, p) => {
    burst(v, v.t, 'pink', 'bandpass', 900, 1, 0.2, 0.08);
    coins(v, v.t + 0.05, Math.max(3, Math.min(7, Math.round(p.count ?? 4))), 0.5);
  }, 0.3),
  /** A bestiary page: paper and a curious note. */
  'bestiary.page': sound('sfx', 0.6, 0.35, 2, 1.2, (v) => {
    const f = swell(v, v.t, 'white', 'bandpass', 2200, 1.5, 0.15, 0.03, 0.04, 0.15);
    f.frequency.exponentialRampToValueAtTime(4000, v.t + 0.2);
    bell(v, v.t + 0.12, 987.8, 0.08, 0.8);
  }, 1),

  // ---- The world
  /** A guardian's lair marked on the map: a low horn and a drum, far off. */
  'lair.revealed': sound('sfx', 0.75, 0.6, 3, 3.2, (v) => {
    const t = v.t;
    const lp = v.filter('lowpass', 300, 1);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(1400, t + 0.4);
    lp.frequency.exponentialRampToValueAtTime(600, t + 1.6);
    lp.connect(v.swell(t, 0.3, 0.3, 0.6, 1.2)).connect(v.out);
    for (const f of [110, 164.8, 220]) v.osc('sawtooth', f, t, t + 2.2).connect(lp);
    thump(v, t + 0.05, 140, 60, 0.4, 0.4);
    burst(v, t + 0.05, 'pink', 'bandpass', 800, 1.1, 0.3, 0.07);
  }, 2),
  /** An elite met: a short dissonant stab and a rising hiss. */
  'elite.alert': sound('sfx', 0.75, 0.35, 3, 1.4, (v) => {
    const t = v.t;
    const lp = v.filter('lowpass', 600, 2);
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(800, t + 0.5);
    lp.connect(v.perc(t, 0.01, 0.3, 0.6)).connect(v.out);
    for (const f of [233.1, 246.9, 349.2]) v.osc('sawtooth', f, t, t + 0.8).connect(lp);
    swell(v, t, 'white', 'highpass', 5000, 0, 0.05, 0.3, 0.05, 0.3);
  }, 1.5),
  /** A lever of the Halden works: an iron clank, a ratchet, a thud. */
  'world.lever': sound('sfx', 0.8, 0.35, 3, 1.4, (v) => {
    const t = v.t;
    partials(v, t, 620, [1, 2.41, 3.88], [0.3, 0.15, 0.06], [0.5, 0.3, 0.15], 1);
    thump(v, t, 160, 80, 0.4, 0.12);
    for (let i = 0; i < 6; i++) burst(v, t + 0.12 + i * 0.045, 'white', 'bandpass', 2200, 3, 0.18, 0.012);
    thump(v, t + 0.45, 200, 110, 0.35, 0.1, 'triangle');
  }, 0.3),
  /** A pressure plate pressed in order: a stone click and a tone that climbs with each one. */
  'world.plate': sound('sfx', 0.75, 0.4, 3, 1.4, (v, p) => {
    const t = v.t;
    thump(v, t, 220, 130, 0.35, 0.07, 'triangle');
    burst(v, t, 'pink', 'bandpass', 1200, 1.5, 0.3, 0.04);
    bell(v, t + 0.05, 440 * (p.pitch ?? 1), 0.14, 1.1);
  }, 0.2),
  /** Wrong plate: every plate springs back, stones rattle, tones fall. */
  'world.plateReset': sound('sfx', 0.75, 0.35, 3, 1.6, (v) => {
    const t = v.t;
    for (let i = 0; i < 8; i++) burst(v, t + i * v.rand(0.03, 0.06), 'pink', 'bandpass', v.rand(900, 1600), 2, 0.2, 0.03);
    [523.3, 466.2, 392].forEach((f, i) => bell(v, t + 0.2 + i * 0.14, f, 0.1, 0.5));
  }, 0.5),
  /** The works' vault door: iron grinding open, chains, and the reward's chord. */
  'world.worksOpened': sound('sfx', 0.8, 0.55, 4, 4.0, (v) => {
    const t = v.t;
    const f = swell(v, t, 'brown', 'lowpass', 500, 2, 0.5, 0.5, 1.2, 0.8);
    v.lfo(f.frequency, 7, 160, t, t + 2.4);
    const g = swell(v, t, 'pink', 'bandpass', 700, 2.5, 0.18, 0.5, 1.2, 0.8);
    v.lfo(g.frequency, 5, 200, t, t + 2.4);
    for (let i = 0; i < 9; i++) partials(v, t + 0.3 + i * v.rand(0.12, 0.2), 800 * v.vary(0.1), [1, 2.3], [0.07, 0.03], [0.12, 0.06], 1);
    chord(v, t + 2.0, [293.7, 370, 440, 587.3], 'triangle', 0.06, 1600, 0.4, 0.5, 1.2);
    rise(v, t + 2.1, [587.3, 740, 880, 1174.7], 0.1, 0.1, 1);
  }, 2),
  /** A named place reached (a river, a set piece, a secret room): a lydian shimmer, smaller than a discovery. */
  'site.found': sound('sfx', 0.7, 0.65, 3, 3.0, (v) => {
    const t = v.t;
    chord(v, t, [293.7, 440, 659.3], 'triangle', 0.05, 1200, 0.6, 0.6, 1.4);
    rise(v, t + 0.2, [587.3, 659.3, 740, 830.6, 880], 0.1, 0.07, 1.2);
  }, 2),
  /** A crit: a blow on an open guard, a bright tick over the hit. */
  'hit.crit': sound('sfx', 0.6, 0.15, 3, 0.5, (v) => {
    partials(v, v.t, 2400, [1, 1.5, 2.76], [0.2, 0.1, 0.06], [0.2, 0.12, 0.08], 1);
    burst(v, v.t, 'white', 'highpass', 5000, 0, 0.12, 0.02);
  }, 0.05),
} satisfies Record<string, SoundDef>;
