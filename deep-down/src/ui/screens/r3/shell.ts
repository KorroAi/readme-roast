import './menus.css';
import { t, type TextKey } from '../../../i18n';
import { h, type Child } from '../../dom';
import { iconSvg } from '../../hud/glyphs';
import type { MenuScreen } from '../../hud/actions';
import type { ScreenHost } from '../host';
import { closeBtn } from '../widgets';

/** The menus reachable from the rail at the top of every menu (one tap between them). */
const RAIL: Array<{ id: Extract<MenuScreen, 'inventory' | 'crafting' | 'map' | 'quests' | 'bestiary'>; glyph: string; label: TextKey }> = [
  { id: 'inventory', glyph: 'bag', label: 'hud3.bag' },
  { id: 'crafting', glyph: 'craft', label: 'hud3.craft' },
  { id: 'map', glyph: 'map', label: 'hud3.map' },
  { id: 'quests', glyph: 'quests', label: 'hud3.quests' },
  { id: 'bestiary', glyph: 'bestiary', label: 'hud3.bestiary' },
];

export type RailId = (typeof RAIL)[number]['id'];

export function glyphEl(name: string, cls = 'dd-m3-glyph'): HTMLElement {
  const g = h('span', { class: cls, 'aria-hidden': 'true' });
  g.innerHTML = iconSvg(name);
  return g;
}

/**
 * The frame of every round 3 menu: the rail (Bag, Craft, Map, Quests, Bestiary), the title, the
 * "?" help (a short card on what the menu is for, BRIEF §0.7) and Close; the body scrolls.
 */
export function menuShell(host: ScreenHost, id: RailId, title: string, help: string, body: Child[], extraHead: Child[] = []): HTMLElement {
  const rail = h('nav', { class: 'dd-m3-rail', 'aria-label': t('m3.rail') });
  for (const r of RAIL) {
    const cur = r.id === id;
    rail.append(
      h(
        'button',
        {
          class: `dd-m3-railbtn${cur ? ' cur' : ''}`,
          type: 'button',
          'aria-current': cur ? 'page' : undefined,
          'data-key': `rail:${r.id}`,
          onclick: () => {
            if (!cur) host.actions.openMenu(r.id);
          },
        },
        glyphEl(r.glyph),
        h('span', { class: 'dd-m3-raillabel', text: t(r.label) }),
      ),
    );
  }
  const helpOpen = host.state.help === id;
  const helpBtn = h(
    'button',
    {
      class: `dd-btn ghost dd-m3-help${helpOpen ? ' on' : ''}`,
      type: 'button',
      'aria-label': t('m3.help'),
      'aria-expanded': String(helpOpen),
      'data-key': 'help',
      onclick: () => {
        host.state.help = helpOpen ? null : id;
        host.rerender();
      },
    },
    glyphEl('help'),
  );
  return h(
    'section',
    { class: 'dd-screen dd-overlay dd-menu3', 'data-menu': id },
    h(
      'div',
      { class: 'dd-panel dd-m3-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      rail,
      h('header', { class: 'dd-panel-head dd-m3-head' }, h('h2', { class: 'dd-panel-title', text: title }), h('div', { class: 'dd-panel-actions' }, ...extraHead, helpBtn, closeBtn(t('m3.close'), () => host.actions.closeScreen()))),
      helpOpen ? h('div', { class: 'dd-m3-helpcard', role: 'note' }, h('p', { text: help })) : null,
      h('div', { class: 'dd-scroll dd-m3-body' }, ...body),
    ),
  );
}

/** A row of tabs (re-renders on change); `count` adds a small number after the label. */
export function tabRow<T extends string>(label: string, tabs: Array<{ id: T; text: string; count?: number }>, current: T, onPick: (id: T) => void): HTMLElement {
  const row = h('div', { class: 'dd-tabs dd-m3-tabs', role: 'tablist', 'aria-label': label });
  let selected: HTMLElement | null = null;
  for (const tb of tabs) {
    const sel = tb.id === current;
    const b = h(
      'button',
      { class: 'dd-tab', type: 'button', role: 'tab', 'aria-selected': String(sel), 'data-key': `tab:${tb.id}`, onclick: () => onPick(tb.id) },
      tb.text,
      tb.count !== undefined && tb.count > 0 ? h('span', { class: 'dd-m3-tabcount', text: String(tb.count) }) : null,
    );
    if (sel) selected = b;
    row.append(b);
  }
  // The strip scrolls sideways on a narrow phone: the selected tab is always brought into view.
  if (selected && typeof requestAnimationFrame === 'function') {
    const s = selected;
    requestAnimationFrame(() => {
      if (!row.isConnected) return;
      const left = s.offsetLeft - row.offsetLeft;
      if (left < row.scrollLeft || left + s.offsetWidth > row.scrollLeft + row.clientWidth * 0.85) row.scrollLeft = Math.max(0, left - 12);
    });
  }
  return row;
}

/** A small have/need chip (ok or short). */
export function costChip(icon: string | null, name: string, have: number, need: number): HTMLElement {
  const ok = have >= need;
  return h(
    'span',
    { class: `dd-m3-cost${ok ? ' ok' : ' short'}`, title: name },
    icon ? h('img', { class: 'dd-m3-costicon', src: icon, width: 18, height: 18, alt: '', 'aria-hidden': 'true' }) : null,
    h('span', { class: 'dd-m3-costname', text: name }),
    h('b', { class: 'dd-m3-costn', text: t('hud3.count', { have: Math.min(have, 999), need }) }),
  );
}

/** The calm empty state of a list. */
export function empty(text: string): HTMLElement {
  return h('p', { class: 'dd-m3-empty', text });
}
