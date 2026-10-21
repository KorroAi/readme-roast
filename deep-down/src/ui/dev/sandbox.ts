// The HUD sandbox (the Visual Lab's "UI Readability" view): the real first-person HUD over a painted lantern-lit
// backdrop, driven by a scripted view so the plates, the objective line, the cards, the first-time card, the focus
// panel and the sheet can be judged at arm's length without a game. Not shipped (DD_RELEASE builds only index.html).
// tools/ui-check.mjs drives it by query: `state=` fresh | play | ride | focus | return | sheet-dig | sheet-crew |
// sheet-settings, and the flags `large=1`, `lefty=1`, `contrast=1`, `white=1` (a white backdrop for the HUD weight).

import { HybridUI } from '../hybrid/HybridUI';
import type { HudFrame } from '../hybrid/Hud';
import { DEFAULT_SETTINGS } from '../../save/types';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const root = document.getElementById('ui') as HTMLElement;

const q = new URLSearchParams(location.search);
const STATE = q.get('state') ?? 'play';
const flag = (k: string): boolean => q.get(k) === '1';

function paintBackdrop(): void {
  const w = (canvas.width = innerWidth);
  const h = (canvas.height = innerHeight);
  const g = canvas.getContext('2d');
  if (!g) return;
  if (flag('white')) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    return;
  }
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0d1418');
  sky.addColorStop(1, '#05080b');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const pool = g.createRadialGradient(w * 0.32, h * 0.72, 10, w * 0.32, h * 0.72, h * 0.55);
  pool.addColorStop(0, 'rgba(255, 179, 92, 0.55)');
  pool.addColorStop(1, 'rgba(255, 179, 92, 0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, w, h);
}

const ui = new HybridUI(root, {
  buy: () => true,
  goal: () => ui.hud.firstTime('Walk to the chest', 'The objective line walks you there.'),
  sheet: () => {},
  skip: () => {},
  rows: (tab) =>
    (tab === 'dig' ? ['Pick', 'Lucky Strike', 'Steady Hand'] : ['Shovel Hand', 'Pick Crew', 'Mine Cart']).map((title, i) => ({
      id: `${tab}:${i}`,
      title,
      sub: 'One line of what it does',
      level: `Lv ${3 + i}`,
      price: `${(1.2 + i).toFixed(1)}K`,
      ready: i === 0,
      locked: i === 2,
      best: i === 0,
    })),
  settings: () => [{ id: 'motion', label: 'Motion', options: [{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }], value: 'full' }],
  setSetting: () => {},
  collect: () => {},
  toCamp: () => {},
});
ui.applySettings({ ...DEFAULT_SETTINGS, textSize: flag('large') ? 'large' : 'normal', leftHanded: flag('lefty'), highContrast: flag('contrast') });

const frame = (): HudFrame => ({
  depth: '12 m',
  biome: 'Topsoil Roots',
  gold: '1.24K',
  rate: '',
  goal: { id: 'demo', text: 'Relight the lamps · 1/2', fill: 0.5, icon: 'lamp', reward: '+1 ◇', ring: null },
  cards:
    STATE === 'fresh'
      ? [null, null]
      : [
          { slot: 'pick', id: 'pick', title: 'Pick', sub: 'Lv 7 · 1.42K / strike', price: '980', ready: true, progress: 1, best: false },
          { slot: 'best', id: 'crew:0', title: 'Shovel Hand', sub: 'Hire · 12/s', price: '1.6K', ready: false, progress: 0.62, best: true },
        ],
  badge: false,
  skip: STATE === 'ride',
  ceremony: false,
});

function layout(): void {
  paintBackdrop();
  ui.hud.setLayout(innerWidth, innerHeight, 0, 0, flag('large'));
}
addEventListener('resize', layout);
layout();
if (STATE === 'play') ui.hud.firstTime('NEW · Copper', 'Worth more than soil.');
if (STATE === 'focus') ui.hud.focus('Wood chest', 'Tap to open', 'chest');
if (STATE === 'return') ui.hud.showReturn(['While you were away the crew dug 42 m', '+12.4K gold', 'Two chambers charted']);
if (STATE.startsWith('sheet-')) ui.hud.toggleSheet(STATE.slice(6) as 'dig' | 'crew' | 'settings');
const tick = (now: number) => {
  ui.hud.update(frame(), now);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
(window as unknown as { __SANDBOX__: unknown }).__SANDBOX__ = { state: STATE, plateArea: () => ui.hud.plateArea(), numbers: () => ui.hud.numbers() };
