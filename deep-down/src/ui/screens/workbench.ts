import './workbench.css';
import { ITEMS } from '../../config/items';
import { t, type TextKey } from '../../i18n';
import { h, icon } from '../dom';
import { iconPx, itemIconDataUrl } from '../icons';
import type { CraftTreeNode, CraftTreeView, NodeStat, TreeLine } from '../types';
import type { ScreenHost, TreeTab } from './host';
import { nodeIconDataUrl } from './nodeIcons';
import { costFraction, nodeLook, pickNode, rowSpan, tabOf, TREE_LINES, type NodeLook } from './progress';
import { btn, closeBtn, ledger } from './widgets';

/**
 * The upgrade tree. Three tabs (the Workbench, the Forge, Camp & Field) over one tree: five
 * columns, one per line (Pickaxe, Lantern, Pack, Gear, Camp), with the tiers descending along a
 * carved groove. The open tab's nodes stand out; the others stay visible, dimmed, so the whole
 * descent can be read from any station. Tapping a node fills the detail pane (right 40 % in
 * landscape, a bottom sheet in portrait): the behaviour sentence, before -> after bars, the
 * cost ledger and the Craft button (data-key craft:{id}). A craft lights the node for 220 ms
 * and runs a spark down its groove for 400 ms.
 */

const TABS: Array<{ id: TreeTab; label: TextKey }> = [
  { id: 'workbench', label: 'ui.tree.tab.workbench' },
  { id: 'forge', label: 'ui.tree.tab.forge' },
  { id: 'camp', label: 'ui.tree.tab.camp' },
];

const LINE_LABEL: Record<TreeLine, TextKey> = {
  pickaxe: 'ui.tree.line.pickaxe',
  lantern: 'ui.tree.line.lantern',
  pack: 'ui.tree.line.pack',
  gear: 'ui.tree.line.gear',
  stations: 'ui.tree.line.stations',
};

const LOOK_TEXT: Record<NodeLook, TextKey> = {
  owned: 'ui.tree.state.owned',
  craftable: 'ui.tree.state.ready',
  partial: 'ui.tree.state.partial',
  short: 'ui.tree.state.short',
  locked: 'ui.tree.state.locked',
  carry: 'ui.tree.state.carry',
  away: 'ui.tree.state.away',
};

/** Node size (px) for the materials ring's geometry; CSS sets the plate (--node) and the pitch. */
const TREE_NODE = 56;
/** How long the groove sparks play (ms; the node's light is 220 ms of it, in CSS). */
const SPARK_MS = 400;

export function buildTree(host: ScreenHost): HTMLElement {
  const view = host.actions.getCraftTree();
  const st = host.state;
  if (host.opening) {
    st.treeTab = tabOf(view.focus);
    st.treeSel = pickNode(view.nodes, st.treeTab, view.select, view.next)?.id ?? null;
    st.treeCrafted = null;
  }
  const tab = st.treeTab;
  const sel = view.nodes.find((n) => n.id === st.treeSel) ?? pickNode(view.nodes, tab, null, view.next);
  if (sel) st.treeSel = sel.id;
  const crafted = st.treeCrafted && performance.now() - st.treeCrafted.at < SPARK_MS + 200 ? st.treeCrafted.id : null;

  const tabs = h('div', { class: 'dd-tree-tabs', role: 'tablist', 'aria-label': t('ui.tree.title') });
  for (const def of TABS) {
    const place = view.places.find((p) => p.id === def.id);
    const selected = def.id === tab;
    tabs.appendChild(
      h(
        'button',
        {
          class: `dd-tab dd-tree-tab${place && !place.open ? ' closed' : ''}`,
          type: 'button',
          role: 'tab',
          id: `dd-ttab-${def.id}`,
          'aria-selected': String(selected),
          'aria-controls': 'dd-tree-panel',
          'data-key': `tab:${def.id}`,
          'data-autofocus': selected,
          onclick: () => {
            if (st.treeTab === def.id) return;
            st.treeTab = def.id;
            st.treeSel = pickNode(view.nodes, def.id, null, view.next)?.id ?? null;
            host.rerender();
          },
        },
        h('span', { text: t(def.label) }),
        place && !place.open ? h('span', { class: 'dd-tree-tab-lock', 'aria-hidden': 'true' }) : null,
      ),
    );
  }

  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-tree', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.tree.title') },
      h(
        'header',
        { class: 'dd-panel-head dd-tree-head' },
        h('h2', { class: 'dd-panel-title dd-tree-title', text: t('ui.tree.title') }),
        tabs,
        h('div', { class: 'dd-panel-actions' }, closeBtn(t('craft.close'), () => host.actions.closeScreen())),
      ),
      h(
        'div',
        { class: 'dd-tree-body', id: 'dd-tree-panel', role: 'tabpanel', 'aria-labelledby': `dd-ttab-${tab}` },
        board(host, view, tab, sel?.id ?? null, crafted),
        sel ? detail(host, view, sel, tab) : h('aside', { class: 'dd-tree-detail' }),
      ),
    ),
  );
}

function board(host: ScreenHost, view: CraftTreeView, tab: TreeTab, sel: string | null, crafted: string | null): HTMLElement {
  const span = rowSpan(view.nodes);
  const grid = h('div', { class: 'dd-tree-grid', style: `--rows: ${span.count}` });
  for (const line of TREE_LINES) {
    const nodes = view.nodes.filter((n) => n.line === line).sort((a, b) => a.row - b.row);
    const track = h('div', { class: 'dd-tree-track' });
    // Positions are in rows; CSS turns them into pixels (--pitch, --node shrink on short screens).
    if (nodes.length > 1) {
      const first = nodes[0].row - span.first;
      const rows = nodes[nodes.length - 1].row - nodes[0].row;
      track.appendChild(h('span', { class: 'dd-tree-groove', 'aria-hidden': 'true', style: `top: calc(${first} * var(--pitch) + var(--node) / 2); height: calc(${rows} * var(--pitch))` }));
    }
    nodes.forEach((n, i) => {
      track.appendChild(nodeButton(host, n, tab, n.id === sel, n.id === view.next, n.id === crafted, n.row - span.first));
      // A craft runs a spark down the groove to the next tier below.
      if (n.id === crafted && n.state === 'owned') {
        const below = nodes[i + 1];
        const steps = below ? below.row - n.row : 0.5;
        track.appendChild(h('span', { class: 'dd-tree-spark', 'aria-hidden': 'true', style: `top: calc(${n.row - span.first} * var(--pitch) + var(--node) / 2); --d: calc(${steps} * var(--pitch))` }));
      }
    });
    grid.appendChild(h('div', { class: `dd-tree-col line-${line}` }, h('span', { class: 'dd-tree-col-label', text: t(LINE_LABEL[line]) }), track));
  }
  return h('div', { class: 'dd-tree-board dd-scroll' }, grid);
}

function nodeButton(host: ScreenHost, n: CraftTreeNode, tab: TreeTab, selected: boolean, next: boolean, crafted: boolean, row: number): HTMLElement {
  const look = nodeLook(n);
  const here = tabOf(n.place) === tab;
  const lit = crafted && n.state === 'owned';
  const classes = ['dd-node', look, here ? 'here' : 'elsewhere'];
  if (selected) classes.push('selected');
  if (lit) classes.push('lit');
  if (host.opening && look === 'craftable' && here) classes.push('pulse');
  const frac = look === 'partial' ? costFraction(n.cost) : 0;
  const label = `${n.name}: ${n.reason && look !== 'craftable' && look !== 'owned' ? n.reason : t(LOOK_TEXT[look])}`;
  return h(
    'button',
    {
      class: classes.join(' '),
      type: 'button',
      style: `top: calc(${row} * var(--pitch))`,
      'aria-pressed': String(selected),
      'aria-label': next ? `${label}. ${t('ui.tree.nextMark')}` : label,
      'data-key': `node:${n.id}`,
      onclick: () => {
        host.state.treeSel = n.id;
        host.rerender();
      },
    },
    icon(nodeIconDataUrl(n.result, iconPx(36)), 36, 'dd-icon dd-node-icon'),
    look === 'partial' ? partialRing(frac) : null,
    look === 'locked' ? h('span', { class: 'dd-node-q', 'aria-hidden': 'true', text: '?' }) : null,
    look === 'owned' ? h('span', { class: 'dd-node-check', 'aria-hidden': 'true' }) : null,
    look === 'carry' ? h('span', { class: 'dd-node-carry', 'aria-hidden': 'true' }) : null,
    next && look !== 'owned' ? h('span', { class: 'dd-node-next', 'aria-hidden': 'true' }) : null,
    lit ? h('span', { class: 'dd-node-flash', 'aria-hidden': 'true' }) : null,
  );
}

/** The materials ring: an octagon traced inside the plate as far as the cost is on hand. */
function partialRing(frac: number): Element {
  const c = 9;
  const s = TREE_NODE - 6;
  const pts = [
    [c, 0], [s - c, 0], [s, c], [s, s - c], [s - c, s], [c, s], [0, s - c], [0, c],
  ].map(([x, y]) => `${x + 3},${y + 3}`);
  const tpl = document.createElement('template');
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  tpl.innerHTML = `<svg class="dd-node-ring" viewBox="0 0 ${TREE_NODE} ${TREE_NODE}" width="${TREE_NODE}" height="${TREE_NODE}" aria-hidden="true"><polygon points="${pts.join(' ')}" pathLength="100" stroke-dasharray="${pct} 100"/></svg>`;
  return tpl.content.firstElementChild!;
}

function detail(host: ScreenHost, view: CraftTreeView, n: CraftTreeNode, tab: TreeTab): HTMLElement {
  const look = nodeLook(n);
  const place = view.places.find((p) => p.id === n.place);
  const station = n.result.kind === 'station';
  const eyebrow = [place?.name ?? '', t(LOOK_TEXT[look])].filter(Boolean).join(' · ');
  const why = look === 'owned' || look === 'craftable' ? null : n.reason;
  const prereqs = look === 'locked' && n.prereqs.length
    ? h(
        'ul',
        { class: 'dd-tree-prereqs', 'aria-label': t('ui.tree.needs') },
        ...n.prereqs.map((p) => h('li', { class: `dd-tree-prereq${p.met ? ' met' : ''}` }, h('span', { class: 'dd-tree-prereq-mark', 'aria-hidden': 'true' }), p.name)),
      )
    : null;
  const cost = n.cost.length
    ? ledger(
        n.cost.map((c) => ({
          icon: itemIconDataUrl(c.item, iconPx(24)),
          label: t(ITEMS[c.item].name),
          value: t('craft.from', { have: Math.min(c.have, 9999), need: c.need }),
          tone: look === 'owned' ? 'paid' : c.have >= c.need ? 'ok' : 'short',
        })),
        'dd-tree-cost',
      )
    : h('p', { class: 'dd-muted dd-tree-free', text: t('ui.tree.free') });
  let action: HTMLElement;
  if (look === 'craftable' && !n.auto) {
    action = btn(
      t(station ? 'ui.tree.build' : 'craft.craft'),
      () => {
        host.state.treeCrafted = { id: n.id, at: performance.now() };
        host.actions.craft(n.id);
        host.rerender();
      },
      { variant: 'primary', key: `craft:${n.id}`, className: 'dd-craft-btn', autofocus: tabOf(n.place) === tab },
    );
  } else {
    const text = look === 'owned' ? t(station ? 'ui.tree.built' : 'craft.owned') : n.reason ?? t(LOOK_TEXT[look]);
    action = btn(text, () => undefined, { disabled: true, key: `craft:${n.id}`, className: `dd-craft-btn ${look}` });
  }
  return h(
    'aside',
    { class: `dd-tree-detail ${look}`, 'aria-label': n.name },
    h(
      'div',
      { class: 'dd-tree-detail-body dd-scroll' },
      h(
        'div',
        { class: 'dd-tree-id' },
        icon(nodeIconDataUrl(n.result, iconPx(44)), 44, 'dd-icon dd-tree-id-icon'),
        h('div', { class: 'dd-tree-id-text' }, h('span', { class: 'dd-eyebrow', text: eyebrow }), h('h3', { class: 'dd-tree-name', text: n.name })),
      ),
      h('p', { class: 'dd-tree-does', text: n.does }),
      why ? h('p', { class: `dd-tree-why ${look}`, text: why }) : null,
      prereqs,
      n.stats.length ? h('div', { class: 'dd-tree-stats' }, ...n.stats.map(statBar)) : null,
      h('h4', { class: 'dd-section-title dd-tree-cost-title', text: t('craft.requires') }),
      cost,
    ),
    h('div', { class: 'dd-tree-action' }, action),
  );
}

/** Before -> after: the old value in brass, the gain in amber, on one bar. */
function statBar(s: NodeStat): HTMLElement {
  const max = s.max > 0 ? s.max : Math.max(s.before, s.after, 1);
  const b = Math.max(0, Math.min(1, s.before / max));
  const a = Math.max(0, Math.min(1, s.after / max));
  return h(
    'div',
    { class: 'dd-stat', role: 'img', 'aria-label': t('ui.tree.statAria', { label: s.label, before: s.beforeText, after: s.afterText }) },
    h('span', { class: 'dd-stat-label', text: s.label }),
    h('span', { class: 'dd-stat-values' }, h('span', { class: 'dd-stat-before', text: s.beforeText }), h('span', { class: 'dd-stat-arrow', 'aria-hidden': 'true', text: '→' }), h('b', { class: 'dd-stat-after', text: s.afterText })),
    h(
      'span',
      { class: 'dd-stat-bar', 'aria-hidden': 'true' },
      h('span', { class: 'dd-stat-gain', style: `transform: scaleX(${a})` }),
      h('span', { class: 'dd-stat-was', style: `transform: scaleX(${b})` }),
    ),
  );
}
