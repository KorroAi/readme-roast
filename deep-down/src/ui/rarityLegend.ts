import { RARITY_COLOR, RARITY_LEGEND } from '../config/rarity';
import { t } from '../i18n';
import { h } from './dom';

/**
 * The rarity legend (ROUND2 §0.3): what glows can be taken, and each colour's tier with examples.
 * Shown once in a first-time card (the discovery banner) and at the head of the journal.
 */
export function rarityLegend(compact = false): HTMLElement {
  return h(
    'ul',
    { class: `dd-rarity-legend${compact ? ' compact' : ''}`, 'aria-label': t('rarity.legend.title') },
    ...RARITY_LEGEND.map((r) =>
      h(
        'li',
        { class: `dd-rarity r-${r.rarity}` },
        h('span', { class: 'dd-rarity-dot', 'aria-hidden': 'true', style: `--rc:${RARITY_COLOR[r.rarity]}` }),
        h('b', { class: 'dd-rarity-name', text: t(r.name), style: `color:${RARITY_COLOR[r.rarity]}` }),
        h('span', { class: 'dd-rarity-what', text: t(r.what) }),
      ),
    ),
  );
}
