import { STRATUM_TOP_Y, stratumDef, type StratumIndex } from '../config/biomes';
import { STRATA_GEN, WORLD, setDepthOffset, worldGen } from '../config/balance';
import { ITEMS, type ItemId } from '../config/items';
import { hash32 } from '../core/math';
import { t } from '../i18n';
import { createNewSave } from '../save/saveData';
import type { SaveSystem } from '../save/SaveSystem';
import type { SaveData } from '../save/types';
import { isStratumLayout } from '../world/gen/strata/types';
import type { Game } from './Game';
import { StratumManager, type StrataSave } from './Stratum';
import { installStratumDebug } from './StratumDebug';

/**
 * Round 3 (WORLD): the glue between Game and the strata, so Game.ts carries one-line calls in its
 * WORLD blocks: which stratum boots, the manager and its host, New Game / Continue / save, the
 * per-frame update and the systems refreshed after each switch.
 */

/** A fresh random expedition seed (32 bits, never 0). */
export function rollSeed(): number {
  const a = new Uint32Array(1);
  try {
    crypto.getRandomValues(a);
  } catch {
    a[0] = (Math.random() * 0xffffffff) >>> 0;
  }
  return a[0] || 0x5eed;
}

/** What the game boots into: the saved expedition's stratum (so Continue is quick), else a new seed. */
export function bootStrata(saves: SaveSystem): { seed: number; stratum: StratumIndex } {
  if (worldGen() !== 'strata') return { seed: 0, stratum: 1 };
  try {
    const res = saves.load();
    const data = res.data as SaveData | null;
    const st = data?.strata;
    if (data && !data.changed && st && Number.isFinite(st.seed)) return { seed: st.seed >>> 0, stratum: st.current };
  } catch {
    // A save we cannot read: boot a new expedition (Continue reports the problem).
  }
  return { seed: rollSeed(), stratum: 1 };
}

/** True until an expedition starts: the booted stratum I is still pristine and its seed unused. */
let bootFresh = true;

/** The manager, with its host over the game (loading screen, placing the explorer). */
export function createStrata(game: Game, seed: number): StratumManager {
  const strata = new StratumManager(
    {
      get session() {
        return game.session;
      },
      bus: game.bus,
      loading: (p, label) => {
        if (p === null) {
          if (game.mode === 'playing' || game.mode === 'paused') game.ui.showScreen('none');
          return;
        }
        if (game.ui.screen !== 'loading') game.ui.showScreen('loading');
        game.ui.setLoading(p, label ?? '');
      },
      placeExplorer: (x, y, z, yaw) => {
        game.player.teleport(x, y, z, yaw);
        game.cameraRig.yaw = yaw + Math.PI;
        game.cameraRig.snapTo(x, y + 1.62, z);
      },
      announce: (n) => {
        if (game.mode === 'playing') game.ui.showDiscovery(n);
      },
    },
    seed,
  );
  // After every switch: the depth readout, the world features, the walking fields, the creatures put
  // away (the new stratum's spawn on their own; the bestiary and the beaten guardians stay).
  strata.onEnter(({ stratum }) => {
    setDepthOffset(stratumDef(stratum).depthTop + STRATUM_TOP_Y);
    game.features.attach([...game.session.removedProps]);
    const l = game.session.layout;
    const p = game.player;
    const atCamp = p.x >= l.camp.min[0] && p.x <= l.camp.max[0] && p.y >= l.camp.min[1] && p.y <= l.camp.max[1] && p.z >= l.camp.min[2] && p.z <= l.camp.max[2];
    game.progression.attachWorld(atCamp);
    game.mobs?.clear();
    game.markHalosDirty();
  });
  if (isStratumLayout(game.session.layout)) {
    strata.current = game.session.layout.stratum;
    setDepthOffset(stratumDef(strata.current).depthTop + STRATUM_TOP_Y);
    strata.adoptBooted();
  }
  installStratumDebug({
    get session() {
      return game.session;
    },
    strata,
    get player() {
      return game.player;
    },
    teleport: (x, y, z, yaw) => {
      game.player.teleport(x, y, z, yaw);
      if (yaw !== undefined) game.cameraRig.yaw = yaw + Math.PI;
      game.cameraRig.snapTo(x, y + 1.62, z);
    },
  });
  return strata;
}

/**
 * New Game: a new expedition from stratum I, with the seed given (typed on New Game), else the one the
 * boot rolled while it is still unused (its stratum I is already generated: no wait), else a fresh one.
 * (Game.newGame starts the creatures' book over: MOBS' block.)
 */
export async function newExpedition(game: Game, seed?: number): Promise<void> {
  if (worldGen() !== 'strata' || !game.strata) {
    await game.session.reset();
    return;
  }
  const st = game.strata;
  const booted = bootFresh && st.current === 1 && isStratumLayout(game.session.layout) && game.session.layout.expeditionSeed === st.seed;
  const s = seed ?? (booted ? st.seed : rollSeed());
  bootFresh = false;
  if (s === st.seed && st.current === 1 && isStratumLayout(game.session.layout) && game.session.layout.expeditionSeed === s) {
    // This seed's stratum I is loaded: restore it pristine (no regeneration).
    st.reset(s);
    await game.session.reset();
    st.adoptBooted();
    return;
  }
  st.reset(s);
  await st.enter(1);
}

/**
 * Continue: the save's expedition, its stratum and that stratum's edits (the booted stratum is reused
 * when it is the save's; MOBS' block restores the bestiary). A new expedition made from a 1.x save
 * (`fresh`) wakes at the stratum's arrival; a save from another strata generator wakes there too.
 * False: not a strata save (the old world restores its own edits).
 */
export async function continueExpedition(game: Game, data: SaveData): Promise<boolean> {
  const save = data.strata;
  if (worldGen() !== 'strata' || !game.strata || !save) return false;
  bootFresh = false;
  const st = game.strata;
  const same = st.fromSave(save);
  const wake = save.fresh || !same ? 'arrival' : ([data.player.x, data.player.y, data.player.z] as [number, number, number]);
  await st.resume(save.current, wake);
  if (wake === 'arrival') {
    // restoreProgress puts the explorer at data.player: point it at the arrival.
    const a = st.layout!.arrival;
    data.player = { ...data.player, x: a.x, y: a.y, z: a.z, yaw: a.yaw };
  }
  return true;
}

/** The starter gift of an explorer whose 1.x deep has changed (the camp's welcome to the new strata). */
export const CHANGED_GIFT: Partial<Record<ItemId, number>> = { torch: 12, bandage: 3, oilFlask: 2, flare: 2, healingDraught: 1 };

/**
 * A save from another world (a 1.x save, marked `changed` by the v3 -> v4 migration, or a save with no
 * strata part): on Continue, one calm card, "The deep has changed. A new expedition begins." Begin turns
 * the save into a new expedition (a seed from the old save, stratum I) that keeps the feats, the
 * lifetime counters, the records, the stats and the play time, with a starter gift in the pack; Back
 * leaves everything as it was. Returns true when the card is showing (Continue stops there).
 */
export function deepChanged(game: Game, data: SaveData): boolean {
  if (worldGen() !== 'strata' || (!data.changed && data.strata)) return false;
  if (changedAccepted) {
    changedAccepted = false;
    const fresh = freshFromOld(data);
    // The new expedition is the save from now on (a quit while it loads continues it, no second card).
    game.saves.save(fresh);
    for (const k of Object.keys(data)) delete (data as unknown as Record<string, unknown>)[k];
    Object.assign(data, fresh);
    return false;
  }
  game.ui.showScreen('confirm', {
    confirm: {
      text: `${t('save.changed.title')}. ${t('save.changed.body')}`,
      yes: t('save.changed.ok'),
      no: t('menu.back'),
      onYes: () => {
        changedAccepted = true;
        void game.continueGame();
      },
    },
  });
  return true;
}
let changedAccepted = false;

/** A new expedition keeping an old save's feats, lifetime counters, records, stats and play time. */
export function freshFromOld(old: SaveData): SaveData {
  const seed = (hash32((old.savedAt >>> 0) ^ Math.imul(old.worldSeed >>> 0, 0x9e3779b1)) >>> 0) || 0x5eed;
  const d = createNewSave({ x: 0, y: 0, z: 0, yaw: 0 }, WORLD.seed, Date.now());
  d.playTime = old.playTime;
  d.stats = { ...old.stats };
  d.progression.feats = [...old.progression.feats];
  d.progression.life = { ...old.progression.life, firsts: [...(old.progression.life.firsts ?? [])] };
  d.progression.records = { ...old.progression.records };
  let slot = 0;
  for (const [item, n] of Object.entries(CHANGED_GIFT) as Array<[ItemId, number]>) {
    if (!(item in ITEMS) || slot >= d.backpack.length) continue;
    d.backpack[slot++] = { item, count: Math.min(n, ITEMS[item].stackSize) };
  }
  d.strata = { seed, current: 1, deepest: 1, strata: {}, outposts: [], shards: [], gen: STRATA_GEN.genVersion, fresh: true };
  return d;
}

/**
 * The save's world part (save v4): the strata (each stratum's edits live in its slice, so the top-level
 * edits stay empty). Spread over the save in Game.buildSave; {} in the old world. (MOBS saves `mobs`.)
 */
export function strataSaveParts(game: Game): Pick<SaveData, 'strata' | 'worldEdits' | 'removedProps'> | Record<string, never> {
  if (worldGen() !== 'strata' || !game.strata?.layout) return {};
  return { strata: game.strata.toSave(), worldEdits: [], removedProps: [] };
}

/** The save's strata part alone (tests, tools), or undefined in the old world. */
export function strataSave(game: Game): StrataSave | undefined {
  return worldGen() === 'strata' && game.strata?.layout ? game.strata.toSave() : undefined;
}
