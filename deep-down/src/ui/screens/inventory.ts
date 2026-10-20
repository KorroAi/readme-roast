import { lanternForTier, packForTier, pickaxeForTier, PICKAXES } from '../../config/balance';
import { ITEM_IDS, ITEMS, type ItemId } from '../../config/items';
import type { EquipmentSlot } from '../../config/recipes';
import { t, type TextKey } from '../../i18n';
import './inventory.css';
import { h, icon } from '../dom';
import { iconPx, itemIconDataUrl } from '../icons';
import type { InventoryView } from '../types';
import type { InventoryTab, ScreenHost } from './host';
import { nodeIconDataUrl } from './nodeIcons';
import { btn, closeBtn, header, ledger } from './widgets';

const TABS: Array<{ id: InventoryTab; label: TextKey }> = [
  { id: 'backpack', label: 'inventory.backpack' },
  { id: 'storage', label: 'inventory.storage' },
  { id: 'equipment', label: 'inventory.equipment' },
  { id: 'journal', label: 'inventory.journal' },
];

export function buildInventory(host: ScreenHost): HTMLElement {
  const inv = host.actions.getInventory();
  const tab = host.state.invTab;
  const tabs = h('div', { class: 'dd-tabs', role: 'tablist', 'aria-label': t('inventory.title') });
  for (const def of TABS) {
    const selected = def.id === tab;
    tabs.appendChild(
      h('button', {
        class: 'dd-tab',
        type: 'button',
        role: 'tab',
        id: `dd-tab-${def.id}`,
        'aria-selected': String(selected),
        'aria-controls': 'dd-tabpanel',
        'data-key': `tab:${def.id}`,
        'data-autofocus': selected,
        text: t(def.label),
        onclick: () => {
          host.state.invTab = def.id;
          host.rerender();
        },
      }),
    );
  }
  const body =
    tab === 'backpack' ? backpackTab(host, inv) : tab === 'storage' ? storageTab(inv) : tab === 'equipment' ? equipmentTab(inv) : journalTab(host);
  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-inventory', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('inventory.title') },
      header(t('inventory.title'), closeBtn(t('inventory.close'), () => host.actions.closeScreen())),
      tabs,
      h('div', { class: 'dd-scroll dd-tabpanel', id: 'dd-tabpanel', role: 'tabpanel', 'aria-labelledby': `dd-tab-${tab}` }, body),
    ),
  );
}

/** How long Drop must be held (ms): a stack is never dropped by a stray tap. */
export const DROP_HOLD_MS = 600;

function backpackTab(host: ScreenHost, inv: InventoryView): HTMLElement {
  const used = inv.backpack.filter((s) => s !== null).length;
  let sel = host.state.invSlot;
  if (!inv.backpack[sel]) sel = inv.backpack.findIndex((s) => s !== null);
  const pouchFrom = inv.backpack.length - inv.pouchSlots;
  // Two even rows for the bigger packs (8 -> 4 x 2, 10 -> 5 x 2), so the pouch sits on the last row.
  const cols = inv.backpack.length > 6 ? Math.ceil(inv.backpack.length / 2) : 3;
  const grid = h('div', { class: 'dd-slots', style: `--cols: ${cols}` });
  inv.backpack.forEach((slot, i) => {
    const pouch = inv.pouchSlots > 0 && i >= pouchFrom;
    const lock = pouch ? h('span', { class: 'dd-slot-lock', 'aria-hidden': 'true' }) : null;
    if (!slot) {
      grid.appendChild(h('div', { class: `dd-slot empty${pouch ? ' pouch' : ''}`, 'aria-label': t(pouch ? 'ui.inv.pouchEmpty' : 'inventory.empty'), role: 'img' }, lock));
      return;
    }
    const name = t(ITEMS[slot.item].name);
    grid.appendChild(
      h(
        'button',
        {
          class: `dd-slot ${ITEMS[slot.item].rarity}${i === sel ? ' selected' : ''}${pouch ? ' pouch' : ''}`,
          type: 'button',
          'aria-pressed': String(i === sel),
          'aria-label': `${name} ${t('inventory.count', { count: slot.count })}${pouch ? `. ${t('equip.stat.pouch')}` : ''}`,
          'data-key': `slot:${i}`,
          onclick: () => {
            host.state.invSlot = i;
            host.rerender();
          },
        },
        icon(itemIconDataUrl(slot.item, iconPx(40)), 40),
        h('span', { class: 'dd-slot-count', text: slot.count }),
        lock,
      ),
    );
  });
  const picked = sel >= 0 ? inv.backpack[sel] : null;
  const detail = picked
    ? h(
        'div',
        { class: 'dd-detail' },
        icon(itemIconDataUrl(picked.item, iconPx(56)), 56),
        h(
          'div',
          { class: 'dd-detail-text' },
          h('h3', { class: `dd-item-name ${ITEMS[picked.item].rarity}`, text: t(ITEMS[picked.item].name) }),
          h('p', { class: 'dd-muted', text: t(ITEMS[picked.item].desc) }),
          h('p', { class: 'dd-detail-count', text: t('inventory.count', { count: picked.count }) }),
          dropButton(host, sel),
        ),
      )
    : h('div', { class: 'dd-detail empty' }, h('p', { class: 'dd-muted', text: t('hint.pickup') }));
  return h(
    'div',
    { class: 'dd-backpack' },
    h('p', { class: 'dd-caption', text: t('inventory.slots', { used, max: inv.backpack.length }) }),
    h('div', { class: 'dd-backpack-grid' }, grid, detail),
    inv.pouchSlots > 0 ? h('p', { class: 'dd-caption dd-pouch-note' }, h('span', { class: 'dd-slot-lock', 'aria-hidden': 'true' }), t('ui.inv.pouchNote', { count: inv.pouchSlots })) : null,
  );
}

/**
 * Drop the selected stack on the ground in front of the explorer: press and hold (a brass bar
 * fills over DROP_HOLD_MS). A keyboard press is deliberate already and drops at once.
 */
function dropButton(host: ScreenHost, slot: number): HTMLElement {
  let timer = 0;
  const drop = () => {
    window.clearTimeout(timer);
    host.actions.dropStack(slot);
    host.rerender();
  };
  const b = btn(t('ui.inv.drop'), () => undefined, { key: `drop:${slot}`, className: 'dd-drop', label: t('ui.inv.dropLabel') });
  b.prepend(h('span', { class: 'dd-drop-fill', 'aria-hidden': 'true' }));
  const cancel = () => {
    window.clearTimeout(timer);
    b.classList.remove('holding');
  };
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    b.classList.add('holding');
    window.clearTimeout(timer);
    timer = window.setTimeout(drop, DROP_HOLD_MS);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) b.addEventListener(type, cancel);
  b.addEventListener('click', (e) => {
    if ((e as MouseEvent).detail === 0) drop();
  });
  return b;
}

function storageTab(inv: InventoryView): HTMLElement {
  const items = ITEM_IDS.filter((id) => (inv.storage[id] ?? 0) > 0);
  return h(
    'div',
    { class: 'dd-storage' },
    h('p', { class: 'dd-caption', text: t('inventory.storageHint') }),
    items.length
      ? h('ul', { class: 'dd-cards' }, ...items.map((id) => itemCard(id, inv.storage[id] ?? 0)))
      : h('p', { class: 'dd-empty', text: t('inventory.storageEmpty') }),
  );
}

function itemCard(id: ItemId, count: number): HTMLElement {
  return h(
    'li',
    { class: `dd-card ${ITEMS[id].rarity}` },
    icon(itemIconDataUrl(id, iconPx(40)), 40),
    h('div', { class: 'dd-card-text' }, h('span', { class: 'dd-item-name', text: t(ITEMS[id].name) }), h('span', { class: 'dd-muted small', text: t(ITEMS[id].desc) })),
    h('b', { class: 'dd-card-count', text: t('inventory.count', { count }) }),
  );
}

interface EquipInfo {
  name: TextKey;
  desc: TextKey;
  stats: Array<[TextKey, string]>;
}

/** Display data for an equipment tier (shared with the Workbench). */
export function equipInfo(slot: EquipmentSlot, tier: number): EquipInfo {
  if (slot === 'pickaxe') {
    const p = pickaxeForTier(tier);
    const base = PICKAXES[0];
    const speed = Math.round(((p.power / p.swingInterval) / (base.power / base.swingInterval)) * 100);
    return {
      name: p.name,
      desc: p.desc,
      stats: [
        ['equip.stat.speed', t('equip.stat.speedValue', { value: speed })],
        ['equip.stat.tier', t('equip.stat.tierValue', { value: p.tier })],
      ],
    };
  }
  if (slot === 'lantern') {
    const l = lanternForTier(tier);
    return {
      name: l.name,
      desc: l.desc,
      stats: [
        ['equip.stat.radius', t('equip.stat.radiusValue', { value: l.radius })],
        ['equip.stat.fuel', t('equip.stat.fuelValue', { value: Math.round(l.fuelSeconds / 60) })],
      ],
    };
  }
  const k = packForTier(tier);
  const stats: Array<[TextKey, string]> = [['equip.stat.slots', String(k.slots)]];
  if (k.pouch > 0) stats.push(['equip.stat.pouch', String(k.pouch)]);
  return { name: k.name, desc: k.desc, stats };
}

const SLOT_LABEL: Record<EquipmentSlot, TextKey> = { pickaxe: 'equip.pickaxe', lantern: 'equip.lantern', pack: 'equip.pack' };

function equipmentTab(inv: InventoryView): HTMLElement {
  const slots: EquipmentSlot[] = ['pickaxe', 'lantern', 'pack'];
  return h(
    'ul',
    { class: 'dd-equip' },
    ...slots.map((slot) => {
      const tier = inv.equipment[slot];
      const info = equipInfo(slot, tier);
      return h(
        'li',
        { class: 'dd-equip-card' },
        // Every tier has its own art now (the tree's node icons): iron and glimmer picks, the attuned lantern.
        icon(nodeIconDataUrl({ kind: 'equip', slot, tier }, iconPx(56)), 56),
        h(
          'div',
          { class: 'dd-card-text' },
          h('span', { class: 'dd-eyebrow', text: t(SLOT_LABEL[slot]) }),
          h('span', { class: 'dd-item-name', text: t(info.name) }),
          h('span', { class: 'dd-muted small', text: t(info.desc) }),
          h('dl', { class: 'dd-stats' }, ...info.stats.flatMap(([k, v]) => [h('dt', { text: t(k) }), h('dd', { text: v })])),
        ),
      );
    }),
  );
}

/** The Bag's Journal tab: how much of the Hollow has been found, and the way into the Journal. */
function journalTab(host: ScreenHost): HTMLElement {
  const j = host.actions.getJournal();
  const relics = j.relics.filter((r) => r.found).length;
  const runes = j.runes.filter((r) => r.found).map((r) => r.item);
  return h(
    'div',
    { class: 'dd-journal' },
    h(
      'div',
      { class: 'dd-journal-head' },
      ledger([
        { label: t('ui.journal.tab.discoveries'), value: `${j.found}/${j.total}`, tone: 'rare' },
        { label: t('ui.journal.tab.runes'), value: `${j.runesFound}/${j.runesTotal}`, tone: 'relic' },
        ...(j.relics.length ? [{ label: t('ui.journal.tab.relics'), value: `${relics}/${j.relics.length}`, tone: 'relic' }] : []),
      ]),
      h('div', { class: 'dd-journal-open' }, btn(t('ui.journal.open'), () => host.actions.openJournal(), { variant: 'primary', key: 'open-journal' })),
    ),
    runes.length ? h('ul', { class: 'dd-cards dd-journal-keys' }, ...runes.map((id) => keyItemCard(id))) : h('p', { class: 'dd-empty', text: t('inventory.journalEmpty') }),
  );
}

function keyItemCard(id: ItemId): HTMLElement {
  return h(
    'li',
    { class: `dd-card ${ITEMS[id].rarity}` },
    icon(itemIconDataUrl(id, iconPx(40)), 40),
    h('div', { class: 'dd-card-text' }, h('span', { class: 'dd-item-name', text: t(ITEMS[id].name) }), h('span', { class: 'dd-muted small', text: t(ITEMS[id].desc) })),
  );
}
