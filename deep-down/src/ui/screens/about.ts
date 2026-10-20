import './about.css';
import { t, type TextKey } from '../../i18n';
import { BUILD, VERSION, VERSION_CODE } from '../../version';
import { h } from '../dom';
import type { AboutTab, ScreenHost } from './host';
import { closeBtn, ledger, type LedgerRow } from './widgets';

/**
 * About / Licences, reached from Settings. Three tabs:
 * - About: the version and versionCode, the copyright line, how the game is made.
 * - Privacy: the statement from the release text (the same words as the hosted privacy page).
 * - Licences: licenses.txt (three.js and Vite's notices, emitted by the build), fetched into a
 *   scrolling panel. The WebView never navigates away from the game to show any of it.
 */

const TABS: Array<{ id: AboutTab; label: TextKey }> = [
  { id: 'about', label: 'ui.about.tab.about' },
  { id: 'privacy', label: 'ui.about.tab.privacy' },
  { id: 'licences', label: 'ui.about.tab.licences' },
];

const PRIVACY: Array<[TextKey, TextKey]> = [
  ['release.privacy.networkTitle', 'release.privacy.network'],
  ['release.privacy.storageTitle', 'release.privacy.storage'],
  ['release.privacy.backupTitle', 'release.privacy.backup'],
  ['release.privacy.permissionsTitle', 'release.privacy.permissions'],
  ['release.privacy.crashTitle', 'release.privacy.crash'],
  ['release.privacy.childrenTitle', 'release.privacy.children'],
  ['release.privacy.changesTitle', 'release.privacy.changes'],
  ['release.privacy.contactTitle', 'release.privacy.contact'],
];

/** licenses.txt once read (it never changes while the game runs). */
let licences: string | null = null;
let licencesFailed = false;
let pending: Promise<void> | null = null;

function loadLicences(): Promise<void> {
  pending ??= fetch('./licenses.txt')
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((text) => {
      licences = text;
    })
    .catch(() => {
      licencesFailed = true;
      pending = null;
    });
  return pending;
}

export function buildAbout(host: ScreenHost): HTMLElement {
  if (host.opening) host.state.aboutTab = 'about';
  const tab = host.state.aboutTab;
  const tabs = h('div', { class: 'dd-tabs dd-about-tabs', role: 'tablist', 'aria-label': t('ui.about.title') });
  for (const def of TABS) {
    const selected = def.id === tab;
    tabs.appendChild(
      h('button', {
        class: 'dd-tab',
        type: 'button',
        role: 'tab',
        id: `dd-atab-${def.id}`,
        'aria-selected': String(selected),
        'aria-controls': 'dd-about-panel',
        'data-key': `atab:${def.id}`,
        'data-autofocus': selected,
        text: t(def.label),
        onclick: () => {
          host.state.aboutTab = def.id;
          host.rerender();
        },
      }),
    );
  }
  const body = tab === 'about' ? aboutTab() : tab === 'privacy' ? privacyTab() : licencesTab();
  return h(
    'section',
    { class: 'dd-screen dd-overlay' },
    h(
      'div',
      { class: 'dd-panel dd-about', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ui.about.title') },
      h('header', { class: 'dd-panel-head' }, h('h2', { class: 'dd-panel-title', text: t('ui.about.title') }), h('div', { class: 'dd-panel-actions' }, closeBtn(t('menu.back'), () => host.aboutBack()))),
      tabs,
      h('div', { class: 'dd-scroll dd-about-panel', id: 'dd-about-panel', role: 'tabpanel', 'aria-labelledby': `dd-atab-${tab}` }, body),
    ),
  );
}

function aboutTab(): HTMLElement {
  const rows: LedgerRow[] = [
    { label: t('ui.about.version'), value: VERSION },
    { label: t('ui.about.versionCode'), value: String(VERSION_CODE) },
  ];
  if (BUILD > 0) rows.push({ label: t('ui.about.build'), value: String(BUILD) });
  return h(
    'div',
    { class: 'dd-about-main' },
    h('h3', { class: 'dd-about-name dd-lintel', text: t('game.title') }),
    ledger(rows, 'dd-about-ledger'),
    h('p', { class: 'dd-about-copy', text: t('ui.about.copyright') }),
    h('section', { class: 'dd-about-sec' }, h('h4', { class: 'dd-section-title', text: t('ui.about.madeTitle') }), h('p', { class: 'dd-about-text', text: t('ui.about.made') })),
    h('section', { class: 'dd-about-sec' }, h('h4', { class: 'dd-section-title', text: t('ui.about.builtTitle') }), h('p', { class: 'dd-about-text', text: t('ui.about.built') })),
  );
}

function privacyTab(): HTMLElement {
  return h(
    'div',
    { class: 'dd-about-privacy' },
    h('p', { class: 'dd-about-summary', text: t('release.privacy.summary') }),
    ...PRIVACY.map(([title, body]) => h('section', { class: 'dd-about-sec' }, h('h4', { class: 'dd-section-title', text: t(title) }), h('p', { class: 'dd-about-text', text: t(body) }))),
    h('p', { class: 'dd-about-fine', text: t('release.privacy.version', { version: VERSION }) }),
  );
}

function licencesTab(): HTMLElement {
  const pre = h('pre', { class: 'dd-licences', tabindex: 0, 'aria-label': t('ui.about.tab.licences') });
  const fill = () => {
    pre.textContent = licences ?? (licencesFailed ? t('ui.about.licencesFailed') : t('ui.about.licencesLoading'));
    pre.classList.toggle('failed', licences === null && licencesFailed);
  };
  if (licences === null && !pending) licencesFailed = false; // a new visit tries again
  fill();
  // Filled in place when the text arrives (a rebuild would lose the scroll position).
  if (licences === null) void loadLicences().then(fill);
  return h('div', { class: 'dd-about-licences' }, h('p', { class: 'dd-about-text', text: t('ui.about.licencesIntro') }), pre);
}
