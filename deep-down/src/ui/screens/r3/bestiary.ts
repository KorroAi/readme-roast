import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import type { BestiaryEntryView, BestiaryView } from '../../types';
import type { ScreenHost } from '../host';
import { empty, glyphEl, menuShell, tabRow } from './shell';

const ROLE: Record<BestiaryEntryView['role'], TextKey> = {
  monster: 'm3.best.role.monster',
  being: 'm3.best.role.being',
  guardian: 'm3.best.role.guardian',
  boss: 'm3.best.role.boss',
};

/** The glyph (ui/hud/glyphs) of each kind of creature: claws, a friendly face, a lair's maw, the Heart. */
const ROLE_GLYPH: Record<BestiaryEntryView['role'], string> = { monster: 'claw', being: 'being', guardian: 'lair', boss: 'heart' };

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

/** A page is complete once the creature was scanned or defeated (caught, befriended). */
export const pageComplete = (e: Pick<BestiaryEntryView, 'scanned' | 'defeated'>): boolean => e.scanned || e.defeated > 0;

/**
 * The Bestiary (BRIEF §0.3): a page per creature, grouped by biome (each tab counts what was met
 * there). A page fills in when the creature is met (its name and lore); scanning it with the sonar
 * or defeating it completes it (its bonus). An unmet creature is a short silhouette row with MOBS's
 * hint of where it lurks; the biome's guardian is framed in red.
 */
export function buildBestiary(host: ScreenHost): HTMLElement {
  const v: BestiaryView | null = host.actions.getBestiary();
  if (!v || !v.entries.length) return menuShell(host, 'bestiary', t('m3.best.title'), t('m3.help.bestiary'), [empty(t('m3.best.none'))]);
  const groups = groupByBiome(v.entries);
  const st = host.state;
  const biome = groups.some((g) => g.biome === st.bestiaryBiome) ? st.bestiaryBiome! : (groups.find((g) => g.entries.some((e) => e.seen)) ?? groups[0]).biome;
  const g = groups.find((x) => x.biome === biome)!;
  const complete = v.entries.filter((e) => e.seen && pageComplete(e)).length;
  const list = h(
    'div',
    { class: 'dd-m3-beasts' },
    ...g.entries.map((e) => {
      const done = e.seen && pageComplete(e);
      if (!e.seen)
        return h(
          'article',
          { class: `dd-m3-beast r-${e.role} unknown`, 'data-kind': e.kind },
          h('span', { class: 'dd-m3-beastglyph', 'aria-hidden': 'true' }, glyphEl(ROLE_GLYPH[e.role], 'dd-m3-beastsvg'), h('i', { text: '?' })),
          h('div', { class: 'dd-m3-beastbody' }, h('div', { class: 'dd-m3-beasthead' }, h('h3', { text: t('m3.best.unknown') }), h('span', { class: 'dd-m3-role', text: t(ROLE[e.role]) })), e.desc ? h('p', { class: 'dd-m3-desc dim', text: e.desc }) : null),
        );
      return h(
        'article',
        { class: `dd-m3-beast r-${e.role}${done ? ' complete' : ''}`, 'data-kind': e.kind },
        h('span', { class: 'dd-m3-beastglyph', 'aria-hidden': 'true' }, glyphEl(ROLE_GLYPH[e.role], 'dd-m3-beastsvg')),
        h(
          'div',
          { class: 'dd-m3-beastbody' },
          h('div', { class: 'dd-m3-beasthead' }, h('h3', { text: e.name }), h('span', { class: 'dd-m3-role', text: t(ROLE[e.role]) })),
          h('p', { class: 'dd-m3-desc', text: e.desc }),
          h(
            'p',
            { class: 'dd-m3-beaststats' },
            h('span', { class: `dd-m3-badge${e.scanned ? ' on' : ''}`, title: e.scanned ? t('m3.best.scanned') : t('m3.best.notScanned') }, glyphEl('sonar', 'dd-m3-badgeglyph'), document.createTextNode(e.scanned ? t('m3.best.scanned') : t('m3.best.notScanned'))),
            h('span', { class: `dd-m3-badge${e.defeated > 0 ? ' on' : ''}` }, glyphEl(e.role === 'being' ? 'being' : 'claw', 'dd-m3-badgeglyph'), document.createTextNode(t('m3.best.defeated', { n: e.defeated }))),
          ),
          e.bonus && done ? h('p', { class: 'dd-m3-good dd-m3-bonus', text: e.bonus }) : null,
        ),
      );
    }),
  );
  const pct = v.total ? Math.round((v.found / v.total) * 100) : 0;
  return menuShell(host, 'bestiary', t('m3.best.title'), t('m3.help.bestiary'), [
    h(
      'div',
      { class: 'dd-m3-bestmeta' },
      h('span', { text: t('m3.best.found', { n: v.found, total: v.total }) }),
      h('span', { class: 'dd-m3-good', text: t('m3.best.complete', { n: complete }) }),
      h('span', { class: 'dd-m3-prog small', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, h('span', { class: 'dd-m3-progfill', style: `transform:scaleX(${pct / 100})` })),
    ),
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
