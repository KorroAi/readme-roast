import { ITEM_IDS, type ItemId } from '../../config/items';
import { RECIPES, type RecipeId } from '../../config/recipes';
import { EventBus, type GameEvents } from '../../core/events';
import { Noise } from '../../core/noise';
import { t, type TextKey } from '../../i18n';
import { consumeEdges, createInputState } from '../../input/types';
import { DEFAULT_SETTINGS, type ItemCounts, type Settings, type SlotData } from '../../save/types';
import type { ExpeditionReport, HudState, InventoryView, SaveSummary, ScreenId, UiActions } from '../types';
import { UI } from '../UI';

/**
 * Development sandbox for the UI (src/ui/dev/sandbox.html; also built as the Visual Lab "UI Readability" view).
 * Mounts the real UI over a painted cave backdrop with fake UiActions that behave like the
 * game, and exposes window.__UI__ so tools/ui-check.mjs can switch scenes and inspect input.
 */

const bus = new EventBus<GameEvents>();
const input = createInputState();
let settings: Settings = { ...DEFAULT_SETTINGS };
let savedAt: number | null = Date.now() - 7 * 60_000;
let mode: 'menu' | 'playing' | 'paused' = 'menu';

const inv = {
  backpack: [
    { item: 'stone', count: 14 },
    { item: 'copperOre', count: 5 },
    { item: 'glimmerShard', count: 2 },
    null,
    null,
    null,
  ] as Array<SlotData | null>,
  storage: { stone: 22, copperOre: 4 } as ItemCounts,
  equipment: { pickaxe: 1, lantern: 1, pack: 1 },
  journal: ['hollow', 'crystals', 'tablet', 'ancientTablet'],
  atCamp: true,
};

function available(): ItemCounts {
  const out: ItemCounts = {};
  for (const id of ITEM_IDS) {
    const n = inv.backpack.reduce((a, s) => a + (s && s.item === id ? s.count : 0), 0) + (inv.storage[id] ?? 0);
    if (n > 0) out[id] = n;
  }
  return out;
}

function spend(id: ItemId, n: number): void {
  const fromStorage = Math.min(n, inv.storage[id] ?? 0);
  inv.storage[id] = (inv.storage[id] ?? 0) - fromStorage;
  let left = n - fromStorage;
  for (let i = 0; i < inv.backpack.length && left > 0; i++) {
    const s = inv.backpack[i];
    if (!s || s.item !== id) continue;
    const take = Math.min(left, s.count);
    s.count -= take;
    left -= take;
    if (s.count === 0) inv.backpack[i] = null;
  }
}

const hud: HudState = {
  health: 70,
  maxHealth: 100,
  lantern: 0.55,
  lanternLow: false,
  backpackUsed: 3,
  backpackMax: 6,
  depth: 128,
  atCamp: false,
  campBearing: 0.6,
  campDistance: 24,
  objectiveText: t('objective.findCopper', { have: 3, need: 8 }),
  interactLabel: null,
  target: { name: t('block.copperOre'), progress: 0.45, blocked: false },
  showCrosshair: false,
  fps: 58,
  frameMs: 12.4,
  drawCalls: 118,
  triangles: 71,
  fuelSeconds: 165,
  fuelCapacity: 300,
  homeSeconds: 31,
  turnBackFraction: (31 * 1.25 + 10) / 300,
  fuelState: 'ok',
  cold: 0,
  compass: { kind: 'camp', bearing: 0.6, distance: 24 },
  cache: null,
  bestDepth: 128,
  newBest: false,
  packFull: false,
  pouchSlots: 0,
};

/** The last expedition, for the report fixtures (W3 builds the screen). */
const report: ExpeditionReport = {
  n: 3,
  outcome: 'returned',
  duration: 252,
  deepest: 96,
  newBest: true,
  previousBest: 71,
  mined: 58,
  found: { stone: 31, copperOre: 9, rootFibre: 4, glimmerShard: 3 },
  banked: { stone: 31, copperOre: 9, rootFibre: 4, glimmerShard: 3 },
  bankedTotal: 47,
  cached: null,
  cacheDepth: null,
  lostCount: 0,
  damage: 18,
  fuelLeft: 61,
  discoveries: ['hollow'],
  runes: [],
  records: ['deepest', 'biggestHaul'],
  show: true,
};
let reportOpen: ExpeditionReport | null = report;

const actions: UiActions = {
  continueGame: () => startPlaying(),
  newGame: () => startPlaying(),
  openVisualLab: () => ui.toast(t('menu.visualLab')),
  pause: () => {
    mode = 'paused';
    ui.showScreen('pause');
  },
  resume: () => {
    mode = 'playing';
    ui.showScreen('none');
  },
  returnToCamp: () => {
    mode = 'playing';
    ui.showScreen('none');
    ui.setGameplayActive(true);
  },
  quitToMenu: () => {
    mode = 'menu';
    ui.setGameplayActive(false);
    ui.showScreen('menu');
  },
  respawn: () => {
    mode = 'playing';
    ui.showScreen('none');
    ui.setGameplayActive(true);
  },
  craft: (id: RecipeId) => {
    const r = RECIPES[id];
    for (const [item, n] of Object.entries(r.inputs) as Array<[ItemId, number]>) spend(item, n);
    inv.equipment[r.result.slot] = r.result.tier;
    if (r.result.slot === 'pack') while (inv.backpack.length < 10) inv.backpack.push(null);
    bus.emit('craft:done', { recipe: id });
    bus.emit('inventory:changed', {});
    ui.toast(t('toast.crafted', { item: t(r.name) }), 'good');
  },
  openInventory: () => ui.showScreen('inventory'),
  openCrafting: () => ui.showScreen('crafting'),
  closeScreen: () => {
    if (mode === 'paused') actions.resume();
    else ui.showScreen(mode === 'menu' ? 'menu' : 'none');
  },
  updateSettings: (p) => {
    settings = { ...settings, ...p };
    ui.applySettings(settings);
  },
  resetSettings: () => actions.updateSettings({ ...DEFAULT_SETTINGS }),
  deleteSave: () => {
    savedAt = null;
  },
  getInventory: (): InventoryView => ({
    backpack: inv.backpack.map((s) => (s ? { ...s } : null)),
    storage: { ...inv.storage },
    equipment: { ...inv.equipment },
    journal: [...inv.journal],
    available: available(),
    atCamp: inv.atCamp,
    pouchSlots: inv.equipment.pack >= 3 ? 2 : 0,
  }),
  getSettings: () => settings,
  hasSave: () => savedAt !== null,
  saveTimestamp: () => savedAt,
  getSaveSummary: (): SaveSummary | null =>
    savedAt === null
      ? null
      : {
          savedAt,
          playTime: 1520,
          expeditions: 3,
          bestDepth: 96,
          discoveries: 3,
          discoveriesTotal: 6,
          runes: 1,
          runesTotal: 8,
          equipment: { ...inv.equipment },
          cacheWaiting: false,
        },
  getReport: () => reportOpen,
  dismissReport: () => {
    reportOpen = null;
  },
};

const ui = new UI(document.getElementById('ui') as HTMLElement, actions, bus, input);
ui.applySettings(settings);

function startPlaying(): void {
  ui.showScreen('loading');
  ui.setLoading(0.3, t('menu.loadingMesh'));
  window.setTimeout(() => {
    mode = 'playing';
    ui.showScreen('none');
    ui.setGameplayActive(true);
  }, 300);
}

// Input the fake game consumed, so tests can check what the touch controls produced.
const seen = { jump: 0, interact: 0, inventory: 0, pause: 0, lookDX: 0, lookDY: 0, maxMoveY: 0, miningFrames: 0 };
let lastInteract: string | null = null;

function frame(): void {
  if (mode === 'playing') {
    hud.backpackUsed = inv.backpack.filter((s) => s !== null).length;
    hud.backpackMax = inv.backpack.length;
    ui.setHud(hud);
    if (hud.interactLabel !== lastInteract) {
      lastInteract = hud.interactLabel;
      ui.touch.setInteractVisible(lastInteract);
    }
    if (input.jumpPressed) seen.jump++;
    if (input.interactPressed) seen.interact++;
    if (input.inventoryPressed) seen.inventory++;
    if (input.pausePressed) seen.pause++;
    if (input.mining) seen.miningFrames++;
    seen.lookDX += input.lookDX;
    seen.lookDY += input.lookDY;
    seen.maxMoveY = Math.max(seen.maxMoveY, input.moveY);
    if (!ui.isBlockingInput()) {
      if (input.pausePressed) actions.pause();
      else if (input.inventoryPressed) actions.openInventory();
      else if (input.interactPressed && hud.interactLabel) actions.openCrafting();
    }
  }
  consumeEdges(input);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** Scene presets for screenshots. */
function scene(name: string): void {
  const [id, arg] = name.split(':');
  Object.assign(hud, {
    health: 70,
    lantern: 0.55,
    lanternLow: false,
    atCamp: false,
    interactLabel: null,
    target: { name: t('block.copperOre'), progress: 0.45, blocked: false },
    fuelSeconds: 165,
    fuelState: 'ok',
    cold: 0,
    cache: null,
  });
  reportOpen = report;
  savedAt = Date.now() - 7 * 60_000;
  settings = { ...DEFAULT_SETTINGS };
  ui.applySettings(settings);
  const play = (screen: ScreenId = 'none') => {
    mode = screen === 'pause' ? 'paused' : 'playing';
    ui.setGameplayActive(screen !== 'death');
    ui.showScreen(screen);
  };
  switch (id) {
    case 'menu':
      mode = 'menu';
      if (arg === 'nosave') savedAt = null;
      ui.setGameplayActive(false);
      ui.showScreen('menu');
      break;
    case 'loading':
      mode = 'menu';
      ui.setGameplayActive(false);
      ui.showScreen('loading');
      ui.setLoading(0.62, t('menu.loadingLight'));
      break;
    case 'hud':
      play();
      if (arg === 'low') {
        Object.assign(hud, {
          health: 25,
          lantern: 0.12,
          lanternLow: true,
          fuelSeconds: 36,
          fuelState: 'critical',
          cold: 0,
          cache: { bearing: -0.9, distance: 84, count: 23 },
          interactLabel: t('hint.interactWorkbench'),
          target: { name: t('block.hardenedSlate'), progress: 0, blocked: true },
        });
        inv.backpack = inv.backpack.map((s, i) => s ?? { item: i % 2 ? 'stone' : 'copperOre', count: 3 });
        actions.updateSettings({ showFps: true });
        ui.hint(t('hint.tooHard', { tool: t('equip.copperPickaxe') }), 60_000);
        ui.toast(t('hint.backpackFull'), 'warn');
      } else {
        ui.pickup({ item: 'copperOre', count: 1 });
        ui.pickup({ item: 'copperOre', count: 1 });
        ui.pickup({ item: 'stone', count: 1 });
        ui.pickup({ item: 'glimmerShard', count: 2 });
        ui.hint(t('hint.mine'), 60_000);
        ui.toast(t('toast.banked', { count: 12 }), 'good');
      }
      break;
    case 'discovery':
      play();
      hud.target = null;
      ui.showDiscovery({ id: 'hollow', title: t('discovery.hollow.title'), body: t('discovery.hollow.body'), index: 2, total: 6, major: true });
      break;
    case 'inventory':
      play('inventory');
      if (arg) {
        ui.state.invTab = arg as typeof ui.state.invTab;
        ui.refresh();
      }
      break;
    case 'crafting':
      inv.storage = { stone: 20, copperOre: 4 };
      inv.equipment = { pickaxe: 1, lantern: 1, pack: 2 };
      play('crafting');
      break;
    case 'pause':
      play('pause');
      break;
    case 'settings':
      play('pause');
      ui.showScreen('settings');
      break;
    case 'confirm':
      play('pause');
      ui.showScreen('confirm', {
        confirm: { text: t('pause.confirmReturn'), yes: t('pause.confirmReturnYes'), no: t('pause.confirmReturnNo'), onYes: () => actions.returnToCamp() },
      });
      break;
    case 'death':
      mode = 'playing';
      ui.setGameplayActive(false);
      reportOpen = { ...report, outcome: 'blackout', cached: { stone: 6, copperOre: 3, glimmerShard: 1 }, cacheDepth: 84, banked: {}, bankedTotal: 0, records: [], newBest: false };
      ui.showDeath({ stone: 6, copperOre: 3, glimmerShard: 1 });
      break;
  }
}

paintCave(document.getElementById('game') as HTMLCanvasElement);

Object.assign(window, { __UI__: { ui, input, bus, actions, hud, inv, seen, scene, settings: () => settings } });
const params = new URLSearchParams(location.search);
scene(params.get('scene') ?? 'menu');
// Accessibility variants on top of any scene: ?large=1&contrast=1&lefty=1
actions.updateSettings({
  textSize: params.get('large') === '1' ? 'large' : 'normal',
  highContrast: params.get('contrast') === '1',
  leftHanded: params.get('lefty') === '1',
});
if (params.get('lab') === '1') labBar();

/** Visual Lab mode (?lab=1): a scene picker with the accessibility variants, for judging readability. */
function labBar(): void {
  const scenes: Array<[string, TextKey]> = [
    ['menu', 'lab.scene.menu'], ['loading', 'lab.scene.loading'], ['hud', 'lab.scene.hud'], ['hud:low', 'lab.scene.hudLow'],
    ['discovery', 'lab.scene.discovery'], ['inventory', 'lab.scene.inventory'], ['inventory:storage', 'lab.scene.storage'],
    ['inventory:equipment', 'lab.scene.equipment'], ['inventory:journal', 'lab.scene.journal'], ['crafting', 'lab.scene.crafting'],
    ['pause', 'lab.scene.pause'], ['settings', 'lab.scene.settings'], ['confirm', 'lab.scene.confirm'], ['death', 'lab.scene.death'],
  ];
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;background:rgba(9,14,22,0.85);color:#e8eef6;font:600 13px system-ui,sans-serif';
  const pick = document.createElement('select');
  pick.setAttribute('aria-label', t('lab.uiScene'));
  for (const [id, key] of scenes) pick.add(new Option(t(key), id, false, id === (params.get('scene') ?? 'menu')));
  const toggle = (label: string, key: 'large' | 'contrast') => {
    const l = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = params.get(key) === '1';
    l.append(c, ' ', label);
    c.addEventListener('change', go);
    return { l, c };
  };
  const large = toggle(t('settings.textSize.large'), 'large');
  const contrast = toggle(t('settings.highContrast'), 'contrast');
  function go(): void {
    const url = new URL(location.href);
    url.searchParams.set('scene', pick.value);
    url.searchParams.set('large', large.c.checked ? '1' : '0');
    url.searchParams.set('contrast', contrast.c.checked ? '1' : '0');
    location.replace(url);
  }
  pick.addEventListener('change', go);
  const back = document.createElement('a');
  back.href = '../../../visuallab.html';
  back.textContent = t('lab.backToLab');
  back.style.color = 'inherit';
  bar.append(pick, large.l, contrast.l, back);
  document.body.appendChild(bar);
}

/** A painted stand-in for the 3D cave so contrast and readability can be judged. */
function paintCave(canvas: HTMLCanvasElement): void {
  const w = (canvas.width = Math.max(1, Math.round(window.innerWidth / 2)));
  const hgt = (canvas.height = Math.max(1, Math.round(window.innerHeight / 2)));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const noise = new Noise(7);
  const sky = ctx.createLinearGradient(0, 0, 0, hgt);
  sky.addColorStop(0, '#070b12');
  sky.addColorStop(0.55, '#10233a');
  sky.addColorStop(1, '#070a10');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hgt);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow(w * 0.62, hgt * 0.58, hgt * 0.5, 'rgba(60,110,170,0.35)');
  // Rock layers: ceiling and floor silhouettes with blocky, voxel-like steps.
  for (const [base, amp, color, dir] of [
    [0.16, 0.12, '#141a24', 1],
    [0.8, 0.14, '#121821', -1],
    [0.9, 0.08, '#0b0f15', -1],
  ] as Array<[number, number, string, number]>) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, dir > 0 ? 0 : hgt);
    const step = Math.max(4, Math.round(w / 48));
    for (let x = 0; x <= w; x += step) {
      const y = (base + noise.fbm2(x / w * 4, base * 9, 3) * amp) * hgt;
      ctx.lineTo(x, Math.round(y / step) * step);
      ctx.lineTo(x + step, Math.round(y / step) * step);
    }
    ctx.lineTo(w, dir > 0 ? 0 : hgt);
    ctx.fill();
  }
  glow(w * 0.3, hgt * 0.72, hgt * 0.32, 'rgba(255,170,90,0.4)');
  for (let i = 0; i < 9; i++) {
    const x = w * (0.55 + 0.4 * Math.abs(noise.noise2(i * 3.1, 0.5)));
    const y = hgt * (0.62 + 0.3 * Math.abs(noise.noise2(i * 1.7, 2.5)));
    glow(x, y, hgt * 0.05, 'rgba(95,240,255,0.55)');
  }
}
