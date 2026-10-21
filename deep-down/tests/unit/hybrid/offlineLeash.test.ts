// The offline return with the leash (hybrid SPEC §5.3, §13.1 U-M7; BUILD §3.1 MUST 4).
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { GOLD_X } from '../../../src/idle/config/chart';
import { goldPerHp, KAPPA, rowCostLog10 } from '../../../src/idle/config/curves';
import { nodeAt, nodeOfDepth } from '../../../src/idle/model/chart';
import { crewStopDepth, leashL, setPlayerNode } from '../../../src/idle/model/nodes';
import { awaySeconds, computeOffline, offlineCap, offlineEfficiency, returnFromAway } from '../../../src/idle/model/offline';
import { goldMultLog10 } from '../../../src/idle/model/shaft';
import type { IdleState } from '../../../src/idle/model/state';
import { createHybrid } from '../../../src/idle/model/step';

const SEED = 7;

/** A player standing in chamber i of a lifetime whose Hatch is open and whose Topsoil is seen. */
function at(i: number, seed = SEED): IdleState {
  const s = createHybrid(seed, 0);
  s.meta.sealsOpened = [1];
  for (let k = 0; k < 7; k++) if (!s.meta.seen.includes(k)) s.meta.seen.push(k);
  setPlayerNode(s, i, 'explore');
  // A working crew (the Shovel Hand and the Pick Crew), so the crew digs while the player is away.
  s.run.lines = [40, 20];
  return s;
}

/** The first Glowroot chamber after the Threshold, and the biome's unseen first sight (its Vista). */
function glowroot(seed = SEED): { first: number; vista: number; hall: number } {
  let first = -1;
  let vista = -1;
  let hall = -1;
  for (let i = 0; i < 40; i++) {
    const t = nodeAt(seed, i);
    if (t.biome !== 1) continue;
    if (t.kind !== 'threshold' && first < 0) first = i;
    if (t.kind === 'vista' && vista < 0) vista = i;
    if (t.exitSeal && hall < 0) hall = i;
  }
  return { first, vista, hall };
}

/** A 1/60 s step integration of the row model with the leash stop and the Works haul (G·works/κ × mults per damage). */
function stepped(s: IdleState, from: number, dps: number, seconds: number, stop: number): { depth: number; rows: number; haul: number } {
  let d = from;
  let prog = 0;
  let rows = 0;
  let haul = 0;
  const gph = goldPerHp() / KAPPA;
  const hph = (goldPerHp() * GOLD_X.works) / KAPPA * Math.pow(10, goldMultLog10(s));
  const dt = 1 / 60;
  const steps = Math.round(seconds * 60);
  for (let k = 0; k < steps; k++) {
    let w = dps * dt;
    for (let guard = 0; guard < 1e6 && w > 0; guard++) {
      if (d >= stop) {
        haul += w * hph;
        w = 0;
        break;
      }
      const row = Math.pow(10, rowCostLog10(d));
      const need = row * (1 - prog);
      if (w >= need) {
        w -= need;
        rows += need * gph;
        d++;
        prog = 0;
      } else {
        prog += w / row;
        rows += w * gph;
        w = 0;
      }
    }
  }
  return { depth: d, rows, haul };
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);

describe('U-M7 offline: the closed form with the leash stop', () => {
  const cases: Array<[string, number, number, number]> = [
    // [label, start node offset in Glowroot, rows per second at the start, seconds]
    ['short of the stop', 0, 0.02, 600],
    ['reaches the leash, the rest is Works haul', 0, 0.5, 3600],
    ['deep into the haul', 2, 2, 2 * 3600],
  ];
  for (const [label, off, rps, secs] of cases) {
    it(`equals a 1/60 s step simulation within 1e-9 relative: ${label}`, () => {
      const g = glowroot();
      const s = at(g.first + off);
      const from = s.run.depth;
      const dpsLog10 = rowCostLog10(from) + Math.log10(rps);
      const stop = crewStopDepth(s);
      const r = computeOffline(s, secs, { dpsLog10, eff: 1 });
      const ref = stepped(s, from, Math.pow(10, dpsLog10), secs, stop);
      expect(r.toDepth).toBe(ref.depth);
      expect(r.toDepth).toBeLessThanOrEqual(stop);
      expect(rel(r.goldRows.toNumber(), ref.rows)).toBeLessThan(1e-9);
      if (ref.haul > 0) {
        expect(r.leashStop).toBe(true);
        expect(rel(r.goldGallery.toNumber(), ref.haul)).toBeLessThan(1e-9);
      } else expect(r.goldGallery.isZero()).toBe(true);
    }, 30000);
  }

  it('the cap: 3 h (6 h at 25 Embers, 12 h at 250); efficiency 50 % (75 % at 250 Embers, 100 % at 1e5)', () => {
    const s = at(2);
    expect(offlineCap(s)).toBe(3 * 3600);
    expect(offlineEfficiency(s)).toBe(0.5);
    s.meta.embersMax = Big.from(25);
    expect(offlineCap(s)).toBe(6 * 3600);
    s.meta.embersMax = Big.from(250);
    expect(offlineCap(s)).toBe(12 * 3600);
    expect(offlineEfficiency(s)).toBe(0.75);
    s.meta.embersMax = Big.from(1e5);
    expect(offlineEfficiency(s)).toBe(1);
    const a = awaySeconds(s, 0, 30 * 3600 * 1000, 0);
    expect(a.counted).toBe(12 * 3600);
    expect(a.capped).toBe(true);
  });

  it('the return: the crew\'s chambers wait dark, the player lands at the first dark mouth, up to 3 glimpses', () => {
    const g = glowroot();
    const s = at(g.first);
    const bus = createIdleBus();
    const r = returnFromAway(s, 0, 3 * 3600 * 1000, bus);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.chambers).toBeGreaterThanOrEqual(1);
    expect(r.glimpses.length).toBeLessThanOrEqual(3);
    expect(r.glimpses.length).toBe(Math.min(3, r.chambers));
    expect(s.node.phase).toBe('explore');
    expect(s.node.node).toBe(g.first + 1);
    expect(r.darkNode).toBe(g.first + 1);
    expect(s.node.chambers[s.node.node]?.lit).toBe(false);
    expect(s.node.chambers[s.node.node]?.by).toBe('crew');
    // The gold waits for Collect; the depth never passed the leash stop.
    expect(nodeOfDepth(SEED, s.run.depth).i - s.node.node).toBeLessThanOrEqual(leashL(s));
  });
});
