import './summary.css';
import { ITEMS, type ItemId } from '../../config/items';
import { hasText, t, type TextKey } from '../../i18n';
import { h, icon, type Child } from '../dom';
import { depthText } from '../format';
import { iconPx, itemIconDataUrl } from '../icons';
import type { ExpeditionReport } from '../types';
import type { ScreenHost } from './host';
import { clock, countUp } from './progress';
import { btn, closeBtn, ledger, type LedgerRow } from './widgets';

/**
 * The Expedition Report, after every trip worth one (ExpeditionReport.show). Three columns in
 * landscape, one in portrait:
 * - the record: the ledger (Deepest with the NEW BEST stamp, time out, blocks mined, lantern left);
 * - the haul: banked items counting up over 600 ms, what was found (discoveries and runes), or the
 *   black-out variant (what waits in the pack, what was lost);
 * - what lies ahead: Overnight (what the deep did) and the Next card with its missing chips.
 * The call to action is Open Workbench when something can be made, otherwise Head Out Again.
 *
 * Sections are a registry (registerReportSection), so later waves add theirs (a contract result,
 * firsts, strike stats) without touching the screen.
 */

export type ReportColumn = 'record' | 'haul' | 'ahead';

export interface ReportSection {
  /** Unique id (a later registration with the same id replaces the earlier one). */
  id: string;
  /** The landscape column it sits in; portrait stacks the columns in this order. */
  column: ReportColumn;
  /** Order within the column (lower first). Built-ins use 10, 20, 30... */
  order: number;
  /** The section's element (reportSection() gives the standard frame), or null to leave it out. */
  build(report: ExpeditionReport, ctx: ReportContext): HTMLElement | null;
}

export interface ReportContext {
  readonly host: ScreenHost;
  /** When the report was opened (performance.now()), for count-ups. */
  readonly openedAt: number;
}

const COLUMNS: readonly ReportColumn[] = ['record', 'haul', 'ahead'];
const sections = new Map<string, ReportSection>();

/** Add (or replace) a section of the Expedition Report. */
export function registerReportSection(s: ReportSection): void {
  sections.set(s.id, s);
}

/** The registered sections, in column then order. */
export function reportSections(): ReportSection[] {
  return [...sections.values()].sort((a, b) => COLUMNS.indexOf(a.column) - COLUMNS.indexOf(b.column) || a.order - b.order);
}

/** The standard frame of a report section: an eyebrow title over its content. */
export function reportSection(id: string, title: string, ...children: Child[]): HTMLElement {
  return h('section', { class: `dd-report-sec sec-${id}`, 'data-section': id }, h('h3', { class: 'dd-section-title dd-report-sec-title', text: title }), ...children);
}

/** How long banked items count up (ms). */
export const COUNT_UP_MS = 600;

const OUTCOME: Record<ExpeditionReport['outcome'], TextKey> = {
  returned: 'ui.report.outcome.returned',
  blackout: 'ui.report.outcome.blackout',
  abandoned: 'ui.report.outcome.abandoned',
};

const RECORD_TEXT: Record<string, TextKey> = {
  deepest: 'ui.report.recordDeepest',
  biggestHaul: 'ui.report.recordHaul',
  bestStreak: 'ui.report.recordStreak',
};

const items = (c: Partial<Record<ItemId, number>> | null | undefined): Array<[ItemId, number]> =>
  Object.entries(c ?? {}).filter(([id, n]) => (n ?? 0) > 0 && Object.prototype.hasOwnProperty.call(ITEMS, id)) as Array<[ItemId, number]>;

// ---------------------------------------------------------------------------------------
// The built-in sections

registerReportSection({
  id: 'ledger',
  column: 'record',
  order: 10,
  build: (r) => {
    const rows: LedgerRow[] = [
      { label: t('ui.report.deepest'), value: depthText(r.deepest), tone: r.newBest ? 'best' : undefined },
      { label: t('ui.report.timeOut'), value: clock(r.duration) },
      { label: t('ui.report.mined'), value: String(r.mined) },
      { label: t('ui.report.lanternLeft'), value: clock(r.fuelLeft) },
    ];
    const broke = r.records.filter((k) => RECORD_TEXT[k] && k !== 'deepest');
    const sec = reportSection(
      'ledger',
      t('ui.report.ledger'),
      ledger(rows, 'dd-report-ledger'),
      broke.length ? h('ul', { class: 'dd-report-records' }, ...broke.map((k) => h('li', { text: t(RECORD_TEXT[k]) }))) : null,
    );
    // NEW BEST: a stamp pressed into the ledger, on the title line.
    if (r.newBest) sec.firstElementChild!.appendChild(h('span', { class: 'dd-report-stamp', role: 'status' }, h('span', { class: 'dd-report-star', 'aria-hidden': 'true', text: '★' }), t('ui.report.newBest')));
    return sec;
  },
});

registerReportSection({
  id: 'banked',
  column: 'haul',
  order: 10,
  build: (r, ctx) => {
    if (r.outcome !== 'returned') return null;
    const list = items(r.banked);
    if (!list.length) return reportSection('banked', t('ui.report.banked'), h('p', { class: 'dd-muted', text: t('ui.report.bankedNone') }));
    const counts: Array<[HTMLElement, number]> = [];
    const chips = list.map(([id, n]) => {
      const num = h('b', { class: 'dd-report-chip-n', text: t('inventory.count', { count: countUp(n, performance.now() - ctx.openedAt, COUNT_UP_MS) }) });
      counts.push([num, n]);
      return h('li', { class: `dd-report-chip ${ITEMS[id].rarity}`, 'aria-label': `${t(ITEMS[id].name)} ${t('inventory.count', { count: n })}` }, icon(itemIconDataUrl(id, iconPx(32)), 32), num);
    });
    const total = h('b', { class: 'dd-report-total', text: String(countUp(r.bankedTotal, performance.now() - ctx.openedAt, COUNT_UP_MS)) });
    counts.push([total, r.bankedTotal]);
    runCountUp(counts, ctx.openedAt, (el, v) => (el === total ? String(v) : t('inventory.count', { count: v })));
    return reportSection(
      'banked',
      t('ui.report.banked'),
      h('ul', { class: 'dd-report-chips' }, ...chips),
      h('p', { class: 'dd-report-sum' }, h('span', { text: t('ui.report.bankedTotal') }), total),
    );
  },
});

registerReportSection({
  id: 'cached',
  column: 'haul',
  order: 10,
  build: (r) => {
    if (r.outcome === 'returned') return null;
    const list = items(r.cached);
    const count = list.reduce((a, [, n]) => a + n, 0);
    return reportSection(
      'cached',
      t(r.outcome === 'blackout' ? 'ui.report.cachedBlackout' : 'ui.report.cachedAbandon'),
      list.length
        ? ledger(list.map(([id, n]) => ({ icon: itemIconDataUrl(id, iconPx(24)), label: t(ITEMS[id].name), value: t('inventory.count', { count: n }), tone: ITEMS[id].rarity })))
        : h('p', { class: 'dd-muted', text: t('ui.report.cachedNone') }),
      list.length && r.cacheDepth !== null ? h('p', { class: 'dd-report-cache-at', text: t('death.cacheAt', { depth: r.cacheDepth, count }) }) : null,
      r.lostCount > 0 ? h('p', { class: 'dd-report-lost', text: t('ui.report.lost', { count: r.lostCount }) }) : null,
    );
  },
});

registerReportSection({
  id: 'found',
  column: 'haul',
  order: 20,
  build: (r) => {
    const discoveries = r.discoveries.filter((id) => hasText(`discovery.${id}.title`));
    const runes = r.runes.filter((id) => Object.prototype.hasOwnProperty.call(ITEMS, id)) as ItemId[];
    if (!discoveries.length && !runes.length) return null;
    return reportSection(
      'found',
      t('ui.report.found'),
      h(
        'ul',
        { class: 'dd-report-found' },
        ...runes.map((id) => h('li', { class: 'dd-report-find rune' }, icon(itemIconDataUrl(id, iconPx(28)), 28), h('span', { text: t(ITEMS[id].name) }))),
        ...discoveries.map((id) =>
          h('li', { class: 'dd-report-find' }, h('span', { class: 'dd-report-mark', 'aria-hidden': 'true' }), h('span', { text: t(`discovery.${id}.title` as TextKey) })),
        ),
      ),
    );
  },
});

registerReportSection({
  id: 'finds',
  column: 'haul',
  order: 30,
  build: (r) => {
    // One calm line: the feats this trip earned, the caches opened and the secrets found.
    const feats = (r.feats ?? []).filter((n) => typeof n === 'string' && n.length > 0);
    const caches = Math.max(0, Math.floor(r.caches ?? 0));
    const secrets = Math.max(0, Math.floor(r.secrets ?? 0));
    const parts: HTMLElement[] = [];
    if (feats.length) parts.push(h('span', { class: 'dd-report-finds-part feats' }, h('span', { class: 'dd-report-finds-k', text: t('journal.feats') }), ' ', h('b', { text: feats.join(', ') })));
    if (caches > 0) parts.push(h('span', { class: 'dd-report-finds-part' }, h('span', { class: 'dd-report-finds-k', text: t('stat.caches') }), ' ', h('b', { text: String(caches) })));
    if (secrets > 0) parts.push(h('span', { class: 'dd-report-finds-part' }, h('span', { class: 'dd-report-finds-k', text: t('stat.secrets') }), ' ', h('b', { text: String(secrets) })));
    if (!parts.length) return null;
    const line = h('p', { class: 'dd-report-finds', 'data-section': 'finds' });
    parts.forEach((el, i) => {
      if (i) line.appendChild(h('span', { class: 'dd-report-finds-sep', 'aria-hidden': 'true', text: '·' }));
      line.appendChild(el);
    });
    return line;
  },
});

registerReportSection({
  id: 'overnight',
  column: 'ahead',
  order: 10,
  build: (r) => {
    const o = r.overnight;
    if (!o) return null;
    return reportSection(
      'overnight',
      t('ui.report.overnight'),
      h('p', { class: 'dd-report-night', text: o.regrown > 0 ? t('ui.report.regrown', { count: o.regrown }) : t('ui.report.breathed') }),
      o.rumours.length ? h('ul', { class: 'dd-report-rumours' }, ...o.rumours.slice(0, 3).map((x) => h('li', { class: `dd-report-rumour ${x.kind}`, text: x.text }))) : null,
    );
  },
});

registerReportSection({
  id: 'next',
  column: 'ahead',
  order: 20,
  build: (r) => {
    const n = r.next;
    if (!n) return null;
    return reportSection(
      'next',
      t(n.ready ? 'ui.report.nextReady' : 'ui.report.next'),
      h(
        'div',
        { class: `dd-report-next${n.ready ? ' ready' : ''}` },
        h('span', { class: 'dd-report-next-name', text: n.name }),
        h(
          'ul',
          { class: 'dd-report-next-chips', 'aria-label': t('craft.requires') },
          ...n.cost.map((c) =>
            h(
              'li',
              { class: `dd-req ${c.have >= c.need ? 'ok' : 'short'}` },
              icon(itemIconDataUrl(c.item, iconPx(22)), 22),
              h('span', { class: 'dd-req-name', text: t(ITEMS[c.item].name) }),
              h('b', { text: t('craft.from', { have: Math.min(c.have, c.need), need: c.need }) }),
            ),
          ),
        ),
      ),
    );
  },
});

/** Count the banked numbers up from 0 until COUNT_UP_MS after opening (stops once detached). */
function runCountUp(els: Array<[HTMLElement, number]>, openedAt: number, text: (el: HTMLElement, v: number) => string): void {
  if (performance.now() - openedAt >= COUNT_UP_MS) return;
  let started = false;
  const tick = () => {
    const el0 = els[0]?.[0];
    if (!el0 || (started && !el0.isConnected)) return;
    started = true;
    const dt = performance.now() - openedAt;
    for (const [el, total] of els) {
      const v = text(el, countUp(total, dt, COUNT_UP_MS));
      if (el.textContent !== v) el.textContent = v;
    }
    if (dt < COUNT_UP_MS) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------------------
// The screen

export function buildSummary(host: ScreenHost): HTMLElement {
  const r = host.actions.getReport();
  const close = () => host.closeReport();
  if (!r) return h('section', { class: 'dd-screen dd-overlay dd-report-screen' });
  const ctx: ReportContext = { host, openedAt: host.state.reportAt };
  const cols = new Map<ReportColumn, HTMLElement[]>(COLUMNS.map((c) => [c, []]));
  for (const s of reportSections()) {
    const el = s.build(r, ctx);
    if (el) cols.get(s.column)!.push(el);
  }
  const craftable = r.craftableNow === true;
  const cta = craftable
    ? btn(t('ui.report.openWorkbench'), () => host.openFromReport(), { variant: 'primary', key: 'summary-workbench', autofocus: true })
    : btn(t('ui.report.headOut'), close, { variant: 'primary', key: 'summary-go', autofocus: true });
  const screen = h(
    'section',
    { class: `dd-screen dd-overlay dd-report-screen ${r.outcome}` },
    h(
      'div',
      { class: `dd-panel dd-report ${r.outcome}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.report.title', { n: r.n }) },
      h(
        'header',
        { class: 'dd-panel-head dd-report-head' },
        h(
          'div',
          { class: 'dd-report-heading' },
          h('span', { class: 'dd-eyebrow dd-report-outcome', text: t(OUTCOME[r.outcome]) }),
          h('h2', { class: 'dd-panel-title dd-report-title', text: t('ui.report.heading', { n: r.n, time: clock(r.duration) }) }),
        ),
        h('div', { class: 'dd-panel-actions' }, closeSummaryBtn(close)),
      ),
      h('div', { class: 'dd-scroll dd-report-body' }, ...COLUMNS.map((c) => h('div', { class: `dd-report-col col-${c}` }, ...cols.get(c)!))),
      h('footer', { class: 'dd-report-foot' }, cta),
    ),
  );
  // A tap outside the plate skips the report.
  screen.addEventListener('click', (e) => {
    if (e.target === screen) close();
  });
  return screen;
}

/** The close control: data-key summary-close (e2e and the tour close the report through it). */
function closeSummaryBtn(onClick: () => void): HTMLButtonElement {
  const b = closeBtn(t('ui.report.close'), onClick);
  b.setAttribute('data-key', 'summary-close');
  return b;
}
