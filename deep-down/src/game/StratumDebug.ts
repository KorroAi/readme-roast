import { BIOMES, BIOME_IDS, type BiomeId } from '../config/biomes';
import { debugMutationsAllowed } from '../debug/DebugApi';
import { standable } from '../world/analysis/reachability';
import type { StratumManager } from './Stratum';
import type { WorldSession } from './WorldSession';

/** What the hooks need from the game. */
export interface StratumDebugHost {
  readonly session: WorldSession;
  readonly strata: StratumManager;
  player: { x: number; y: number; z: number };
  teleport(x: number, y: number, z: number, yaw?: number): void;
}

/**
 * window.__DD__ world hooks (round 3, WORLD; BRIEF §2): reading is always allowed, moving and switching
 * only under automation or ?debug=1.
 * - `stratum(n?)`: the current stratum, or switch to n (resolves when loaded).
 * - `biomeHere()`: the biome under the explorer.
 * - `goto(biomeId | 'lair' | 'gate' | 'camp' | 'arrival', which?)`: teleport to a standable spot in that
 *   biome (switching stratum when needed), to the nearest (or `which`) lair's entrance, the gate's stand.
 * - `seed(n?)`: the expedition seed, or start a new expedition with seed n (stratum I).
 * - `strata()`: the loaded stratum's layout summary (lairs, gate, pages, chests, stats).
 */
export function installStratumDebug(game: StratumDebugHost): void {
  const w = window as unknown as { __DD__?: Record<string, unknown> };
  if (!w.__DD__) return;
  const allowed = debugMutationsAllowed();
  const s = () => game.strata;
  const layout = () => s().layout;

  /** A standable cell near (x, z) in biome b (spiral search over the region map). */
  const spotIn = (b: BiomeId): [number, number, number] | null => {
    const l = layout();
    if (!l) return null;
    const world = game.session.world;
    const cands: Array<[number, number, number]> = [];
    // Prefer the biome's caverns and outpost sites (open, safe ground), then any floor in it.
    for (const c of l.caverns) if (c.biome === b) cands.push(c.centre);
    for (const o of l.outpostSites) if (o.biome === b) cands.push(o.p);
    for (const p of l.spawnPoints) if (p.biome === b) cands.push(p.p);
    for (const c of cands) {
      const x = Math.floor(c[0]);
      const z = Math.floor(c[2]);
      for (let dy = 0; dy < 12; dy++) for (const y of [Math.floor(c[1]) + dy, Math.floor(c[1]) - dy]) if (standable(world, x, y, z) && l.biomeAt(x, y, z) === b) return [x + 0.5, y, z + 0.5];
    }
    return null;
  };

  const api = {
    stratum: (n?: number): number | Promise<number> => {
      if (n === undefined || !allowed) return s().current;
      return s().enter(n).then(() => s().current);
    },
    biomeHere: (): BiomeId | null => layout()?.biomeAt(game.player.x, game.player.y, game.player.z) ?? null,
    goto: async (where: BiomeId | 'lair' | 'gate' | 'camp' | 'arrival', which?: string): Promise<[number, number, number] | null> => {
      if (!allowed) return null;
      let l = layout();
      if (!l) return null;
      if ((BIOME_IDS as readonly string[]).includes(where)) {
        const b = where as BiomeId;
        const st = BIOMES[b].stratum;
        if (st !== s().current) {
          await s().enter(st);
          l = layout()!;
        }
        if (b === 'heart' && l.heart) {
          game.teleport(...l.heart.spawn);
          return l.heart.spawn;
        }
        const p = spotIn(b);
        if (p) game.teleport(...p);
        return p;
      }
      if (where === 'lair') {
        const px = game.player.x;
        const pz = game.player.z;
        const lair = which ? l.lairs.find((a) => a.id === which || a.biome === which) : [...l.lairs].sort((a, b) => Math.hypot(a.centre[0] - px, a.centre[2] - pz) - Math.hypot(b.centre[0] - px, b.centre[2] - pz))[0];
        if (!lair) return null;
        game.teleport(...lair.entrance);
        return lair.entrance;
      }
      if (where === 'gate') {
        game.teleport(...l.gate.stand);
        return l.gate.stand;
      }
      const a = l.arrival;
      game.teleport(a.x, a.y, a.z, a.yaw);
      return [a.x, a.y, a.z];
    },
    seed: (n?: number): number | Promise<number> => {
      if (n === undefined || !allowed) return s().seed;
      s().reset(n);
      return s().enter(1).then(() => s().seed);
    },
    strata: () => {
      const l = layout();
      if (!l) return null;
      return {
        stratum: l.stratum,
        seed: l.expeditionSeed,
        biomes: l.biomes,
        lairs: l.lairs,
        gate: l.gate,
        arrival: l.arrival,
        pages: l.pages,
        chests: l.chests.length,
        nests: l.nests.length,
        outpostSites: l.outpostSites,
        caverns: l.caverns,
        hazards: l.hazards,
        sites: l.sites,
        stats: l.stats,
        heart: l.heart,
        explored: s().map?.fraction() ?? 0,
      };
    },
    reveal: (id: string) => (allowed ? s().reveal(id, 'debug') : false),
    openGate: () => (allowed ? s().openGate() : false),
    descend: () => (allowed ? s().descend() : Promise.resolve(false)),
    ascend: () => (allowed ? s().ascend() : Promise.resolve(false)),
  };
  Object.assign(w.__DD__, api);
}
