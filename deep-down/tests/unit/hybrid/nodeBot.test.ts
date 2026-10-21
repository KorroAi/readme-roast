// The node-paced bot (hybrid SPEC §5.12, §13.2; BUILD §3.1 MUST 8): it plays the real crawl to W1's end, deterministically.
import { describe, expect, it } from 'vitest';
import { nodeAt } from '../../../src/idle/model/chart';
import { NODE_TARGETS, simNodes } from '../../../src/idle/sim/nodeBot';

describe('the node-paced bot', () => {
  const r = simNodes({ seed: 7 });

  it('plays from the first launch to the closed Root Knot (W1 ends at 119 m)', () => {
    expect(r.end).toBe('rootKnot');
    expect(r.state.run.depth).toBe(120);
    const hall = nodeAt(7, r.state.node.node);
    expect(hall.exitSeal).toBe(true);
    expect(nodeAt(7, r.state.node.node + 1).closed).toBe(true);
  });

  it('meets every phase in order: the six Topsoil chambers, the Hatch, the Threshold, the Vista, the Seal hall', () => {
    expect(r.chambers.slice(0, 6).map((c) => c.fixed)).toEqual([
      'topsoil.rootCellar', 'topsoil.copperLode', 'topsoil.lampRoom', 'topsoil.reliquary', 'topsoil.cache', 'topsoil.liftBottom',
    ]);
    // First light is the player's in Topsoil (L = 0): every Topsoil chamber was broken into by the player.
    for (const c of r.chambers.slice(0, 6)) expect(c.by).toBe('player');
    expect(r.firstBreach).toBeLessThan(r.hatch);
    expect(r.hatch).toBeLessThan(r.vista);
    expect(r.vista).toBeLessThan(r.rootKnot);
    expect(r.phaseSecs.dig).toBeGreaterThan(0);
    expect(r.phaseSecs.explore).toBeGreaterThan(0);
    expect(r.phaseSecs.ride).toBeGreaterThan(0);
    expect(r.phaseSecs.seal).toBeGreaterThan(0);
    // The tutorial's steps and the seal lesson show up in the session.
    const ids = r.prompts.map((p) => p[0]);
    expect(ids[0]).toBe('tapRock');
    expect(ids).toContain('lesson:seal');
    expect(r.state.meta.tutorial.done).toBe(true);
  });

  it('is deterministic per seed', () => {
    const b = simNodes({ seed: 7 });
    expect(b.t).toBe(r.t);
    expect(b.chambers).toEqual(r.chambers);
    expect(b.goldBy).toEqual(r.goldBy);
  });

  it('S1 partial: taps per block p50 ≤ 4; chamber gold share is measured (25–35 % band reported, not tuned)', () => {
    expect(r.tpb[1]).toBeLessThanOrEqual(4);
    expect(r.chamberShare).toBeGreaterThan(0);
    expect(r.chamberShare).toBeLessThan(1);
  });

  // S1's §5.12 time bands for 0–120 m. The curves are frozen (BUILD rule 12); K and CHAMBER_EQ are tuned with the lead.
  // At 4 taps/s and a 1 s mean walk per chamber target the bot is early on every band (see `npm run sim -- nodes`), so this
  // stays an honest expected failure until the tuning lands.
  it.fails('S1: every §5.12 milestone of 0–120 m inside its band', () => {
    for (const [k, name, lo, hi] of NODE_TARGETS) {
      const v = r[k] as number;
      expect(v, name).toBeGreaterThanOrEqual(lo);
      expect(v, name).toBeLessThanOrEqual(hi);
    }
  });
});
