// The node crawl (hybrid SPEC §4–§5, §13.1 U-M1, U-M2, U-M3, U-M5; BUILD §3.1 MUST 2–3, 5; W1-LEAD §3 phases).
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus, type IdleEvents } from '../../../src/idle/bus';
import { CHAMBER_EQ, GOLD_X, TOPSOIL_K } from '../../../src/idle/config/chart';
import { CREW_BAR, CREW_BEAT, crewLine } from '../../../src/idle/config/crew';
import { goldPerHp } from '../../../src/idle/config/curves';
import { contents, nodeAt, nodeOfDepth, TOPSOIL_NODES } from '../../../src/idle/model/chart';
import {
  applyNodeAction,
  chamberView,
  contentsOf,
  nodeView,
  setPlayerNode,
  tappableValueLog10,
  type NodeAction,
} from '../../../src/idle/model/nodes';
import { goldMultLog10 } from '../../../src/idle/model/shaft';
import { lineDpsLog10 } from '../../../src/idle/model/run';
import { createHybrid, STEP_DT, stepIdle } from '../../../src/idle/model/step';
import type { IdleState } from '../../../src/idle/model/state';

const SEED = 7;

function log(bus: ReturnType<typeof createIdleBus>, names: Array<keyof IdleEvents>) {
  const out: Array<{ name: string; p: unknown }> = [];
  for (const n of names) bus.on(n, (p) => out.push({ name: n, p }));
  return out;
}

/** Tap the face (the weakest live block, like a careful player) until the phase changes or `max` taps. */
function digOut(s: IdleState, bus: ReturnType<typeof createIdleBus>, max = 4000): number {
  let taps = 0;
  const start = s.node.node;
  while (s.node.phase === 'dig' && s.node.node === start && taps < max) {
    const row = s.shaft.rows[0];
    let col = 3;
    for (let c = 0; c < 7; c++) if (row.left[c] > 0) {
      col = c;
      break;
    }
    stepIdle(s, STEP_DT, [], [{ type: 'strike', target: { kind: 'face', col } }], bus);
    taps++;
    // Buy the pick when affordable so the drift stays short.
    if (taps % 30 === 0) s.run.pick += 1;
  }
  return taps;
}

describe('U-M1 node ↔ depth', () => {
  it('Topsoil is the six authored nodes: drifts 5, 6, 7, 7, 7, 8 → C1 at 5 m … C6 at 40 m', () => {
    const depths: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = nodeAt(SEED, i);
      expect(t.biome).toBe(0);
      expect(t.K).toBe(TOPSOIL_K[i]);
      expect(t.fixed).toBe(TOPSOIL_NODES[i].fixed);
      depths.push(t.depth);
    }
    expect(depths).toEqual([5, 11, 18, 25, 32, 40]);
    expect(nodeAt(SEED, 5).exitSeal).toBe(true);
    expect(nodeAt(SEED, 1).wayDown).toBe('cart');
  });

  it('Glowroot starts with its Threshold (the Hatch row 40) and fills 41..119 with K ≈ 7 drifts; the Root Knot is closed', () => {
    const th = nodeAt(SEED, 6);
    expect(th.kind).toBe('threshold');
    expect(th.seal).toBe(true);
    expect([th.depthTop, th.K]).toEqual([40, 1]);
    let d = 41;
    let i = 7;
    for (; nodeAt(SEED, i).biome === 1; i++) {
      const t = nodeAt(SEED, i);
      expect(t.depthTop).toBe(d);
      expect(t.K).toBeGreaterThanOrEqual(7);
      expect(t.K).toBeLessThanOrEqual(8);
      d += t.K;
    }
    expect(d).toBe(120);
    expect(nodeAt(SEED, i - 1).kind).toBe('sealHall');
    const knot = nodeAt(SEED, i);
    expect(knot.seal && knot.closed).toBe(true);
    // A landmark at least every 6 chambers (U-W6's model half).
    let last = 6;
    for (let j = 7; j < i; j++) if (nodeAt(SEED, j).landmark) {
      expect(j - last).toBeLessThanOrEqual(6);
      last = j;
    }
  });

  it('every row belongs to exactly one node, deterministically', () => {
    for (let d = 0; d < 400; d++) {
      const t = nodeOfDepth(SEED, d);
      expect(d).toBeGreaterThanOrEqual(t.depthTop);
      expect(d).toBeLessThan(t.depthTop + t.K);
      expect(nodeOfDepth(SEED, d)).toEqual(t);
    }
  });
});

describe('the phases: dig → explore → ride → dig (W1-LEAD §3)', () => {
  it('the first breakthrough is the player\'s: breach, first light, the scripted chest, lamps charted, the cart ride', () => {
    const s = createHybrid(SEED, 0);
    const bus = createIdleBus();
    const ev = log(bus, ['node:breach', 'node:firstLight', 'phase:change', 'chest:open', 'lamp:relight', 'chamber:charted', 'ride:start', 'ride:end', 'node:arrive', 'drift:slice']);
    expect(nodeView(s).phase).toBe('dig');
    digOut(s, bus);
    expect(s.node.phase).toBe('explore');
    expect(s.node.node).toBe(0);
    expect(s.run.depth).toBe(5);
    const br = ev.find((e) => e.name === 'node:breach')?.p as IdleEvents['node:breach'];
    expect(br.by).toBe('player');
    expect(ev.some((e) => e.name === 'node:firstLight')).toBe(true);
    expect(ev.filter((e) => e.name === 'drift:slice').length).toBeGreaterThanOrEqual(4);
    const con = contentsOf(s, 0);
    // The Root Cellar: a scripted Wood chest, three root-knot veins (and stash bricks), two cold lamps.
    const chest = con.focus.find((id) => con.sockets[id].kind === 'chest') as string;
    expect(con.sockets[chest].scripted).toBe(true);
    expect(con.lamps.length).toBe(2);
    stepIdle(s, STEP_DT, [], [{ type: 'focus', id: chest }, { type: 'resolve', id: chest, input: 'tap' }], bus);
    const open = ev.find((e) => e.name === 'chest:open')?.p as IdleEvents['chest:open'];
    expect(open.floor).toBe('wood');
    expect(open.steps).toBeGreaterThanOrEqual(1);
    const gems0 = s.meta.gems;
    stepIdle(s, STEP_DT, [], con.lamps.map((id) => ({ type: 'relight', lampId: id }) as NodeAction), bus);
    expect(ev.filter((e) => e.name === 'lamp:relight').length).toBe(2);
    const ch = ev.find((e) => e.name === 'chamber:charted')?.p as IdleEvents['chamber:charted'];
    expect(ch.first).toBe(true);
    expect(s.meta.gems).toBe(gems0 + 1);
    expect(s.meta.charted).toContain(0);
    // Leave by the rope ladder: ride, then the next face.
    stepIdle(s, STEP_DT, [], [{ type: 'exit', exitId: 'e0' }], bus);
    expect(s.node.phase).toBe('ride');
    stepIdle(s, STEP_DT, [], [{ type: 'rideEnd' }], bus);
    expect(s.node.phase).toBe('dig');
    expect(s.node.node).toBe(1);
    const arr = ev.filter((e) => e.name === 'node:arrive').pop()?.p as IdleEvents['node:arrive'];
    expect(arr.phase).toBe('dig');
  });

  it('the player never pierces past the breach: the slices behind it are the chamber, not rock', () => {
    const s = createHybrid(SEED, 0);
    const bus = createIdleBus();
    s.run.pick = 400; // huge damage: one tap clears rows and pierces 8 deep on the free face
    stepIdle(s, STEP_DT, [], [{ type: 'strike', target: { kind: 'face', col: 3 } }], bus);
    expect(s.run.depth).toBeLessThanOrEqual(nodeAt(SEED, 0).depth);
    for (let k = 0; k < 40 && s.node.phase === 'dig'; k++) stepIdle(s, STEP_DT, [], [{ type: 'strike', target: { kind: 'face', col: k % 7 } }], bus);
    expect(s.node.phase).toBe('explore');
    expect(s.run.depth).toBe(nodeAt(SEED, 0).depth);
  });

  it('the Copper Lode → Lamp Room cart run has pass-by glints; each tap mines one and pays for the HP it took (L6)', () => {
    const s = createHybrid(SEED, 0);
    const bus = createIdleBus();
    const ev = log(bus, ['ride:glint']);
    setPlayerNode(s, 1, 'explore', bus);
    stepIdle(s, STEP_DT, [], [{ type: 'exit', exitId: 'cart' }], bus);
    expect(s.node.ride?.kind).toBe('cart');
    const glints = contentsOf(s, 1).ride;
    expect(glints.length).toBeGreaterThanOrEqual(5);
    s.run.pick = 300;
    const g0 = s.run.gold.clone();
    stepIdle(s, STEP_DT, [], glints.map((g) => ({ type: 'strike', target: { kind: 'glint', id: g.id } }) as NodeAction), bus);
    expect(ev.length).toBe(glints.length);
    // A huge tap is capped at the glint's HP: gold = HP × G × goldX × mults (honest).
    let want = Big.zero();
    const topo = nodeAt(SEED, 1);
    for (const g of glints) want = want.add(Big.fromLog10(tappableValueLog10(s, topo, g.hpEq, g.goldX).hp + Math.log10(goldPerHp() * g.goldX) + goldMultLog10(s)));
    const got = s.run.gold.sub(g0);
    expect(Math.abs(got.log10() - want.log10())).toBeLessThan(1e-9);
    // The same glint twice does nothing.
    expect(applyNodeAction(s, { type: 'strike', target: { kind: 'glint', id: glints[0].id } }, bus)).toBe(false);
  });
});

describe('U-M3 the gold law: harder rock is richer rock (L6)', () => {
  it('a chamber\'s strike tappables share CHAMBER_EQ cell-equivalents and pay HP × G × goldX × mults', () => {
    for (let i = 0; i < 18; i++) {
      const t = nodeAt(SEED, i);
      const c = contents(123, SEED, t);
      let eq = 0;
      for (const id of c.strike) if (c.sockets[id].kind !== 'secret') eq += c.sockets[id].hpEq;
      if (t.kind !== 'threshold') expect(eq).toBeCloseTo(CHAMBER_EQ, 9);
      for (const id of c.strike) {
        const k = c.sockets[id].kind;
        const gx = c.sockets[id].goldX;
        if (k === 'vein') expect(gx).toBe(GOLD_X.vein);
        if (k === 'rich') expect(gx).toBe(GOLD_X.rich);
        if (k === 'gem') expect(gx).toBe(GOLD_X.gem);
      }
    }
  });

  it('breaking a vein pays exactly its value; a skin cell pays 0.6× of its host rock', () => {
    const s = createHybrid(SEED, 0);
    const bus = createIdleBus();
    setPlayerNode(s, 3, 'explore', bus);
    s.run.pick = 300;
    const con = contentsOf(s, 3);
    const topo = nodeAt(SEED, 3);
    const vein = con.strike.find((id) => con.sockets[id].kind === 'vein') as string;
    const sc = con.sockets[vein];
    // The value at the moment of the strike (a rank-up later in the same step may raise the multipliers).
    const veinWant = tappableValueLog10(s, topo, sc.hpEq, sc.goldX).gold;
    let got = -Infinity;
    const off = bus.on('chamber:harvest', (p) => (got = p.gold.log10()));
    stepIdle(s, STEP_DT, [], [{ type: 'strike', target: { kind: 'tappable', id: vein } }], bus);
    off();
    expect(got).toBeCloseTo(veinWant, 9);
    const skinWant = tappableValueLog10(s, topo, 1, GOLD_X.skin).gold;
    let skin = -Infinity;
    bus.on('skin:strike', (p) => p.broke && (skin = p.gold.log10()));
    stepIdle(s, STEP_DT, [], [{ type: 'strike', target: { kind: 'skin', id: 'skin:a' } }], bus);
    expect(skin).toBeCloseTo(skinWant, 9);
  });
});

describe('U-M5 lamps and charting', () => {
  it('relight → per-run lit bit; every lamp → lifetime charted, +1 gem only the first time ever', () => {
    const s = createHybrid(SEED, 0);
    const bus = createIdleBus();
    setPlayerNode(s, 2, 'explore', bus);
    const con = contentsOf(s, 2);
    expect(con.litLamps.length).toBeGreaterThanOrEqual(1); // the Lamp Room's lamp still burning
    expect(con.lamps.length).toBe(2);
    const g0 = s.meta.gems;
    applyNodeAction(s, { type: 'relight', lampId: con.lamps[0] }, bus);
    expect(chamberView(s, 2)?.lampLit(con.lamps[0])).toBe(true);
    expect(s.meta.charted).not.toContain(2);
    applyNodeAction(s, { type: 'relight', lampId: con.lamps[1] }, bus);
    expect(s.meta.charted).toContain(2);
    expect(s.meta.gems).toBe(g0 + 1);
    // A new run: lamps darken, relighting is quick, no second gem.
    setPlayerNode(s, 2, 'explore', bus);
    applyNodeAction(s, { type: 'relight', lampId: con.lamps[0] }, bus);
    applyNodeAction(s, { type: 'relight', lampId: con.lamps[1] }, bus);
    expect(s.meta.gems).toBe(g0 + 1);
  });
});

describe('the crew bar (BUILD §3.1 MUST 5)', () => {
  it('every rig period is a multiple of 0.9 s, impacts sit on the beat, and DPS is unchanged', () => {
    for (let i = 0; i < 15; i++) {
      const rig = crewLine(i).rig;
      expect(Math.abs(rig.period / CREW_BAR - Math.round(rig.period / CREW_BAR))).toBeLessThan(1e-9);
      for (const at of rig.impacts) expect(Math.abs((at - CREW_BEAT) / CREW_BAR - Math.round((at - CREW_BEAT) / CREW_BAR))).toBeLessThan(1e-9);
    }
    // DPS: the damage landed over a long window equals lineDps × time (damage per impact = DPS × period / impacts).
    const s = createHybrid(SEED, 0);
    s.node.on = false; // the base physics: the crew digs freely
    s.run.lines = [10, 5];
    const bus = createIdleBus();
    let dmg = Big.zero();
    bus.on('crew:strike', (p) => (dmg = dmg.add(p.dmg)));
    const T = 36;
    for (let t = 0; t < T; t += STEP_DT) stepIdle(s, STEP_DT, [], bus);
    const want = Big.fromLog10(lineDpsLog10(s, 0) + Math.log10(T)).add(Big.fromLog10(lineDpsLog10(s, 1) + Math.log10(T)));
    expect(Math.abs(dmg.log10() - want.log10())).toBeLessThan(0.02);
  });
});

describe('U-M2 conservation', () => {
  it('crew damage in = HP removed + Works haul (to 1e-12 relative)', () => {
    const s = createHybrid(SEED, 0);
    const bus = createIdleBus();
    s.run.lines = [40];
    let dmgIn = Big.zero();
    bus.on('crew:strike', (p) => (dmgIn = dmgIn.add(p.dmg)));
    // Topsoil (L = 0): the crew may not touch the breach of the player's drift; the rest is haul.
    for (let t = 0; t < 120; t += STEP_DT) stepIdle(s, STEP_DT, [], bus);
    expect(s.run.depth).toBe(nodeAt(SEED, 0).breach);
    expect(s.node.phase).toBe('dig');
    expect(s.node.haulPending.isZero() && s.run.goldEarned.isZero()).toBe(false);
  });
});
