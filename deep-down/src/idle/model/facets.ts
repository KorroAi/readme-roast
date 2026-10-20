// Facets (SPEC §5.10): from the second seal or charted gate of a run, each one broken queues a hand of three; the
// player keeps one for the run. The hand is a T2 overlay (the world keeps digging); pending hands queue (a "Facet ×2"
// chip). Rarity Common 70 % / Rare 25 % / Relic 5 %; no duplicate in a hand; duos only when eligible (12 % a slot);
// one free reroll a run, then 10 gems. Auto-pick (250 Embers) takes the highlighted card after 6 s.
// `facetStats(s)` folds the run's facets and their set bonuses into the numbers every system reads.

import type { FacetCardView, IdleBus } from '../bus';
import { AUTO_PICK_S, DUO_CHANCE, FACET_TAGS, FACETS, type FacetTag, facetDef, RARITY, REROLL_GEMS, SETS, TAG_UNLOCK } from '../config/facets';
import { spendGems } from './gain';
import type { IdleState } from './state';
import { rand } from './tap';

/** Every number facets change (sums of values; multipliers start at 1). */
export interface FacetStats {
  critPts: number; critSplash: number; critSplashCells: number; staticEvery: number; critMultAdd: number; megaCrit: number;
  shockAdd: number; areaX: number; aftershock: number; faultEvery: number; chargeEvery: number; blastRadius: number; rowBlast: number;
  goldAdd: number; goldX: number; veinX: number; oreGoldX: number; chestEvery: number; goldenEvery: number;
  crewAdd: number; crewX: number; edgePts: number; newestX: number; unionPer: number; crewTwoCells: boolean;
  comboWindow: number; comboCap: number; comboBuild: number; comboFloor: number; surgeSecs: number; surgeX: number; drumPer: number;
  chestStepPts: number; rareX: number; findX: number; doubleChest: number; chestFloorUp: number; tenthReliquary: boolean;
  critBlast: number; critGoldX: number; goldenX: number; workSong: number; crewChest: number; rollingThunder: number;
  /** The strength of the cadence facets' hits (a Rare ×1.5, a Relic ×2.5). */
  blastX: number;
  /** Facets owned per tag. */
  tags: Record<string, number>;
}

function emptyStats(): FacetStats {
  return {
    critPts: 0, critSplash: 0, critSplashCells: 0, staticEvery: 0, critMultAdd: 0, megaCrit: 0,
    shockAdd: 0, areaX: 1, aftershock: 0, faultEvery: 0, chargeEvery: 0, blastRadius: 1, rowBlast: 0,
    goldAdd: 0, goldX: 1, veinX: 1, oreGoldX: 1, chestEvery: 0, goldenEvery: 0,
    crewAdd: 0, crewX: 1, edgePts: 0, newestX: 1, unionPer: 0, crewTwoCells: false,
    comboWindow: 0, comboCap: 0, comboBuild: 1, comboFloor: 0, surgeSecs: 0, surgeX: 0, drumPer: 0,
    chestStepPts: 0, rareX: 1, findX: 1, doubleChest: 0, chestFloorUp: 0, tenthReliquary: false,
    critBlast: 0, critGoldX: 1, goldenX: 1, workSong: 0, crewChest: 0, rollingThunder: 0,
    blastX: 1,
    tags: {},
  };
}

const EMPTY = emptyStats();
const cache = new WeakMap<IdleState, { key: string; stats: FacetStats; list: readonly string[]; len: number; last: string }>();

/** A run facet as stored: `<id>@<rarity index>` (e.g. 'hotEdge@1' is a Rare Hot Edge). */
export function facetKey(id: string, rarity: number): string {
  return `${id}@${rarity}`;
}

export function parseFacet(key: string): { id: string; rarity: number } {
  const at = key.indexOf('@');
  if (at < 0) return { id: key, rarity: 0 };
  return { id: key.slice(0, at), rarity: Math.max(0, Math.min(2, Number(key.slice(at + 1)) | 0)) };
}

/** The run's facet numbers (cached until the facets change). */
export function facetStats(s: IdleState): FacetStats {
  const list = s.run.facets;
  if (list.length === 0) return EMPTY;
  // Facets are only ever appended to a run's list (a new run starts a new list): the list, its length and its last
  // key identify the set without joining it on every call (the formulas call this thousands of times a second).
  const c = cache.get(s);
  if (c && c.list === list && c.len === list.length && c.last === list[list.length - 1]) return c.stats;
  const key = list.join(',');
  if (c && c.key === key) {
    c.list = list;
    c.len = list.length;
    c.last = list[list.length - 1];
    return c.stats;
  }
  const st = emptyStats();
  for (const k of s.run.facets) {
    const { id, rarity } = parseFacet(k);
    const d = facetDef(id);
    if (!d) continue;
    const v = d.value * RARITY[rarity].x;
    if (d.tag !== 'duo') st.tags[d.tag] = (st.tags[d.tag] ?? 0) + 1;
    switch (d.stat) {
      // Thresholds ("every Nth") keep their cadence; a rarer card hits harder instead (blastX).
      case 'staticEvery': case 'faultEvery': case 'chargeEvery': case 'chestEvery': case 'crewChest': case 'rollingThunder': {
        const n = Math.max(2, Math.round(d.value));
        const cur = (st as unknown as Record<string, number>)[d.stat];
        (st as unknown as Record<string, number>)[d.stat] = cur > 0 ? Math.min(cur, n) : n;
        st.blastX = Math.max(st.blastX, RARITY[rarity].x);
        break;
      }
      case 'veinX': case 'oreGoldX': case 'newestX': case 'rareX': case 'findX': case 'critGoldX': case 'goldenX':
        (st as unknown as Record<string, number>)[d.stat] *= d.value === 1.5 ? 1 + 0.5 * RARITY[rarity].x : 1 + (d.value - 1) * RARITY[rarity].x;
        break;
      case 'critSplash':
        st.critSplash = Math.max(st.critSplash, v);
        st.critSplashCells = Math.max(st.critSplashCells, 1);
        break;
      default:
        (st as unknown as Record<string, number>)[d.stat] += v;
    }
  }
  // Set bonuses.
  for (const tag of FACET_TAGS) {
    const n = st.tags[tag] ?? 0;
    for (const b of SETS[tag]) {
      if (n < b.at) continue;
      switch (b.stat) {
        case 'critChain': st.critSplashCells = Math.max(st.critSplashCells, 2); st.critSplash = Math.max(st.critSplash, 0.5); break;
        case 'crewTwoCells': st.crewTwoCells = true; break;
        case 'tenthReliquary': st.tenthReliquary = true; break;
        case 'areaX': case 'goldX': case 'crewX': case 'comboBuild': case 'rareX':
          (st as unknown as Record<string, number>)[b.stat] *= b.v;
          break;
        case 'surgeX': st.surgeX = Math.max(st.surgeX, b.v); break;
        case 'comboFloor': st.comboFloor = Math.max(st.comboFloor, b.v); break;
        case 'goldenEvery': st.goldenEvery = b.v; break;
        case 'blastRadius': st.blastRadius += b.v; break;
        default:
          (st as unknown as Record<string, number>)[b.stat] = ((st as unknown as Record<string, number>)[b.stat] ?? 0) + b.v;
      }
    }
  }
  cache.set(s, { key, stats: st, list, len: list.length, last: list[list.length - 1] });
  return st;
}

/** Tags on offer at the run's depth. */
export function tagsUnlocked(s: IdleState): FacetTag[] {
  return FACET_TAGS.filter((t) => s.run.dmax >= TAG_UNLOCK[t]);
}

function rollRarity(s: IdleState): number {
  const r = rand(s);
  return r < RARITY[0].p ? 0 : r < RARITY[0].p + RARITY[1].p ? 1 : 2;
}

/**
 * Deal a hand of three (pure apart from the RNG): no duplicate, no facet the run already holds, duos only when two
 * of their tags have ≥ 2 facets each (12 % a slot).
 */
export function offerHand(s: IdleState): FacetCardView[] {
  const tags = tagsUnlocked(s);
  const st = facetStats(s);
  const owned = new Set(s.run.facets.map((k) => parseFacet(k).id));
  const pool = FACETS.filter((f) => f.tag !== 'duo' && tags.includes(f.tag as FacetTag) && !owned.has(f.id));
  const duos = FACETS.filter((f) => f.tag === 'duo' && !owned.has(f.id) && f.duo && (st.tags[f.duo[0]] ?? 0) >= 2 && (st.tags[f.duo[1]] ?? 0) >= 2);
  const out: FacetCardView[] = [];
  const taken = new Set<string>();
  for (let slot = 0; slot < 3; slot++) {
    let def = undefined as (typeof FACETS)[number] | undefined;
    if (duos.length && rand(s) < DUO_CHANCE) {
      const left = duos.filter((d) => !taken.has(d.id));
      if (left.length) def = left[Math.floor(rand(s) * left.length)];
    }
    if (!def) {
      const left = pool.filter((d) => !taken.has(d.id));
      if (!left.length) break;
      def = left[Math.floor(rand(s) * left.length)];
    }
    taken.add(def.id);
    const rarity = rollRarity(s);
    out.push({ id: def.id, tag: def.tag, rarity: RARITY[rarity].id, duo: def.tag === 'duo', value: RARITY[rarity].x });
  }
  return out;
}

/** Queue a hand (a seal or a charted gate broke). The first waiting hand is offered at once. */
export function queueHand(s: IdleState, bus?: IdleBus): void {
  if (tagsUnlocked(s).length === 0) return;
  s.run.hands++;
  if (!s.meta.firstTime.includes('ft:facets')) {
    s.meta.firstTime.push('ft:facets');
    bus?.emit('firsttime', { id: 'facets' });
  }
  bus?.emit('facet:hand', { pending: s.run.hands });
  if (!s.hand) dealNext(s, bus);
}

function dealNext(s: IdleState, bus?: IdleBus): void {
  if (s.run.hands <= 0) {
    s.hand = null;
    return;
  }
  const cards = offerHand(s);
  if (!cards.length) {
    s.run.hands = 0;
    s.hand = null;
    return;
  }
  s.hand = { cards, at: s.time, rerolls: 0 };
  bus?.emit('facet:offer', { cards, rerollFree: s.run.freeReroll || s.meta.rerolls > 0, rerollGems: REROLL_GEMS });
}

/** Keep card `i` of the hand on offer. @returns the facet id kept ('' when there is no hand). */
export function pick(s: IdleState, i: number, bus?: IdleBus): string {
  const h = s.hand;
  if (!h || i < 0 || i >= h.cards.length) return '';
  const c = h.cards[i];
  const rarity = RARITY.findIndex((r) => r.id === c.rarity);
  const before = facetStats(s).tags[c.tag] ?? 0;
  s.run.facets.push(facetKey(c.id, Math.max(0, rarity)));
  s.run.hands = Math.max(0, s.run.hands - 1);
  s.hand = null;
  bus?.emit('facet:pick', { id: c.id, tag: c.tag, rarity: c.rarity, duo: c.duo });
  const after = facetStats(s).tags[c.tag] ?? 0;
  for (const at of [2, 4, 6]) if (before < at && after >= at) bus?.emit('facet:set', { tag: c.tag, count: at });
  if (after >= 6 && !s.meta.secrets.includes('fullSet')) s.meta.firstTime.push('secret:fullSet');
  dealNext(s, bus);
  return c.id;
}

/** Reroll the hand on offer: the run's free reroll, then 10 gems (or a stored chest reroll). @returns success. */
export function reroll(s: IdleState, bus?: IdleBus): boolean {
  if (!s.hand) return false;
  let free = false;
  if (s.run.freeReroll) {
    s.run.freeReroll = false;
    free = true;
  } else if (s.meta.rerolls > 0) {
    s.meta.rerolls--;
    free = true;
  } else if (!spendGems(s, REROLL_GEMS, 'facetReroll', bus)) return false;
  s.hand.cards = offerHand(s);
  s.hand.rerolls++;
  bus?.emit('facet:reroll', { free, gems: free ? 0 : REROLL_GEMS });
  bus?.emit('facet:offer', { cards: s.hand.cards, rerollFree: s.run.freeReroll, rerollGems: REROLL_GEMS });
  return true;
}

/** Store free rerolls (Crystal chests, the calendar). */
export function addStoredRerolls(s: IdleState, n: number): void {
  s.meta.rerolls += n;
}

/** The card auto-pick takes: the highest value (relic first, then the tag with the most facets). */
export function highlighted(s: IdleState): number {
  const h = s.hand;
  if (!h) return -1;
  const st = facetStats(s);
  let best = 0;
  let bs = -Infinity;
  h.cards.forEach((c, i) => {
    const sc = c.value * 10 + (st.tags[c.tag] ?? 0) + (c.duo ? 30 : 0);
    if (sc > bs) {
      bs = sc;
      best = i;
    }
  });
  return best;
}

/** Auto-pick (250 Embers and the setting on): after 6 s the highlighted card is kept. */
export function tickFacets(s: IdleState, autoPick: boolean, bus?: IdleBus): void {
  if (!s.hand && s.run.hands > 0) dealNext(s, bus);
  if (s.hand && autoPick && s.meta.embersMax.toNumber() >= 250 && s.time - s.hand.at >= AUTO_PICK_S) pick(s, highlighted(s), bus);
}
