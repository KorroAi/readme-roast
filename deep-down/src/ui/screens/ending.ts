import './ending.css';
import { t } from '../../i18n';
import { emblemSvg } from '../brand/emblem.mjs';
import { h } from '../dom';
import { depthText } from '../format';
import type { ScreenHost } from './host';
import { hoursMinutes } from './progress';
import { btn, ledger } from './widgets';

/**
 * The end card, once the black stone has answered ('finale:reached'):
 * THE LANTERN HOLLOW — COMPLETE · Expeditions · Deepest · time · The Hollow keeps growing.
 * [Continue] plays on (the Bloom and the records carry the game after the end). No promise of
 * anything more.
 */
export function buildEnding(host: ScreenHost): HTMLElement {
  // Round 3: the strata's end card (the Heart relit: LOOP's endingView), after the world's relighting.
  const r3 = host.state.ending;
  if (r3) {
    const mark3 = h('span', { class: 'dd-ending-mark', 'aria-hidden': 'true' });
    mark3.innerHTML = emblemSvg({ size: 72, idPrefix: 'ddend3' });
    return h(
      'section',
      { class: 'dd-screen dd-ending dd-ending3' },
      h(
        'div',
        { class: 'dd-panel dd-ending-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dd-ending-title' },
        h(
          'div',
          { class: 'dd-scroll dd-ending-body' },
          h('div', { class: 'dd-ending-head' }, mark3, h('h2', { class: 'dd-ending-title dd-lintel', id: 'dd-ending-title' }, h('span', { class: 'dd-ending-complete', text: r3.title })), h('p', { class: 'dd-ending-answer', text: r3.body })),
          h('div', { class: 'dd-ending-numbers' }, ledger(r3.lines.map((l) => ({ label: l.label, value: l.value })), 'dd-ending-ledger'), h('p', { class: 'dd-ending-coda', text: r3.free })),
        ),
        btn(t('ui.ending.continue'), () => host.actions.continueAfterEnding(), { variant: 'primary', key: 'ending-continue', autofocus: true }),
      ),
    );
  }
  const e = host.actions.getJournal().ending;
  // The brand's emblem: the lantern rune hanging from its lintel (trusted markup, built from geometry).
  const mark = h('span', { class: 'dd-ending-mark', 'aria-hidden': 'true' });
  mark.innerHTML = emblemSvg({ size: 72, idPrefix: 'ddend' });
  return h(
    'section',
    { class: 'dd-screen dd-ending' },
    h(
      'div',
      { class: 'dd-panel dd-ending-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dd-ending-title' },
      h(
        'div',
        { class: 'dd-scroll dd-ending-body' },
        h(
          'div',
          { class: 'dd-ending-head' },
          mark,
          h(
            'h2',
            { class: 'dd-ending-title dd-lintel', id: 'dd-ending-title' },
            h('span', { class: 'dd-ending-place', text: t('ui.ending.place') }),
            h('span', { class: 'dd-ending-complete', text: t('ui.ending.complete') }),
          ),
          e.answer ? h('p', { class: 'dd-ending-answer', text: e.answer }) : null,
        ),
        h(
          'div',
          { class: 'dd-ending-numbers' },
          ledger(
            [
              { label: t('ui.ending.expeditions'), value: String(e.expeditions) },
              { label: t('ui.ending.deepest'), value: depthText(e.deepest) },
              { label: t('ui.ending.time'), value: hoursMinutes(e.playTime) },
            ],
            'dd-ending-ledger',
          ),
          h('p', { class: 'dd-ending-coda', text: t('ui.ending.coda') }),
        ),
      ),
      btn(t('ui.ending.continue'), () => host.actions.continueAfterEnding(), { variant: 'primary', key: 'ending-continue', autofocus: true }),
    ),
  );
}
