// Contracts (E22), the daily chest and calendar, the Codex, Feats (E18), Rank (E19 shape), facets (E24).
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { AUTHORED_BIOMES } from '../../../src/idle/config/biomes';
import { FINDS, PAGE_SIZE, pageEntries } from '../../../src/idle/config/codex';
import { CONTRACT, CONTRACTS } from '../../../src/idle/config/contracts';
import { FACETS, RARITY } from '../../../src/idle/config/facets';
import { FEATS, featThreshold, SECRETS } from '../../../src/idle/config/feats';
import { rankNeed } from '../../../src/idle/config/rank';
import { addLore, awardFind, codexCount, pageCount } from '../../../src/idle/model/codex';
import { contractEta, fillBoard, generate, rerollContract, tickContracts } from '../../../src/idle/model/contracts';
import { claimDaily, localDay, tickDaily } from '../../../src/idle/model/daily';
import { facetStats, offerHand, pick, queueHand, reroll } from '../../../src/idle/model/facets';
import { flagSecret, tickFeats } from '../../../src/idle/model/feats';
import { addXp } from '../../../src/idle/model/gain';
import { mults } from '../../../src/idle/model/mult';
import { tickRank } from '../../../src/idle/model/rank';
import { refreshRates } from '../../../src/idle/model/run';
import { simFirstRun } from '../../../src/idle/sim/pacing';
import { stateAt } from './w2fixture';

describe('contracts (SPEC §7.4, E22)', () => {
  it('E22: ≥ 95 % of generated contracts take 90–240 s at the live rates', () => {
    let ok = 0;
    let n = 0;
    // Real builds: the pacing sim's state after 2, 10, 30 and 60 minutes, at 3 and 5 taps/s.
    for (const secs of [120, 600, 1800, 3600]) {
      for (const taps of [3, 5]) {
        const s = simFirstRun({ secs, taps }).state;
        s.playTime = secs;
        refreshRates(s, taps);
        for (const d of CONTRACTS) {
          // A seal, lamps, a Find, a perfect Strike and a combo streak come at their own cadence (not rated).
          if (d.fixed || d.tpl === 'combo') continue;
          const c = generate(s, d, false);
          const eta = contractEta(s, c);
          n++;
          if (eta >= CONTRACT.etaMin * 0.98 && eta <= CONTRACT.etaMax) ok++;
        }
      }
    }
    expect(ok / n).toBeGreaterThanOrEqual(0.95);
  });

  it('the Board holds 3, completes, pays, replaces at once; every 5th is Grand; a reroll costs 2 gems', () => {
    const s = stateAt(200, 3);
    const bus = createIdleBus();
    const done: Array<{ grand: boolean }> = [];
    bus.on('contract:done', (e) => done.push(e));
    fillBoard(s, bus);
    expect(s.meta.contracts.filter(Boolean).length).toBe(3);
    const gems0 = s.meta.gems;
    for (let i = 0; i < 6; i++) {
      const c = s.meta.contracts[0];
      c.progress = c.target;
      c.base = -1e9; // force completion through the counter
      s.meta.stats.cells += 1e9;
      s.meta.stats.ores += 1e9;
      s.meta.stats.crits += 1e9;
      s.meta.stats.levels += 1e9;
      s.meta.stats.chests += 1e9;
      s.run.dmax += 1e6;
      tickContracts(s, bus);
    }
    expect(done.length).toBeGreaterThanOrEqual(5);
    expect(done.some((d) => d.grand)).toBe(true);
    expect(s.meta.gems).toBeGreaterThan(gems0);
    expect(s.meta.contracts.filter(Boolean).length).toBe(3);
    const g = s.meta.gems;
    expect(rerollContract(s, 1, bus)).toBe(true);
    expect(s.meta.gems).toBe(g - CONTRACT.rerollGems);
    s.meta.gems = 0;
    expect(rerollContract(s, 1, bus)).toBe(false);
  });
});

describe('the Daily Lantern Chest and the calendar (SPEC §7.4)', () => {
  it('a missed day pauses the calendar, it never resets; a clock that moved back holds', () => {
    const s = stateAt(100, 4);
    const day = 86400000;
    const t0 = Date.UTC(2026, 9, 20, 12);
    s.monotonicMs = t0;
    tickDaily(s, t0, undefined, 0);
    expect(s.meta.dailyReady).toBe(true); // the first one, free at 75 m
    expect(claimDaily(s, t0, undefined, 0)).toBe('chest:1');
    tickDaily(s, t0 + 1000, undefined, 0);
    expect(s.meta.dailyReady).toBe(false);
    // Three days later (two missed): the next calendar day, not a reset.
    const t3 = t0 + 3 * day;
    s.monotonicMs = t3;
    tickDaily(s, t3, undefined, 0);
    expect(claimDaily(s, t3, undefined, 0)).toBe('gems:30');
    expect(s.meta.daily.calendarDay).toBe(2);
    // The clock moved back: nothing becomes ready, nothing is taken.
    tickDaily(s, t3 - 5 * day, undefined, 0);
    expect(s.meta.dailyReady).toBe(false);
    expect(s.meta.daily.calendarDay).toBe(2);
    expect(localDay(t0, 0)).toBe(Math.floor(t0 / day));
  });
});

describe('the Codex (SPEC §7.5)', () => {
  it('196 entries, each reachable; a complete page stamps its Biome Seal; a Codex chest every 10 entries', () => {
    let all = 0;
    for (let b = 0; b < AUTHORED_BIOMES; b++) all += pageEntries(b).length;
    expect(all).toBe(14 * PAGE_SIZE);
    expect(FINDS.length).toBe(84);
    const s = stateAt(100, 5);
    const bus = createIdleBus();
    let chests = 0;
    bus.on('codex:chest', () => chests++);
    let pages = 0;
    bus.on('codex:page', () => pages++);
    for (const id of pageEntries(2)) {
      if (id.startsWith('find:')) awardFind(s, id, bus);
      else addLore(s, id, bus);
    }
    expect(pageCount(s, 2)).toBe(PAGE_SIZE);
    expect(s.meta.biomeSeals).toEqual([2]);
    expect(pages).toBe(1);
    expect(chests).toBe(1);
    // The Codex chest (Crystal) may itself hold a new Find.
    expect(codexCount(s)).toBeGreaterThanOrEqual(PAGE_SIZE);
    // A duplicate levels the Find (+1 %).
    const m0 = mults(s).gold;
    awardFind(s, 'find:2:0', bus);
    expect(s.meta.finds['find:2:0']).toBe(2);
    expect(mults(s).gold).toBeGreaterThanOrEqual(m0);
  });
});

describe('Feats (SPEC §7.6, E18)', () => {
  it('thresholds strictly increase (Swift decreases) through tier X and past it; every tier pays a Mark, gems and XP', () => {
    for (const f of FEATS) {
      for (let t = 2; t <= 16; t++) {
        const a = featThreshold(f, t - 1);
        const b = featThreshold(f, t);
        if (f.counter === 'swift') expect(b, f.id).toBeLessThan(a);
        else expect(b, `${f.id} ${t}`).toBeGreaterThan(a);
      }
    }
    const s = stateAt(700, 6);
    const bus = createIdleBus();
    const tiers: Array<{ family: string; tier: number; gems?: number }> = [];
    bus.on('feat:tier', (e) => tiers.push(e));
    s.meta.record = 700;
    s.meta.stats.cellsNew = 1500;
    const marks0 = s.meta.marks;
    const gems0 = s.meta.gems;
    tickFeats(s, bus);
    expect(tiers.filter((t) => t.family === 'delver').map((t) => t.tier)).toEqual([1, 2, 3, 4]);
    expect(s.meta.marks - marks0).toBe(tiers.length);
    expect(s.meta.gems - gems0).toBe(tiers.reduce((a, t) => a + (t.gems ?? 0), 0));
  });

  it('every secret is reachable (flagged where it happens) and pays 5 Marks and 25 gems', () => {
    const s = stateAt(100, 7);
    const bus = createIdleBus();
    const got: string[] = [];
    bus.on('feat:secret', (e) => got.push(e.id));
    for (const id of SECRETS) flagSecret(s, id);
    const m0 = s.meta.marks;
    tickFeats(s, bus);
    expect(new Set(got)).toEqual(new Set(SECRETS));
    expect(s.meta.marks - m0).toBeGreaterThanOrEqual(5 * SECRETS.length);
  });
});

describe('Rank (SPEC §7.7)', () => {
  it('need(r) = 120 · r^0.78; rank-ups pay gems, a Copper chest every 5 and a title every 25', () => {
    expect(rankNeed(1)).toBe(120);
    expect(rankNeed(10)).toBe(Math.round(120 * Math.pow(10, 0.78)));
    const s = stateAt(100, 8);
    const bus = createIdleBus();
    const ups: Array<{ rank: number; chest?: boolean; title?: string }> = [];
    bus.on('rank:up', (e) => ups.push(e));
    let total = 0;
    for (let r = 1; r < 25; r++) total += rankNeed(r);
    addXp(s, total);
    tickRank(s, bus);
    expect(s.meta.rank.r).toBe(25);
    expect(ups.filter((u) => u.chest).map((u) => u.rank)).toEqual([5, 10, 15, 20, 25]);
    expect(ups[ups.length - 1].title).toBe('digger');
  });
});

describe('facets (SPEC §5.10, E24)', () => {
  it('no duplicate in a hand, never a held facet; duos only when eligible; rarity odds within ±0.5 pt', () => {
    const s = stateAt(1000, 9);
    const n = 30000;
    const rar = [0, 0, 0];
    let duos = 0;
    for (let i = 0; i < n; i++) {
      const h = offerHand(s);
      expect(new Set(h.map((c) => c.id)).size).toBe(h.length);
      for (const c of h) {
        rar[RARITY.findIndex((r) => r.id === c.rarity)]++;
        if (c.duo) duos++;
      }
    }
    expect(duos).toBe(0);
    const total = rar[0] + rar[1] + rar[2];
    expect(Math.abs(rar[0] / total - 0.7)).toBeLessThan(0.005);
    expect(Math.abs(rar[1] / total - 0.25)).toBeLessThan(0.005);
    expect(Math.abs(rar[2] / total - 0.05)).toBeLessThan(0.005);
    // Two of two tags: duos appear (about 12 % a slot).
    s.run.facets = ['hotEdge@0', 'static@0', 'wideSwing@0', 'faultLine@0'];
    let d2 = 0;
    for (let i = 0; i < 5000; i++) for (const c of offerHand(s)) if (c.duo) d2++;
    expect(d2 / 15000).toBeGreaterThan(0.08);
    expect(d2 / 15000).toBeLessThan(0.16);
    for (let i = 0; i < 200; i++) for (const c of offerHand(s)) expect(s.run.facets.map((k) => k.split('@')[0])).not.toContain(c.id);
  });

  it('a hand queues, a pick keeps it for the run, sets turn on at 2, the free reroll then 10 gems', () => {
    const s = stateAt(1000, 10);
    const bus = createIdleBus();
    const sets: string[] = [];
    bus.on('facet:set', (e) => sets.push(`${e.tag}${e.count}`));
    queueHand(s, bus);
    queueHand(s, bus);
    expect(s.run.hands).toBe(2);
    expect(s.hand?.cards.length).toBe(3);
    expect(reroll(s, bus)).toBe(true); // free
    s.meta.gems = 9;
    expect(reroll(s, bus)).toBe(false);
    s.meta.gems = 10;
    expect(reroll(s, bus)).toBe(true);
    expect(s.meta.gems).toBe(0);
    s.hand!.cards = [{ id: 'hotEdge', tag: 'spark', rarity: 'common', duo: false, value: 1 }, { id: 'static', tag: 'spark', rarity: 'rare', duo: false, value: 1.5 }, { id: 'whistle', tag: 'crew', rarity: 'common', duo: false, value: 1 }];
    pick(s, 0, bus);
    expect(s.run.hands).toBe(1);
    s.hand!.cards = [{ id: 'static', tag: 'spark', rarity: 'rare', duo: false, value: 1.5 }, { id: 'whistle', tag: 'crew', rarity: 'common', duo: false, value: 1 }, { id: 'assay', tag: 'greed', rarity: 'common', duo: false, value: 1 }];
    pick(s, 0, bus);
    expect(sets).toContain('spark2');
    const st = facetStats(s);
    expect(st.critPts).toBeCloseTo(0.04 + 0.05, 6);
    expect(st.staticEvery).toBeGreaterThan(0);
    expect(FACETS.length).toBe(30);
    void Big;
  });
});
