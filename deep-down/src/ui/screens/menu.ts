import { t } from '../../i18n';
import { VERSION } from '../../version';
import { logo } from '../brand/logo';
import { h } from '../dom';
import { formatRelativeTime } from '../format';
import type { ScreenHost } from './host';
import { btn } from './widgets';

/**
 * The menu at the surface (from the second launch; a first launch goes straight into the shaft, SPEC §8.1):
 * the carved wordmark over the dusk camp, Continue, Settings and About. The world stays live behind it.
 */
export function buildMenu(host: ScreenHost): HTMLElement {
  const a = host.actions;
  const savedAt = a.hasSave() ? a.saveTimestamp() : null;
  const summary = a.saveSummary();
  const sub = [summary, savedAt !== null ? formatRelativeTime(savedAt, Date.now()) : ''].filter(Boolean).join(' · ');
  return h(
    'section',
    { class: 'dd-screen dd-menu dd-idle-menu' },
    h(
      'div',
      { class: 'dd-menu-col' },
      logo('menu'),
      h('p', { class: 'dd-tagline', text: t('game.tagline') }),
      h(
        'div',
        { class: 'dd-menu-buttons' },
        btn(t('ui.menu.continue'), () => a.play(), { variant: 'primary', sub: sub || undefined, key: 'continue', autofocus: true }),
        h(
          'div',
          { class: 'dd-menu-row' },
          btn(t('menu.settings'), () => host.show('settings'), { key: 'settings' }),
          btn(t('ui.menu.about'), () => host.show('about'), { key: 'about' }),
        ),
      ),
    ),
    h('p', { class: 'dd-version', text: t('menu.version', { version: VERSION }) }),
  );
}
