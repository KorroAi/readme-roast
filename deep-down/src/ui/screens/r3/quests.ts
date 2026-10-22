import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import type { QuestsScreenView } from '../../types';
import type { ScreenHost } from '../host';
import { btn } from '../widgets';
import { empty, menuShell, tabRow } from './shell';

export type QuestsTab = 'main' | 'tasks' | 'orders' | 'feats' | 'pages';
const TABS: Array<{ id: QuestsTab; label: TextKey }> = [
  { id: 'main', label: 'm3.quests.tab.main' },
  { id: 'tasks', label: 'm3.quests.tab.tasks' },
  { id: 'orders', label: 'm3.quests.tab.orders' },
  { id: 'feats', label: 'm3.quests.tab.feats' },
  { id: 'pages', label: 'm3.quests.tab.pages' },
];

function progress(have: number, need: number): HTMLElement {
  const f = need > 0 ? Math.max(0, Math.min(1, have / need)) : 0;
  return h('span', { class: 'dd-m3-prog', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': need, 'aria-valuenow': Math.min(have, need) }, h('span', { class: 'dd-m3-progfill', style: `transform:scaleX(${f})` }), h('b', { text: t('hud3.count', { have: Math.min(have, need), need }) }));
}

/**
 * Quests (BRIEF §0.3): the main chain "Relight the Heart" (the current step, the shards, each
 * stratum's steps), the biome tasks and the camp's orders (track one on the HUD), the feats and
 * Halden's journal pages.
 */
export function buildQuests(host: ScreenHost): HTMLElement {
  const v: QuestsScreenView | null = host.actions.getQuests();
  const st = host.state;
  if (!v) return menuShell(host, 'quests', t('m3.quests.title'), t('m3.help.quests'), [empty(t('m3.quests.none'))]);
  const track = (id: string) =>
    btn(v.tracked === id ? t('m3.quests.tracked') : t('m3.quests.track'), () => {
      host.actions.trackQuest(v.tracked === id ? null : id);
      host.rerender();
    }, { key: `track:${id}`, variant: v.tracked === id ? 'primary' : 'secondary', className: 'dd-m3-trackbtn' });

  let body: HTMLElement;
  if (st.questsTab === 'main') {
    const c = v.current;
    body = h(
      'div',
      null,
      h(
        'article',
        { class: 'dd-m3-quest current' },
        h('p', { class: 'dd-m3-kicker', text: c.title }),
        h('h3', { text: c.text }),
        c.progress ? progress(c.progress.have, c.progress.need) : null,
        c.reward ? h('p', { class: 'dd-m3-reward', text: t('m3.quests.reward', { reward: c.reward }) }) : null,
      ),
      h('p', { class: 'dd-m3-shards' }, t('m3.quests.shards', { have: v.shards.have, total: v.shards.total }), ...Array.from({ length: v.shards.total }, (_, i) => h('span', { class: `dd-m3-shard${i < v.shards.have ? ' on' : ''}`, 'aria-hidden': 'true' }))),
      v.free ? h('p', { class: 'dd-m3-good', text: t('m3.quests.free') }) : null,
      ...v.main.map((s) =>
        h(
          'section',
          { class: 'dd-m3-stratum' },
          h('h4', { text: s.name }),
          h('ol', { class: 'dd-m3-steps' }, ...s.steps.map((x) => h('li', { class: x.done ? 'done' : x.current ? 'current' : '' }, x.text))),
        ),
      ),
    );
  } else if (st.questsTab === 'tasks') {
    const groups = v.biomes.filter((b) => b.visited || b.tasks.some((x) => x.done));
    body = groups.length
      ? h(
          'div',
          null,
          ...groups.map((b) =>
            h(
              'section',
              { class: 'dd-m3-stratum' },
              h('h4', { text: b.name }),
              ...b.tasks.map((x) =>
                h('article', { class: `dd-m3-quest${x.done ? ' done' : ''}` }, h('h3', { text: x.text }), progress(x.have, x.need), h('p', { class: 'dd-m3-reward', text: t('m3.quests.reward', { reward: x.reward }) }), x.done ? null : track(x.id)),
              ),
            ),
          ),
        )
      : empty(t('m3.quests.noTasks'));
  } else if (st.questsTab === 'orders') {
    body = v.orders.length
      ? h(
          'div',
          null,
          ...v.orders.map((o) =>
            h(
              'article',
              { class: `dd-m3-quest${o.done ? ' done' : ''}${o.daily ? ' daily' : ''}` },
              o.daily ? h('p', { class: 'dd-m3-kicker', text: t('m3.quests.daily') }) : null,
              h('h3', { text: o.text }),
              progress(o.have, o.need),
              h('p', { class: 'dd-m3-reward', text: o.done ? t('m3.quests.payAtCamp', { reward: o.reward }) : t('m3.quests.reward', { reward: o.reward }) }),
              o.done ? null : track(o.id),
            ),
          ),
        )
      : empty(t('m3.quests.noOrders'));
  } else if (st.questsTab === 'feats') {
    body = v.feats.length
      ? h('ul', { class: 'dd-m3-feats' }, ...v.feats.map((f) => h('li', { class: f.earned ? 'earned' : '' }, h('b', { text: f.name }), h('span', { text: f.text }))))
      : empty(t('m3.quests.noFeats'));
  } else {
    const found = v.pages.filter((p) => p.found);
    body = found.length
      ? h('div', null, ...found.map((p) => h('article', { class: 'dd-m3-page' }, h('p', { class: 'dd-m3-kicker', text: t('m3.quests.page', { n: p.n }) }), h('h3', { text: p.title }), h('p', { text: p.body }))), h('p', { class: 'dd-m3-meta', text: t('m3.quests.pagesFound', { n: found.length, total: v.pages.length }) }))
      : empty(t('m3.quests.noPages'));
  }

  return menuShell(host, 'quests', t('m3.quests.title'), t('m3.help.quests'), [
    tabRow(
      t('m3.quests.title'),
      TABS.map((x) => ({ id: x.id, text: t(x.label), count: x.id === 'orders' ? v.orders.filter((o) => !o.done).length : undefined })),
      st.questsTab,
      (id) => {
        st.questsTab = id;
        host.rerender();
      },
    ),
    body,
  ]);
}
