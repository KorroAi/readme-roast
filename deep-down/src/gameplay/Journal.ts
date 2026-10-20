import { RUNES_BY_GLYPH, RUNE_GLYPH } from '../config/runes';
import { ITEMS } from '../config/items';
import { hasText, t, type TextKey } from '../i18n';
import type { EndingView, JournalEntry, JournalTab, JournalView, JournalZone, RelicText, RunePage } from '../ui/types';
import { DISCOVERIES } from './discoveries';

/** Serialized journal: discovery ids (e.g. "hollow") and key item ids (e.g. "ancientTablet"). */
export interface JournalState {
  discoveries: string[];
  keyItems: string[];
}

export type JournalKind = 'discovery' | 'keyItem';

/**
 * Permanent record of discoveries and key items, in the order they were found.
 * Nothing in the journal is ever lost (not even on death).
 */
export class Journal {
  private readonly lists: Record<JournalKind, string[]> = { discovery: [], keyItem: [] };
  private readonly sets: Record<JournalKind, Set<string>> = { discovery: new Set(), keyItem: new Set() };

  constructor(state?: Partial<JournalState> | null) {
    for (const id of validIds(state?.discoveries)) this.add('discovery', id);
    for (const id of validIds(state?.keyItems)) this.add('keyItem', id);
  }

  static fromJSON(x: unknown): Journal {
    return new Journal(x && typeof x === 'object' ? (x as Partial<JournalState>) : null);
  }

  get discoveries(): readonly string[] {
    return this.lists.discovery;
  }

  get keyItems(): readonly string[] {
    return this.lists.keyItem;
  }

  /** True if `id` is a recorded discovery or key item. */
  has(id: string): boolean {
    return this.sets.discovery.has(id) || this.sets.keyItem.has(id);
  }

  hasDiscovery(id: string): boolean {
    return this.sets.discovery.has(id);
  }

  hasKeyItem(id: string): boolean {
    return this.sets.keyItem.has(id);
  }

  /** @returns true if `id` was newly recorded (false for duplicates and empty ids). */
  add(kind: JournalKind, id: string): boolean {
    if (typeof id !== 'string' || id.length === 0 || this.sets[kind].has(id)) return false;
    this.sets[kind].add(id);
    this.lists[kind].push(id);
    return true;
  }

  addDiscovery(id: string): boolean {
    return this.add('discovery', id);
  }

  addKeyItem(id: string): boolean {
    return this.add('keyItem', id);
  }

  toJSON(): JournalState {
    return { discoveries: [...this.lists.discovery], keyItems: [...this.lists.keyItem] };
  }
}

function validIds(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
}

// ---------------------------------------------------------------------------------------
// The Journal as the screens see it (final pass W3)

/** Zone of each discovery (the Journal's headers); anything not listed is the deep. */
export const JOURNAL_ZONES: Readonly<Record<string, 'tunnel' | 'hollow' | 'deep'>> = {
  crystals: 'tunnel',
  mothGrotto: 'tunnel',
  'note.office': 'tunnel',
  hollow: 'hollow',
  shrine: 'hollow',
  tablet: 'hollow',
  hoist: 'hollow',
  reliquary: 'hollow',
  'note.landing': 'hollow',
  'note.yard': 'hollow',
};
const ZONE_ORDER = ['tunnel', 'hollow', 'deep'] as const;

/** The found texts the Relic tab collects (the tablets in the shrine, the reliquary and the gallery). */
const RELIC_TEXTS = ['tablet', 'reliquary', 'lampGallery'] as const;

export interface JournalInput {
  discoveries: readonly string[];
  keyItems: readonly string[];
  foundAt: Readonly<Record<string, readonly [number, number]>>;
  finale: boolean;
  expeditions: number;
  deepest: number;
  playTime: number;
  focus?: JournalTab;
}

export function buildJournalView(j: JournalInput): JournalView {
  const found = new Set(j.discoveries);
  const keys = new Set(j.keyItems);
  const text = (key: string, fallback = '') => (hasText(key) ? t(key as TextKey) : fallback);
  const at = (id: string) => j.foundAt[id] ?? null;
  const discoveries: JournalEntry[] = DISCOVERIES.map((d) => {
    const zone = JOURNAL_ZONES[d.id] ?? 'deep';
    const f = found.has(d.id);
    const when = f ? at(d.id) : null;
    return {
      id: d.id,
      title: text(`discovery.${d.id}.title`, d.id),
      body: text(`discovery.${d.id}.body`),
      found: f,
      hint: text(`journal.hint.${d.id}`),
      major: d.major,
      log: d.log === true,
      zone,
      zoneName: t(`zone.${zone}` as TextKey),
      expedition: when ? when[0] : null,
      depth: when ? when[1] : null,
    };
  });
  const zones: JournalZone[] = ZONE_ORDER.map((id) => ({
    id,
    name: t(`zone.${id}` as TextKey),
    found: discoveries.filter((d) => d.zone === id && d.found).length,
    total: discoveries.filter((d) => d.zone === id).length,
  }));
  const runes: RunePage[] = RUNES_BY_GLYPH.map((item) => {
    const f = keys.has(item);
    const when = f ? at(item) : null;
    return {
      item,
      glyph: RUNE_GLYPH[item],
      name: t(ITEMS[item].name),
      line: f ? text(`item.${item}.line`) : '',
      found: f,
      hint: text(`item.${item}.hint`),
      expedition: when ? when[0] : null,
      depth: when ? when[1] : null,
    };
  });
  const relics: RelicText[] = RELIC_TEXTS.map((id) => ({ id, title: text(`discovery.${id}.title`, id), body: text(`discovery.${id}.body`), found: found.has(id) }));
  const ending: EndingView = { reached: j.finale, expeditions: j.expeditions, deepest: j.deepest, playTime: j.playTime, answer: t('discovery.answer.body') };
  return {
    discoveries,
    zones,
    found: discoveries.filter((d) => d.found).length,
    total: discoveries.length,
    runes,
    runesFound: runes.filter((r) => r.found).length,
    runesTotal: runes.length,
    relics,
    ending,
    focus: j.focus ?? 'discoveries',
  };
}
