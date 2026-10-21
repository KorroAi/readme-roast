import './journal.css';
import { RUNES } from '../../config/runes';
import { t, type TextKey } from '../../i18n';
import { h } from '../dom';
import { rarityLegend } from '../rarityLegend';
import { depthText } from '../format';
import type { FeatsView } from '../../gameplay/Feats';
import type { JournalEntry, JournalTab, JournalView, RunePage } from '../types';
import type { ScreenHost } from './host';
import { closeBtn } from './widgets';

/**
 * The Journal: the collection of what the Hollow has shown. Builders' register (cyan ink on
 * stone) for what was found, violet '?' for what still waits. Three tabs:
 * - Discoveries: each zone with its k/N, found lore cards (the rune emblem, the expedition and
 *   the depth it was found at), '?' cards with a light hint; the four Halden logs grouped apart.
 * - Runes: the eight plates, inked once found (k/8).
 * - Relics: the texts the relics carry.
 * - Feats: every feat (earned in cyan ink with its reward, the rest as what to do), then the
 *   lifetime numbers.
 */

const TABS: Array<{ id: JournalTab; label: TextKey }> = [
  { id: 'discoveries', label: 'ui.journal.tab.discoveries' },
  { id: 'runes', label: 'ui.journal.tab.runes' },
  { id: 'relics', label: 'ui.journal.tab.relics' },
  { id: 'feats', label: 'journal.feats' },
];

function tabCount(v: JournalView, id: JournalTab): string {
  if (id === 'discoveries') return `${v.found}/${v.total}`;
  if (id === 'runes') return `${v.runesFound}/${v.runesTotal}`;
  if (id === 'feats') return v.feats ? `${v.feats.earned}/${v.feats.total}` : '';
  return `${v.relics.filter((r) => r.found).length}/${v.relics.length}`;
}

export function buildJournal(host: ScreenHost): HTMLElement {
  const v = host.actions.getJournal();
  if (host.opening) host.state.journalTab = v.focus;
  // The Feats tab exists when the game keeps feats (a view without them never lands on it).
  const defs = TABS.filter((d) => d.id !== 'feats' || !!v.feats);
  if (!defs.some((d) => d.id === host.state.journalTab)) host.state.journalTab = 'discoveries';
  const tab = host.state.journalTab;
  const tabs = h('div', { class: `dd-tabs dd-journal-tabs n${defs.length}`, role: 'tablist', 'aria-label': t('ui.journal.title') });
  for (const def of defs) {
    const selected = def.id === tab;
    const count = tabCount(v, def.id);
    tabs.appendChild(
      h(
        'button',
        {
          class: 'dd-tab',
          type: 'button',
          role: 'tab',
          id: `dd-jtab-${def.id}`,
          'aria-selected': String(selected),
          'aria-controls': 'dd-journal-panel',
          'data-key': `jtab:${def.id}`,
          'data-autofocus': selected,
          onclick: () => {
            host.state.journalTab = def.id;
            host.rerender();
          },
        },
        h('span', { text: t(def.label) }),
        h('span', { class: 'dd-journal-tab-n', text: count }),
      ),
    );
  }
  const body = tab === 'discoveries' ? discoveriesTab(v) : tab === 'runes' ? runesTab(v) : tab === 'feats' && v.feats ? featsTab(v.feats) : relicsTab(v);
  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-journal-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.journal.title') },
      h('header', { class: 'dd-panel-head' }, h('h2', { class: 'dd-panel-title', text: t('ui.journal.title') }), h('div', { class: 'dd-panel-actions' }, closeBtn(t('ui.journal.close'), () => host.actions.closeScreen()))),
      tabs,
      h('div', { class: 'dd-scroll dd-journal-panel', id: 'dd-journal-panel', role: 'tabpanel', 'aria-labelledby': `dd-jtab-${tab}` }, body),
    ),
  );
}

/** "Expedition 3 · -96 m" (whatever is known). */
function foundAt(expedition: number | null, depth: number | null): string {
  const parts: string[] = [];
  if (expedition !== null) parts.push(t('ui.journal.expedition', { n: expedition }));
  if (depth !== null) parts.push(depthText(depth));
  return parts.join(' · ');
}

function entryCard(e: JournalEntry): HTMLElement {
  if (!e.found) {
    return h(
      'li',
      { class: `dd-lore unfound${e.log ? ' log' : ''}`, 'aria-label': `${t('ui.journal.unknown')}. ${e.hint}` },
      h('span', { class: 'dd-lore-q', 'aria-hidden': 'true', text: '?' }),
      h('div', { class: 'dd-lore-text' }, h('span', { class: 'dd-lore-hint', text: e.hint })),
    );
  }
  const meta = foundAt(e.expedition, e.depth);
  return h(
    'li',
    { class: `dd-lore found${e.major ? ' major' : ''}${e.log ? ' log' : ''}` },
    h('span', { class: 'dd-lore-emblem', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'dd-lore-text' },
      h('h4', { class: 'dd-lore-title', text: e.title }),
      h('p', { class: 'dd-lore-body', text: e.body }),
      meta ? h('span', { class: 'dd-lore-meta', text: meta }) : null,
    ),
  );
}

function group(id: string, name: string, found: number, total: number, entries: JournalEntry[]): HTMLElement {
  return h(
    'section',
    { class: `dd-journal-group g-${id}` },
    h('h3', { class: 'dd-journal-zone' }, h('span', { class: 'dd-journal-zone-name', text: name }), h('span', { class: 'dd-journal-zone-n', text: `${found}/${total}` })),
    h('ul', { class: 'dd-lores' }, ...entries.map(entryCard)),
  );
}

function discoveriesTab(v: JournalView): HTMLElement {
  const places = v.discoveries.filter((e) => !e.log);
  const logs = v.discoveries.filter((e) => e.log);
  const groups: HTMLElement[] = [];
  for (const z of v.zones) {
    const list = places.filter((e) => e.zone === z.id);
    if (!list.length) continue;
    groups.push(group(z.id, z.name, list.filter((e) => e.found).length, list.length, list));
  }
  // Entries whose zone the view does not list still show (never silently dropped).
  const listed = new Set(v.zones.map((z) => z.id));
  const rest = places.filter((e) => !listed.has(e.zone));
  if (rest.length) groups.push(group('other', t('ui.journal.elsewhere'), rest.filter((e) => e.found).length, rest.length, rest));
  // The Halden logs, together and in table order.
  if (logs.length) groups.push(group('logs', t('ui.journal.logs'), logs.filter((e) => e.found).length, logs.length, logs));
  // Round 2: what glows can be taken (the rarity colours), at the head of the journal.
  const legend = h('section', { class: 'dd-journal-legend' }, h('h3', { text: t('rarity.legend.title') }), h('p', { text: t('rarity.legend.body') }), rarityLegend());
  return h('div', { class: 'dd-journal-discoveries' }, legend, h('p', { class: 'dd-journal-total' }, h('b', { text: `${v.found}/${v.total}` }), ' ', t('ui.journal.foundOf')), h('div', { class: 'dd-journal-groups' }, ...groups));
}

/** A rune's glyph as SVG strokes on its 16 x 16 grid (config/runes). */
export function runeGlyphSvg(index: number, size: number): string {
  const g = RUNES[((index % RUNES.length) + RUNES.length) % RUNES.length];
  const lines = g.lines.map(([x0, y0, x1, y1]) => `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`).join('');
  const rings = (g.rings ?? []).map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('');
  const dots = (g.dots ?? []).map(([x, y]) => `<rect x="${x - 0.8}" y="${y - 0.8}" width="1.6" height="1.6"/>`).join('');
  return `<svg class="dd-rune-glyph" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${lines}${rings}<g class="dots">${dots}</g></svg>`;
}

function runePlate(r: RunePage): HTMLElement {
  const glyph = h('span', { class: 'dd-rune-face' });
  glyph.innerHTML = runeGlyphSvg(r.glyph, 44); // trusted: built from config/runes numbers
  const meta = foundAt(r.expedition, r.depth);
  return h(
    'li',
    { class: `dd-rune-plate ${r.found ? 'inked' : 'blank'}`, 'aria-label': r.found ? `${r.name}. ${r.line}` : `${t('ui.journal.runeUnfound')}. ${r.hint}` },
    glyph,
    h(
      'div',
      { class: 'dd-rune-text' },
      h('span', { class: 'dd-rune-name', text: r.found ? r.name : '?' }),
      h('span', { class: 'dd-rune-line', text: r.found ? r.line : r.hint }),
      r.found && meta ? h('span', { class: 'dd-lore-meta', text: meta }) : null,
    ),
  );
}

function runesTab(v: JournalView): HTMLElement {
  return h(
    'div',
    { class: 'dd-journal-runes' },
    h('p', { class: 'dd-journal-total' }, h('b', { text: `${v.runesFound}/${v.runesTotal}` }), ' ', t('ui.journal.runesOf')),
    h('ul', { class: 'dd-rune-plates' }, ...v.runes.map(runePlate)),
  );
}

function relicsTab(v: JournalView): HTMLElement {
  if (!v.relics.length) return h('p', { class: 'dd-empty', text: t('ui.journal.noRelics') });
  return h(
    'ul',
    { class: 'dd-lores dd-journal-relics' },
    ...v.relics.map((r) =>
      r.found
        ? h('li', { class: 'dd-lore found relic' }, h('span', { class: 'dd-lore-emblem', 'aria-hidden': 'true' }), h('div', { class: 'dd-lore-text' }, h('h4', { class: 'dd-lore-title', text: r.title }), h('p', { class: 'dd-lore-body', text: r.body })))
        : h('li', { class: 'dd-lore unfound relic' }, h('span', { class: 'dd-lore-q', 'aria-hidden': 'true', text: '?' }), h('div', { class: 'dd-lore-text' }, h('span', { class: 'dd-lore-hint', text: t('ui.journal.relicUnfound') }))),
    ),
  );
}

function featCard(f: FeatsView['feats'][number]): HTMLElement {
  return h(
    'li',
    { class: `dd-lore dd-feat ${f.earned ? 'found' : 'unfound'}`, 'data-feat': f.id, 'aria-label': `${f.name}. ${f.desc}${f.earned ? '' : `. ${t('ui.journal.unknown')}`}` },
    f.earned ? h('span', { class: 'dd-lore-emblem', 'aria-hidden': 'true' }) : h('span', { class: 'dd-feat-socket', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'dd-lore-text' },
      h('h4', { class: 'dd-lore-title', text: f.name }),
      h('p', { class: 'dd-lore-body', text: f.desc }),
      f.earned && f.reward ? h('span', { class: 'dd-lore-meta dd-feat-reward', text: `+ ${f.reward}` }) : null,
    ),
  );
}

function featsTab(v: FeatsView): HTMLElement {
  // Earned first (the page fills from the top as you play), each part in table order.
  const earned = v.feats.filter((f) => f.earned);
  const waiting = v.feats.filter((f) => !f.earned);
  return h(
    'div',
    { class: 'dd-journal-feats' },
    h('p', { class: 'dd-journal-total' }, h('b', { text: `${v.earned}/${v.total}` }), ' ', t('journal.feats')),
    h('ul', { class: 'dd-lores dd-feats' }, ...earned.map(featCard), ...waiting.map(featCard)),
    h(
      'section',
      { class: 'dd-journal-group g-stats' },
      h('h3', { class: 'dd-journal-zone' }, h('span', { class: 'dd-journal-zone-name', text: t('journal.stats') })),
      h('dl', { class: 'dd-life' }, ...v.stats.map((r) => h('div', { class: 'dd-life-row', 'data-stat': r.id }, h('dt', { text: r.label }), h('dd', { text: r.value })))),
    ),
  );
}
