import { version } from '../../../package.json';
import { ITEMS, type ItemId } from '../../config/items';
import { t } from '../../i18n';
import { h, icon } from '../dom';
import { formatRelativeTime } from '../format';
import { iconPx, itemIconDataUrl } from '../icons';
import type { ScreenHost } from './host';
import { btn, header } from './widgets';

/** The Visual Lab button: dev builds, or ?lab=1 for reviewers. */
function showLab(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('lab');
}

/** Main menu over the live cave: pixel-font title, tagline, the expedition buttons. */
export function buildMenu(host: ScreenHost): HTMLElement {
  const a = host.actions;
  const hasSave = a.hasSave();
  const savedAt = hasSave ? a.saveTimestamp() : null;
  const title = h('canvas', { class: 'dd-title', 'aria-hidden': 'true' });
  host.setTitleCanvas(title, 1);

  const startNew = () => {
    if (!a.hasSave()) {
      a.newGame();
      return;
    }
    host.confirm({ text: t('menu.confirmNew'), yes: t('menu.confirmYes'), no: t('menu.confirmNo'), onYes: () => a.newGame(), danger: true });
  };

  return h(
    'section',
    { class: 'dd-screen dd-menu' },
    h(
      'div',
      { class: 'dd-menu-col' },
      h('h1', { class: 'dd-sr', text: t('game.title') }),
      title,
      h('p', { class: 'dd-tagline', text: t('game.tagline') }),
      h(
        'div',
        { class: 'dd-menu-buttons' },
        hasSave
          ? btn(t('menu.continue'), () => a.continueGame(), {
              variant: 'primary',
              sub: savedAt !== null ? t('menu.saveFound', { time: formatRelativeTime(savedAt, Date.now()) }) : undefined,
              key: 'continue',
              autofocus: true,
            })
          : null,
        btn(t('menu.newGame'), startNew, { variant: hasSave ? 'secondary' : 'primary', key: 'new', autofocus: !hasSave }),
        h(
          'div',
          { class: 'dd-menu-row' },
          btn(t('menu.settings'), () => host.show('settings'), { key: 'settings' }),
          // The Visual Lab is a developer tool: not on a player's home screen.
          showLab() ? btn(t('menu.visualLab'), () => a.openVisualLab(), { key: 'lab' }) : null,
        ),
      ),
      h('p', { class: 'dd-rotate-hint', text: t('menu.rotateHint') }),
    ),
    h('p', { class: 'dd-version', text: t('menu.version', { version }) }),
  );
}

export function buildLoading(host: ScreenHost): HTMLElement {
  const title = h('canvas', { class: 'dd-title', 'aria-hidden': 'true' });
  host.setTitleCanvas(title, 0.62);
  const p = Math.round(host.state.loadingProgress * 100);
  return h(
    'section',
    { class: 'dd-screen dd-loading' },
    h('h1', { class: 'dd-sr', text: t('game.title') }),
    title,
    h(
      'div',
      { class: 'dd-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p, 'aria-label': host.state.loadingLabel },
      h('div', { class: 'dd-progress-fill', style: `transform: scaleX(${host.state.loadingProgress})` }),
    ),
    h('p', { class: 'dd-loading-label', 'aria-live': 'polite', text: host.state.loadingLabel }),
  );
}

/** Update an open loading screen in place (no rebuild while the world generates). */
export function updateLoading(el: HTMLElement, progress: number, label: string): void {
  const bar = el.querySelector<HTMLElement>('.dd-progress');
  const fill = el.querySelector<HTMLElement>('.dd-progress-fill');
  const text = el.querySelector<HTMLElement>('.dd-loading-label');
  if (fill) fill.style.transform = `scaleX(${progress})`;
  if (bar) {
    bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    bar.setAttribute('aria-label', label);
  }
  if (text && text.textContent !== label) text.textContent = label;
}

export function buildPause(host: ScreenHost): HTMLElement {
  const a = host.actions;
  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-pause', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('pause.title') },
      header(t('pause.title')),
      h(
        'div',
        { class: 'dd-stack' },
        btn(t('pause.resume'), () => a.resume(), { variant: 'primary', key: 'resume', autofocus: true }),
        btn(t('pause.settings'), () => host.show('settings'), { key: 'settings' }),
        btn(
          t('pause.returnToCamp'),
          () =>
            host.confirm({
              text: t('pause.confirmReturn'),
              yes: t('pause.confirmReturnYes'),
              no: t('pause.confirmReturnNo'),
              onYes: () => a.returnToCamp(),
              danger: true,
            }),
          { sub: t('pause.returnToCampHint'), key: 'camp' },
        ),
        btn(t('pause.quit'), () => a.quitToMenu(), { key: 'quit' }),
      ),
    ),
  );
}

/**
 * The black-out screen. Nothing is lost outright: the pack (minus the Sealed Pouch) waits where
 * the explorer fell, and the screen says where. Only an older pack it replaced is gone.
 */
export function buildDeath(host: ScreenHost): HTMLElement {
  const left = Object.entries(host.state.deathLost).filter(([, n]) => (n ?? 0) > 0) as Array<[ItemId, number]>;
  const report = host.actions.getReport();
  const count = left.reduce((a, [, n]) => a + n, 0);
  // What the Sealed Pouch kept (the last slots of the Expedition Pack).
  const inv = host.actions.getInventory();
  const kept = inv.pouchSlots > 0 ? (inv.backpack.slice(inv.backpack.length - inv.pouchSlots).filter((s) => s !== null) as Array<{ item: ItemId; count: number }>) : [];
  const chips = (list: Array<[ItemId, number]>) =>
    h(
      'ul',
      { class: 'dd-chips' },
      ...list.map(([id, n]) => h('li', { class: 'dd-chip' }, icon(itemIconDataUrl(id, iconPx(24)), 24), h('span', { text: t(ITEMS[id].name) }), h('b', { text: t('inventory.count', { count: n }) }))),
    );
  return h(
    'section',
    { class: 'dd-screen dd-overlay dd-death' },
    h(
      'div',
      { class: 'dd-panel dd-death-panel', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': t('death.title') },
      h('h2', { class: 'dd-death-title', text: t('death.title') }),
      h('p', { class: 'dd-death-body', text: t('death.body') }),
      h('h3', { class: 'dd-section-title', text: t('death.cached') }),
      left.length ? chips(left) : h('p', { class: 'dd-muted', text: t('death.nothingLost') }),
      left.length && report?.cacheDepth !== null && report?.cacheDepth !== undefined
        ? h('p', { class: 'dd-death-cache', text: t('death.cacheAt', { depth: report.cacheDepth, count }) })
        : null,
      report && report.lostCount > 0 ? h('p', { class: 'dd-muted', text: t('death.cacheReplaced', { count: report.lostCount }) }) : null,
      kept.length ? h('h3', { class: 'dd-section-title', text: t('death.pouchKept') }) : null,
      kept.length ? chips(kept.map((s) => [s.item, s.count] as [ItemId, number])) : null,
      btn(t('death.respawn'), () => host.actions.respawn(), { variant: 'primary', key: 'respawn', autofocus: true }),
    ),
  );
}
