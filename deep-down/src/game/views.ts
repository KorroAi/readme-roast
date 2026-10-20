// The sheets' view models over the pure game (the Board, Feats, Codex and Lantern sheets): what each row says, built
// from 2A's model views (contracts, featView, pageView, projection, perks, mults) and the i18n keys the model names.
// A line with no words yet is left out: nothing unworded reaches a player.

import { Big } from '../core/big';
import { AUTHORED_BIOMES, BIOMES, baseBiome, biomeAt } from '../idle/config/biomes';
import { CONTRACT } from '../idle/config/contracts';
import { FEATS, SECRETS } from '../idle/config/feats';
import { PERKS, REKINDLE_AT } from '../idle/config/prestige';
import { rankGems, rankNeed, titleAt } from '../idle/config/rank';
import { nextCodexChest, codexPercent, pageView } from '../idle/model/codex';
import { contractFill } from '../idle/model/contracts';
import { featView } from '../idle/model/feats';
import { mults } from '../idle/model/mult';
import { canRekindle, projection, recommend } from '../idle/model/prestige';
import type { IdleState } from '../idle/model/state';
import { format, formatDepth, formatEta } from '../idle/num/notation';
import { calendarView } from '../idle/model/daily';
import { tr } from '../ui/idle/Card';
import { roman } from './fx/ceremonies/Feat';
import type { BoardContract } from '../ui/idle/sheets/BoardSheet';
import type { FeatRowView } from '../ui/idle/sheets/FeatsSheet';
import type { CodexEntryView } from '../ui/idle/sheets/CodexSheet';
import type { LanternView } from '../ui/idle/sheets/LanternSheet';

const big = Big.zero();
const fmt = (n: number): string => (Math.abs(n) < 1e6 && Number.isInteger(n) ? n.toLocaleString('en-US') : format(big.setNum(n)));

/** The Board's contracts. */
export function boardContracts(s: IdleState): BoardContract[] {
  return s.meta.contracts.map((c) => {
    const fill = contractFill(c);
    const text = tr(`idle.contract.${c.tpl}`, { n: fmt(c.target), ore: c.arg ? tr(`idle.ore.${c.arg}`) || c.arg : '', biome: c.arg });
    return {
      text,
      fill,
      progress: `${fmt(Math.min(c.target, Math.floor(c.progress)))} / ${fmt(c.target)}`,
      reward: c.grand ? tr('ui.board.rewardGrand') : tr('ui.board.reward', { gems: `${CONTRACT.gems[0]}–${CONTRACT.gems[1]}` }),
      grand: c.grand,
    };
  }).filter((c) => c.text);
}

/** Contracts until the next Grand one. */
export function nextGrand(s: IdleState): number {
  const n = s.meta.contractCount % CONTRACT.grandEvery;
  return CONTRACT.grandEvery - n;
}

/** The daily chest and the calendar, with each day's reward as a short label. */
export function daily(s: IdleState): { ready: boolean; next: number; days: string[] } {
  const v = calendarView(s);
  const days = v.days.map((code) => {
    const [k, n] = code.split(':');
    if (k === 'chest') return tr(`ui.chest.${['wood', 'copper', 'crystal', 'reliquary', 'lintel'][Number(n)] ?? 'wood'}`);
    if (k === 'gems') return tr('ui.chest.gems', { gems: n });
    if (k === 'rerolls') return tr('ui.chest.reroll', { n });
    if (k === 'oil') return tr('idle.boost.oil') || tr('ui.board.oil');
    return '';
  });
  return { ready: v.ready, next: v.next, days };
}

/** The Feats sheet's families (sorted by closeness by the model), with their words. */
export function feats(s: IdleState): FeatRowView[] {
  const out: FeatRowView[] = [];
  for (const f of featView(s)) {
    const name = tr(`idle.feat.${f.id}`);
    if (!name) continue;
    const def = FEATS.find((x) => x.id === f.id);
    const next = def?.counter === 'runGold' || def?.counter === 'embersEver' ? format(big.setLog10(f.next)) : def?.counter === 'swift' ? formatEta(f.next) : fmt(f.next);
    const line = tr(`idle.feat.${f.id}.desc`, { n: next }) || tr('ui.feat.next', { target: next });
    const pct = Math.floor(f.progress * 100);
    out.push({ id: f.id, name, line: f.perk ? tr('ui.feat.perk', { perk: tr(`idle.feat.${f.id}.perk`) }) || line : line, tier: f.tier > 0 ? `${roman(f.tier)} · ${pct} %` : `${pct} %`, progress: f.progress, done: f.perk });
  }
  return out;
}

export function secrets(s: IdleState): Array<{ id: string; name: string; hint: string; found: boolean }> {
  const out: Array<{ id: string; name: string; hint: string; found: boolean }> = [];
  for (const id of SECRETS) {
    const hint = tr(`idle.secret.${id}.hint`);
    const name = tr(`idle.secret.${id}`);
    if (!hint || !name) continue;
    out.push({ id, name, hint, found: s.meta.secrets.includes(id) });
  }
  return out;
}

export function rank(s: IdleState): { rank: number; xp: number; need: number; title: string; next: string } {
  const r = s.meta.rank.r;
  const ti = titleAt(r);
  const title = tr(`idle.title.${ti.id}`) + (ti.n ? ` ${roman(ti.n)}` : '');
  return { rank: r, xp: s.meta.rank.xp, need: rankNeed(r), title, next: tr('ui.rank.next', { gems: rankGems(r + 1) }) };
}

/** The Codex pages: the current biome first, then every other biome reached. */
export function codexPages(s: IdleState): Array<{ biome: number; name: string; entries: CodexEntryView[]; sealed: boolean }> {
  const cur = Math.max(0, Math.min(AUTHORED_BIOMES - 1, baseBiome(biomeAt(s.run.depth))));
  const seen = [...new Set([cur, ...s.meta.biomesSeen.map((b) => Math.min(AUTHORED_BIOMES - 1, baseBiome(b)))])].filter((b) => b >= 0 && b < AUTHORED_BIOMES);
  return seen.map((b) => ({
    biome: b,
    name: tr(`idle.biome.${BIOMES[b].id}`),
    sealed: s.meta.biomeSeals.includes(b),
    entries: pageView(s, b).map((e) => ({
      id: e.id,
      section: e.section,
      found: e.found,
      level: e.level,
      name: entryName(e.id) || tr(e.hint),
      hint: tr(e.hint) || tr('ui.codex.unknown'),
    })),
  }));
}

function entryName(id: string): string {
  if (id.startsWith('find:')) {
    const [, b, i] = id.split(':');
    return tr(`idle.find.${b}.${i}`);
  }
  if (id.startsWith('creature:')) return tr(`idle.creature.${id.slice(9)}`);
  if (id.startsWith('lore:')) {
    const [, b, k] = id.split(':');
    return tr(`idle.lore.${b}.${k}.title`) || tr(`idle.lore.${k}`);
  }
  return '';
}

export function codexNext(s: IdleState): { at: number; toGo: number } {
  return nextCodexChest(s);
}

export function codexPct(s: IdleState): number {
  return codexPercent(s);
}

/** The Lantern sheet's Rekindle panel. Projection runs a short sim: cached by the caller. */
export function lantern(s: IdleState, proj: { passAt: number; record: number } | null): LanternView {
  const open = s.meta.record >= REKINDLE_AT || s.meta.stats.rekindles > 0;
  const embers = s.meta.embers;
  if (!open) {
    return { open, teaser: tr('ui.lantern.teaser', { depth: formatDepth(REKINDLE_AT) }), deepest: '', gain: '', power: '', pass: '', recommended: false, canRekindle: false, embers: embers.isZero() ? '' : tr('ui.lantern.embers', { n: format(embers) }) };
  }
  const p = proj ?? null;
  const pw = s.run.dmax;
  const rec = recommend(s);
  let gainB = Big.zero();
  let before = 1;
  let after = 1;
  try {
    const pr = projectionCache.get(s);
    if (pr) {
      gainB = pr.gain;
      before = pr.before;
      after = pr.after;
    }
  } catch {
    // The projection is a nicety: the panel still works without it.
  }
  const can = canRekindle(s);
  return {
    open,
    teaser: '',
    deepest: tr('ui.lantern.deepest', { depth: formatDepth(Math.max(s.meta.cycleRecord, pw)) }),
    gain: gainB.isZero() ? tr('ui.lantern.notYet') : tr('ui.lantern.gain', { gain: format(gainB) }),
    power: tr('ui.lantern.power', { from: fmtX(before), to: fmtX(after) }),
    pass: p && Number.isFinite(p.passAt) ? tr('ui.lantern.pass', { depth: formatDepth(p.record), time: formatEta(p.passAt) }) : '',
    recommended: rec.ok,
    canRekindle: can,
    embers: tr('ui.lantern.embers', { n: format(embers) }),
  };
}

const projectionCache = new WeakMap<IdleState, { gain: Big; before: number; after: number; passAt: number; record: number; t: number }>();

/** The projection (a ≤ 30 ms sim), recomputed at most every 2 s of model time while the sheet is open. */
export function lanternProjection(s: IdleState): { passAt: number; record: number } | null {
  const c = projectionCache.get(s);
  if (c && s.time - c.t < 2) return c;
  if (!(s.meta.record >= REKINDLE_AT)) return null;
  const p = projection(s);
  const v = { gain: p.gain, before: p.before, after: p.after, passAt: p.passAt, record: p.record, t: s.time };
  projectionCache.set(s, v);
  return v;
}

function fmtX(x: number): string {
  return x >= 1000 ? format(big.setNum(x)) : x >= 10 ? x.toFixed(0) : x.toFixed(1);
}

/** The perks vine. */
export function perks(s: IdleState): Array<{ at: string; name: string; reached: boolean; next: boolean }> {
  const have = s.meta.embersMax.toNumber();
  let nextSet = false;
  const out: Array<{ at: string; name: string; reached: boolean; next: boolean }> = [];
  for (const p of PERKS) {
    const name = tr(`idle.perk.${p.id}`);
    if (!name) continue;
    const reached = have >= p.at;
    const next = !reached && !nextSet;
    if (next) nextSet = true;
    out.push({ at: tr('ui.lantern.perkAt', { n: fmt(p.at) }), name, reached, next });
  }
  return out;
}

/** The Stats panel: every multiplier group, sorted by size. */
export function stats(s: IdleState): Array<{ name: string; value: string }> {
  const m = mults(s);
  const rows: Array<{ name: string; v: number }> = [
    { name: tr('ui.stat.embers'), v: 1 + 0.1 * s.meta.embers.toNumber() },
    { name: tr('ui.stat.marks'), v: 1 + 0.01 * s.meta.marks },
    { name: tr('ui.stat.rank'), v: 1 + 0.005 * (s.meta.rank.r - 1) },
    { name: tr('ui.stat.seals'), v: 1 + 0.1 * s.meta.biomeSeals.length },
    { name: tr('ui.stat.planted'), v: 1 + s.run.plantedBonus },
  ];
  rows.push({ name: tr('ui.stat.facets'), v: m.power / Math.max(1e-9, rows.reduce((a, r) => a * r.v, 1)) });
  return rows
    .filter((r) => r.name && Number.isFinite(r.v) && r.v > 1.0001)
    .sort((a, b) => b.v - a.v)
    .map((r) => ({ name: r.name, value: `×${fmtX(r.v)}` }));
}
