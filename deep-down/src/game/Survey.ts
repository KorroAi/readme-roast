import { BLOCKS } from '../config/blocks';
import type { ItemId } from '../config/items';
import { hasText, t, type TextKey } from '../i18n';
import type { Rumour } from '../ui/types';
import type { HomeField } from '../world/analysis/homeField';
import type { LiveSite } from './WorldFeatures';

/** A rumour's walk is measured from the field cell nearest to its site, searched this far (cells). */
const SITE_SEARCH = 7;

/**
 * Rumours for the Survey Table (final pass W3): where the deep has stirred tonight. Built from the
 * world's renewal sites (game/WorldFeatures sites(): the living rock and the glimmer bloom), with
 * the walk from camp measured on the walk-home field. Pure apart from the field it reads.
 */
export function buildRumours(sites: readonly LiveSite[], home: HomeField | null, target: string | null): Rumour[] {
  const out: Rumour[] = [];
  for (const s of sites) {
    const areaName = areaNameOf(s.area);
    const ore = oreOf(s);
    const distance = home ? siteSteps(home, s.x, s.y, s.z) : null;
    let text: string;
    if (s.kind === 'bloom') text = t(s.present ? 'rumour.bloom' : 'rumour.bloomGone', { area: areaName });
    else text = t('rumour.ore', { ores: oreList(ore.map((o) => o.item)), area: areaName });
    out.push({
      id: s.id,
      kind: s.kind,
      area: s.area,
      areaName,
      text: distance === null || (s.kind === 'bloom' && !s.present) ? text : t('next.rumour', { what: text, distance }),
      ore,
      distance,
      present: s.present,
      target: target === s.id,
    });
  }
  // The bloom first (it is gone once mined), then the nearest.
  return out.sort((a, b) => Number(b.kind === 'bloom' && b.present) - Number(a.kind === 'bloom' && a.present) || (a.distance ?? 1e9) - (b.distance ?? 1e9));
}

/** The rumour the Next line offers: the compass target if there is one, else the best present one. */
export function focusRumour(rumours: readonly Rumour[], target: string | null): Rumour | null {
  if (target) {
    const r = rumours.find((x) => x.id === target && x.present);
    if (r) return r;
  }
  return rumours.find((r) => r.present) ?? null;
}

/** What grew at a site, as items (block drops), merged and in table order. */
export function oreOf(s: LiveSite): Array<{ item: ItemId; count: number }> {
  const m = new Map<ItemId, number>();
  for (const r of s.ore) {
    const item = BLOCKS[r.block]?.drop?.item;
    if (!item || r.count <= 0) continue;
    m.set(item, (m.get(item) ?? 0) + r.count);
  }
  return [...m].map(([item, count]) => ({ item, count }));
}

export function areaNameOf(area: string): string {
  const key = `area.${area}`;
  return hasText(key) ? t(key) : t('area.hall');
}

function oreList(items: readonly ItemId[]): string {
  const names = items.map((i) => {
    const key = `rumour.ore.${i}`;
    return hasText(key) ? t(key as TextKey) : t('rumour.ore.other');
  });
  if (names.length === 0) return t('rumour.ore.other');
  if (names.length === 1) return names[0];
  return t('rumour.and', { a: names.slice(0, -1).join(', '), b: names[names.length - 1] });
}

/** The nearest walk-home field cell to a point, or null (searched in a box of SITE_SEARCH cells). */
export function siteCell(home: HomeField, x: number, y: number, z: number): [number, number, number] | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const cz = Math.floor(z);
  let best: [number, number, number] | null = null;
  let bestD = Infinity;
  const r = SITE_SEARCH;
  for (let dz = -r; dz <= r; dz++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy * 2 + dz * dz;
        if (d >= bestD) continue;
        if (home.at(cx + dx, cy + dy, cz + dz) < 0) continue;
        bestD = d;
        best = [cx + dx, cy + dy, cz + dz];
      }
  return best;
}

/** Walking metres from camp to a site (field steps at its nearest cell), or null when none is near. */
export function siteSteps(home: HomeField, x: number, y: number, z: number): number | null {
  const c = siteCell(home, x, y, z);
  return c ? home.at(c[0], c[1], c[2]) : null;
}
