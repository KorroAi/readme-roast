import { BESTIARY_ORDER, ROSTERS, bestiary } from './rosters';
import { SPECIES } from './species';
import type { BestiaryEntryView, BestiaryProgress, MobBiome, MobKind } from './types';
import { hasText, t, type TextKey } from '../../i18n';

/**
 * The explorer's bestiary (round 3, MOBS; BRIEF §0.3): a page per creature, found on the first
 * meeting and completed by a scan (the sonar, or a long look) or a defeat (a catch, a harvest or
 * a pat for the beings). A completed page makes blows land 20 % harder on that kind (MobSim reads
 * `known`); LOOP may add its own reward on 'mob:bestiary' page 'complete'. Saved by WORLD's v4.
 */
export interface BestiarySave {
  v: 1;
  pages: Array<[MobKind, number, number, number, number]>;
  guardians: MobBiome[];
  /** The companion (MobDirector adds it): its kind and experience (the level follows from it). */
  companion?: { kind: MobKind; level: number; xp: number };
}

const blank = (): BestiaryProgress => ({ seen: false, scanned: false, defeated: 0, befriended: 0 });

export class BestiaryLog {
  private readonly pages = new Map<MobKind, BestiaryProgress>();

  get(kind: MobKind): BestiaryProgress {
    return this.pages.get(kind) ?? blank();
  }

  private edit(kind: MobKind): BestiaryProgress {
    let p = this.pages.get(kind);
    if (!p) {
      p = blank();
      this.pages.set(kind, p);
    }
    return p;
  }

  complete(kind: MobKind): boolean {
    const p = this.pages.get(kind);
    return !!p && (p.scanned || p.defeated > 0 || p.befriended > 0);
  }

  /** @returns 'new' when the page is found now, else null. */
  see(kind: MobKind): 'new' | null {
    const p = this.edit(kind);
    if (p.seen) return null;
    p.seen = true;
    return 'new';
  }

  /** @returns 'complete' when this completes the page, 'new' when it also finds it. */
  scan(kind: MobKind): 'new' | 'complete' | null {
    const was = this.complete(kind);
    const found = this.see(kind);
    this.edit(kind).scanned = true;
    return !was ? 'complete' : found;
  }

  defeat(kind: MobKind): 'new' | 'complete' | null {
    const was = this.complete(kind);
    const found = this.see(kind);
    this.edit(kind).defeated++;
    return !was ? 'complete' : found;
  }

  befriend(kind: MobKind): 'new' | 'complete' | null {
    const was = this.complete(kind);
    const found = this.see(kind);
    this.edit(kind).befriended++;
    return !was ? 'complete' : found;
  }

  /** Pages found (met at least once) and the total. */
  get found(): number {
    let n = 0;
    for (const p of this.pages.values()) if (p.seen) n++;
    return n;
  }

  get total(): number {
    return BESTIARY_ORDER.length;
  }

  /** Kinds with a complete page. */
  known(): MobKind[] {
    return [...this.pages.keys()].filter((k) => this.complete(k));
  }

  clear(): void {
    this.pages.clear();
  }

  serialise(guardians: Iterable<MobBiome> = []): BestiarySave {
    return { v: 1, pages: [...this.pages].map(([k, p]) => [k, p.seen ? 1 : 0, p.scanned ? 1 : 0, p.defeated, p.befriended]), guardians: [...guardians] };
  }

  restore(data: unknown): MobBiome[] {
    this.pages.clear();
    const d = data as Partial<BestiarySave> | null;
    if (!d || !Array.isArray(d.pages)) return [];
    for (const row of d.pages) {
      if (!Array.isArray(row) || !(row[0] in SPECIES)) continue;
      const [k, seen, scanned, defeated, befriended] = row;
      this.pages.set(k, { seen: !!seen, scanned: !!scanned, defeated: Math.max(0, Number(defeated) || 0), befriended: Math.max(0, Number(befriended) || 0) });
    }
    return Array.isArray(d.guardians) ? d.guardians.filter((b): b is MobBiome => typeof b === 'string' && b in ROSTERS) : [];
  }

  /** UI's Bestiary screen: every page in order; an unmet creature shows as unknown. */
  view(): { entries: BestiaryEntryView[]; found: number; total: number } {
    const tx = (k: string, fb: string) => (hasText(k) ? t(k as TextKey) : fb);
    const entries = BESTIARY_ORDER.map((kind): BestiaryEntryView => {
      const e = bestiary(kind);
      const p = this.get(kind);
      const role = e.rank === 'boss' ? 'boss' : e.rank === 'guardian' ? 'guardian' : e.family;
      return {
        kind,
        name: p.seen ? tx(e.nameKey, kind) : tx('mob.bestiary.unknown', '???'),
        biome: tx(`biome.${e.biome}.name`, e.biome),
        role,
        desc: p.seen ? `${tx(e.loreKey, '')} ${tx(e.tipKey, '')}`.trim() : tx(`mob.bestiary.hint.${role}`, ''),
        seen: p.seen,
        scanned: p.scanned,
        defeated: p.defeated + p.befriended,
        bonus: this.complete(kind) && e.family === 'monster' ? tx('mob.bestiary.bonus', '+20% damage') : null,
      };
    });
    return { entries, found: this.found, total: this.total };
  }
}
