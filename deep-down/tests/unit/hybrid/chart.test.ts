// Chamber economy and the chart (hybrid SPEC §4.4, §5.2, §13.1 U-M4, U-M8, U-M9; BUILD §3.1 MUST 2–3).
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { CLASS_ON, PER_BIOME_MIN, PITY_APART, RACK_MAX_ITEMS } from '../../../src/idle/config/chart';
import { crewLine } from '../../../src/idle/config/crew';
import { goldPerHp, KAPPA } from '../../../src/idle/config/curves';
import { contents, contentsClass, nodeAt, type ContentsClass } from '../../../src/idle/model/chart';
import { applyNodeAction, contentsOf, setPlayerNode, tappableValueLog10 } from '../../../src/idle/model/nodes';
import { lineDpsLog10, tapBaseLog10 } from '../../../src/idle/model/run';
import { goldMultLog10 } from '../../../src/idle/model/shaft';
import type { IdleState } from '../../../src/idle/model/state';
import { createHybrid, STEP_DT, stepIdle } from '../../../src/idle/model/step';
import { simNodes } from '../../../src/idle/sim/nodeBot';

const L10 = Math.log10;

describe('U-M4 a player strike on a chamber special pays ≥ 10× a crew strike at the same depth (median over seeds)', () => {
  it('median over seeds 7, 11, 23, 31, 47 of every special the bot meets, against the best hired line\'s impact', () => {
    const ratios: number[] = [];
    for (const seed of [7, 11, 23, 31, 47]) {
      let last = -1;
      simNodes({
        seed,
        probe: (s) => {
          if (s.node.phase !== 'explore' || s.node.node === last) return;
          last = s.node.node;
          const i = s.node.node;
          const topo = nodeAt(s.seed, i);
          const con = contentsOf(s, i);
          // The crew's strike: the best hired line's damage per impact on the face, at the face's gold per damage.
          let crew = -Infinity;
          s.run.lines.forEach((lv, k) => {
            if (lv <= 0) return;
            const rig = crewLine(k).rig;
            crew = Math.max(crew, lineDpsLog10(s, k) + L10(rig.period / rig.impacts.length));
          });
          if (crew === -Infinity) return;
          const crewGold = crew + L10(goldPerHp() / KAPPA) + goldMultLog10(s);
          const tap = tapBaseLog10(s);
          for (const id of con.strike) {
            const sc = con.sockets[id];
            if (sc.kind === 'secret') continue;
            const v = tappableValueLog10(s, topo, sc.hpEq, sc.goldX);
            const strikes = Math.max(1, Math.ceil(Math.pow(10, v.hp - tap)));
            ratios.push(v.gold - L10(strikes) - crewGold);
          }
        },
      });
    }
    ratios.sort((a, b) => a - b);
    const median = Math.pow(10, ratios[Math.floor(ratios.length / 2)]);
    expect(ratios.length).toBeGreaterThan(100);
    expect(median).toBeGreaterThanOrEqual(10);
  }, 60000);
});

/** Standing in chamber i (lit) with the Hatch open. */
function inChamber(i: number, seed = 7): IdleState {
  const s = createHybrid(seed, 0);
  s.meta.sealsOpened = [1];
  setPlayerNode(s, i, 'explore');
  return s;
}

describe('U-M8 nothing is lost (L11)', () => {
  it('skipped chests and relics reach the rack; a full rack pays the chest as gold; the relic is still graded', () => {
    const bus = createIdleBus();
    // C4 the Reliquary (a relic), C5 the Cache (a Copper-floor chest): leave both without opening anything.
    const s = inChamber(3);
    expect(applyNodeAction(s, { type: 'exit', exitId: 'x' }, bus)).toBe(true);
    expect(s.node.rackRelics).toEqual(['find:0:4']);
    applyNodeAction(s, { type: 'rideEnd' }, bus);
    setPlayerNode(s, 4, 'explore');
    s.node.rackRelics = ['find:0:4'];
    applyNodeAction(s, { type: 'exit', exitId: 'x' }, bus);
    expect(s.run.rack).toContain(1);
    // A full rack: the next skipped chest opens as gold at once (never dropped).
    s.run.rack = Array.from({ length: RACK_MAX_ITEMS }, () => 0);
    s.node.rackRelics = [];
    applyNodeAction(s, { type: 'rideEnd' }, bus);
    setPlayerNode(s, 4, 'explore');
    const opens: string[] = [];
    bus.on('chest:open', (e) => opens.push(e.source));
    applyNodeAction(s, { type: 'exit', exitId: 'x' }, bus);
    expect(s.run.rack.length).toBe(RACK_MAX_ITEMS);
    expect(opens).toContain('rack');
  });

  it('leftover specials join the Works at their own value; a chipped one pays its chipped part now', () => {
    const s = inChamber(7);
    const bus = createIdleBus();
    const con = contentsOf(s, 7);
    const topo = nodeAt(s.seed, 7);
    const ids = con.strike.filter((id) => con.sockets[id].kind !== 'secret');
    expect(ids.length).toBeGreaterThan(1);
    // Chip the first special (a weak tap: a quarter of its HP).
    const first = ids[0];
    const v0 = tappableValueLog10(s, topo, con.sockets[first].hpEq, con.sockets[first].goldX);
    s.run.pick = 1;
    for (let k = 0; k < 400 && (s.node.chambers[7].left[first] ?? 1) > 0.75; k++) applyNodeAction(s, { type: 'strike', target: { kind: 'tappable', id: first } }, bus);
    const left0 = s.node.chambers[7].left[first] ?? 1;
    expect(left0).toBeLessThan(1);
    expect(left0).toBeGreaterThan(0);
    let wantHp = Big.fromLog10(v0.hp + L10(left0));
    let wantGold = Big.fromLog10(v0.gold + L10(left0));
    for (const id of ids.slice(1)) {
      const v = tappableValueLog10(s, topo, con.sockets[id].hpEq, con.sockets[id].goldX);
      wantHp = wantHp.add(Big.fromLog10(v.hp));
      wantGold = wantGold.add(Big.fromLog10(v.gold));
    }
    // Secrets broken open count too; unfound ones stay secrets (nothing found yet).
    const g0 = s.run.gold.clone();
    applyNodeAction(s, { type: 'exit', exitId: 'x' }, bus);
    const paid = s.run.gold.sub(g0);
    expect(Math.abs(paid.log10() - (v0.gold + L10(1 - left0)))).toBeLessThan(1e-9);
    expect(Math.abs(s.node.worksHp.log10() - wantHp.log10())).toBeLessThan(1e-9);
    expect(Math.abs(s.node.worksGold.log10() - wantGold.log10())).toBeLessThan(1e-9);
  });

  it('a failed seal keeps 50 % of the damage dealt and waits for the next tap', () => {
    // A first lifetime at the Lift Bottom: the Hatch is still shut.
    const s = createHybrid(7, 0);
    setPlayerNode(s, 5, 'explore');
    const bus = createIdleBus();
    s.run.pick = 30;
    expect(applyNodeAction(s, { type: 'exit', exitId: 'hatch' }, bus)).toBe(true);
    expect(s.node.phase).toBe('seal');
    stepIdle(s, STEP_DT, [], [], bus);
    expect(s.seal).not.toBeNull();
    for (let k = 0; k < 3; k++) stepIdle(s, STEP_DT, [], [{ type: 'strike', target: { kind: 'seal', weak: false } }], bus);
    const dealt = 1 - (s.seal?.left ?? 1);
    expect(dealt).toBeGreaterThan(0);
    expect(dealt).toBeLessThan(1);
    for (let t = 0; t < 31; t += STEP_DT) stepIdle(s, STEP_DT, [], [], bus);
    expect(s.seal?.phase).toBe('held');
    expect(Math.abs((s.seal?.left ?? 0) - (1 - dealt * 0.5))).toBeLessThan(1e-9);
    stepIdle(s, STEP_DT, [], [{ type: 'strike', target: { kind: 'seal', weak: false } }], bus);
    expect(s.seal?.phase).toBe('fight');
  });
});

describe('U-M9 the chart', () => {
  const ordinary = (seed: number, j: number) => {
    const t = nodeAt(seed, j);
    return t.kind === 'chamber' || t.kind === 'landmark' || t.biome === 0;
  };

  for (const lifeSeed of [7, 11, 23]) {
    it(`pity floors (life ${lifeSeed}, 12 runs, nodes 0–200): Cache ≤ ${PITY_APART.cache}, Reliquary ≤ ${PITY_APART.reliquary}, Geode ≤ ${PITY_APART.geode} ordinary chambers apart; ≥ ${PER_BIOME_MIN.notes} notes per biome`, () => {
      for (let run = 0; run < 12; run++) {
        const runSeed = (lifeSeed * 7919 + run * 104729) >>> 0;
        const gap: Record<string, number> = { cache: 0, reliquary: 0, geode: 0 };
        const worst: Record<string, number> = { cache: 0, reliquary: 0, geode: 0 };
        const notes = new Map<number, number>();
        for (let j = 0; j <= 200; j++) {
          const t = nodeAt(lifeSeed, j);
          const cls: ContentsClass = contentsClass(runSeed, lifeSeed, j);
          if (t.biome > 0 && cls === 'haldenCamp') notes.set(t.biome, (notes.get(t.biome) ?? 0) + 1);
          if (!ordinary(lifeSeed, j)) continue;
          for (const c of Object.keys(gap)) {
            if (cls === c) gap[c] = 0;
            else gap[c]++;
            worst[c] = Math.max(worst[c], gap[c]);
          }
        }
        expect(worst.cache, `run ${run}`).toBeLessThanOrEqual(PITY_APART.cache - 1);
        expect(worst.reliquary, `run ${run}`).toBeLessThanOrEqual(PITY_APART.reliquary - 1);
        expect(worst.geode, `run ${run}`).toBeLessThanOrEqual(PITY_APART.geode - 1);
        // Every whole generated biome inside the window holds at least three Halden notes (Topsoil holds its authored three).
        const lastBiome = nodeAt(lifeSeed, 200).biome;
        for (let b = 1; b < lastBiome; b++) expect(notes.get(b) ?? 0, `biome ${b}, run ${run}`).toBeGreaterThanOrEqual(PER_BIOME_MIN.notes);
      }
    });
  }

  it('Topsoil holds its authored three notes; W2 classes (Depot, Lamp Hall) are folded into Gallery in this build', () => {
    const notes: string[] = [];
    for (let j = 0; j < 6; j++) notes.push(...contents(1, 7, nodeAt(7, j)).notes);
    expect(notes).toEqual(['lore:0:note0', 'lore:0:note1', 'lore:0:note2']);
    expect(CLASS_ON.depot).toBe(false);
    expect(CLASS_ON.lampHall).toBe(false);
    for (let run = 0; run < 8; run++) for (let j = 0; j < 120; j++) {
      const cls = contentsClass(run * 31 + 5, 7, j);
      expect(cls === 'depot' || cls === 'lampHall').toBe(false);
    }
  });

  it('a new run re-rolls the contents but keeps the topology and the template ids', () => {
    let changed = 0;
    for (let j = 6; j < 18; j++) {
      const t = nodeAt(7, j);
      const a = contents(1001, 7, t);
      const b = contents(2002, 7, t);
      expect(a.template).toBe(b.template);
      expect(Object.keys(a.sockets).sort()).toEqual(Object.keys(b.sockets).sort());
      if (a.cls !== b.cls || JSON.stringify(a.sockets) !== JSON.stringify(b.sockets)) changed++;
      // Same run, same contents (deterministic).
      expect(JSON.stringify(contents(1001, 7, t).sockets)).toBe(JSON.stringify(a.sockets));
    }
    expect(changed).toBeGreaterThanOrEqual(6);
    // The topology is the lifetime's: the same node, the same depth, whatever the run.
    expect(nodeAt(7, 12)).toEqual(nodeAt(7, 12));
  });
});

describe('the W1 text: every entry the slice can show has its words (no raw id on screen)', () => {
  it('Finds, notes, murals and seal cards of Topsoil and Glowroot; the relic grades; the seal names', async () => {
    const { en } = await import('../../../src/i18n/en');
    const { entryTextKey } = await import('../../../src/idle/model/codex');
    const { pageEntries } = await import('../../../src/idle/config/codex');
    const { RELIC_GRADES } = await import('../../../src/idle/config/chart');
    const { BIOMES } = await import('../../../src/idle/config/biomes');
    expect(entryTextKey('find:0:4')).toBe('idle.find.0.4');
    expect(entryTextKey('lore:1:note2')).toBe('lore:1:note2');
    expect(entryTextKey('nonsense')).toBe('');
    for (const b of [0, 1]) for (const id of pageEntries(b)) expect(entryTextKey(id) in en, id).toBe(true);
    for (const g of RELIC_GRADES) expect(`idle.grade.${g}` in en, g).toBe(true);
    for (const b of BIOMES) expect(`idle.mech.${b.seal}` in en, b.seal).toBe(true);
    // The contents the chart can place in W1 (Topsoil and Glowroot) only name lore that has text.
    for (let run = 0; run < 6; run++) for (let j = 0; j < 18; j++) {
      const c = contents(run * 977 + 3, 7, nodeAt(7, j));
      for (const n of c.notes) expect(n in en, n).toBe(true);
      for (const sc of Object.values(c.sockets)) if (sc.relic) expect(entryTextKey(sc.relic) in en, sc.relic).toBe(true);
    }
  });
});
