import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import type { BestiaryEntryView, BestiaryView } from '../../types';
import type { ScreenHost } from '../host';
import { empty, menuShell, tabRow } from './shell';

const ROLE: Record<BestiaryEntryView['role'], TextKey> = {
  monster: 'm3.best.role.monster',
  being: 'm3.best.role.being',
  guardian: 'm3.best.role.guardian',
  boss: 'm3.best.role.boss',
};

/** Entries grouped by biome, in the order they come (MOBS's BESTIARY_ORDER follows the descent). */
export function groupByBiome(entries: readonly BestiaryEntryView[]): Array<{ biome: string; entries: BestiaryEntryView[] }> {
  const out: Array<{ biome: string; entries: BestiaryEntryView[] }> = [];
  for (const e of entries) {
    let g = out.find((x) => x.biome === e.biome);
    if (!g) out.push((g = { biome: e.biome, entries: [] }));
    g.entries.push(e);
  }
  return out;
}

/**
 * The Bestiary (BRIEF §0.3): a page per creature, grouped by biome. A page fills in when the
 * creature is met (its name and lore), scanned by the sonar or defeated (its tip and its bonus);
 * unmet ones stay a silhouette with a question mark.
 */
export function buildBestiary(host: ScreenHost): HTMLElement {
  const v: BestiaryView | null = host.actions.getBestiary();
  if (!v || !v.entries.length) return menuShell(host, 'bestiary', t('m3.best.title'), t('m3.help.bestiary'), [empty(t('m3.best.none'))]);
  const groups = groupByBiome(v.entries);
  const st = host.state;
  const biome = groups.some((g) => g.biome === st.bestiaryBiome) ? st.bestiaryBiome! : (groups.find((g) => g.entries.some((e) => e.seen)) ?? groups[0]).biome;
  const g = groups.find((x) => x.biome === biome)!;
  const list = h(
    'div',
    { class: 'dd-m3-beasts' },
    ...g.entries.map((e) =>
      h(
        'article',
        { class: `dd-m3-beast r-${e.role}${e.seen ? '' : ' unknown'}${e.scanned || e.defeated > 0 ? ' complete' : ''}`, 'data-kind': e.kind },
        h('div', { class: 'dd-m3-beasthead' }, h('h3', { text: e.seen ? e.name : t('m3.best.unknown') }), h('span', { class: 'dd-m3-role', text: t(ROLE[e.role]) })),
        e.seen ? h('p', { class: 'dd-m3-desc', text: e.desc }) : h('p', { class: 'dd-m3-desc dim', text: t('m3.best.unmet') }),
        h(
          'p',
          { class: 'dd-m3-beaststats' },
          h('span', { class: e.scanned ? 'on' : '', text: e.scanned ? t('m3.best.scanned') : t('m3.best.notScanned') }),
          h('span', { text: t('m3.best.defeated', { n: e.defeated }) }),
        ),
        e.bonus && (e.scanned || e.defeated > 0) ? h('p', { class: 'dd-m3-good', text: e.bonus }) : null,
      ),
    ),
  );
  return menuShell(host, 'bestiary', t('m3.best.title'), t('m3.help.bestiary'), [
    h('p', { class: 'dd-m3-meta' }, h('span', { text: t('m3.best.found', { n: v.found, total: v.total }) })),
    tabRow(
      t('m3.best.title'),
      groups.map((x) => ({ id: x.biome, text: x.biome, count: x.entries.filter((e) => e.seen).length })),
      biome,
      (id) => {
        st.bestiaryBiome = id;
        host.rerender();
      },
    ),
    list,
  ]);
}
