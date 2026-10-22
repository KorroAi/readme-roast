import { t } from '../../../i18n';
import { h } from '../../dom';
import { iconPx, itemIconDataUrl } from '../../icons';
import type { CraftMenuView, RecipeCardView } from '../../types';
import type { ScreenHost } from '../host';
import { btn } from '../widgets';
import { costChip, empty, menuShell, tabRow } from './shell';

/** Which category tab opens: the remembered one if it has cards, else the first with a ready card, else the first. */
export function pickCategory(v: Pick<CraftMenuView, 'categories'>, remembered: string | null): string {
  if (remembered && v.categories.some((c) => c.id === remembered && c.total > 0)) return remembered;
  return (v.categories.find((c) => c.ready > 0) ?? v.categories.find((c) => c.total > 0) ?? v.categories[0])?.id ?? '';
}

/**
 * Crafting (BRIEF §0.6): categories with their ready counts, the stations in reach, recipe cards
 * with have/need counts, fuel at the Furnace, the reason a card cannot be made, and Craft ×1 / ×5.
 */
export function buildCraft(host: ScreenHost): HTMLElement {
  const loop = host.actions.loop();
  const v = loop?.craftView() ?? null;
  const st = host.state;
  if (!v || !loop) return menuShell(host, 'crafting', t('craft3.title'), t('m3.help.craft'), [empty(t('m3.craft.none'))]);
  // A station's own recipes (opened from a placed Furnace, Forge or Alchemy Table), else all.
  const station = st.craftStation && v.cards.some((c) => c.station === st.craftStation) ? st.craftStation : null;
  const pool = station ? v.cards.filter((c) => c.station === station) : v.cards;
  const categories = v.categories
    .map((c) => ({ ...c, total: pool.filter((x) => x.category === c.id).length, ready: pool.filter((x) => x.category === c.id && x.state === 'ok').length }))
    .filter((c) => c.total > 0);
  const cat = pickCategory({ categories }, st.craftTab);
  st.craftTab = cat;
  const cards = pool.filter((c) => c.category === cat);

  const chip = (id: string | null, text: string, near: boolean) =>
    h(
      'button',
      {
        class: `dd-m3-station${near ? ' near' : ''}${station === id ? ' cur' : ''}`,
        type: 'button',
        'aria-pressed': String(station === id),
        'data-key': `station:${id ?? 'all'}`,
        onclick: () => {
          st.craftStation = station === id ? null : id;
          st.craftTab = null;
          host.rerender();
        },
      },
      text,
    );
  const stations = h(
    'div',
    { class: 'dd-m3-stations', role: 'group', 'aria-label': t('m3.craft.stations') },
    chip(null, t('m3.craft.allStations'), false),
    ...v.stations
      .filter((s) => s.id !== 'hand' && v.cards.some((c) => c.station === s.id))
      .map((s) => chip(s.id, s.near ? t('m3.craft.stationNear', { name: s.name }) : s.name, s.near)),
    v.bank ? h('span', { class: 'dd-m3-station near bank', text: t('craft3.bank') }) : null,
  );

  const list = h('div', { class: 'dd-m3-cards' });
  for (const c of cards) list.append(card(host, c));

  const body = [
    tabRow(
      t('craft3.title'),
      categories.map((c) => ({ id: c.id as string, text: c.name, count: c.ready })),
      cat,
      (id) => {
        st.craftTab = id;
        host.rerender();
      },
    ),
    stations,
    cards.length ? list : empty(t('m3.craft.emptyTab')),
  ];
  return menuShell(host, 'crafting', t('craft3.title'), t('m3.help.craft'), body);
}

function card(host: ScreenHost, c: RecipeCardView): HTMLElement {
  const loop = host.actions.loop()!;
  const ok = c.state === 'ok';
  const make = (n: number) => {
    const res = loop.craft(c.id, n);
    if (res.ok) host.state.craftFlash = c.id;
    host.rerender();
  };
  const flash = host.state.craftFlash === c.id;
  if (flash) host.state.craftFlash = null;
  return h(
    'article',
    { class: `dd-m3-card g-${c.output.grade} s-${c.state}${flash ? ' made' : ''}`, 'data-recipe': c.id },
    h(
      'div',
      { class: 'dd-m3-cardhead' },
      h('img', { class: 'dd-m3-cardicon', src: itemIconDataUrl(c.output.item, iconPx(40)), width: 40, height: 40, alt: '', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'dd-m3-cardtitle' },
        h('h3', null, c.output.name, c.output.count > 1 ? h('span', { class: 'dd-m3-x', text: ` ×${c.output.count}` }) : null, c.fresh ? h('span', { class: 'dd-m3-new', text: t('m3.craft.new') }) : null),
        c.stat ? h('p', { class: 'dd-m3-stat', text: c.stat }) : h('p', { class: 'dd-m3-stat', text: c.output.desc }),
      ),
    ),
    h(
      'div',
      { class: 'dd-m3-costs' },
      ...c.inputs.map((i) => costChip(itemIconDataUrl(i.item, iconPx(18)), i.name, i.have, i.need)),
      c.fuel ? costChip(null, t('craft3.fuel'), c.fuel.have, c.fuel.need) : null,
      h('span', { class: `dd-m3-at${c.state === 'station' ? ' short' : ''}`, text: t('m3.craft.at', { station: c.stationName }) }),
    ),
    c.reason && !ok ? h('p', { class: 'dd-m3-reason', text: c.reason }) : null,
    h(
      'div',
      { class: 'dd-m3-actions' },
      ...(c.state === 'owned'
        ? [h('span', { class: 'dd-m3-good', text: t('craft3.owned') })]
        : [
            btn(t('craft3.make1'), () => make(1), { variant: 'primary', disabled: !ok || c.max < 1, key: `craft:${c.id}:1` }),
            btn(t('craft3.make5'), () => make(5), { disabled: !ok || c.max < 5, key: `craft:${c.id}:5` }),
          ]),
    ),
  );
}
