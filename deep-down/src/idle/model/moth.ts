// The Lucky Moth (SPEC §5.11; BUILD §2.1 SHOULD 2) and entity taps. The first moth is scripted at 1:40
// of play (it crosses slowly, 8 s), then one every 90–180 s of active play on its own clock (7 s each).
// Outcomes: Gold Shower (60 s of income, 55 %), Moth Frenzy (all damage ×7 for 20 s, 20 %), 3 gems
// (15 %), Skill refresh (10 %). It flies off if not tapped: nothing is lost.

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import type { IdleState } from './state';
import { rand } from './tap';

export const MOTH = {
  firstAt: 100,
  firstLife: 8,
  life: 7,
  every: [90, 180] as const,
  /** Active play: a hit within this many seconds. */
  activeWindow: 10,
  odds: { gold: 0.55, frenzy: 0.2, gems: 0.15, refresh: 0.1 },
  goldSeconds: 60,
  frenzySeconds: 20,
  gems: 3,
} as const;

/** Advance the moth's clock (active play only) and expire an uncaught moth. */
export function tickMoth(s: IdleState, dt: number, bus?: IdleBus): void {
  const active = s.time - s.hints.lastHitAt <= MOTH.activeWindow;
  if (s.moth) {
    if (s.time - s.moth.born >= s.moth.life) {
      bus?.emit('moth:gone', { id: s.moth.id });
      const scripted = s.moth.scripted;
      s.moth = null;
      // The scripted moth crosses once more if missed (SPEC §8.2 1:40 fallback).
      s.nextMothAt = scripted ? s.playTime + 3 : s.playTime + mothGap(s);
      if (scripted) s.meta.firstTime.push('moth:missedOnce');
    }
    return;
  }
  if (!s.meta.revealed.includes('surge') && !s.meta.tutorial.done) return; // after Seal 1 (the tutorial's 1:40 beat)
  if (!Number.isFinite(s.nextMothAt)) s.nextMothAt = Math.max(s.playTime + 15, MOTH.firstAt);
  if (!active) {
    s.nextMothAt += dt; // the clock runs on active play only
    return;
  }
  if (s.playTime >= s.nextMothAt) {
    const scripted = !s.meta.firstTime.includes('moth');
    const missedOnce = s.meta.firstTime.includes('moth:missedOnce');
    const life = scripted || missedOnce ? MOTH.firstLife : MOTH.life;
    const id = `moth:${s.nextId++}`;
    s.moth = { id, born: s.time, life, scripted: scripted && !missedOnce };
    if (scripted) s.meta.firstTime.push('moth');
    bus?.emit('moth:spawn', { id, life, scripted });
  }
}

function mothGap(s: IdleState): number {
  return MOTH.every[0] + rand(s) * (MOTH.every[1] - MOTH.every[0]);
}

/** Catch the moth: roll its outcome. */
export function catchMoth(s: IdleState, bus?: IdleBus): boolean {
  const m = s.moth;
  if (!m) return false;
  s.moth = null;
  s.nextMothAt = s.playTime + mothGap(s);
  let r = rand(s);
  // The first catch is always a Gold Shower (the lesson is "moths pay").
  if (!s.meta.firstTime.includes('moth:caught')) {
    s.meta.firstTime.push('moth:caught');
    r = 0;
  }
  const o = MOTH.odds;
  let outcome: 'gold' | 'frenzy' | 'gems' | 'refresh';
  let gold = Big.zero();
  let gems = 0;
  if (r < o.gold) {
    outcome = 'gold';
    const l = s.rates.goldPerSec.log10() + Math.log10(MOTH.goldSeconds);
    gold = Number.isFinite(l) ? Big.fromLog10(l) : Big.from(30);
    s.run.gold.addIn(gold);
    s.run.goldEarned.addIn(gold);
    s.meta.lifetime.gold.addIn(gold);
    bus?.emit('gold:gain', { amount: gold.clone(), source: 'moth', col: -1, depth: s.run.depth });
  } else if (r < o.gold + o.frenzy) {
    outcome = 'frenzy';
    s.run.frenzyEnd = Math.max(s.run.frenzyEnd, s.time + MOTH.frenzySeconds);
  } else if (r < o.gold + o.frenzy + o.gems) {
    outcome = 'gems';
    gems = MOTH.gems;
    s.meta.gems += gems;
    bus?.emit('gems:gain', { amount: gems, source: 'moth', col: -1, depth: s.run.depth });
  } else {
    outcome = 'refresh';
    for (const k of Object.values(s.run.skills)) k.cdEnd = 0;
  }
  s.meta.stats.events++;
  bus?.emit('moth:catch', { id: m.id, outcome, gold, gems });
  return true;
}

/** Entity taps moved to entities.ts (every tappable kind); kept as a re-export for older imports. */
export { tapEntity } from './entities';
