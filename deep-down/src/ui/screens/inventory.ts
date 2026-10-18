import { lanternForTier, packForTier, pickaxeForTier, PICKAXES } from '../../config/balance';
import { ITEM_IDS, ITEMS, type ItemId } from '../../config/items';
import { RECIPE_LIST, type EquipmentSlot, type RecipeDef } from '../../config/recipes';
import { hasText, t, type TextKey } from '../../i18n';
import { h, icon } from '../dom';
import { equipmentIconDataUrl, iconPx, itemIconDataUrl } from '../icons';
import type { InventoryView } from '../types';
import type { InventoryTab, ScreenHost } from './host';
import { btn, closeBtn, header } from './widgets';

const TABS: Array<{ id: InventoryTab; label: TextKey }> = [
  { id: 'backpack', label: 'inventory.backpack' },
  { id: 'storage', label: 'inventory.storage' },
  { id: 'equipment', label: 'inventory.equipment' },
  { id: 'journal', label: 'inventory.journal' },
];

const isItem = (id: string): id is ItemId => Object.prototype.hasOwnProperty.call(ITEMS, id);

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
    tab === 'backpack' ? backpackTab(host, inv) : tab === 'storage' ? storageTab(inv) : tab === 'equipment' ? equipmentTab(inv) : journalTab(inv);
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

function backpackTab(host: ScreenHost, inv: InventoryView): HTMLElement {
  const used = inv.backpack.filter((s) => s !== null).length;
  let sel = host.state.invSlot;
  if (!inv.backpack[sel]) sel = inv.backpack.findIndex((s) => s !== null);
  const grid = h('div', { class: 'dd-slots' });
  inv.backpack.forEach((slot, i) => {
    if (!slot) {
      grid.appendChild(h('div', { class: 'dd-slot empty', 'aria-label': t('inventory.empty'), role: 'img' }));
      return;
    }
    const name = t(ITEMS[slot.item].name);
    grid.appendChild(
      h(
        'button',
        {
          class: `dd-slot ${ITEMS[slot.item].rarity}${i === sel ? ' selected' : ''}`,
          type: 'button',
          'aria-pressed': String(i === sel),
          'aria-label': `${name} ${t('inventory.count', { count: slot.count })}`,
          'data-key': `slot:${i}`,
          onclick: () => {
            host.state.invSlot = i;
            host.rerender();
          },
        },
        icon(itemIconDataUrl(slot.item, iconPx(40)), 40),
        h('span', { class: 'dd-slot-count', text: slot.count }),
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
          null,
          h('h3', { class: `dd-item-name ${ITEMS[picked.item].rarity}`, text: t(ITEMS[picked.item].name) }),
          h('p', { class: 'dd-muted', text: t(ITEMS[picked.item].desc) }),
          h('p', { class: 'dd-detail-count', text: t('inventory.count', { count: picked.count }) }),
        ),
      )
    : h('div', { class: 'dd-detail empty' }, h('p', { class: 'dd-muted', text: t('hint.pickup') }));
  return h(
    'div',
    { class: 'dd-backpack' },
    h('p', { class: 'dd-caption', text: t('inventory.slots', { used, max: inv.backpack.length }) }),
    h('div', { class: 'dd-backpack-grid' }, grid, detail),
  );
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
  return { name: k.name, desc: k.desc, stats: [['equip.stat.slots', String(k.slots)]] };
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
        icon(equipmentIconDataUrl(slot, tier, iconPx(56)), 56),
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

function journalTab(inv: InventoryView): HTMLElement {
  const discoveries = inv.journal.filter((id) => hasText(`discovery.${id}.title`));
  const keyItems = inv.journal.filter(isItem);
  if (!discoveries.length && !keyItems.length) return h('p', { class: 'dd-empty', text: t('inventory.journalEmpty') });
  return h(
    'div',
    { class: 'dd-journal' },
    discoveries.length
      ? h(
          'section',
          { class: 'dd-section' },
          h('h3', { class: 'dd-section-title', text: t('inventory.discoveries') }),
          h(
            'ul',
            { class: 'dd-entries' },
            ...discoveries.map((id) =>
              h(
                'li',
                { class: 'dd-entry' },
                h('span', { class: 'dd-entry-title', text: t(`discovery.${id}.title` as TextKey) }),
                h('span', { class: 'dd-muted small', text: t(`discovery.${id}.body` as TextKey) }),
              ),
            ),
          ),
        )
      : null,
    keyItems.length
      ? h('section', { class: 'dd-section' }, h('h3', { class: 'dd-section-title', text: t('inventory.keyItems') }), h('ul', { class: 'dd-cards' }, ...keyItems.map((id) => keyItemCard(id))))
      : null,
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

// ---------------------------------------------------------------------------------------
// Workbench

export type CraftState = 'ready' | 'owned' | 'missing' | 'notAtCamp';

/** Same precedence as gameplay/Crafting.evaluate: owned > notAtCamp > missing. */
export function craftState(recipe: RecipeDef, inv: Pick<InventoryView, 'available' | 'equipment' | 'atCamp'>): CraftState {
  if (inv.equipment[recipe.result.slot] >= recipe.result.tier) return 'owned';
  if (!inv.atCamp) return 'notAtCamp';
  for (const [id, need] of Object.entries(recipe.inputs) as Array<[ItemId, number]>) if ((inv.available[id] ?? 0) < need) return 'missing';
  return 'ready';
}

const CRAFT_REASON: Record<Exclude<CraftState, 'ready'>, TextKey> = { owned: 'craft.owned', missing: 'craft.missing', notAtCamp: 'craft.notAtCamp' };

export function buildCrafting(host: ScreenHost): HTMLElement {
  const inv = host.actions.getInventory();
  let focused = false;
  const cards = RECIPE_LIST.map((recipe) => {
    const state = craftState(recipe, inv);
    const info = equipInfo(recipe.result.slot, recipe.result.tier);
    const inputs = (Object.entries(recipe.inputs) as Array<[ItemId, number]>).map(([id, need]) => {
      const have = inv.available[id] ?? 0;
      const ok = have >= need;
      return h(
        'li',
        { class: `dd-req ${ok ? 'ok' : 'short'}` },
        icon(itemIconDataUrl(id, iconPx(22)), 22),
        h('span', { class: 'dd-req-name', text: t(ITEMS[id].name) }),
        h('b', { text: t('craft.from', { have, need }) }),
      );
    });
    const ready = state === 'ready';
    const action = ready
      ? btn(
          t('craft.craft'),
          () => {
            host.actions.craft(recipe.id);
            host.rerender();
          },
          { variant: 'primary', key: `craft:${recipe.id}`, autofocus: !focused, className: 'dd-craft-btn' },
        )
      : btn(t(CRAFT_REASON[state]), () => undefined, { disabled: true, key: `craft:${recipe.id}`, className: `dd-craft-btn ${state}` });
    focused ||= ready;
    return h(
      'li',
      { class: `dd-recipe ${state}` },
      icon(equipmentIconDataUrl(recipe.result.slot, recipe.result.tier, iconPx(56)), 56, 'dd-icon dd-recipe-icon'),
      h(
        'div',
        { class: 'dd-recipe-info' },
        h('span', { class: 'dd-item-name', text: t(recipe.name) }),
        h('span', { class: 'dd-muted small', text: t(info.desc) }),
        h('ul', { class: 'dd-reqs', 'aria-label': t('craft.requires') }, ...inputs),
      ),
      action,
    );
  });
  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-crafting', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('craft.title') },
      header(t('craft.title'), closeBtn(t('craft.close'), () => host.actions.closeScreen())),
      h('ul', { class: 'dd-scroll dd-recipes' }, ...cards),
    ),
  );
}
