import { ITEMS, isItem, type BiomeKey, type ItemId } from '../../config/items';
import { BIOMES, STRATA, type BiomeId } from '../../config/biomes';
import { blockDef, PLACEABLE } from '../../config/blocks';
import { BONUS_DROPS } from '../../config/loot';
import { STRATA_GEN } from '../../config/balance';
import { ROSTERS } from '../mobs/rosters';
import { SPECIES } from '../mobs/species';
import { generateStratum } from '../../world/gen/strata/generateStratum';
import { walkBfs } from '../../world/gen/strata/content';
import type { StratumLayout } from '../../world/gen/strata/types';
import type { Counts, CreatureSupply, OreSupply, StratumSupply } from './economy';

/**
 * What a generated stratum offers an explorer (round 3, LOOP: the economy simulation's supply).
 * Measured on WORLD's real layout: the walkable cells from the arrival (the gate's seal open),
 * every block with a drop within reach of one (3 m round, from a step below to 4 m up), the
 * chests, and the biomes' rosters and guardians from MOBS' tables.
 */
export function measureStratum(layout: StratumLayout): StratumSupply {
  const w = layout.world;
  const { sx, sy, sz } = w;
  const open = new Set(layout.gate.seal.map(([x, y, z]) => x + sx * (y + sy * z)));
  const seen = walkBfs({ world: w }, [layout.arrival.x, layout.arrival.y, layout.arrival.z], open);
  // Within reach of a walkable cell.
  const near = new Uint8Array(sx * sy * sz);
  let floorCells = 0;
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    floorCells++;
    const x = i % sx;
    const y = Math.floor(i / sx) % sy;
    const z = Math.floor(i / (sx * sy));
    for (let dz = -3; dz <= 3; dz++) {
      const zz = z + dz;
      if (zz < 0 || zz >= sz) continue;
      for (let dy = -1; dy <= 4; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= sy) continue;
        const row = sx * (yy + sy * zz);
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < sx) near[xx + row] = 1;
        }
      }
    }
  }
  // Blocks with a drop, within reach, per (block, biome).
  const ores = new Map<string, OreSupply>();
  const blocks = w.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const id = blocks[i];
    if (!id || !near[i]) continue;
    const def = blockDef(id);
    if (!def.drop || def.plain || def.tier >= 99 || PLACEABLE.has(id) || !isItem(def.drop.item)) continue;
    const x = i % sx;
    const y = Math.floor(i / sx) % sy;
    const z = Math.floor(i / (sx * sy));
    const biome = layout.biomeAt(x, y, z) as BiomeKey;
    const key = `${id}:${biome}`;
    let o = ores.get(key);
    if (!o) {
      const bonus = BONUS_DROPS.get(id);
      o = {
        item: def.drop.item,
        biome,
        tier: def.tier,
        hardness: def.hardness,
        blocks: 0,
        perBlock: def.drop.chance * ((def.drop.min + def.drop.max) / 2),
        stone: bonus && bonus.item === 'stone' ? bonus.chance * ((bonus.min + bonus.max) / 2) : 0,
      };
      ores.set(key, o);
    }
    o.blocks++;
  }
  const chests = layout.chests.map((c) => ({ kind: c.kind, tier: c.tier, biome: c.biome as BiomeKey }));
  const creatures: CreatureSupply[] = [];
  const guardians: StratumSupply['guardians'] = [];
  for (const b of layout.biomes) {
    const r = ROSTERS[b as keyof typeof ROSTERS];
    if (!r) continue;
    const total = r.monsters.reduce((a, e) => a + e.weight, 0) || 1;
    for (const e of r.monsters) {
      const sp = SPECIES[e.kind];
      // Each biome holds half of the stratum's encounters.
      creatures.push({ kind: e.kind, hp: sp.hp, weight: (e.weight / total) * 0.5, pack: (e.pack[0] + e.pack[1]) / 2, drops: dropsOf(sp.drops) });
    }
    const g = SPECIES[r.guardian];
    guardians.push({ biome: b as BiomeKey, kind: r.guardian, hp: g.hp, drops: dropsOf(g.drops) });
  }
  return {
    stratum: layout.stratum,
    floorCells,
    tunnelMetres: chests.length * STRATA_GEN.chestSpacing,
    ores: [...ores.values()],
    chests,
    creatures,
    guardians,
  };
}

/** Mean drops of a creature (MOBS' rule: each row rolls its chance; the first known item). */
function dropsOf(rows: ReadonlyArray<{ items: readonly string[]; min: number; max: number; chance: number }>): Counts {
  const out: Counts = {};
  for (const d of rows) {
    const item = d.items.find((i) => isItem(i)) as ItemId | undefined;
    if (!item || ITEMS[item].keyItem) continue;
    out[item] = (out[item] ?? 0) + Math.min(1, d.chance) * ((d.min + d.max) / 2);
  }
  return out;
}

/** The six strata of an expedition seed, measured (about a second each). */
export function measureStrata(seed: number, list: readonly number[] = STRATA.map((s) => s.index)): StratumSupply[] {
  return list.map((n) => measureStratum(generateStratum(seed, n)));
}

/** The biomes WORLD lists for a stratum (re-exported for the tools). */
export const STRATUM_BIOME_IDS = (n: number): readonly BiomeId[] => STRATA[n - 1]?.biomes ?? [];
void BIOMES;
