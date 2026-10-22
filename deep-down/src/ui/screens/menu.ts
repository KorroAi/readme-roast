import { ITEMS, type ItemId } from '../../config/items';
import { t } from '../../i18n';
import { VERSION } from '../../version';
import { logo } from '../brand/logo';
import { h } from '../dom';
import { formatRelativeTime } from '../format';
import { iconPx, itemIconDataUrl } from '../icons';
import type { ScreenHost } from './host';
import { btn, header, ledger } from './widgets';
import { iconSvg } from '../hud/glyphs';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

/** Time played, short: "42 min", "3 h 05". */
export function playTimeText(seconds: number): string {
  const m = Math.max(0, Math.floor(seconds / 60));
  if (m < 60) return t('menu3.minutes', { n: m });
  return t('menu3.hours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}

/** The Visual Lab button: dev builds, or ?lab for reviewers (never on a player's home screen). */
function showLab(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('lab');
}

/** Main menu over the live cave: the carved wordmark, the tagline between brass rules, the expedition buttons. */
export function buildMenu(host: ScreenHost): HTMLElement {
  const a = host.actions;
  const hasSave = a.hasSave();
  const savedAt = hasSave ? a.saveTimestamp() : null;

  // Round 3: an optional seed for the new world (empty: a random one is rolled).
  const seedInput = h('input', {
    class: 'dd-seed-input',
    type: 'text',
    inputmode: 'text',
    maxlength: 24,
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: t('menu3.seed'),
    'aria-label': t('menu3.seed'),
    'data-key': 'seed',
  });
  const seed = () => (seedInput.value.trim() ? seedInput.value.trim() : undefined);
  // Round 3: the expedition waiting behind Continue (its stratum, biomes, shards and time played).
  const sum = hasSave ? a.getSaveSummary() : null;
  const ex = sum?.expedition;
  const card = ex
    ? h(
        'div',
        { class: 'dd-continue-card', 'aria-hidden': 'true' },
        h('p', { class: 'dd-cc-stratum' }, h('span', { class: 'dd-cc-roman', text: ROMAN[ex.stratum] ?? String(ex.stratum) }), h('span', { text: ex.stratumName })),
        h('p', { class: 'dd-cc-biomes', text: ex.biomes.join(' · ') }),
        h(
          'p',
          { class: 'dd-cc-meta' },
          h('span', { class: 'dd-cc-shards' }, ...Array.from({ length: 12 }, (_, i) => h('i', { class: i < ex.shards ? 'on' : '' }))),
          h('span', { text: t('menu3.cardShards', { n: ex.shards }) }),
          h('span', { text: t('menu3.cardTime', { time: playTimeText(sum!.playTime) }) }),
        ),
      )
    : null;
  const startNew = () => {
    if (!a.hasSave()) {
      a.newGame(seed());
      return;
    }
    host.confirm({ text: t('menu.confirmNew'), yes: t('menu.confirmYes'), no: t('menu.confirmNo'), onYes: () => a.newGame(seed()), danger: true });
  };
  // Round 3: today's Daily Descent (one seed, one goal and its modifiers for everyone today).
  const daily = a.daily?.() ?? null;
  const startDaily = () => {
    if (!a.newDaily) return;
    if (!a.hasSave()) {
      a.newDaily();
      return;
    }
    host.confirm({ text: t('menu.confirmNew'), yes: t('menu.confirmYes'), no: t('menu.confirmNo'), onYes: () => a.newDaily?.(), danger: true });
  };

  return h(
    'section',
    { class: 'dd-screen dd-menu' },
    h(
      'div',
      { class: 'dd-menu-col' },
      logo('menu'),
      h('p', { class: 'dd-tagline', text: t('game.tagline') }),
      // The buttons scroll inside the column when a short screen cannot hold them all.
      h(
        'div',
        { class: 'dd-menu-buttons dd-scroll' },
        hasSave
          ? btn(t('menu.continue'), () => a.continueGame(), {
              variant: 'primary',
              sub: savedAt !== null ? t('menu.saveFound', { time: formatRelativeTime(savedAt, Date.now()) }) : undefined,
              key: 'continue',
              autofocus: true,
            })
          : null,
        card,
        btn(t('menu.newGame'), startNew, { variant: hasSave ? 'secondary' : 'primary', key: 'new', autofocus: !hasSave }),
        h('details', { class: 'dd-seed' }, h('summary', { class: 'dd-seed-summary', text: t('menu3.seed') }), h('p', { class: 'dd-seed-hint', text: t('menu3.seedHint') }), seedInput),
        daily
          ? btn(t('daily3.name'), startDaily, {
              sub: [daily.goalText, ...daily.modTexts, daily.best ? t('daily3.best', { time: daily.best }) : ''].filter(Boolean).join(' · '),
              key: 'daily',
              className: 'dd-daily-btn',
            })
          : null,
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
    h('p', { class: 'dd-version', text: t('menu.version', { version: VERSION }) }),
  );
}

export function buildLoading(host: ScreenHost): HTMLElement {
  const p = Math.round(host.state.loadingProgress * 100);
  return h(
    'section',
    { class: 'dd-screen dd-loading' },
    logo('loading'),
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
    ledger(list.map(([id, n]) => ({ icon: itemIconDataUrl(id, iconPx(24)), label: t(ITEMS[id].name), value: t('inventory.count', { count: n }), tone: ITEMS[id].rarity })));
  const info = host.state.deathInfo;
  // Round 3: the lantern goes out (a dark fall over the world, the flame dying), then the card rises
  // with what did it, where, what was left and where the explorer wakes.
  const flame = h('span', { class: 'dd-bo-flame', 'aria-hidden': 'true' });
  flame.innerHTML = iconSvg('flame');
  return h(
    'section',
    { class: `dd-screen dd-overlay dd-death${info ? ' dd-bo' : ''}` },
    info ? h('div', { class: 'dd-bo-veil', 'aria-hidden': 'true' }, flame) : null,
    h(
      'div',
      { class: 'dd-panel dd-death-panel', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': info ? t('bo3.title') : t('death.title') },
      h('h2', { class: 'dd-death-title', text: info ? t('bo3.title') : t('death.title') }),
      // The story scrolls on a short screen (a landscape phone); the wake-up stays in view under it.
      h(
        'div',
        { class: 'dd-scroll dd-death-story' },
        info ? h('p', { class: 'dd-bo-cause', text: info.cause }) : null,
        info && info.biome ? h('p', { class: 'dd-bo-where', text: t('bo3.where', { depth: info.depth, biome: info.biome, stratum: ROMAN[info.stratum] ?? String(info.stratum) }) }) : null,
        info ? null : h('p', { class: 'dd-death-body', text: t('death.body') }),
        h('h3', { class: 'dd-section-title', text: t('death.cached') }),
        left.length ? chips(left) : h('p', { class: 'dd-muted', text: t('death.nothingLost') }),
        left.length && report?.cacheDepth !== null && report?.cacheDepth !== undefined
          ? h('p', { class: 'dd-death-cache', text: t('death.cacheAt', { depth: report.cacheDepth, count }) })
          : null,
        left.length && info ? h('p', { class: 'dd-muted', text: t('bo3.mapMarks') }) : null,
        report && report.lostCount > 0 ? h('p', { class: 'dd-muted', text: t('death.cacheReplaced', { count: report.lostCount }) }) : null,
        kept.length ? h('h3', { class: 'dd-section-title', text: t('death.pouchKept') }) : null,
        kept.length ? chips(kept.map((s) => [s.item, s.count] as [ItemId, number])) : null,
      ),
      info ? h('p', { class: 'dd-bo-wake', text: info.wake }) : null,
      btn(info ? t('bo3.wake') : t('death.respawn'), () => host.actions.respawn(), { variant: 'primary', key: 'respawn', autofocus: true }),
    ),
  );
}
