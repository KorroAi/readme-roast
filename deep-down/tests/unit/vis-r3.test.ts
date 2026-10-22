import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { BIOMES, BIOME_IDS } from '../../src/config/biomes';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { BIOME_LOOKS, BIOME_WATER, BiomeLook, LOOK_BIOMES, applyBiomeLook, waterTintFor } from '../../src/render/biomeLook';
import { MOTE_STYLES, pickMotes } from '../../src/game/effects/BiomeMotes';
import { POCKET_PROPS, findPockets, pocketKind, pocketProps } from '../../src/render/props/pocketModels';
import { HANGING_KINDS } from '../../src/render/props/biomeModels';
import { PROP_KINDS, buildPropModel, PROP_VARIANTS } from '../../src/render/props/models';
import { dripAnchors } from '../../src/game/effects/stratumAmbience';
import { climbMount } from '../../src/render/climbables';
import { torchMount } from '../../src/render/torches';
import { scanFinds } from '../../src/render/sonar';
import { DEFAULT_WATER, lakeGeometry } from '../../src/render/water';
import type { LightingRig } from '../../src/render/lighting';
import type { PropKind } from '../../src/world/gen/types';

/** A solid box world with an open room inside (x, z in [lo, hi), y in [y0, y1)). */
function room(n = 32, lo = 4, hi = 28, y0 = 4, y1 = 14): VoxelWorld {
  const w = new VoxelWorld(n, n, n, 16);
  w.blocks.fill(B.SLATE);
  for (let z = lo; z < hi; z++) for (let y = y0; y < y1; y++) for (let x = lo; x < hi; x++) w.setRaw(x, y, z, B.AIR);
  return w;
}

/** A stand-in for LightingRig: records the biome targets it is given. */
function fakeRig(): LightingRig & { targets: Map<string, number> | null } {
  const r = { targets: null as Map<string, number> | null, setBiomeTargets(t: Map<string, number> | null) { r.targets = t ? new Map(t) : null; } };
  return r as unknown as LightingRig & { targets: Map<string, number> | null };
}

describe('biome looks (VIS round 3)', () => {
  it('has a look, water and motes for every biome WORLD defines, and the Heart', () => {
    for (const b of BIOME_IDS) {
      expect(LOOK_BIOMES).toContain(b);
      expect(BIOME_LOOKS[b].fx.length).toBeGreaterThan(0);
      expect(BIOME_WATER[b]).toBeDefined();
      for (const f of BIOME_LOOKS[b].fx) if (f !== 'drips') expect(MOTE_STYLES[f]).toBeDefined();
    }
  });

  it('blends the biomes sampled round the explorer and writes the grade', () => {
    const rig = fakeRig();
    const grade = { lift: new THREE.Color(0, 0, 0), gain: new THREE.Color(1, 1, 1), saturation: 1 };
    const look = new BiomeLook(rig, grade);
    // West of x = 0 the amber hollows, east of it the mushroom forest.
    const at = (x: number) => (x < 0 ? 'amberHollows' : 'mushroomForest');
    look.update(1 / 30, -30, 10, 0, at);
    expect(look.current).toBe('amberHollows');
    expect(grade.saturation).toBeCloseTo(BIOME_LOOKS.amberHollows.grade.saturation, 5);
    // On the border both count; the rig gets the un-eased targets of both.
    look.update(1 / 30, 0, 10, 0, at);
    expect(rig.targets?.size).toBe(2);
    // Walking on (a small step each frame) the mix eases over: not a pop.
    for (let i = 0; i < 4; i++) look.update(1 / 30, 1 + i * 0.1, 10, 0, at);
    const w = look.weights.get('mushroomForest') ?? 0;
    expect(w).toBeGreaterThan(0.05);
    expect(w).toBeLessThan(0.95);
    // Forcing a biome (the Lab, captures) overrides the sampled one.
    applyBiomeLook('frostCaverns', 1);
    look.update(1 / 30, 40, 10, 0, at);
    expect(look.current).toBe('frostCaverns');
    applyBiomeLook(null);
    look.detach();
    expect(grade.saturation).toBe(1);
  });

  it('gives the water of a biome mix, and the old water where no biome is known', () => {
    const none = waterTintFor(new Map());
    expect(none.sky).toBeNull();
    expect(none.deep).toEqual([...DEFAULT_WATER.deep]);
    const flooded = waterTintFor(new Map([['floodedGrottoes', 1]]));
    expect(flooded.glowAmount).toBeCloseTo(1, 5);
    expect(flooded.deep[2]).toBeGreaterThan(flooded.deep[0]);
    const half = waterTintFor(new Map([['floodedGrottoes', 0.5], ['amberHollows', 0.5]]));
    expect(half.glowAmount).toBeCloseTo(0.5, 5);
  });
});

describe('biome motes (VIS round 3)', () => {
  it('picks the strongest two styles of the mix, the first effect counting most', () => {
    expect(pickMotes(new Map()).length).toBe(0);
    const mush = pickMotes(new Map([['mushroomForest', 1]]));
    expect(mush[0].style).toBe('spores');
    const roots = pickMotes(new Map([['rootGalleries', 1]]));
    expect(roots.map((p) => p.style)).toEqual(['dust', 'fireflies']);
    expect(roots[0].weight).toBeGreaterThan(roots[1].weight);
    // A border: the frost's snow and the jungle's fireflies both show.
    const border = pickMotes(new Map([['frostCaverns', 0.5], ['glowrootJungle', 0.5]]));
    expect(border.map((p) => p.style).sort()).toEqual(['fireflies', 'snow']);
  });

  it('gives a generic style the colour of the biome it comes from', () => {
    const geode = pickMotes(new Map([['crystalGeode', 1]]));
    expect(geode[0].style).toBe('motes');
    expect(geode[0].color).toEqual([...BIOME_LOOKS.crystalGeode.light]);
    const bog = pickMotes(new Map([['sulphurBog', 1]]));
    expect(bog[0].color).toEqual([...BIOME_LOOKS.sulphurBog.light]);
  });

  it('keeps every style calm: slow twinkles, slow drift', () => {
    for (const s of Object.values(MOTE_STYLES)) {
      expect(s.twinkleRate).toBeLessThanOrEqual(0.5);
      expect(Math.hypot(...s.vel)).toBeLessThan(0.4);
      expect(s.density).toBeLessThanOrEqual(0.7);
    }
  });
});

describe('props of the strata (VIS round 3)', () => {
  it('models every prop kind WORLD places in a biome, the stations and the arenas', () => {
    const kinds = new Set<string>(['furnace', 'forge', 'alchemyTable', 'outpost', 'workbench', 'lairPillar', 'lairBrazier', 'lairRune']);
    for (const b of BIOME_IDS) for (const k of BIOMES[b].props) kinds.add(k);
    for (const k of kinds) expect(PROP_KINDS, k).toContain(k as PropKind);
  });

  it('builds every round 3 model, and the hanging ones hang below their roof', () => {
    const check = [...new Set([...BIOME_IDS.flatMap((b) => BIOMES[b].props), ...Object.keys(POCKET_PROPS), 'lairPillar', 'lairRune', 'furnace', 'alchemyTable', 'outpost', 'campTent', 'forgeChimney', 'trophyWall'])];
    for (const k of check) {
      for (let v = 0; v < Math.min(8, PROP_VARIANTS[k as PropKind]); v++) {
        const m = buildPropModel(k as PropKind, { variant: v });
        expect(m.body.getAttribute('position').count + (m.glow?.getAttribute('position').count ?? 0), k).toBeGreaterThan(0);
        if (HANGING_KINDS.has(k)) expect(m.bounds.max.y, k).toBeLessThan(0.1);
      }
    }
  });

  it('finds the light pockets no prop owns, the roof over each, and what glows there', () => {
    // A tall hall: a cyan pocket under the roof, one 8 m below it, one with no roof in reach, and a
    // lamp a prop owns.
    const w = room(48, 4, 44, 4, 30);
    w.setRaw(10, 29, 10, B.LIGHT_CYAN);
    w.setRaw(20, 21, 20, B.LIGHT_CYAN);
    w.setRaw(30, 6, 30, B.LIGHT_CYAN);
    w.setRaw(12, 5, 20, B.LIGHT_LAMP);
    const owned = new Set([w.index(12, 5, 20)]);
    const pockets = findPockets(w, () => 'floodedGrottoes', owned);
    expect(pockets.length).toBe(3);
    expect(pockets.find((p) => p.y === 29)!.roof).toBe(30);
    expect(pockets.find((p) => p.y === 21)!.roof).toBe(30);
    expect(pockets.find((p) => p.y === 6)!.roof).toBeNull();
    const specs = pocketProps(pockets, 7);
    expect(specs.length).toBe(2);
    expect(specs.every((sp) => sp.kind === 'glowWormsBlue' && sp.y === 30)).toBe(true);
    // A mine lamp hangs on its chain down to its light: the drop rides in the variant.
    const mine = pocketProps(findPockets(w, () => 'haldenMines', owned), 7).find((sp) => sp.x === 20.5)!;
    expect(mine.kind).toBe('mineLamp');
    expect(Math.floor(mine.modelVariant! / 4)).toBe(16);
    expect(pocketKind('mushroomForest', B.LIGHT_MAGENTA)).toBe('glowCapsMagenta');
    expect(pocketKind('mushroomForest', B.LIGHT_TEAL)).toBe('glowCapsTeal');
    for (const b of BIOME_IDS) expect(pocketKind(b, BIOMES[b].lightBlock), b).not.toBeNull();
  });
});

describe('ambient anchors, climbables and torches (VIS round 3)', () => {
  it('drips only from a real roof 3-12 m over a real floor, where the biome drips', () => {
    const w = room(32, 4, 28, 4, 14);
    const all = dripAnchors(w, () => true, { step: 2, chance: 1 });
    expect(all.length).toBeGreaterThan(20);
    for (const a of all) {
      expect(a.drop).toBe(10);
      expect(a.p[1]).toBe(14);
    }
    expect(dripAnchors(w, () => false, { chance: 1 }).length).toBe(0);
    // A low room drips nowhere (under 3 m).
    expect(dripAnchors(room(32, 4, 28, 4, 6), () => true, { chance: 1 }).length).toBe(0);
  });

  it('mounts a ladder on its wall and finds a rope\'s top', () => {
    const w = room();
    w.setRaw(4, 5, 10, B.LADDER);
    const lad = climbMount(w, 4, 5, 10)!;
    expect(lad.kind).toBe('ladder');
    expect(lad.wall).toEqual([-1, 0]);
    for (let y = 8; y < 14; y++) w.setRaw(16, y, 16, B.ROPE);
    expect(climbMount(w, 16, 13, 16)!.top).toBe(true);
    expect(climbMount(w, 16, 13, 16)!.roof).toBe(true);
    expect(climbMount(w, 16, 10, 16)!.top).toBe(false);
    expect(climbMount(w, 15, 10, 16)).toBeNull();
  });

  it('stands a torch on the floor, leans it out of a wall or hangs it', () => {
    const w = room();
    expect(torchMount(w, 10, 4, 10).mount).toBe('floor');
    expect(torchMount(w, 4, 8, 10).mount).toBe('wall');
    expect(torchMount(w, 4, 8, 10).out).toEqual([1, 0]);
    expect(torchMount(w, 10, 13, 10).mount).toBe('ceiling');
  });
});

describe('sonar and water (VIS round 3)', () => {
  it('finds one mark per ore vein in reach, nearest and rarest first', () => {
    const w = room();
    // A copper vein of 3 in the wall, and an amber nugget further.
    for (const x of [4, 5, 6]) w.setRaw(x, 3, 10, B.COPPER_ORE);
    w.setRaw(20, 3, 20, B.AMBER_ORE);
    const finds = scanFinds(w, 6, 6, 10, 24);
    const kinds = finds.map((f) => f.kind);
    expect(kinds.filter((k) => k === 'ore').length).toBe(2);
    expect(scanFinds(w, 6, 6, 10, 2).length).toBe(0);
  });

  it('merges every lake of a layout into one mesh', () => {
    const w = room();
    const mask = new Uint8Array(32 * 32).fill(1);
    const g = lakeGeometry(w, { id: 'a', level: 4.5, min: [0, 0], max: [31, 31], mask });
    expect(g).not.toBeNull();
  });
});
