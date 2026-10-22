import './menus.css';
import { hasText, t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import type { ScreenHost } from '../host';
import { btn, ledger } from '../widgets';
import { glyphEl } from './shell';

/**
 * The trip card (round 3, LOOP's trip summary; BRIEF §6 "a trip summary after each return"): one
 * calm card when the explorer is back at camp (or wakes there after a black-out). It names the trip
 * and how it ended, lists LOOP's ready-made lines (time out, the deepest point, finds by rarity, the
 * rarest, creatures, crafts, torches, shards, orders, pages, bestiary pages, what was banked), stamps
 * the records it set, and says what comes next. Head Out closes it; Craft opens the Craft menu.
 */
export function buildTrip(host: ScreenHost): HTMLElement {
  const s = host.state.trip;
  const close = () => host.closeReport();
  if (!s) return h('section', { class: 'dd-screen dd-overlay' });
  const records = s.records.filter((r) => hasText(`trip3.rec.${r}`));
  const blackout = s.outcome === 'blackout';
  return h(
    'section',
    { class: 'dd-screen dd-overlay dd-trip3' },
    h(
      'div',
      { class: `dd-panel dd-trip3-card${blackout ? ' blackout' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dd-trip3-title' },
      h(
        'header',
        { class: 'dd-trip3-head' },
        glyphEl(blackout ? 'flame' : 'camp', 'dd-trip3-glyph'),
        h('p', { class: 'dd-trip3-kicker', text: t('trip3c.kicker', { n: s.n }) }),
        h('h2', { class: 'dd-trip3-title', id: 'dd-trip3-title', text: s.title }),
      ),
      h(
        'div',
        { class: 'dd-scroll dd-trip3-body' },
        records.length
          ? h('ul', { class: 'dd-trip3-records', role: 'status' }, ...records.map((r) => h('li', null, h('span', { class: 'dd-trip3-star', 'aria-hidden': 'true', text: '★' }), t('trip3.record', { what: t(`trip3.rec.${r}` as TextKey) }))))
          : null,
        ledger(s.lines.map((l) => ({ label: l.label, value: l.value })), 'dd-trip3-ledger'),
        s.next ? h('p', { class: 'dd-trip3-next' }, h('b', { text: t('trip3.nextLabel') }), document.createTextNode(` ${s.next}`)) : null,
      ),
      h(
        'div',
        { class: 'dd-trip3-actions' },
        btn(t('trip3c.craft'), () => {
          close();
          host.actions.openMenu('crafting');
        }, { key: 'trip:craft' }),
        btn(t('trip3c.go'), close, { variant: 'primary', key: 'trip:close', autofocus: true }),
      ),
    ),
  );
}
