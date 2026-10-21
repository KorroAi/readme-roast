// Rank (SPEC §7.7; never resets): XP from everything (cells below the record, ores, chests, purchases, ★, pick tiers,
// biomes, gates, seals, Feats, events, contracts, Finds, lamps, charts). need(r) = 120 · r^0.78. Rewards: +0.5 % to all per
// rank (mult.ts), 2–10 gems, a Copper-floor chest every 5 ranks, a cosmetic every 10 and a Might title every 25.

import type { IdleBus } from '../bus';
import { RANK_COSMETICS, rankGems, rankNeed, titleAt } from '../config/rank';
import { openChest } from './chests';
import { creditGems } from './gain';
import { invalidateMults } from './mult';
import type { IdleState } from './state';

/** Rank up while the XP covers the next rank (called 4 times a second); xp:gain at most each call. */
export function tickRank(s: IdleState, bus?: IdleBus): void {
  const rk = s.meta.rank;
  for (let guard = 0; guard < 64; guard++) {
    const need = rankNeed(rk.r);
    if (rk.xp < need) break;
    rk.xp -= need;
    rk.r++;
    const gems = rankGems(rk.r);
    creditGems(s, gems, 'rank', bus);
    const chest = rk.r % 5 === 0;
    let cosmetic = '';
    if (rk.r % 10 === 0) {
      cosmetic = RANK_COSMETICS[(rk.r / 10 - 1) % RANK_COSMETICS.length];
      if (!s.meta.cosmetics.owned.includes(cosmetic)) s.meta.cosmetics.owned.push(cosmetic);
    }
    const title = rk.r % 25 === 0 ? titleAt(rk.r).id : '';
    invalidateMults(s);
    s.director.lastBeat = s.time;
    bus?.emit('rank:up', { rank: rk.r, gems, chest, title, cosmetic });
    if (rk.r === 2 && !s.meta.firstTime.includes('ft:rank')) {
      s.meta.firstTime.push('ft:rank');
      bus?.emit('firsttime', { id: 'rank' });
    }
    if (chest) openChest(s, `rank:${rk.r}`, 1, 'rank', bus);
  }
  if (s.xpPending > 0) {
    bus?.emit('xp:gain', { amount: s.xpPending, xp: rk.xp, need: rankNeed(rk.r) });
    s.xpPending = 0;
  }
}

/** The XP bar: fraction to the next rank, and the title now. */
export function rankView(s: IdleState): { rank: number; xp: number; need: number; fill: number; title: string; titleN: number } {
  const rk = s.meta.rank;
  const need = rankNeed(rk.r);
  const t = titleAt(rk.r);
  return { rank: rk.r, xp: rk.xp, need, fill: Math.min(1, rk.xp / need), title: t.id, titleN: t.n };
}
