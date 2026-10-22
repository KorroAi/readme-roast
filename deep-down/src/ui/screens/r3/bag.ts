import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import { iconPx, itemIconDataUrl } from '../../icons';
import type { BagItemView, BagView } from '../../types';
import type { ItemId } from '../../../config/items';
import type { ScreenHost } from '../host';
import { btn } from '../widgets';
import { empty, menuShell, tabRow } from './shell';

export type BagTab = 'all' | 'materials' | 'gear' | 'consumables' | 'building' | 'key';
const TABS: Array<{ id: BagTab; label: TextKey }> = [
  { id: 'all', label: 'm3.bag.all' },
  { id: 'materials', label: 'bag3.cat.materials' },
  { id: 'gear', label: 'bag3.cat.gear' },
  { id: 'consumables', label: 'bag3.cat.consumables' },
  { id: 'building', label: 'bag3.cat.building' },
  { id: 'key', label: 'bag3.cat.key' },
];
const SLOT_LABEL: Record<string, TextKey> = {
  pick: 'gear3.pick',
  weapon: 'gear3.weapon',
  lantern: 'gear3.lantern',
  pack: 'gear3.pack',
  head: 'gear3.head',
  chest: 'gear3.chest',
  feet: 'gear3.feet',
};
const ACTION_LABEL: Record<BagItemView['actions'][number], TextKey> = {
  use: 'bag3.use',
  equip: 'bag3.equip',
  place: 'm3.bag.place',
  assign: 'bag3.assign',
  drop: 'bag3.drop',
  bank: 'bag3.bank',
};

function itemsOf(v: BagView, tab: BagTab): BagItemView[] {
  if (tab !== 'all') return v.items[tab] ?? [];
  const out: BagItemView[] = [];
  for (const k of Object.keys(v.items) as Array<keyof BagView['items']>) out.push(...v.items[k]);
  return out;
}

/**
 * The Bag (BRIEF §0.6): a grid of what is carried by category, a detail card with Use, Equip,
 * Place and Put on hotbar, the gear worn (armour, set bonus, wards) and, at camp or an outpost,
 * the bank. A long-press on a hotbar slot opens it in "choose for slot N" mode: a tap on an item
 * fills that slot.
 */
export function buildBag(host: ScreenHost): HTMLElement {
  const loop = host.actions.loop();
  const v = loop?.bagView() ?? null;
  const st = host.state;
  if (!v || !loop) return menuShell(host, 'inventory', t('bag3.title'), t('m3.help.bag'), [empty(t('m3.bag.none'))]);
  const list = itemsOf(v, st.bagTab);
  const sel = list.find((i) => i.item === st.bagSel) ?? list[0] ?? null;
  const assigning = st.assignSlot >= 0;

  const grid = h('div', { class: 'dd-m3-grid', role: 'listbox', 'aria-label': t('bag3.title') });
  for (const it of list) {
    const on = sel?.item === it.item;
    grid.append(
      h(
        'button',
        {
          class: `dd-m3-tile g-${it.grade}${on ? ' sel' : ''}${it.equipped ? ' equipped' : ''}`,
          type: 'button',
          role: 'option',
          'aria-selected': String(on),
          'aria-label': `${it.name} ×${it.count}`,
          'data-key': `item:${it.item}`,
          'data-item': it.item,
          onclick: () => {
            if (assigning) {
              loop.assign(st.assignSlot, it.item);
              host.toast(t('m3.bag.assigned', { item: it.name, n: st.assignSlot + 1 }), 'good');
              st.assignSlot = -1;
              host.actions.closeScreen();
              return;
            }
            st.bagSel = it.item;
            host.rerender();
          },
        },
        h('img', { class: 'dd-m3-tileicon', src: itemIconDataUrl(it.item, iconPx(34)), width: 34, height: 34, alt: '', 'aria-hidden': 'true' }),
        it.count > 1 ? h('span', { class: 'dd-m3-tilen', text: String(it.count) }) : null,
        it.equipped ? h('span', { class: 'dd-m3-tileeq', text: t('m3.bag.worn') }) : null,
      ),
    );
  }

  const detail = sel
    ? h(
        'div',
        { class: `dd-m3-detail g-${sel.grade}` },
        h('div', { class: 'dd-m3-detailhead' }, h('img', { src: itemIconDataUrl(sel.item, iconPx(44)), width: 44, height: 44, alt: '', 'aria-hidden': 'true' }), h('div', null, h('h3', { text: sel.name }), h('p', { class: 'dd-m3-sub', text: t('m3.bag.have', { n: sel.count }) }))),
        h('p', { class: 'dd-m3-desc', text: sel.desc }),
        h(
          'div',
          { class: 'dd-m3-actions' },
          ...sel.actions
            .filter((a) => a !== 'drop' && (a !== 'bank' || v.bank !== null))
            .map((a) =>
              btn(
                t(ACTION_LABEL[a]),
                () => {
                  if (a === 'use') {
                    if (!loop.use(sel.item)) host.toast(t('bag3.cantUse'), 'warn');
                  } else if (a === 'equip') loop.equip(sel.item);
                  else if (a === 'assign' || a === 'place') {
                    const slot = firstFreeSlot(loop.hotbarView().slots, sel.item);
                    loop.assign(slot, sel.item);
                    loop.selectHotbar(slot);
                    host.toast(t('m3.bag.assigned', { item: sel.name, n: slot + 1 }), 'good');
                  } else if (a === 'bank') loop.bankAll();
                  host.rerender();
                },
                { key: `act:${a}`, variant: a === 'use' || a === 'equip' ? 'primary' : 'secondary' },
              ),
            ),
        ),
      )
    : null;

  const gear = v.gear;
  const gearRow = h(
    'div',
    { class: 'dd-m3-gear' },
    ...(Object.keys(gear.equipped) as Array<keyof typeof gear.equipped>).map((slot) => {
      const item = gear.equipped[slot];
      return h(
        'div',
        { class: `dd-m3-gearslot${item ? '' : ' empty'}`, title: t(SLOT_LABEL[slot] ?? 'gear3.pick') },
        item ? h('img', { src: itemIconDataUrl(item, iconPx(28)), width: 28, height: 28, alt: '', 'aria-hidden': 'true' }) : h('span', { class: 'dd-m3-gearempty', 'aria-hidden': 'true' }),
        h('span', { class: 'dd-m3-gearlabel', text: t(SLOT_LABEL[slot] ?? 'gear3.pick') }),
      );
    }),
  );
  const wards = gear.wards;
  const stats = h(
    'p',
    { class: 'dd-m3-gearstats' },
    t('gear3.armour', { armour: Math.round(gear.armour * 100) }),
    wards.cold > 0 ? ` · ${t('m3.bag.ward.cold', { pct: Math.round(wards.cold * 100) })}` : '',
    wards.gas > 0 ? ` · ${t('m3.bag.ward.gas', { pct: Math.round(wards.gas * 100) })}` : '',
    wards.heat > 0 ? ` · ${t('m3.bag.ward.heat', { pct: Math.round(wards.heat * 100) })}` : '',
    wards.dark > 0 ? ` · ${t('m3.bag.ward.dark', { pct: Math.round(wards.dark * 100) })}` : '',
  );

  const body = [
    assigning ? h('p', { class: 'dd-m3-banner', role: 'status', text: t('m3.bag.choose', { n: st.assignSlot + 1 }) }) : null,
    h('div', { class: 'dd-m3-meta' }, h('span', { text: t('m3.bag.used', { used: v.used, max: v.max }) }), v.bank ? h('span', { class: 'dd-m3-good', text: t('m3.bag.bankNear') }) : null),
    tabRow(
      t('bag3.title'),
      TABS.map((tb) => ({ id: tb.id, text: t(tb.label), count: tb.id === 'all' ? undefined : (v.items[tb.id as Exclude<BagTab, 'all'>] ?? []).length })),
      st.bagTab,
      (id) => {
        st.bagTab = id;
        st.bagSel = null;
        host.rerender();
      },
    ),
    list.length ? grid : empty(t('m3.bag.emptyTab')),
    detail,
    h('h3', { class: 'dd-m3-section', text: t('m3.bag.gear') }),
    gearRow,
    stats,
    gear.set ? h('p', { class: 'dd-m3-good', text: `${gear.set.name}: ${gear.set.bonus}` }) : null,
    v.bank ? h('div', { class: 'dd-m3-actions' }, btn(t('bag3.bankAll'), () => {
      const n = loop.bankAll();
      host.toast(t('toast.banked', { count: n }), 'good');
      host.rerender();
    }, { key: 'bankAll' })) : null,
  ];
  return menuShell(host, 'inventory', t('bag3.title'), t('m3.help.bag'), body);
}

/** The slot a new item goes to: the slot already holding it, else the first empty free slot, else the last. */
export function firstFreeSlot(slots: ReadonlyArray<{ item: ItemId | null; role?: string }>, item: ItemId): number {
  const same = slots.findIndex((s) => s.item === item);
  if (same >= 0) return same;
  const free = slots.findIndex((s, i) => s.item === null && i >= 2);
  if (free >= 0) return free;
  return Math.max(0, slots.length - 1);
}
