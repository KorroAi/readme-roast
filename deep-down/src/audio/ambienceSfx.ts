import { bell, burst, glide, grit, partials, sound, swell, thump, type SoundDef } from './dsp';

/**
 * The beds' one-shots (round 3, AUDIO): each biome's small events, heard now and then over its
 * room tone (ambience.ts BEDS lists which, and how often). On the ambience bus at priority 0, so a
 * busy fight steals them first. Heard mostly through the reverb, as things far off in the cave.
 */
export const AMBIENCE_SFX = {
  /** Pebbles and soil trickling down a wall. */
  'amb.trickle': sound('ambience', 0.7, 0.6, 0, 1.6, (v) => {
    const t = v.t;
    const n = 6 + Math.floor(v.rand(0, 7));
    for (let k = 0; k < n; k++) burst(v, t + (k / n) * v.rand(0.6, 1.1) + v.rand(0, 0.05), 'white', 'bandpass', v.rand(1800, 3600), 3, v.rand(0.05, 0.14), v.rand(0.01, 0.03));
    grit(v, t + 0.1, 0.8, 'bandpass', 2200, 1.2, 0.1, v.rand(1.2, 1.5), 0.25);
  }, 1),
  /** A mushroom's spore puff: a soft breath and a glitter of motes. */
  'amb.spore': sound('ambience', 0.7, 0.7, 0, 2.0, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const f = swell(v, t, 'pink', 'bandpass', 900 * k, 1.6, 0.35, 0.05, 0.08, 0.5);
    f.frequency.setValueAtTime(800 * k, t);
    f.frequency.exponentialRampToValueAtTime(2600 * k, t + 0.4);
    for (let i = 0; i < 4; i++) {
      const at = t + 0.15 + i * v.rand(0.08, 0.2);
      v.osc('sine', v.rand(2600, 4200) * k, at, at + 0.4).connect(v.perc(at, 0.002, 0.035, 0.35)).connect(v.out);
    }
  }, 1),
  /** Lumen moths fluttering past. */
  'amb.moth': sound('ambience', 0.6, 0.5, 0, 1.3, (v) => {
    const t = v.t;
    const band = v.filter('bandpass', 1300, 2);
    const am = v.gain(0.5);
    v.noise('pink', t, t + 1).connect(band).connect(am).connect(v.swell(t, 0.25, 0.4, 0.3, 0.4)).connect(v.out);
    v.lfo(am.gain, 19 * v.vary(0.1), 0.45, t, t + 1, 'square');
    v.lfo(band.frequency, 1.2, 400, t, t + 1);
  }, 1),
  /** A great root creaking as the rock settles, then a little soil. */
  'amb.root': sound('ambience', 0.75, 0.5, 0, 2.2, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const src = v.osc('sawtooth', 95 * k, t, t + 1.3);
    src.frequency.setValueAtTime(90 * k, t);
    src.frequency.linearRampToValueAtTime(130 * k, t + 0.6);
    src.frequency.linearRampToValueAtTime(100 * k, t + 1.2);
    const env = v.swell(t, 0.25, 0.32, 0.4, 0.5);
    src.connect(v.filter('bandpass', 620 * k, 4)).connect(env).connect(v.out);
    v.lfo(env.gain, 22, 0.14, t, t + 1.25, 'square');
    for (let i = 0; i < 6; i++) burst(v, t + 1.1 + i * v.rand(0.05, 0.12), 'white', 'bandpass', v.rand(1500, 3000), 2.5, 0.06, 0.02);
  }, 3),
  /** Something small slipping into still water: a plop and its ripples. */
  'amb.splash': sound('ambience', 0.75, 0.7, 0, 1.4, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    glide(v, t, 'sine', 320 * k, 720 * k, 0.07, 0.3, 0.002);
    burst(v, t + 0.02, 'white', 'bandpass', 2200 * k, 1.2, 0.18, 0.18);
    for (let i = 0; i < 3; i++) glide(v, t + 0.18 + i * v.rand(0.1, 0.2), 'sine', 1100 * k * v.vary(0.2), 1700 * k, 0.04, 0.06, 0.001);
  }, 2),
  /** Crystals singing: a few glassy notes in a bright pentatonic, ringing on. */
  'amb.chime': sound('ambience', 0.6, 0.85, 0, 3.2, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const scale = [1760, 1975.5, 2217.5, 2637, 2960];
    const n = 2 + Math.floor(v.rand(0, 2.5));
    for (let i = 0; i < n; i++) {
      const at = t + i * v.rand(0.15, 0.4);
      partials(v, at, v.pick(scale) * k, [1, 2.01, 3.98], [0.18, 0.06, 0.025], [2.4, 1.2, 0.6], 1);
    }
  }, 2),
  /** A mine timber groaning under the load, in ratchets. */
  'amb.creak': sound('ambience', 0.8, 0.5, 0, 2.0, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const src = v.osc('sawtooth', 80 * k, t, t + 1.3);
    src.frequency.setValueAtTime(75 * k, t);
    src.frequency.exponentialRampToValueAtTime(115 * k, t + 1.1);
    const env = v.swell(t, 0.15, 0.36, 0.5, 0.45);
    src.connect(v.filter('bandpass', 520 * k, 5)).connect(env).connect(v.out);
    v.lfo(env.gain, 26 * v.vary(0.15), 0.2, t, t + 1.2, 'square');
    burst(v, t + 1.0, 'pink', 'bandpass', 900, 2, 0.12, 0.08);
  }, 3),
  /** Picks working somewhere far off (a ghost of Halden's crews, or another explorer). */
  'amb.pick': sound('ambience', 0.6, 0.9, 0, 2.6, (v) => {
    const t = v.t;
    const n = 2 + Math.floor(v.rand(0, 3));
    const far = v.filter('lowpass', 2600, 0);
    far.connect(v.out);
    for (let i = 0; i < n; i++) {
      const at = t + i * v.rand(0.5, 0.65);
      partials(v, at, 1800 * v.vary(0.04), [1, 2.32, 4.25], [0.22, 0.12, 0.05], [0.35, 0.2, 0.1], 1, far);
      burst(v, at, 'white', 'bandpass', 1500, 1, 0.08, 0.04, 0.001, far);
    }
  }, 8),
  /** A cart rolling on far rails. */
  'amb.rail': sound('ambience', 0.6, 0.8, 0, 3.4, (v) => {
    const t = v.t;
    swell(v, t, 'brown', 'lowpass', 380, 0, 0.45, 1.0, 0.8, 1.2);
    swell(v, t, 'pink', 'bandpass', 700, 1.2, 0.08, 1.0, 0.8, 1.2);
    for (let i = 0; i < 12; i++) burst(v, t + 0.4 + i * v.rand(0.14, 0.2), 'white', 'bandpass', v.rand(700, 1100), 2, v.rand(0.06, 0.12), 0.03);
  }, 10),
  /** Ice groaning: a slow, eerie bend deep in the wall. */
  'amb.ice': sound('ambience', 0.7, 0.75, 0, 2.6, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const o = v.osc('triangle', 180 * k, t, t + 1.9);
    o.frequency.setValueAtTime(170 * k, t);
    o.frequency.linearRampToValueAtTime(240 * k, t + 0.9);
    o.frequency.linearRampToValueAtTime(150 * k, t + 1.8);
    const env = v.swell(t, 0.4, 0.22, 0.6, 0.8);
    o.connect(v.filter('bandpass', 900 * k, 3)).connect(env).connect(v.out);
    v.osc('sine', 360 * k, t, t + 1.9).connect(v.swell(t, 0.5, 0.05, 0.6, 0.7)).connect(v.out);
    swell(v, t + 0.2, 'white', 'bandpass', 3200, 6, 0.03, 0.5, 0.4, 0.6);
  }, 3),
  /** Ice cracking: a sharp snap, falling crystals tinkling. */
  'amb.iceCrack': sound('ambience', 0.7, 0.7, 0, 2.0, (v) => {
    const t = v.t;
    burst(v, t, 'white', 'highpass', 2600, 0, 0.5, 0.03);
    thump(v, t, 280, 150, 0.2, 0.08, 'triangle');
    for (let i = 0; i < 6; i++) {
      const at = t + 0.08 + v.rand(0, 0.7);
      v.osc('sine', v.rand(3000, 6000), at, at + 0.25).connect(v.perc(at, 0.001, 0.04, v.rand(0.1, 0.22))).connect(v.out);
    }
  }, 4),
  /** Icicles knocking together: a few small glassy tinks, high and quick, ringing a moment. */
  'amb.iceTink': sound('ambience', 0.55, 0.75, 0, 1.6, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    const n = 2 + Math.floor(v.rand(0, 3));
    for (let i = 0; i < n; i++) {
      const at = t + i * v.rand(0.06, 0.22);
      partials(v, at, v.rand(2600, 3600) * k, [1, 2.76, 5.4], [0.16, 0.05, 0.02], [0.35, 0.15, 0.06], 1);
    }
  }, 2),
  /** A cave bird's call: two whistles. */
  'amb.bird': sound('ambience', 0.55, 0.6, 0, 1.4, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    glide(v, t, 'sine', 2100 * k, 2800 * k, 0.09, 0.16);
    glide(v, t + 0.16, 'sine', 2300 * k, 1900 * k, 0.14, 0.13);
    if (v.rand(0, 1) < 0.5) glide(v, t + 0.42, 'sine', 2600 * k, 3000 * k, 0.07, 0.1);
  }, 3),
  /** A soft frog-like croak in the vines. */
  'amb.frog': sound('ambience', 0.65, 0.45, 0, 1.2, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    for (const at of [0, 0.32]) {
      const src = v.osc('square', 170 * k, t + at, t + at + 0.3);
      const env = v.swell(t + at, 0.02, 0.22, 0.12, 0.1);
      src.connect(v.filter('bandpass', 720 * k, 3)).connect(env).connect(v.out);
      v.lfo(env.gain, 31, 0.15, t + at, t + at + 0.26, 'square');
    }
  }, 3),
  /** A bog bubble: a thick low bloop and its pop. */
  'amb.bubble': sound('ambience', 0.8, 0.45, 0, 1.0, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    glide(v, t, 'sine', 150 * k, 420 * k, 0.13, 0.42, 0.004);
    glide(v, t, 'triangle', 300 * k, 760 * k, 0.12, 0.12, 0.004);
    burst(v, t + 0.12, 'white', 'bandpass', 1300 * k, 1.5, 0.2, 0.03);
    burst(v, t + 0.13, 'pink', 'lowpass', 600, 0, 0.12, 0.12);
  }, 0.4),
  /** Steam or gas escaping a crack. */
  'amb.hiss': sound('ambience', 0.6, 0.4, 0, 1.6, (v) => {
    const t = v.t;
    const f = swell(v, t, 'white', 'bandpass', 3000, 1.3, 0.2, 0.12, 0.4, 0.7);
    v.lfo(f.frequency, 6, 500, t, t + 1.2);
  }, 2),
  /** The drowned city's distance: a stone knock and its echoes down empty halls. */
  'amb.cityEcho': sound('ambience', 0.7, 0.85, 0, 3.0, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    [0, 0.31, 0.64, 1.0].forEach((at, i) => {
      const g = Math.pow(0.5, i);
      const dark = v.filter('lowpass', 2400 / (1 + i), 0);
      dark.connect(v.out);
      thump(v, t + at, 190 * k, 120 * k, 0.3 * g, 0.12, 'triangle', dark);
      burst(v, t + at, 'pink', 'bandpass', 900 * k, 1.4, 0.2 * g, 0.06, 0.001, dark);
    });
    swell(v, t, 'pink', 'bandpass', 520, 1, 0.05, 0.8, 0.6, 1.2);
  }, 5),
  /** A bell tolling very far away. */
  'amb.farBell': sound('ambience', 0.55, 0.9, 0, 4.6, (v, p) => {
    const t = v.t;
    const far = v.filter('lowpass', 1600, 0);
    far.connect(v.out);
    bell(v, t, 330 * (p.pitch ?? 1), 0.22, 4.2, far);
  }, 8),
  /** Lava bubbling: a thick bloop, a sizzle, a few sparks. */
  'amb.lavaPop': sound('ambience', 0.75, 0.4, 0, 1.4, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    glide(v, t, 'sine', 90 * k, 210 * k, 0.15, 0.4, 0.005);
    glide(v, t, 'triangle', 260 * k, 520 * k, 0.12, 0.15, 0.005);
    burst(v, t + 0.14, 'pink', 'bandpass', 700, 1, 0.25, 0.08);
    swell(v, t + 0.15, 'white', 'highpass', 4200, 0, 0.06, 0.05, 0.25, 0.45);
    for (let i = 0; i < 3; i++) burst(v, t + 0.2 + v.rand(0, 0.5), 'white', 'bandpass', v.rand(2500, 5000), 2, 0.06, 0.012);
  }, 0.6),
  /** The void breathing: a swell that rises as if played backwards, a breath of vowel in it. */
  'amb.voidWhisper': sound('ambience', 0.6, 0.85, 0, 2.6, (v) => {
    const t = v.t;
    const f = swell(v, t, 'pink', 'bandpass', 500, 2.5, 0.3, 1.1, 0.1, 0.35);
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 1.2);
    const g = swell(v, t + 0.3, 'white', 'bandpass', 1100, 7, 0.08, 0.8, 0.1, 0.4);
    v.lfo(g.frequency, 0.9, 260, t, t + 1.7);
  }, 6),
  /** A distant glassy tone bending down in the black. */
  'amb.voidTone': sound('ambience', 0.5, 0.9, 0, 3.6, (v, p) => {
    const t = v.t;
    const k = p.pitch ?? 1;
    for (const [r, a] of [[1, 0.16], [1.006, 0.13], [2, 0.05]] as const) {
      const o = v.osc('sine', 880 * k * r, t, t + 3.2);
      o.frequency.setValueAtTime(880 * k * r, t);
      o.frequency.exponentialRampToValueAtTime(700 * k * r, t + 3);
      o.connect(v.swell(t, 0.8, a, 0.8, 1.5)).connect(v.out);
    }
  }, 6),
  /** The Heart's beat, slow and deep, felt through the floor. */
  'amb.heartbeat': sound('ambience', 0.85, 0.5, 0, 1.0, (v) => {
    const t = v.t;
    for (const [at, g] of [[0, 1], [0.24, 0.65]] as const) {
      thump(v, t + at, 80, 42, 0.5 * g, 0.24);
      thump(v, t + at, 260, 150, 0.32 * g, 0.12, 'triangle');
      burst(v, t + at, 'pink', 'bandpass', 480, 1.2, 0.2 * g, 0.07);
    }
  }, 1.2),
} satisfies Record<string, SoundDef>;
