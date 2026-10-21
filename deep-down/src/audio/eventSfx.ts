import { bell, def, glide, noiseBurst, swellNoise, thud, type MobSfxDef } from './mobSfx';

/**
 * The world events' sounds (polish 2, FP; game/events): calm but felt, each its own colour, all
 * synthesized like every other sound (registered into sfx.ts SFX). One cue at each event's start
 * (eventMap 'world:event'), the rock fall's landing on 'world:rockfall', and the flame catching
 * again when a gust is beaten.
 */
export const EVENT_SFX = {
  /** The tremor: a deep shudder from below, grit trickling, and a hollow crack as a pocket opens. */
  'event.tremor': def(0.62, 0.45, 3, 5.6, (v) => {
    const t = v.t;
    const body = swellNoise(v, t, 'brown', 'lowpass', 140, 0.9, 0.9, 0.7, 2.2, 2.4);
    v.lfo(body.frequency, 5.5, 45, t, t + 5.3);
    const sub = v.osc('sine', 33, t, t + 5.4);
    const shake = v.swell(t, 0.8, 0.32, 2.0, 2.4);
    sub.connect(shake).connect(v.out);
    v.lfo(shake.gain, 7.3, 0.12, t, t + 5.3);
    v.osc('sine', 47, t, t + 5.4).connect(v.swell(t, 1.1, 0.12, 1.6, 2.4)).connect(v.out);
    // Grit and pebbles shaken loose, thickest at the peak.
    for (let k = 0; k < 14; k++) noiseBurst(v, t + 0.5 + v.rand(0, 3.2), 'white', 'bandpass', v.rand(1400, 3400), 2.5, v.rand(0.04, 0.1), v.rand(0.02, 0.05));
    // The wall gives: a dull crack with a hollow ring behind it.
    noiseBurst(v, t + 1.25, 'pink', 'bandpass', 900, 0.9, 0.5, 0.18, 0.003);
    thud(v, t + 1.25, 120, 46, 0.55, 0.7);
    const hollow = v.filter('bandpass', 310, 9);
    v.noise('white', t + 1.27, t + 2.4).connect(hollow).connect(v.perc(t + 1.27, 0.004, 0.35, 0.9)).connect(v.out);
  }, 2),
  /** Before the rocks come down: the ceiling creaks under strain and a few pebbles patter. */
  'event.creak': def(1, 0.4, 3, 1.9, (v) => {
    const t = v.t;
    const groan = v.osc('sawtooth', 62, t, t + 1.6);
    groan.frequency.setValueAtTime(58, t);
    groan.frequency.linearRampToValueAtTime(74, t + 0.7);
    groan.frequency.linearRampToValueAtTime(52, t + 1.5);
    const env = v.swell(t, 0.25, 0.42, 0.6, 0.7);
    groan.connect(v.filter('bandpass', 420, 3.5)).connect(env).connect(v.out);
    v.lfo(env.gain, 17, 0.12, t, t + 1.55, 'square');
    for (let k = 0; k < 3; k++) noiseBurst(v, t + 0.15 + k * v.rand(0.25, 0.4), 'pink', 'bandpass', v.rand(500, 900), 4, 0.3, 0.08);
    for (let k = 0; k < 9; k++) noiseBurst(v, t + 0.3 + (k / 9) * 1.2 + v.rand(0, 0.08), 'white', 'bandpass', v.rand(2200, 4200), 3, 0.05 + 0.08 * (k / 9), 0.02);
  }, 1.2),
  /** The rocks land: heavy thuds one after another and a scatter of stone. */
  'event.rockland': def(0.9, 0.35, 3, 2.2, (v, p) => {
    const t = v.t;
    const k = 0.75 + 0.25 * (p.intensity ?? 1);
    for (const [at, f0, peak] of [[0, 96, 0.8], [0.09, 82, 0.6], [0.22, 104, 0.55], [0.4, 74, 0.4]] as const) {
      thud(v, t + at, f0 * v.vary(0.05), 38, peak * k, 0.45);
      noiseBurst(v, t + at, 'brown', 'lowpass', 900, 0.8, 0.55 * peak * k, 0.3, 0.002);
    }
    for (let i = 0; i < 12; i++) noiseBurst(v, t + 0.05 + v.rand(0, 1.1), 'white', 'bandpass', v.rand(1200, 3000), 2, v.rand(0.06, 0.16), v.rand(0.03, 0.08));
    swellNoise(v, t + 0.1, 'pink', 'lowpass', 1500, 0.7, 0.12, 0.2, 0.3, 1.0);
  }, 0.8),
  /** A gust through the passages: wind rising and falling, the lantern flame guttering in it. */
  'event.gust': def(0.75, 0.5, 3, 4.6, (v) => {
    const t = v.t;
    const wind = swellNoise(v, t, 'pink', 'bandpass', 420, 1.3, 0.55, 1.1, 1.2, 2.0);
    wind.frequency.setValueAtTime(260, t);
    wind.frequency.exponentialRampToValueAtTime(820, t + 1.3);
    wind.frequency.exponentialRampToValueAtTime(380, t + 2.6);
    wind.frequency.exponentialRampToValueAtTime(230, t + 4.2);
    v.lfo(wind.frequency, 0.7, 90, t, t + 4.3);
    const hiss = swellNoise(v, t + 0.3, 'pink', 'bandpass', 2400, 0.9, 0.05, 1.0, 0.8, 1.8);
    v.lfo(hiss.frequency, 1.3, 600, t, t + 4.2);
    // The flame flutters: a soft, uneven low flap under the wind.
    const flap = v.filter('lowpass', 260, 1.2);
    const fenv = v.swell(t + 0.6, 0.4, 0.28, 1.2, 1.2);
    v.noise('brown', t + 0.6, t + 3.6).connect(flap).connect(fenv).connect(v.out);
    v.lfo(fenv.gain, 9, 0.2, t + 0.6, t + 3.5);
  }, 3),
  /** The spore geyser: pressure hissing up through the floor, a bubbling, the soft burst of spores. */
  'event.geyser': def(0.75, 0.5, 3, 3.6, (v) => {
    const t = v.t;
    const press = swellNoise(v, t, 'white', 'bandpass', 1800, 2.5, 0.16, 0.8, 0.2, 0.3);
    press.frequency.setValueAtTime(900, t);
    press.frequency.exponentialRampToValueAtTime(2600, t + 1.0);
    for (let k = 0; k < 10; k++) {
      const at = t + v.rand(0.05, 1.0);
      const f = v.rand(180, 420);
      glide(v, at, 'sine', f, f * 1.6, 0.06, 0.1, 0.002);
    }
    // The burst: a breathy whoosh upward, spores glittering as they rise.
    const whoosh = swellNoise(v, t + 0.95, 'pink', 'bandpass', 700, 1.1, 0.6, 0.08, 0.35, 1.4);
    whoosh.frequency.setValueAtTime(500, t + 0.95);
    whoosh.frequency.exponentialRampToValueAtTime(2400, t + 1.6);
    thud(v, t + 0.95, 80, 45, 0.35, 0.4);
    [1318.5, 1760, 2093, 2637].forEach((f, i) => bell(v, t + 1.1 + i * 0.16, f, 0.035, 1.2));
  }, 3),
  /** A crystal bloom: a slow pentatonic chime opening up, with a shimmer held under it. */
  'event.bloom': def(0.9, 0.7, 3, 4.6, (v) => {
    const t = v.t;
    [880, 1108.7, 1318.5, 1661.2, 1760, 2217.5].forEach((f, i) => bell(v, t + i * 0.14 + v.rand(0, 0.03), f * v.vary(0.003), 0.07 - i * 0.006, 2.6));
    for (const [f, a] of [[1760, 0.03], [1764.5, 0.03], [2637, 0.014]] as const) v.osc('sine', f, t + 0.3, t + 4.4).connect(v.swell(t + 0.3, 1.2, a, 1.0, 1.8)).connect(v.out);
    swellNoise(v, t + 0.2, 'white', 'highpass', 6500, 0.7, 0.02, 0.8, 0.6, 1.4);
  }, 3),
  /** The Halden echo light: a warm, beating hum with a breath of voice in it, and one far bell. */
  'event.echo': def(0.65, 0.75, 3, 6.0, (v) => {
    const t = v.t;
    for (const [f, a] of [[110, 0.14], [110.6, 0.12], [164.8, 0.07], [220, 0.05], [329.6, 0.022]] as const) v.osc('sine', f, t, t + 5.8).connect(v.swell(t, 1.4, a, 1.6, 2.6)).connect(v.out);
    const vox = swellNoise(v, t + 0.4, 'pink', 'bandpass', 720, 6, 0.08, 1.2, 1.0, 2.2);
    v.lfo(vox.frequency, 0.35, 120, t, t + 5.6);
    bell(v, t + 0.6, 1318.5, 0.04, 2.8);
  }, 3),
} satisfies Record<string, MobSfxDef>;
