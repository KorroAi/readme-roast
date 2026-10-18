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
