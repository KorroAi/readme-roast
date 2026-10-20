// Feats, the achievements (SPEC §7.6): 20 families with tiers I–X, then endless. Every tier: +1 Mark (+1 % damage and
// gold), 5 × min(tier, 10) gems and 30 XP; tier V a cosmetic; tier X the family's permanent perk (read through
// mult.ts `hasPerk`). 12 secret Feats ("???" with a hint) pay 5 Marks and 25 gems. The Feats sheet sorts by
// closeness to the next tier: `featView` gives every family's progress, the "almost there" engine.

import type { IdleBus } from '../bus';
import { FEATS, type FeatFamily, featCosmetic, featGems, featThreshold, SECRET_REWARD, SECRETS, type SecretId } from '../config/feats';
import { XP } from '../config/rank';
import { codexCount } from './codex';
import { addXp, creditGems } from './gain';
import { invalidateMults } from './mult';
import type { IdleState } from './state';

/** The Lucky Lamp score (chest rarities, SPEC §7.6): how many of its ten milestones in order hold. */
function luckyLampScore(s: IdleState): number {
  const st = s.meta.stats;
  const checks = [
    s.meta.records.bestChest >= 1, st.crystalPlus >= 5, st.reliquaryPlus >= 1, st.crystalPlus >= 10, st.reliquaryPlus >= 5,
    st.lintels >= 1, st.reliquaryPlus >= 25, st.lintels >= 3, st.lintels >= 10, st.lintels >= 25,
  ];
  let n = 0;
  while (n < checks.length && checks[n]) n++;
  return n;
}

/** A family's counter now. 'swift' is run seconds to 600 m (smaller is better). */
export function featCounter(s: IdleState, f: FeatFamily): number {
  const m = s.meta;
  switch (f.counter) {
    case 'deepest': return m.record;
    case 'cells': return m.stats.cellsNew;
    case 'crits': return m.stats.crits;
    case 'bestCombo': return m.records.bestCombo;
    case 'levels': return m.stats.levels;
    case 'stars': return m.stats.stars;
    case 'runTier': return m.bestTier;
    case 'runLines': return m.bestLines;
    case 'chests': return m.stats.chests;
    case 'chestRarity': return luckyLampScore(s);
    case 'runGold': return s.run.goldEarned.log10();
    case 'rekindles': return m.stats.rekindles;
    case 'embersEver': return m.lifetime.embersEver.log10();
    case 'codex': return codexCount(s);
    case 'biomes': return m.biomesSeen.length;
    case 'offlineHours': return m.stats.offlineHours;
    case 'events': return m.stats.events;
    case 'creatures': return m.stats.creatures;
    case 'swift': return m.swift600;
    case 'contracts': return m.stats.contracts;
  }
}

/** Has the family reached tier t? */
function reached(s: IdleState, f: FeatFamily, t: number): boolean {
  const v = featCounter(s, f);
  const th = featThreshold(f, t);
  if (f.counter === 'swift') return v <= th && (t <= 10 || th > 10 || featThreshold(f, t - 1) > 10);
  return v >= th;
}

/** Progress toward the next tier (0..1), in log space for the counting families. */
export function featProgress(s: IdleState, f: FeatFamily): number {
  const tier = s.meta.feats[f.id] ?? 0;
  const v = featCounter(s, f);
  const next = featThreshold(f, tier + 1);
  const prev = tier > 0 ? featThreshold(f, tier) : 0;
  if (f.counter === 'swift') {
    if (!Number.isFinite(v)) return 0;
    const from = tier > 0 ? prev : 1800;
    return Math.max(0, Math.min(1, (from - v) / Math.max(1e-9, from - next)));
  }
  if (!Number.isFinite(v) || v <= prev) return 0;
  return Math.max(0, Math.min(1, (v - prev) / Math.max(1e-9, next - prev)));
}

/** Award every tier reached (called 4 times a second). */
export function tickFeats(s: IdleState, bus?: IdleBus): void {
  for (let i = 0; i < FEATS.length; i++) {
    const f = FEATS[i];
    for (let guard = 0; guard < 8; guard++) {
      const tier = s.meta.feats[f.id] ?? 0;
      if (!reached(s, f, tier + 1)) break;
      const t = tier + 1;
      s.meta.feats[f.id] = t;
      s.meta.marks++;
      const gems = featGems(t);
      creditGems(s, gems, 'feat', bus);
      addXp(s, XP.feat);
      let cosmetic = '';
      if (t === 5) {
        cosmetic = featCosmetic(i);
        if (!s.meta.cosmetics.owned.includes(cosmetic)) s.meta.cosmetics.owned.push(cosmetic);
      }
      invalidateMults(s);
      s.director.lastBeat = s.time;
      bus?.emit('feat:tier', { family: f.id, tier: t, gems, marks: 1, cosmetic, perk: t === 10 });
    }
  }
  tickSecrets(s, bus);
}

/** Secrets whose condition the model can see directly; the rest are flagged where they happen (`flagSecret`). */
function tickSecrets(s: IdleState, bus?: IdleBus): void {
  const m = s.meta;
  const check = (id: SecretId, ok: boolean) => {
    if (ok && !m.secrets.includes(id)) grantSecret(s, id, bus);
  };
  check('lamplighter', m.stats.chests >= 1);
  check('mothFriend', (m.caught.swarmAll ?? 0) >= 1);
  check('echoOfHalden', m.lore.filter((x) => /:note\d$/.test(x)).length >= 42);
  check('theAnswer', m.sealsOpened.includes(14));
  check('bareHands', s.run.dmax >= 240 && s.run.lines.every((l) => l <= 0));
  for (const id of SECRETS) if (m.firstTime.includes(`secret:${id}`)) check(id, true);
}

/** Flag a secret seen by another system (Overkill, Clean Sweep, Patience, Night Owl, Hands Free, Full Set, Cataclysm). */
export function flagSecret(s: IdleState, id: SecretId): void {
  if (!s.meta.secrets.includes(id) && !s.meta.firstTime.includes(`secret:${id}`)) s.meta.firstTime.push(`secret:${id}`);
}

function grantSecret(s: IdleState, id: SecretId, bus?: IdleBus): void {
  s.meta.secrets.push(id);
  s.meta.firstTime = s.meta.firstTime.filter((k) => k !== `secret:${id}`);
  s.meta.marks += SECRET_REWARD.marks;
  creditGems(s, SECRET_REWARD.gems, 'feat', bus);
  invalidateMults(s);
  bus?.emit('feat:secret', { id });
}

/** Every family's state for the Feats sheet, sorted by closeness to the next tier (the top three glow). */
export function featView(s: IdleState): Array<{ id: string; tier: number; next: number; value: number; progress: number; perk: boolean }> {
  return FEATS.map((f) => {
    const tier = s.meta.feats[f.id] ?? 0;
    return { id: f.id, tier, next: featThreshold(f, tier + 1), value: featCounter(s, f), progress: featProgress(s, f), perk: tier >= 10 };
  }).sort((a, b) => b.progress - a.progress);
}

/** Tiers earned in all (E18). */
export function featTiers(s: IdleState): number {
  let n = 0;
  for (const id in s.meta.feats) n += s.meta.feats[id];
  return n;
}
