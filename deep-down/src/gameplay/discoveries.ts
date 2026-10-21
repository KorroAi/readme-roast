/**
 * Every discovery in the game, in one table. Later waves append their own entries here (the
 * Rift, Echo Crystal, The Answer, Halden logs...). Banners show "{index}/{total}", where total
 * is always computed from this table, never hard-coded. Text lives in i18n under
 * `discovery.{id}.title` / `.body`; how a discovery triggers (a region in the generated layout,
 * or an event such as mining a crystal) stays with the code that triggers it.
 */
export interface DiscoveryDef {
  id: string;
  /** Major discoveries get the big banner: the hollow, shrine, gate, rift and answer. */
  major: boolean;
  /** A found text (a Halden log): banners may label it "HALDEN LOG", the journal may group them. */
  log?: true;
}

export const DISCOVERIES: readonly DiscoveryDef[] = [
  { id: 'crystals', major: false },
  { id: 'hollow', major: true },
  { id: 'shrine', major: true },
  { id: 'tablet', major: false },
  { id: 'gate', major: true },
  { id: 'ironVein', major: false },
  // World variety (final pass W2): places, secrets, the shortcut and the black stone.
  { id: 'mothGrotto', major: false },
  { id: 'hoist', major: false },
  { id: 'reliquary', major: false },
  { id: 'lampGallery', major: false },
  { id: 'undercroft', major: true },
  { id: 'monolith', major: false },
  // The four Halden logs (found texts; `log` marks them for the journal and the banner label).
  { id: 'note.office', major: false, log: true },
  { id: 'note.landing', major: false, log: true },
  { id: 'note.yard', major: false, log: true },
  { id: 'note.rift', major: false, log: true },
  // The deep tier and the finale (final pass W3; the Rift is the world's 'undercroft').
  { id: 'echo', major: false },
  { id: 'answer', major: true },
  // Beyond the rift (finished game, content): three caverns, and the stone that holds a flame.
  { id: 'lanternstone', major: false },
  { id: 'glowroot', major: true },
  { id: 'choir', major: true },
  { id: 'emberDeep', major: true },
  // Round 2 (WORLD): the expanse round the route.
  { id: 'galleries', major: false },
  { id: 'geode', major: false },
  { id: 'lake', major: true },
  { id: 'vault', major: true },
  { id: 'underhall', major: true },
];

/** Number of discoveries in the game. */
export const DISCOVERY_TOTAL = DISCOVERIES.length;

const BY_ID = new Map(DISCOVERIES.map((d, i) => [d.id, { ...d, slot: i + 1 }]));

/** The table entry for `id`, with its 1-based position in the table, or null for an unknown id. */
export function discoveryDef(id: string): (DiscoveryDef & { slot: number }) | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Banner numbering for a discovery just made: `index` is how many known discoveries the player
 * has now (this one included), out of `total`.
 */
export function discoveryNumbering(id: string, found: readonly string[]): { index: number; total: number; major: boolean } {
  let index = 0;
  for (const f of new Set([...found, id])) if (BY_ID.has(f)) index++;
  return { index, total: DISCOVERY_TOTAL, major: BY_ID.get(id)?.major ?? false };
}
