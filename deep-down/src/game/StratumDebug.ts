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
    // Prefer the biome's caverns and outpost sites (open, safe ground), then any floor in it; never a
    // lair (its sleeping guardian would fill the view and wake: MOBS 21:42).
    const inLair = (p: readonly number[]) => l.lairs.some((a) => Math.hypot(p[0] - a.centre[0], p[2] - a.centre[2]) < a.radius + 6 && Math.abs(p[1] - a.centre[1]) < 12);
    for (const c of l.caverns) if (c.biome === b) cands.push(c.centre);
    for (const o of l.outpostSites) if (o.biome === b) cands.push(o.p);
    for (const p of l.spawnPoints) if (p.biome === b) cands.push(p.p);
    for (const c of cands) {
      if (inLair(c)) continue;
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
    goto: async (where: BiomeId | 'lair' | 'gate' | 'camp' | 'arrival' | 'vista' | 'vistaFloor' | 'river' | 'works' | 'vault' | 'secret' | 'ravine' | 'site', which?: string): Promise<[number, number, number] | null> => {
      if (!allowed) return null;
      let l = layout();
      if (!l) return null;
      // Round 3 (§6): the great structures, and any named site (`goto('site', 'geode')`).
      const to = (p: readonly number[] | undefined | null, yaw?: number): [number, number, number] | null => {
        if (!p) return null;
        const w = game.session.world;
        const x = Math.floor(p[0]);
        const z = Math.floor(p[2]);
        for (let dy = 0; dy < 8; dy++) for (const y of [Math.floor(p[1]) + dy, Math.floor(p[1]) - dy]) {
          for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]]) {
            if (standable(w, x + dx, y, z + dz)) {
              game.teleport(x + dx + 0.5, y, z + dz + 0.5, yaw);
              return [x + dx + 0.5, y, z + dz + 0.5];
            }
          }
        }
        return null;
      };
      if (where === 'vista' && l.vista) return to(l.vista.balcony, Math.atan2(l.vista.centre[0] - l.vista.balcony[0], l.vista.centre[2] - l.vista.balcony[2]));
      if (where === 'vistaFloor' && l.vista) return to(l.vista.rampFoot);
      if (where === 'river' && l.rivers[0]) return to(l.rivers[0].spring);
      if (where === 'works' && l.dungeon) return to(l.dungeon.entry);
      if (where === 'vault' && l.dungeon) return to(l.dungeon.vault);
      if (where === 'secret') return to(l.secrets.find((sc) => !which || sc.biome === which || sc.id === which)?.centre);
      if (where === 'ravine') return to(l.ravines.find((r) => !which || r.id === which)?.top);
      if (where === 'site') return to(l.sites.find((st) => st.name === which || st.id === which)?.centre);
      if (['vista', 'vistaFloor', 'river', 'works', 'vault', 'secret', 'ravine', 'site'].includes(where)) return null;
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
        vista: l.vista,
        falls: l.falls,
        rivers: l.rivers.map((r) => ({ id: r.id, kind: r.kind, points: r.points.length, spring: r.spring, mouth: r.mouth })),
        dungeon: l.dungeon,
        works: { set: s().works.setCount(), open: s().works.isOpen() },
        ravines: l.ravines.map((r) => ({ id: r.id, biome: r.biome, top: r.top, bottom: r.bottom, rope: r.rope.length })),
        secrets: l.secrets,
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
