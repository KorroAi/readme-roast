// The wordmark in the DOM. Both lockups are built; CSS shows the line in landscape and the
// stack in portrait, so a rotation never rebuilds the screen. The heading text stays in the
// DOM (screen readers get the SVG's aria-label; tests and find-in-page get the text).
import { t } from '../../i18n';
import { h } from '../dom';
import { wordmarkSvg } from './wordmark';

let serial = 0;

function svgNode(markup: string): Element {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup; // trusted: generated from geometry in wordmark.ts, no user text
  return tpl.content.firstElementChild!;
}

/** The title block: an h1 holding the line and stack lockups. */
export function logo(kind: 'menu' | 'loading', subtitle?: string): HTMLElement {
  const id = `ddwm${++serial}`;
  const label = t('game.title');
  return h(
    'h1',
    { class: `dd-logo dd-logo-${kind}` },
    h('span', { class: 'dd-sr', 'aria-hidden': 'true', text: label }),
    svgNode(wordmarkSvg('line', { id: `${id}l`, label, subtitle, width: 420 })),
    svgNode(wordmarkSvg('stack', { id: `${id}s`, label, subtitle, width: 250 })),
  );
}

