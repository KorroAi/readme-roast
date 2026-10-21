import { describe, expect, it } from 'vitest';
import { WEAPON_NODES, type GearId } from '../../src/config/recipes';
import { EVENT_SFX } from '../../src/audio/eventSfx';
import { sfxForEvent } from '../../src/audio/eventMap';
import { isSfxName, playSfx, SFX } from '../../src/audio/sfx';
import type { SynthTarget } from '../../src/audio/synth';
import type { EventKind } from '../../src/game/events/types';
import { HOIST_EYE_MIN, hoistEyeOffset, hoistSide } from '../../src/game/fp/hoistEye';
import { PLAIN_ROCK_HINT, PlainRockHint } from '../../src/game/fp/plainRockHint';
import { createRide, stepRide } from '../../src/game/ropeRide';
import { nodeArt } from '../../src/ui/screens/nodeIcons';
import { COAT_ROWS, itemRaster, PEBBLE_ROWS, outline, scaleNearest, sprite, pebblePalette } from '../../src/ui/sprites';

// Polish 2 (FP): the Forge's weapon icons, the plain-rock hint, the eye on the hoist, and the
// world events' sounds.

describe('weapon icons in the tree', () => {
  const GEAR: GearId[] = ['gripBoots', 'minersCoat', 'machete', 'sling', 'spear', 'flashCharges'];

  it('gives every Forge weapon and the Flash Charges its own art (never the coat)', () => {
    const arts = GEAR.map((gear) => nodeArt({ kind: 'gear', gear }));
    for (const id of [...WEAPON_NODES, 'flashCharges'] as const) {
      const art = nodeArt({ kind: 'gear', gear: id });
      expect(art.rows, id).not.toBe(COAT_ROWS);
      expect(art.rows.length, id).toBe(16);
      for (const r of art.rows) expect(r.length, id).toBe(16);
      // Every glyph in the art has a colour, and the art keeps a 1 px margin for the dark rim.
      for (const r of art.rows) for (const c of r) if (c !== '.') expect(art.palette[c], `${id} '${c}'`).toBeTypeOf('number');
      expect(art.rows[0]).toBe('.'.repeat(16));
      expect(art.rows.every((r) => r[0] === '.' && r[15] === '.'), id).toBe(true);
    }
    expect(new Set(arts.map((a) => a.rows)).size).toBe(GEAR.length);
  });

  it('shows a Flash Charge in the pack as the bulb, not the fallback pebble', () => {
    const own = itemRaster('flashCharge', 16);
    const pebble = scaleNearest(outline(sprite(PEBBLE_ROWS, pebblePalette(0xfff1c4))), 16);
    expect(own.data.every((v, i) => v === pebble.data[i])).toBe(false);
  });
});

describe('the plain-rock hint', () => {
  it('shows on the first tunk, then never more than once in a while', () => {
    const h = new PlainRockHint();
    let shown = 0;
    // A player tapping plain rock every half second for ten minutes.
    for (let t = 0; t < 600; t += 0.5) if (h.onTunk(t)) shown++;
    // 0 s, 40 s, 120 s, 280 s, 520 s: five times in ten minutes of nonstop tapping.
    expect(shown).toBe(5);
  });

  it('waits for both the gap and a few tunks', () => {
    const h = new PlainRockHint();
    expect(h.onTunk(0)).toBe(true);
    expect(h.onTunk(1)).toBe(false);
    // Long after, but only the second tunk since: not yet.
    expect(h.onTunk(500)).toBe(false);
    expect(h.onTunk(501)).toBe(false);
    expect(h.onTunk(502)).toBe(true);
    for (let k = 0; k < PLAIN_ROCK_HINT.tunksBetween + 2; k++) expect(h.onTunk(510 + k)).toBe(false);
  });
});

describe('the eye on the hoist', () => {
  // The Halden hoist as world/gen/features/places.ts lays it: the head stand, out over the drop
  // (the rope's axis), down the shaft, and off to the foot stand.
  const link = {
    id: 'hoist' as const,
    kind: 'hoist' as const,
    path: [[87.0, 88, 82.5], [85.6, 88.05, 82.5], [85.6, 41.05, 82.5], [85.5, 41, 84.5]] as [number, number, number][],
    speedDown: 9,
    speedUp: 9,
  };
  const side = hoistSide(link.path[1], link.path[3]);

  for (const dir of ['down', 'up'] as const) {
    it(`keeps the eye at least ${HOIST_EYE_MIN} m off the rope's axis, with no jump (${dir})`, () => {
      const ride = createRide(link, dir);
      const out = { x: 0, z: 0 };
      let prev: { x: number; z: number } | null = null;
      let prevOff: { x: number; z: number } | null = null;
      let minAxis = Infinity;
      let maxStep = 0;
      for (let i = 0; i < 100_000; i++) {
        const s = stepRide(ride, 1 / 60);
        hoistEyeOffset(side, s.x, s.z, out);
        const ex = s.x + out.x;
        const ez = s.z + out.z;
        const dAxis = Math.hypot(ex - side.ax, ez - side.az);
        // Only where the rope can be over the lens: within the cage (1.24 m square) of the axis.
        if (Math.hypot(s.x - side.ax, s.z - side.az) < 0.9) minAxis = Math.min(minAxis, dAxis);
        if (prevOff) maxStep = Math.max(maxStep, Math.hypot(out.x - prevOff.x, out.z - prevOff.z));
        prev = { x: ex, z: ez };
        prevOff = { x: out.x, z: out.z };
        if (s.done) break;
      }
      expect(minAxis).toBeGreaterThanOrEqual(HOIST_EYE_MIN);
      // Always on the cage's planks (half-width 0.62 m).
      expect(minAxis).toBeLessThan(0.62);
      // At 60 fps the eye glides off the axis: the offset moves under 9 cm a frame while the feet
      // swing onto the cage at up to 9 m/s (15 cm a frame), so it reads as one diagonal step.
      expect(maxStep).toBeLessThan(0.09);
      expect(prev).not.toBeNull();
      // On the stands at either end the eye is right over the feet.
      const end = ride.pts[ride.pts.length - 1];
      expect(Math.hypot(hoistEyeOffset(side, end[0], end[2], out).x, out.z)).toBe(0);
    });
  }
});

describe('the world events are heard', () => {
  const ev = (kind: EventKind, phase: 'start' | 'end' = 'start', ok?: boolean) =>
    sfxForEvent('world:event', { event: { id: `${kind}-1`, kind, start: 0, end: 10, anchor: [0, 0, 0], radius: 3 }, phase, ok });

  it('gives each event its own cue: tremor, rock fall creak and landing, gust, geyser, bloom, echo', () => {
    expect(ev('tremor')?.name).toBe('event.tremor');
    expect(ev('rockfall')?.name).toBe('event.creak');
    expect(sfxForEvent('world:rockfall', { x: 0, y: 0, z: 0, hit: false })?.name).toBe('event.rockland');
    expect(ev('gust')?.name).toBe('event.gust');
    expect(ev('geyser')?.name).toBe('event.geyser');
    expect(ev('bloom')?.name).toBe('event.bloom');
    expect(ev('echo')?.name).toBe('event.echo');
    const names = ['tremor', 'rockfall', 'gust', 'geyser', 'bloom', 'echo'].map((k) => ev(k as EventKind)!.name);
    expect(new Set(names).size).toBe(6);
    for (const n of names) expect(isSfxName(n)).toBe(true);
    // The creatures' events are heard through the creatures; ends are quiet, but a beaten gust's flame catches.
    expect(ev('migration')).toBeNull();
    expect(ev('treasure')).toBeNull();
    expect(ev('tremor', 'end', true)).toBeNull();
    expect(ev('gust', 'end', false)).toBeNull();
    expect(ev('gust', 'end', true)?.name).toBe('lantern.refueled');
    // Landing on the explorer is heavier than landing beside them.
    expect(sfxForEvent('world:rockfall', { x: 0, y: 0, z: 0, hit: true })!.params.intensity).toBeGreaterThan(sfxForEvent('world:rockfall', { x: 0, y: 0, z: 0, hit: false })!.params.intensity!);
  });

  it('builds every event sound as a valid Web Audio graph that ends within its registered length', () => {
    const errors: string[] = [];
    let latest = 0;
    const param = (v = 0) => {
      const p = {
        value: v,
        setValueAtTime: (x: number, at: number) => (Number.isFinite(x) && at >= 0 ? p : (errors.push(`set ${x}@${at}`), p)),
        linearRampToValueAtTime: (x: number, at: number) => (Number.isFinite(x) && at >= 0 ? p : (errors.push(`lin ${x}@${at}`), p)),
        exponentialRampToValueAtTime: (x: number, at: number) => (x > 0 && Number.isFinite(x) && at >= 0 ? p : (errors.push(`exp ${x}@${at}`), p)),
        setTargetAtTime: () => p,
        cancelScheduledValues: () => p,
      };
      return p;
    };
    const node = (extra: Record<string, unknown> = {}) => {
      const n: Record<string, unknown> = { connect: (d: unknown) => d, disconnect: () => undefined, ...extra };
      return n;
    };
    const source = (extra: Record<string, unknown>) =>
      node({
        ...extra,
        start: (at: number) => (Number.isFinite(at) && at >= 0 ? undefined : errors.push(`start ${at}`)),
        stop: (at: number) => {
          if (!Number.isFinite(at)) errors.push(`stop ${at}`);
          latest = Math.max(latest, at);
        },
      });
    const buf = { duration: 4, length: 4 * 8000, sampleRate: 8000, numberOfChannels: 1 };
    const ctx = {
      sampleRate: 48000,
      currentTime: 0,
      createGain: () => node({ gain: param(1) }),
      createOscillator: () => source({ type: 'sine', frequency: param(440), detune: param(0) }),
      createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
      createBufferSource: () => source({ buffer: null, loop: false, playbackRate: param(1) }),
      createStereoPanner: () => node({ pan: param(0) }),
    };
    const target = { ctx, noise: { white: buf, pink: buf, brown: buf, crumble: [buf], crackle: buf }, out: node(), wet: node(), rand: () => 0.5 } as unknown as SynthTarget;
    for (const name of Object.keys(EVENT_SFX) as Array<keyof typeof EVENT_SFX>) {
      latest = 0;
      errors.length = 0;
      playSfx(target, name, { intensity: 1 }, 0);
      expect(errors, name).toEqual([]);
      expect(latest, name).toBeGreaterThan(0.5);
      expect(latest, name).toBeLessThanOrEqual(SFX[name].length);
    }
  });
});
