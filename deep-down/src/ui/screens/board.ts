import './board.css';
import { ITEMS } from '../../config/items';
import { t } from '../../i18n';
import { h, icon, type Child } from '../dom';
import { depthText } from '../format';
import { iconPx, itemIconDataUrl } from '../icons';
import type { Rumour, SurveyView } from '../types';
import type { ScreenHost } from './host';
import { closeBtn, ledger } from './widgets';

/**
 * The Survey Table board: the records ledger, and the rumours of what the deep did overnight
 * (living rock that grew back, the glimmer bloom), each with its walking distance from camp.
 * Tapping a rumour points the compass at it; tapping it again points the compass home.
 *
 * Sections are a registry (registerBoardSection), so later waves add theirs (Contracts)
 * without touching the screen.
 */

export interface BoardSection {
  id: string;
  /** 'side' is the records column in landscape; 'main' the wider one. Portrait stacks side first. */
  column: 'side' | 'main';
  /** Order within the column (lower first). Built-ins use 10, 20... */
  order: number;
  build(view: SurveyView, host: ScreenHost): HTMLElement | null;
}

const sections = new Map<string, BoardSection>();

/** Add (or replace) a section of the Survey board. */
export function registerBoardSection(s: BoardSection): void {
  sections.set(s.id, s);
}

export function boardSections(): BoardSection[] {
  return [...sections.values()].sort((a, b) => (a.column === b.column ? a.order - b.order : a.column === 'side' ? -1 : 1));
}

/** The standard frame of a board section. */
export function boardSection(id: string, title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: `dd-board-sec sec-${id}`, 'data-section': id }, h('h3', { class: 'dd-section-title', text: title }), ...children);
}

registerBoardSection({
  id: 'records',
  column: 'side',
  order: 10,
  build: (v) => {
    const r = v.records;
    return boardSection(
      'records',
      t('ui.board.records'),
      ledger(
        [
          { label: t('ui.board.deepest'), value: depthText(r.deepest), tone: 'record' },
          { label: t('ui.board.biggestHaul'), value: t('ui.board.items', { count: r.biggestHaul }) },
          { label: t('ui.board.expeditions'), value: String(r.expeditions) },
          { label: t('ui.board.blackouts'), value: String(r.blackouts) },
          { label: t('ui.board.bestStreak'), value: String(r.bestStreak) },
        ],
        'dd-board-ledger',
      ),
      h('p', { class: 'dd-muted dd-board-day', text: t('ui.board.day', { day: v.day }) }),
    );
  },
});

registerBoardSection({
  id: 'rumours',
  column: 'main',
  order: 10,
  build: (v, host) => {
    const list = v.rumours;
    const home = v.target === null;
    return boardSection(
      'rumours',
      t('ui.board.rumours'),
      list.length
        ? h('ul', { class: 'dd-rumours' }, ...list.map((r) => rumourRow(r, host)))
        : h('p', { class: 'dd-muted dd-board-empty', text: t('ui.board.noRumours') }),
      h(
        'button',
        {
          class: `dd-rumour dd-rumour-home${home ? ' target' : ''}`,
          type: 'button',
          'aria-pressed': String(home),
          'data-key': 'rumour:home',
          onclick: () => {
            if (home) return;
            host.actions.setCompassTarget(null);
            host.rerender();
          },
        },
        h('span', { class: 'dd-rumour-pin', 'aria-hidden': 'true' }),
        h('span', { class: 'dd-rumour-text', text: t('ui.board.home') }),
        h('span', { class: 'dd-rumour-state', text: home ? t('ui.board.following') : '' }),
      ),
    );
  },
});

function rumourRow(r: Rumour, host: ScreenHost): HTMLElement {
  const dist = r.distance === null ? t('ui.board.noWalk') : t('ui.board.metres', { distance: Math.round(r.distance) });
  return h(
    'li',
    null,
    h(
      'button',
      {
        class: `dd-rumour ${r.kind}${r.target ? ' target' : ''}${r.present ? '' : ' gone'}`,
        type: 'button',
        'aria-pressed': String(r.target),
        'data-key': `rumour:${r.id}`,
        disabled: !r.present || r.distance === null,
        onclick: () => {
          // The game says where the compass now points (a toast); the board shows it on the row.
          host.actions.setCompassTarget(r.target ? null : r.id);
          host.rerender();
        },
      },
      h('span', { class: 'dd-rumour-pin', 'aria-hidden': 'true' }),
      h(
        'span',
        { class: 'dd-rumour-main' },
        h('span', { class: 'dd-rumour-text', text: r.text }),
        r.ore.length
          ? h('span', { class: 'dd-rumour-ore' }, ...r.ore.map((o) => h('span', { class: 'dd-rumour-ore-chip' }, icon(itemIconDataUrl(o.item, iconPx(18)), 18), t(ITEMS[o.item].name))))
          : null,
      ),
      h('span', { class: 'dd-rumour-dist', text: r.present ? dist : t('ui.board.mined') }),
      h('span', { class: 'dd-rumour-state', text: r.target ? t('ui.board.following') : '' }),
    ),
  );
}

export function buildBoard(host: ScreenHost): HTMLElement {
  const v = host.actions.getSurvey();
  const side: HTMLElement[] = [];
  const main: HTMLElement[] = [];
  for (const s of boardSections()) {
    const el = s.build(v, host);
    if (el) (s.column === 'side' ? side : main).push(el);
  }
  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-board', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.board.title') },
      h('header', { class: 'dd-panel-head' }, h('h2', { class: 'dd-panel-title', text: t('ui.board.title') }), h('div', { class: 'dd-panel-actions' }, closeBtn(t('ui.board.close'), () => host.actions.closeScreen()))),
      h('div', { class: 'dd-scroll dd-board-body' }, h('div', { class: 'dd-board-col side' }, ...side), h('div', { class: 'dd-board-col main' }, ...main)),
    ),
  );
}
