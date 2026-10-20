// Every tap on something that is not a cell (SPEC §3.1 "entity first"; W2.md §3.5's id table). C's DigController
// passes B's pickEntity() id (or a UI-drawn one) straight here, so the ids match:
//
//   crystal:<n>  gem:<n>  fossil:<n>  crate:<n>  note:<n>  cache:<n>  creature:<kind>:<n>  event:<eventId>:<n>
//   lantern:<n>  weak:<sealId>:<i>  chest:<n> (popped chests)  moth:<n> (the Lucky Moth)  rack (the Chest Rack)
//
// `tapEntity` returns whether the tap counted; `tapEntityResult` also says whether the entity is used up (B removes
// it on 'entity:done') and how many hits it still needs. Widgets drawn by the UI (a Strike's needle, a Pick's cards,
// a Sequence mark) are answered with `widgetTap`. Rewards are seconds of income, so a cavern find pays the same at
// any depth.

import type { IdleBus } from '../bus';
import { biomeAt, baseBiome, AUTHORED_BIOMES } from '../config/biomes';
import { CODEX, creatureBiome } from '../config/codex';
import { openChest } from './chests';
import { catchCreature, readNote, rollFind } from './codex';
import { eventTap, geodeDone, pickBoost } from './director';
import { pick as pickFacet } from './facets';
import { creditGems, creditSeconds, useOnce } from './gain';
import { catchMoth } from './moth';
import { tapLantern } from './records';
import { finisherStop, tapWeak } from './seals';
import type { IdleState, StrikeWidget } from './state';
import { rand } from './tap';
import { tapBaseLog10, comboMult, comboCap } from './run';
import { sequenceTap, skip, strikeStop, widgetById } from './widgets';

/** The outcome of an entity tap. */
export interface EntityTapResult {
  /** The tap counted (a known, live entity). */
  ok: boolean;
  /** The entity is used up (B removes it). */
  done: boolean;
  hits: number;
  need: number;
  kind: string;
}

const NO: EntityTapResult = { ok: false, done: false, hits: 0, need: 0, kind: '' };

/** Taps each tappable kind takes (W2.md §3.5; creatures 3, SPEC §7.5). */
export const ENTITY_TAPS: Readonly<Record<string, number>> = {
  crystal: 1, gem: 2, fossil: 3, crate: 1, note: 1, cache: 1, creature: CODEX.creatureTaps, lantern: 1,
};

/** Rewards of the caverns' tappables (seconds of income; gems). */
export const TAPPABLE = {
  crystalSecs: 3,
  gemSecs: 4,
  gemGems: 1,
  /** A gem cluster rolls a mineral Find at ×this the cell odds; a fossil a fossil Find. */
  gemFindX: 6,
  fossilSecs: 5,
  fossilFindX: 10,
  crateSecs: 6,
  crateGemP: 0.15,
  creatureSecs: 8,
  noteSecs: 2,
} as const;

function kindOf(id: string): string {
  const c = id.indexOf(':');
  return c < 0 ? id : id.slice(0, c);
}

/** The biome page a tappable belongs to: the current one. */
function page(s: IdleState): number {
  return Math.max(0, Math.min(AUTHORED_BIOMES - 1, baseBiome(biomeAt(s.run.depth))));
}

/** A multi-tap entity took a hit: count it. @returns the hits so far and whether it is now done. */
function hitMulti(s: IdleState, id: string, need: number, bus?: IdleBus): { hits: number; done: boolean } {
  const hits = (s.hits[id] ?? 0) + 1;
  if (hits >= need) {
    delete s.hits[id];
    return { hits, done: true };
  }
  s.hits[id] = hits;
  // Keep the map small (abandoned entities).
  const keys = Object.keys(s.hits);
  if (keys.length > 32) delete s.hits[keys[0]];
  bus?.emit('entity:hit', { id, kind: kindOf(id), hits, need });
  return { hits, done: false };
}

/** An entity tap (SPEC §3.1 entity first). @returns true when it counted. */
export function tapEntity(s: IdleState, id: string, bus?: IdleBus): boolean {
  return tapEntityResult(s, id, bus).ok;
}

/** An entity tap with its outcome. */
export function tapEntityResult(s: IdleState, id: string, bus?: IdleBus): EntityTapResult {
  const kind = kindOf(id);
  s.hints.lastHitAt = s.time;
  switch (kind) {
    case 'moth':
      return s.moth?.id === id && catchMoth(s, bus) ? done(id, kind, bus, 'moth') : NO;
    case 'chest': {
      const i = s.chests.findIndex((c) => c.id === id);
      if (i < 0) return NO;
      const c = s.chests[i];
      s.chests.splice(i, 1);
      // The tutorial's first chest is scripted: Wood → Copper (SPEC §8.2 0:14).
      openChest(s, id, c.floor, 'cell', bus, s.meta.stats.chests === 0);
      return done(id, kind, bus, 'chest');
    }
    case 'rack': {
      const floor = s.run.rack.shift();
      if (floor === undefined) return NO;
      openChest(s, `rack:${s.nextId++}`, floor, 'rack', bus);
      bus?.emit('chest:rack', { count: s.run.rack.length });
      return { ok: true, done: s.run.rack.length === 0, hits: 1, need: 1, kind };
    }
    case 'event':
      return eventTap(s, id, bus) ? { ok: true, done: false, hits: 1, need: 1, kind } : NO;
    case 'weak': {
      const dmg = tapBaseLog10(s) + Math.log10(comboMult(s.tap.combo, comboCap(s)));
      return tapWeak(s, id, dmg, bus) ? { ok: true, done: false, hits: 1, need: 1, kind } : NO;
    }
    case 'lantern': {
      const n = Number(id.slice(8));
      return tapLantern(s, n, bus) ? { ok: true, done: true, hits: 1, need: 1, kind } : NO;
    }
    case 'crystal': {
      if (!useOnce(s, id)) return NO;
      creditSeconds(s, TAPPABLE.crystalSecs, 'tappable', bus);
      s.tutorial.breaks++;
      s.director.findQuiet = 0;
      return done(id, kind, bus, `secs:${TAPPABLE.crystalSecs}`);
    }
    case 'gem': {
      if (s.run.used.includes(id)) return NO;
      const h = hitMulti(s, id, ENTITY_TAPS.gem, bus);
      if (!h.done) return { ok: true, done: false, hits: h.hits, need: ENTITY_TAPS.gem, kind };
      useOnce(s, id);
      creditSeconds(s, TAPPABLE.gemSecs, 'tappable', bus);
      creditGems(s, TAPPABLE.gemGems, 'tappable', bus);
      const f = rollFind(s, 'rare', page(s), bus, TAPPABLE.gemFindX);
      s.director.findQuiet = 0;
      return done(id, kind, bus, f ? `find:${f}` : 'gems:1');
    }
    case 'fossil': {
      if (s.run.used.includes(id)) return NO;
      const h = hitMulti(s, id, ENTITY_TAPS.fossil, bus);
      if (!h.done) return { ok: true, done: false, hits: h.hits, need: ENTITY_TAPS.fossil, kind };
      useOnce(s, id);
      creditSeconds(s, TAPPABLE.fossilSecs, 'tappable', bus);
      // The tutorial's fossil slab (row 14) always holds the first Find (SPEC §8.2 2:40).
      const first = s.meta.stats.finds === 0;
      const f = rollFind(s, 'fossil', page(s), bus, TAPPABLE.fossilFindX, first);
      s.director.findQuiet = 0;
      return done(id, kind, bus, f ? `find:${f}` : '');
    }
    case 'crate': {
      if (!useOnce(s, id)) return NO;
      creditSeconds(s, TAPPABLE.crateSecs, 'tappable', bus);
      if (rand(s) < TAPPABLE.crateGemP) creditGems(s, 1, 'tappable', bus);
      return done(id, kind, bus, `secs:${TAPPABLE.crateSecs}`);
    }
    case 'note': {
      if (!useOnce(s, id)) return NO;
      const lore = readNote(s, page(s), bus);
      creditSeconds(s, TAPPABLE.noteSecs, 'tappable', bus);
      return done(id, kind, bus, lore ? `lore:${lore}` : '');
    }
    case 'cache': {
      if (!useOnce(s, id)) return NO;
      openChest(s, id, 0, 'cache', bus);
      return done(id, kind, bus, 'chest');
    }
    case 'creature': {
      // creature:<kind>:<n>
      if (s.run.used.includes(id)) return NO;
      const parts = id.split(':');
      const ck = parts[1] ?? '';
      const h = hitMulti(s, id, ENTITY_TAPS.creature, bus);
      if (!h.done) return { ok: true, done: false, hits: h.hits, need: ENTITY_TAPS.creature, kind };
      useOnce(s, id);
      if (creatureBiome(ck) < 0) return NO;
      catchCreature(s, ck, bus);
      const x = (s.meta.feats.kindred ?? 0) >= 10 ? 2 : 1;
      creditSeconds(s, TAPPABLE.creatureSecs * x, 'creature', bus);
      s.director.findQuiet = 0;
      return done(id, kind, bus, `creature:${ck}`);
    }
    default:
      return NO;
  }
}

function done(id: string, kind: string, bus: IdleBus | undefined, reward: string): EntityTapResult {
  bus?.emit('entity:done', { id, kind, reward });
  return { ok: true, done: true, hits: 1, need: 1, kind };
}

/**
 * A tap on a UI widget (C's widgets): a Strike stops its needle (`arg` ignored), a Sequence takes mark `arg`, a Pick
 * takes card `arg` (Supply Rope boosts or the facet hand when `id` is 'facet'). @returns true when it counted.
 */
export function widgetTap(s: IdleState, id: string, arg = 0, bus?: IdleBus): boolean {
  if (id === 'facet') return pickFacet(s, arg, bus) !== '';
  const w = widgetById(s, id);
  if (!w || w.done) return false;
  s.hints.lastHitAt = s.time;
  if (w.kind === 'strike') {
    if (w.owner === 'seal') finisherStop(s, w as StrikeWidget, bus);
    else {
      strikeStop(s, w as StrikeWidget, bus);
      if (w.owner === 'geode' && w.done) geodeDone(s, w as StrikeWidget, bus);
    }
    return true;
  }
  if (w.kind === 'pick') return pickBoost(s, arg, bus) !== '';
  if (w.kind === 'sequence') return sequenceTap(s, w, arg, bus) !== 'wait';
  if (w.kind === 'mash' || w.kind === 'catch') {
    const target = w.kind === 'mash' ? w.target : w.targets.find((t) => t.state === 'live')?.id ?? '';
    return target ? tapEntity(s, target, bus) : false;
  }
  return false;
}

/** Skip a widget (the UI's skip button): it closes, nothing is lost. A geode still pays its miss. */
export function widgetSkip(s: IdleState, id: string, bus?: IdleBus): boolean {
  const w = widgetById(s, id);
  if (!w || w.done) return false;
  skip(w, bus);
  if (w.owner === 'geode') geodeDone(s, w as StrikeWidget, bus);
  return true;
}

/** Ids of everything tappable the model knows about now (for B and C's picking): popped chests, the moth, live targets, the weak point. */
export function liveEntities(s: IdleState): string[] {
  const out: string[] = s.chests.map((c) => c.id);
  if (s.moth) out.push(s.moth.id);
  const ev = s.event;
  if (ev?.widget && !ev.widget.done && ev.widget.kind === 'catch') for (const t of ev.widget.targets) if (t.state === 'live' && s.time >= t.t0) out.push(t.id);
  for (const w of s.widgets) if (w.kind === 'catch' && !w.done) for (const t of w.targets) if (t.state === 'live') out.push(t.id);
  if (s.seal?.weakUntil && s.seal.weakUntil > s.time) out.push(`weak:${s.seal.biome}:${s.seal.weakIndex}`);
  return out;
}

