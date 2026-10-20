// The idle HUD sandbox (the Visual Lab's "UI Readability" view): the real HUD over a painted backdrop, driven by the
// pure model with no WebGL, so every component state can be looked at and captured. ?state=<name> picks a preset:
// fresh (0:00), early (the first buys), mid (120 m, the sheets), feast (the return feast).

import { Big } from '../../core/big';
import { createIdleBus, type BuyMode } from '../../idle/bus';
import { biomeAt, biomeDef } from '../../idle/config/biomes';
import { buy, card, cards as sheetCards, quickSlots, type CardView } from '../../idle/model/run';
import { currentGoal } from '../../idle/model/goals';
import { advanceIdle, computeOffline } from '../../idle/model/offline';
import { createIdle, stepIdle } from '../../idle/model/step';
import { skipTutorial } from '../../idle/model/tutorial';
import { format } from '../../idle/num/notation';
import { DEFAULT_SETTINGS, type Settings } from '../../save/types';
import { tr } from '../idle/Card';
import type { HudModel } from '../idle/Hud';
import { hudLayout } from '../idle/layout';
import { UI } from '../UI';

const bus = createIdleBus();
const s = createIdle(7, Date.now());
const preset = new URLSearchParams(location.search).get('state') ?? 'fresh';
if (preset !== 'fresh') {
  skipTutorial(s, bus);
  s.run.gold = Big.from(preset === 'early' ? 120 : 5e6);
  if (preset === 'mid' || preset === 'feast') advanceIdle(s, 600, bus);
}
const q = new URLSearchParams(location.search);
// ?large=1, ?lefty=1, ?contrast=1: the accessibility variants (tools/ui-check.mjs).
let settings: Settings = { ...DEFAULT_SETTINGS, textSize: q.get('large') ? 'large' : DEFAULT_SETTINGS.textSize, leftHanded: !!q.get('lefty'), highContrast: !!q.get('contrast') };
let mode: BuyMode = 'x1';

const model: HudModel = {
  cards: (sheet, m) => sheetCards(s, sheet, m),
  shownGoldLog10: () => (s.run.gold.isZero() ? -Infinity : s.run.gold.log10()),
  buy: (id) => buy(s, id, mode, bus).ok,
  buyModeNow: () => mode,
  crewDps: () => (s.rates.crewDps.isZero() ? '' : format(s.rates.crewDps)),
  quick: () => quickSlots(s).map((id) => (id ? card(s, id, mode) : null)) as Array<CardView | null>,
  goal: () => currentGoal(s),
  goldLog10: () => (s.run.gold.isZero() ? -Infinity : s.run.gold.log10()),
  gemsShown: () => s.meta.gems,
  rate: () => s.rates.goldPerSec,
  depth: () => s.run.depth,
  biomeName: () => tr(`idle.biome.${biomeDef(biomeAt(s.run.depth)).id}`),
  floorFrac: () => s.run.depth,
  floorY: () => 400,
  rulerMarks: () => [],
  combo: () => ({ combo: s.tap.combo, mult: 1 + 0.02 * Math.min(50, s.tap.combo), surge: 0.4, surgeOn: false }),
  skills: () => [],
  useSkill: () => {},
  guide: () => ({ target: '', text: '' }),
  seal: () => null,
  go: () => {},
};

const ui = new UI(
  document.getElementById('ui') as HTMLElement,
  {
    play: () => ui.showScreen('none'),
    toMenu: () => ui.showScreen('menu'),
    getSettings: () => settings,
    updateSettings: (p) => {
      settings = { ...settings, ...p };
      ui.applySettings(settings);
      layout();
    },
    resetSettings: () => (settings = { ...DEFAULT_SETTINGS }),
    deleteSave: () => {},
    hasSave: () => true,
    saveTimestamp: () => Date.now() - 3600_000,
    saveSummary: () => `${s.run.depth} m`,
  },
  model,
  {
    settings: { get: () => settings, set: (p) => (settings = { ...settings, ...p }), drag: (p) => (settings = { ...settings, ...p }) },
    toMenu: () => ui.showScreen('menu'),
    about: () => ui.showScreen('about'),
    feast: { collect: () => {}, openChest: () => false, rackCount: () => 0, coins: () => {}, tick: () => {}, done: () => {} },
    onReady: () => {},
    onSheet: () => {},
    onMode: (m) => (mode = m),
  },
);
const layout = () => ui.hud.layout(hudLayout(innerWidth, innerHeight, 47, 34, settings.textSize === 'large'));
ui.applySettings(settings);
layout();
addEventListener('resize', layout);
for (const id of s.meta.revealed) ui.hud.reveal(id, true);
if (preset !== 'fresh') for (const id of ['gold', 'depth', 'gems', 'quick1', 'quick2', 'quick3', 'digTab', 'crewTab', 'ruler', 'buyMode', 'combo', 'surge']) ui.hud.reveal(id, true);
if (preset === 'feast') ui.hud.startFeast({ ...computeOffline(s, 5 * 3600, { apply: false }), collected: false });
// A painted backdrop where the world would be.
const c = document.getElementById('game') as HTMLCanvasElement;
c.width = innerWidth;
c.height = innerHeight;
const g = c.getContext('2d')!;
const grd = g.createLinearGradient(0, 0, 0, innerHeight);
grd.addColorStop(0, '#1d2632');
grd.addColorStop(0.5, '#3a2a1c');
grd.addColorStop(1, '#131a24');
g.fillStyle = grd;
g.fillRect(0, 0, innerWidth, innerHeight);
let last = performance.now();
const frame = (now: number) => {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  stepIdle(s, dt, [], bus);
  ui.hud.update(dt, now, false);
  ui.fx.frame(now, dt);
};
requestAnimationFrame(frame);
(window as unknown as { __SANDBOX__: unknown }).__SANDBOX__ = { s, ui, bus };
