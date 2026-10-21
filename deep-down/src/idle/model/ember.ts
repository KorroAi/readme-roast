// The Drifting Ember (hybrid SPEC §5.6; the purge recast the cutaway's event as an ember). A lit ember drifts
// out of a crack across the frame for 7 s; one tap catches it. First at ≈ 11 min of active play, then every 90–180 s.
// Outcomes (the same table as before): a Gold Shower (60 s of income, 55 %), an Ember Frenzy (all damage ×7 for 20 s,
// 20 %), 3 gems (15 %), a skill refresh (10 %). It drifts off if not tapped: nothing is lost.
//
// Dormant in W1 (`EMBER.enabled` false): the Director's events arrive in W2, and the slice stays calm.

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import type { IdleState } from './state';
import { rand } from './tap';

export const EMBER = {
  /** Off in this build (W2 turns the Director's events on). */
  enabled: false,
  /** First ember after this much play (s, ≈ 11 min: session 2 in the SPEC's pacing). */
  firstAt: 660,
  life: 7,
  every: [90, 180] as const,
  /** Active play: a hit within this many seconds. */
  activeWindow: 10,
  odds: { gold: 0.55, frenzy: 0.2, gems: 0.15, refresh: 0.1 },
  goldSeconds: 60,
  frenzySeconds: 20,
  gems: 3,
} as const;

/** Advance the ember's clock (active play only) and let an uncaught ember drift off. */
export function tickEmber(s: IdleState, dt: number, bus?: IdleBus): void {
  if (!EMBER.enabled) return;
  const active = s.time - s.hints.lastHitAt <= EMBER.activeWindow;
  if (s.ember) {
    if (s.time - s.ember.born >= s.ember.life) {
      bus?.emit('ember:gone', { id: s.ember.id });
      s.ember = null;
      s.nextEmberAt = s.playTime + emberGap(s);
    }
    return;
  }
  if (!Number.isFinite(s.nextEmberAt)) s.nextEmberAt = Math.max(s.playTime + 15, EMBER.firstAt);
  if (!active) {
    s.nextEmberAt += dt; // the clock runs on active play only
    return;
  }
  if (s.playTime >= s.nextEmberAt) {
    const id = `ember:${s.nextId++}`;
    s.ember = { id, born: s.time, life: EMBER.life };
    bus?.emit('ember:spawn', { id, life: EMBER.life });
  }
}

function emberGap(s: IdleState): number {
  return EMBER.every[0] + rand(s) * (EMBER.every[1] - EMBER.every[0]);
}

/** Catch the ember: roll its outcome. */
export function catchEmber(s: IdleState, bus?: IdleBus): boolean {
  const m = s.ember;
  if (!m) return false;
  s.ember = null;
  s.nextEmberAt = s.playTime + emberGap(s);
  let r = rand(s);
  // The first catch is always a Gold Shower (the lesson is "embers pay").
  if (!s.meta.firstTime.includes('ember:caught')) {
    s.meta.firstTime.push('ember:caught');
    r = 0;
  }
  const o = EMBER.odds;
  let outcome: 'gold' | 'frenzy' | 'gems' | 'refresh';
  let gold = Big.zero();
  let gems = 0;
  if (r < o.gold) {
    outcome = 'gold';
    const l = s.rates.goldPerSec.log10() + Math.log10(EMBER.goldSeconds);
    gold = Number.isFinite(l) ? Big.fromLog10(l) : Big.from(30);
    s.run.gold.addIn(gold);
    s.run.goldEarned.addIn(gold);
    s.meta.lifetime.gold.addIn(gold);
    bus?.emit('gold:gain', { amount: gold.clone(), source: 'ember', col: -1, depth: s.run.depth });
  } else if (r < o.gold + o.frenzy) {
    outcome = 'frenzy';
    s.run.frenzyEnd = Math.max(s.run.frenzyEnd, s.time + EMBER.frenzySeconds);
  } else if (r < o.gold + o.frenzy + o.gems) {
    outcome = 'gems';
    gems = EMBER.gems;
    s.meta.gems += gems;
    bus?.emit('gems:gain', { amount: gems, source: 'ember', col: -1, depth: s.run.depth });
  } else {
    outcome = 'refresh';
    for (const k of Object.values(s.run.skills)) k.cdEnd = 0;
  }
  s.meta.stats.events++;
  s.meta.caught.ember = (s.meta.caught.ember ?? 0) + 1;
  bus?.emit('ember:catch', { id: m.id, outcome, gold, gems });
  return true;
}
