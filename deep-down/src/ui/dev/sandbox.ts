import { r3HudDefaults } from '../hud/hudDefaults';
import { fixtureBestiary, fixtureDaily, fixtureEnding, fixtureLoop, fixtureMap, fixtureQuests, fixtureTrip, guardianName } from './r3fixtures';
import { BIOMES, stratumDef } from '../../config/biomes';
import { arrivalCard } from '../../game/quests/Guide';
import { ITEMS, ITEM_IDS, type ItemId } from '../../config/items';
import { NODES, type NodeId, type Place } from '../../config/recipes';
import { RUNES_BY_GLYPH, RUNE_GLYPH } from '../../config/runes';
import { EventBus, type GameEvents } from '../../core/events';
import { Noise } from '../../core/noise';
import { craft as craftNode, type CraftContext } from '../../gameplay/Crafting';
import { DISCOVERIES } from '../../gameplay/discoveries';
import { buildFeatsView, NO_LIFE } from '../../gameplay/Feats';
import { Equipment } from '../../gameplay/Equipment';
import { Backpack } from '../../gameplay/Inventory';
import { CampStorage } from '../../gameplay/Storage';
import { buildTreeView, closestNode } from '../../gameplay/Tree';
import { hasText, onLanguage, t, type TextKey } from '../../i18n';
import { consumeEdges, createInputState } from '../../input/types';
import { DEFAULT_SETTINGS, type ItemCounts, type Settings } from '../../save/types';
import type { ExpeditionReport, HudState, InventoryView, JournalTab, JournalView, SaveSummary, ScreenId, SurveyView, UiActions } from '../types';
import { UI } from '../UI';
import { DEFAULT_CONTROL_PREFS, type ControlPrefs } from '../controlPrefs';

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

/** The fake game's camp: the real pack, storage and tree rules (gameplay/Crafting, gameplay/Tree). */
const camp = {
  backpack: new Backpack(6),
  storage: new CampStorage(),
  equipment: new Equipment(),
  built: new Set<string>(),
  atCamp: true,
  rift: false,
  /** Discoveries and runes found (journal fixtures). */
  found: new Set<string>(['crystals', 'hollow', 'tablet', 'note.office']),
  runes: new Set<string>(['runeDescent', 'ancientTablet']),
  treeFocus: 'workbench' as Place,
  journalFocus: 'discoveries' as JournalTab,
  target: null as string | null,
  finale: false,
};

function resetCamp(): void {
  camp.backpack = new Backpack(6);
  for (const [id, n] of [['stone', 14], ['copperOre', 5], ['glimmerShard', 2]] as Array<[ItemId, number]>) camp.backpack.add(id, n);
  camp.storage = new CampStorage();
  camp.storage.add('stone', 22);
  camp.storage.add('copperOre', 4);
  camp.equipment = new Equipment();
  camp.built = new Set();
  camp.atCamp = true;
  camp.rift = false;
  camp.found = new Set(['crystals', 'hollow', 'tablet', 'note.office']);
  camp.runes = new Set(['runeDescent', 'ancientTablet']);
  camp.treeFocus = 'workbench';
  camp.journalFocus = 'discoveries';
  camp.target = null;
  camp.finale = false;
}
resetCamp();

const ctx = (): CraftContext => ({
  backpack: camp.backpack,
  storage: camp.storage,
  equipment: camp.equipment,
  built: camp.built,
  atCamp: camp.atCamp,
  rift: camp.rift,
  rune: camp.runes.size > 0,
});

function available(): ItemCounts {
  const out: ItemCounts = {};
  for (const id of ITEM_IDS) {
    const n = camp.backpack.count(id) + camp.storage.count(id);
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Zones of the fixture journal (the real game derives them from the layout). */
const ZONE: Record<string, string> = {
  crystals: 'office', hollow: 'hall', shrine: 'hall', tablet: 'hall', gate: 'hall', ironVein: 'yard', mothGrotto: 'grotto', hoist: 'yard',
  reliquary: 'reliquary', lampGallery: 'gallery', undercroft: 'rift', monolith: 'rift',
};
const ZONES = ['office', 'grotto', 'hall', 'yard', 'reliquary', 'gallery', 'rift'];

function journalView(): JournalView {
  const discoveries = DISCOVERIES.map((d, i) => {
    const found = camp.found.has(d.id);
    const zone = d.log ? 'logs' : ZONE[d.id] ?? 'hall';
    return {
      id: d.id,
      title: hasText(`discovery.${d.id}.title`) ? t(`discovery.${d.id}.title` as TextKey) : d.id,
      body: hasText(`discovery.${d.id}.body`) ? t(`discovery.${d.id}.body` as TextKey) : '',
      found,
      hint: t(`area.${zone === 'logs' ? 'office' : zone}` as TextKey),
      major: d.major,
      log: d.log === true,
      zone,
      zoneName: t(`area.${zone === 'logs' ? 'office' : zone}` as TextKey),
      expedition: found ? 1 + (i % 3) : null,
      depth: found ? 40 + i * 7 : null,
    };
  });
  const zones = ZONES.map((id) => {
    const list = discoveries.filter((e) => e.zone === id);
    return { id, name: t(`area.${id}` as TextKey), found: list.filter((e) => e.found).length, total: list.length };
  });
  const runes = RUNES_BY_GLYPH.map((item, i) => ({
    item,
    glyph: RUNE_GLYPH[item] ?? i,
    name: t(ITEMS[item].name),
    line: t(ITEMS[item].desc),
    found: camp.runes.has(item),
    hint: t(`area.${ZONES[i % ZONES.length]}` as TextKey),
    expedition: camp.runes.has(item) ? i + 1 : null,
    depth: camp.runes.has(item) ? 30 + i * 12 : null,
  }));
  return {
    discoveries,
    zones,
    found: discoveries.filter((e) => e.found).length,
    total: discoveries.length,
    runes,
    runesFound: runes.filter((r) => r.found).length,
    runesTotal: runes.length,
    relics: [
      { id: 'reliquary', title: t('discovery.reliquary.title'), body: t('discovery.reliquary.body'), found: camp.found.has('reliquary') },
      { id: 'gallery', title: t('discovery.lampGallery.title'), body: t('discovery.lampGallery.body'), found: camp.found.has('lampGallery') },
    ],
    feats: buildFeatsView(
      new Set(['firstStone', 'firstCopper', 'firstGlimmer', 'depth50', 'mined100', 'caches3']),
      { ...NO_LIFE, blocksMined: 212, oreMined: 41, itemsBanked: 180, caches: 4, secrets: 1, walked: 2310 },
      { expeditions: 7, deepest: 96, blackouts: 1 },
      (item) => t(ITEMS[item].name),
    ),
    ending: { reached: camp.finale, expeditions: 14, deepest: 144, playTime: 4210, answer: t('discovery.monolith.title') },
    focus: camp.journalFocus,
  };
}

function surveyView(): SurveyView {
  const rumours: SurveyView['rumours'] = [
    { id: 'live.adit', kind: 'living', area: 'adit', areaName: t('area.adit'), text: `${t('item.copperOre')} · ${t('item.ironOre')} — ${t('area.adit')}`, ore: [{ item: 'copperOre', count: 6 }, { item: 'ironOre', count: 3 }], distance: 61, present: true, target: false },
    { id: 'bloom.gallery', kind: 'bloom', area: 'gallery', areaName: t('area.gallery'), text: `${t('item.glimmerShard')} — ${t('area.gallery')}`, ore: [{ item: 'glimmerShard', count: 5 }], distance: 112, present: true, target: false },
    { id: 'live.yard', kind: 'living', area: 'yard', areaName: t('area.yard'), text: `${t('item.copperOre')} — ${t('area.yard')}`, ore: [{ item: 'copperOre', count: 4 }], distance: 38, present: false, target: false },
  ];
  for (const r of rumours) r.target = r.id === camp.target;
  return { records: { deepest: 96, biggestHaul: 47, expeditions: 7, blackouts: 1, bestStreak: 5, streak: 3 }, day: 6, rumours, target: camp.target, built: true };
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
  showCrosshair: true,
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
  ...r3HudDefaults(),
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
  feats: [t('feat.firstCopper.name'), t('feat.depth50.name')],
  caches: 2,
  secrets: 1,
  show: true,
  next: { id: 'copperPickaxe', name: t('recipe.copperPickaxe'), cost: [{ item: 'copperOre', have: 9, need: 8 }, { item: 'stone', have: 53, need: 12 }], ready: true },
  craftableNow: true,
  overnight: {
    day: 3,
    cells: 40,
    regrown: 14,
    rumours: [
      { id: 'live.adit', kind: 'living', area: 'adit', text: `${t('item.copperOre')} · ${t('item.ironOre')} — ${t('area.adit')} — 61 m`, distance: 61 },
      { id: 'bloom.gallery', kind: 'bloom', area: 'gallery', text: `${t('item.glimmerShard')} — ${t('area.gallery')} — 112 m`, distance: 112 },
    ],
  },
};
/** The black-out variant: the pack waits at -84 m, an older pack was lost. */
const blackoutReport: ExpeditionReport = {
  ...report,
  n: 4,
  outcome: 'blackout',
  duration: 371,
  deepest: 84,
  newBest: false,
  banked: {},
  bankedTotal: 0,
  cached: { stone: 6, copperOre: 3, glimmerShard: 1 },
  cacheDepth: 84,
  lostCount: 12,
  fuelLeft: 0,
  damage: 100,
  discoveries: ['gate'],
  runes: ['runeEye'],
  records: [],
  next: { id: 'sturdyPack', name: t('recipe.sturdyPack'), cost: [{ item: 'stone', have: 22, need: 16 }, { item: 'copperOre', have: 4, need: 4 }, { item: 'rootFibre', have: 1, need: 4 }], ready: false },
  craftableNow: false,
  overnight: null,
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
  craft: (id: NodeId) => {
    const res = craftNode(id, ctx());
    if (!res.ok) {
      bus.emit('craft:failed', { recipe: id, reason: res.reason });
      return;
    }
    const r = NODES[id].result;
    if (r.kind !== 'equip') camp.built.add(id);
    bus.emit('craft:done', { recipe: id });
    bus.emit('inventory:changed', {});
    ui.toast(t(r.kind === 'station' ? 'toast.built' : 'toast.made', { item: t(NODES[id].name) }), 'good');
  },
  openInventory: () => ui.showScreen('inventory'),
  openCrafting: (place?: Place) => {
    camp.treeFocus = place ?? 'workbench';
    ui.showScreen('crafting');
  },
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
    backpack: camp.backpack.toJSON(),
    storage: camp.storage.toJSON(),
    equipment: { ...camp.equipment.tiers },
    journal: [...camp.found, ...camp.runes],
    available: available(),
    atCamp: camp.atCamp,
    pouchSlots: camp.backpack.pouchSlots,
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
          equipment: { ...camp.equipment.tiers },
          cacheWaiting: false,
        },
  getReport: () => reportOpen,
  dismissReport: () => {
    reportOpen = null;
  },
  getCraftTree: () => buildTreeView(ctx(), { focus: camp.treeFocus, next: closestNode(ctx())?.id ?? null }),
  openBoard: () => ui.showScreen('board'),
  getSurvey: () => surveyView(),
  setCompassTarget: (id) => {
    camp.target = id;
    ui.toast(id ? t('toast.targetSet', { area: surveyView().rumours.find((r) => r.id === id)?.areaName ?? '' }) : t('toast.targetCleared'), 'info');
  },
  openJournal: (tab?: JournalTab) => {
    camp.journalFocus = tab ?? 'discoveries';
    ui.showScreen('journal');
  },
  getJournal: () => journalView(),
  openAbout: () => ui.showScreen('about'),
  continueAfterEnding: () => {
    mode = 'playing';
    ui.showScreen('none');
  },
  dropStack: (slot: number) => {
    camp.backpack.dropStack(slot);
    bus.emit('inventory:changed', {});
  },
  // Round 3: the strata game's menus over the fixtures (ui/dev/r3fixtures: LOOP's real craft rules
  // and hotbar, MOBS's real bestiary log, a painted stratum for the Map).
  loop: () => loop3,
  openMenu: (screen) => ui.showScreen(screen === 'pause' ? 'pause' : screen),
  getMap: () => map3,
  fastTravel: (id) => {
    ui.showScreen('none');
    ui.toast(t('ctl.travelled'), 'good');
    void id;
  },
  getQuests: () => ({ ...quests3, tracked: tracked3 }),
  trackQuest: (id) => {
    tracked3 = id;
  },
  getBestiary: () => fixtureBestiary(),
  skipTutorial: () => {
    hud.tutorial = null;
  },
  getSeed: () => '48151623',
  getControlPrefs: () => ({ ...prefs3 }),
  setControlPrefs: (p) => {
    prefs3 = { ...prefs3, ...p };
    ui.setControlPrefs(prefs3);
  },
  // The first version's report scene ('summary') runs as the hand-made world did.
  strata: () => !legacyScene,
  daily: () => fixtureDaily(),
  newDaily: () => startPlaying(),
  endingView: () => fixtureEnding(),
};
const loop3 = fixtureLoop(bus);
// Built again on a language switch (they hold text: the map's header, the tracker's lines).
let map3 = fixtureMap();
let quests3 = fixtureQuests();
onLanguage(() => {
  map3 = fixtureMap();
  quests3 = fixtureQuests();
  r3Hud();
});
let tracked3: string | null = 'order.1';
let legacyScene = false;
let prefs3: ControlPrefs = { ...DEFAULT_CONTROL_PREFS };

/** The round 3 HUD fields of the fixture expedition (stratum I, the tracker on the second guardian). */
function r3Hud(): void {
  Object.assign(hud, {
    biomeName: t(BIOMES.amberHollows.name),
    stratum: 1,
    depth: 38,
    reticle: 'mine',
    reticleProgress: 0.45,
    reticleName: t('block.copperOre'),
    tracker: { main: { id: quests3.current.id, text: quests3.current.text, have: 1, need: 2 }, side: { id: 'order.1', text: quests3.orders[0].text, have: 4, need: 8 } },
    objectiveArrow: { bearing: 0.7, distance: 46, vertical: -1 },
    guardian: null,
    hazard: null,
    companion: { name: t('mob.lampling' as TextKey), level: 2, progress: 0.4, state: 'follow', glow: 0.6 },
    interact: null,
    tutorial: null,
  });
}
r3Hud();

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
const seen = { jump: 0, interact: 0, inventory: 0, pause: 0, lookDX: 0, lookDY: 0, maxMoveY: 0, miningFrames: 0, taps: 0, tapX: 0, tapY: 0, locks: 0, action: 0, actionFrames: 0, dash: 0, sonar: 0, place: 0, hotbar: -1, open: '', sprintFrames: 0 };

function frame(): void {
  if (mode === 'playing') {
    hud.backpackUsed = camp.backpack.usedSlots;
    hud.backpackMax = camp.backpack.slotCount;
    // Round 3: the hotbar and the minimap from the fixtures.
    const hb = loop3.hotbarView();
    hud.hotbar = loop3.hudSlots();
    hud.hotbarSelected = hb.selected;
    hud.canPlace = hb.mode === 'place';
    ui.touch.setPlaceVisible?.(hud.canPlace);
    // The Interact chip: the round 3 view, else the first version's label (a station's).
    ui.touch.setInteract?.(hud.interact ?? (hud.interactLabel ? { icon: 'station', verb: t('ctl.verb.craft'), label: hud.interactLabel } : null));
    ui.setMap(map3.source);
    if (input.hotbarPressed >= 0) loop3.selectHotbar(input.hotbarPressed);
    ui.setHud(hud);
    if (input.jumpPressed) seen.jump++;
    if (input.interactPressed) seen.interact++;
    if (input.inventoryPressed) seen.inventory++;
    if (input.pausePressed) seen.pause++;
    if (input.mining) seen.miningFrames++;
    if (input.tapPressed) {
      seen.taps++;
      seen.tapX = input.tapX;
      seen.tapY = input.tapY;
    }
    if (input.lockAssistPressed) seen.locks++;
    // Round 3: the right-thumb pads, the hotbar and the menu requests.
    if (input.actionPressed) seen.action++;
    if (input.actionHeld) seen.actionFrames++;
    if (input.dashPressed) seen.dash++;
    if (input.sonarPressed) seen.sonar++;
    if (input.placePressed) seen.place++;
    if (input.sprint) seen.sprintFrames++;
    if (input.hotbarPressed >= 0) seen.hotbar = input.hotbarPressed;
    if (input.openRequest) seen.open = input.openRequest;
    seen.lookDX += input.lookDX;
    seen.lookDY += input.lookDY;
    seen.maxMoveY = Math.max(seen.maxMoveY, input.moveY);
    if (!ui.isBlockingInput()) {
      if (input.pausePressed) actions.pause();
      else if (input.inventoryPressed) actions.openInventory();
      else if (input.openRequest) actions.openMenu(input.openRequest);
      else if (input.interactPressed && (hud.interact || hud.interactLabel)) actions.openCrafting('workbench');
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
  resetCamp();
  r3Hud();
  ui.state.trip = null;
  ui.state.ending = null;
  legacyScene = id === 'summary';
  savedAt = Date.now() - 7 * 60_000;
  settings = { ...DEFAULT_SETTINGS };
  ui.applySettings(settings);
  const play = (screen: ScreenId = 'none') => {
    mode = screen === 'pause' ? 'paused' : 'playing';
    ui.setGameplayActive(screen !== 'death');
    ui.showScreen(screen);
  };
  switch (id) {
    // Round 3: the strata game's screens over the fixtures.
    case 'bag':
      play('inventory');
      ui.state.bagTab = 'all';
      ui.state.bagSel = arg === 'gear' ? 'copperPick' : 'torch';
      if (arg === 'assign') ui.state.assignSlot = 5;
      ui.refresh();
      break;
    case 'craft':
      if (arg === 'forge') {
        loop3.near.add('forge');
        ui.focusCraft('forge');
      }
      play('crafting');
      ui.state.craftTab = arg === 'forge' ? 'weapons' : 'building';
      ui.refresh();
      break;
    case 'map':
      play('map');
      break;
    case 'quests':
      play('quests');
      ui.state.questsTab = (arg as typeof ui.state.questsTab | undefined) ?? 'main';
      ui.refresh();
      break;
    case 'bestiary':
      play('bestiary');
      break;
    case 'trip':
      play();
      bus.emit('trip:summary', { summary: fixtureTrip(arg === 'blackout' ? 'blackout' : 'returned') });
      break;
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
      // "loading:descent" (or "loading:4"): a stratum's own load, labelled with its name as WORLD does.
      if (arg) ui.setLoading(0.62, t(stratumDef(arg === 'descent' ? 2 : Number(arg) || 2).name));
      else ui.setLoading(0.62, t('menu.loadingLight'));
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
        for (let i = camp.backpack.usedSlots; i < camp.backpack.slotCount; i++) camp.backpack.add(i % 2 ? 'rootFibre' : 'ironOre', 3);
        actions.updateSettings({ showFps: true });
        ui.hint(t('hint.tooHard', { tool: t('equip.copperPickaxe') }), 60_000);
        ui.toast(t('hint.backpackFull'), 'warn');
        // Round 3: a guardian fight in the cold: its bar, the hazard meter, the reticle on the foe.
        Object.assign(hud, {
          reticle: 'attack',
          reticleName: null,
          hazard: { kind: 'cold', level: 0.64, warded: 0 },
          guardian: { name: guardianName('amberHollows'), hp: 380, max: 600, phase: 2, phases: 2 },
          interact: { icon: 'chest', verb: t('ctl.verb.open'), label: t('m3.map.m.chest') },
        });
        ui.damageNumber(0.56, 0.42, 12, 'hit');
        ui.damageNumber(0.6, 0.38, 24, 'weak');
        ui.damageNumber(0.5, 0.47, 3, 'guard');
      } else if (arg === 'tutorial') {
        hud.tutorial = { target: 'action', line: t('tut.mine' as TextKey), step: 3, total: 11 };
      } else if (arg === 'look') {
        hud.tutorial = { target: 'look', line: t('tut.look' as TextKey), step: 1, total: 11 };
      } else if (arg === 'arrival') {
        // LOOP's real card for a first visit (the tutorial's bubble steps aside for it).
        hud.tutorial = { target: 'action', line: t('tut.mine' as TextKey), step: 3, total: 11 };
        ui.arrival(arrivalCard('mushroomForest', true));
      } else {
        ui.pickup({ item: 'copperOre', count: 1 });
        ui.pickup({ item: 'copperOre', count: 1 });
        ui.pickup({ item: 'stone', count: 1 });
        ui.pickup({ item: 'glimmerShard', count: 2 });
        ui.hint(t('hint.mine'), 60_000);
        ui.toast(t('toast.banked', { count: 12 }), 'good');
      }
      break;
    case 'hud-wake':
      // A rune door waking under the lantern: the ring on the interact chip at 60 %.
      play();
      hud.target = null;
      bus.emit('world:runeWake', { id: 'reliquary', progress: 0.6 });
      window.setInterval(() => bus.emit('world:runeWake', { id: 'reliquary', progress: 0.6 }), 250);
      break;
    case 'discovery':
      play();
      hud.target = null;
      ui.showDiscovery({ id: 'hollow', title: t('discovery.hollow.title'), body: t('discovery.hollow.body'), index: 2, total: 6, major: true });
      break;
    case 'inventory':
      // 'pouch': the Expedition Pack, its last two slots the Sealed Pouch (one holds glimmer).
      if (arg === 'pouch') {
        camp.equipment = new Equipment({ pickaxe: 3, lantern: 2, pack: 3 });
        camp.backpack = Backpack.fromJSON([{ item: 'stone', count: 30 }, { item: 'ironOre', count: 6 }, { item: 'copperOre', count: 9 }, { item: 'rootFibre', count: 7 }, null, null, null, null, { item: 'glimmerShard', count: 4 }, null], 10, 2);
      }
      play('inventory');
      ui.state.invTab = arg && arg !== 'pouch' ? (arg as typeof ui.state.invTab) : 'backpack';
      ui.state.invSlot = 0;
      ui.refresh();
      break;
    case 'crafting':
      // The tree at three moments: the first craft (default), mid-game (tree), and the Forge.
      if (arg === 'tree' || arg === 'forge') {
        camp.equipment = new Equipment({ pickaxe: 2, lantern: 1, pack: 2 });
        camp.backpack.resize(8);
        camp.built = new Set(['surveyTable', 'relicShelf', ...(arg === 'forge' ? ['forge'] : [])]);
        camp.storage = new CampStorage();
        for (const [id, n] of [['stone', 60], ['copperOre', 11], ['ironOre', arg === 'forge' ? 9 : 2], ['rootFibre', 5], ['glimmerShard', 4]] as Array<[ItemId, number]>) camp.storage.add(id, n);
        camp.treeFocus = arg === 'forge' ? 'forge' : 'workbench';
      } else {
        camp.storage = new CampStorage();
        camp.storage.add('stone', 20);
        camp.storage.add('copperOre', 4);
        camp.equipment = new Equipment({ pickaxe: 1, lantern: 1, pack: 2 });
        camp.backpack.resize(8);
      }
      play('crafting');
      break;
    case 'summary':
      // Through the real flow: the trip ends, the report opens (a black-out waits for the respawn).
      reportOpen = arg === 'blackout' ? blackoutReport : report;
      play();
      bus.emit('expedition:ended', { report: reportOpen });
      if (arg === 'blackout') bus.emit('player:respawned', {});
      break;
    case 'board':
      camp.target = 'live.adit';
      play('board');
      break;
    case 'journal':
      camp.found = new Set(['crystals', 'hollow', 'shrine', 'tablet', 'gate', 'mothGrotto', 'note.office', 'note.landing', 'reliquary']);
      camp.runes = new Set(['runeDescent', 'runeEye', 'ancientTablet', 'runeStar', 'runeSpire']);
      camp.journalFocus = (arg as JournalTab | undefined) ?? 'discoveries';
      play('journal');
      break;
    case 'ending':
      camp.finale = true;
      // Round 3: the strata's end card (the first version's with ':legacy').
      if (arg !== 'legacy') ui.state.ending = fixtureEnding();
      play('ending');
      break;
    case 'about':
      play('pause');
      ui.showScreen('settings');
      ui.showScreen('about');
      if (arg) {
        ui.state.aboutTab = arg as typeof ui.state.aboutTab;
        ui.refresh();
      }
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
      reportOpen = blackoutReport;
      // Round 3: the black-out card's story (what did it, where, where the explorer wakes).
      ui.showDeath({ stone: 6, copperOre: 3, glimmerShard: 1 }, arg === 'legacy' ? undefined : { cause: t('bo3.cause.mob', { name: t('mob.gritBoar' as TextKey) }), depth: 62, biome: t(BIOMES.amberHollows.name), stratum: 1, wake: t('bo3.wakeCamp') });
      break;
  }
}

paintCave(document.getElementById('game') as HTMLCanvasElement);

Object.assign(window, { __UI__: { ui, input, bus, actions, hud, camp, seen, scene, settings: () => settings } });
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
    ['crafting:tree', 'lab.scene.tree'], ['crafting:forge', 'lab.scene.forge'], ['summary', 'lab.scene.report'], ['summary:blackout', 'lab.scene.reportBlackout'],
    ['board', 'lab.scene.board'], ['journal:discoveries', 'lab.scene.journalDiscoveries'], ['journal:runes', 'lab.scene.journalRunes'], ['ending', 'lab.scene.ending'], ['about', 'lab.scene.about'],
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
