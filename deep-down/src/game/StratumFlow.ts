import { STRATUM_TOP_Y, stratumDef, type StratumIndex } from '../config/biomes';
import { setDepthOffset, worldGen } from '../config/balance';
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
    const st = (res.data as (SaveData & { strata?: StrataSave }) | null)?.strata;
    if (st && Number.isFinite(st.seed)) return { seed: st.seed >>> 0, stratum: st.current };
  } catch {
    // A save we cannot read: boot a new expedition (Continue reports the problem).
  }
  return { seed: rollSeed(), stratum: 1 };
}

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
    },
    seed,
  );
  // After every switch: the depth readout, the world features, the walking fields, the creatures.
  strata.onEnter(({ stratum }) => {
    setDepthOffset(stratumDef(stratum).depthTop + STRATUM_TOP_Y);
    game.features.attach([...game.session.removedProps]);
    const l = game.session.layout;
    const p = game.player;
    const atCamp = p.x >= l.camp.min[0] && p.x <= l.camp.max[0] && p.y >= l.camp.min[1] && p.y <= l.camp.max[1] && p.z >= l.camp.min[2] && p.z <= l.camp.max[2];
    game.progression.attachWorld(atCamp);
    game.mobs?.reset();
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
    teleport: (x, y, z, yaw) => game.player.teleport(x, y, z, yaw),
  });
  return strata;
}

/** New Game: a new expedition (the seed given, or a fresh one) from stratum I. */
export async function newExpedition(game: Game, seed?: number): Promise<void> {
  if (worldGen() !== 'strata' || !game.strata) {
    await game.session.reset();
    return;
  }
  const s = seed ?? rollSeed();
  const st = game.strata;
  if (s === st.seed && st.current === 1 && isStratumLayout(game.session.layout)) {
    // The booted stratum I of this seed: restore it pristine (no regeneration).
    st.reset(s);
    await game.session.reset();
    st.adoptBooted();
    return;
  }
  st.reset(s);
  await st.enter(1);
}

/** Continue: the save's expedition, its stratum and that stratum's edits. False: not a strata save. */
export async function continueExpedition(game: Game, data: SaveData): Promise<boolean> {
  const save = (data as SaveData & { strata?: StrataSave }).strata;
  if (worldGen() !== 'strata' || !game.strata || !save) return false;
  const st = game.strata;
  st.fromSave(save);
  await st.enter(save.current, [data.player.x, data.player.y, data.player.z]);
  return true;
}

/** The save's world part (save v4), or undefined in the old world. */
export function strataSave(game: Game): StrataSave | undefined {
  return worldGen() === 'strata' && game.strata?.layout ? game.strata.toSave() : undefined;
}
