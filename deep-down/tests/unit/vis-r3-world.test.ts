import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { BLOCK_SURFACES, MATERIAL_NAMES } from '../../src/render/materials';
import { LAVA_DROP, riverGeometry } from '../../src/render/rivers';
import { PROP_KINDS, PROP_VARIANTS, buildPropModel } from '../../src/render/props/models';
import { companionGlow } from '../../src/game/effects/VisDirector';
import { CAMP_UPGRADES, TROPHY_SPOTS } from '../../src/config/camp';
import type { PropKind } from '../../src/world/gen/types';

/** A straight river of n points a metre apart along +x at surface y 10, with an optional gap. */
function river(n: number, kind: 'water' | 'lava' = 'water', gapAt = -1) {
  const points: number[][] = [];
  for (let i = 0; i < n; i++) points.push([10 + i + (gapAt >= 0 && i >= gapAt ? 5 : 0), 10 - (i > n / 2 ? 1 : 0), 20]);
  return { kind, points, width: 2.2 };
}

describe('rivers and falls (VIS round 3, WORLD layout.rivers / falls)', () => {
  it('lays a ribbon two vertices wide per point, splits it where the channel breaks', () => {
    const g = riverGeometry([river(20)], 'water')!;
    expect(g.getAttribute('position').count).toBe(40);
    expect(g.index!.count).toBe(19 * 6);
    // The banks reach past WORLD's half width (they tuck into the channel walls).
    const pos = g.getAttribute('position');
    expect(Math.abs(pos.getZ(0) - pos.getZ(1))).toBeGreaterThan(2.2);
    // A 5 m gap: two runs, no quad across it.
    const split = riverGeometry([river(20, 'water', 10)], 'water')!;
    expect(split.index!.count).toBe((9 + 9) * 6);
    // Its ends fade (aEnds 0 at both ends of a run), the flow runs along it, the step shows in aSlope.
    const ends = split.getAttribute('aEnds');
    expect(ends.getX(0)).toBe(0);
    const slope = g.getAttribute('aSlope');
    let steep = 0;
    for (let i = 0; i < slope.count; i++) steep = Math.max(steep, slope.getX(i));
    expect(steep).toBeGreaterThan(0.1);
  });

  it('leaves a pool the river runs through to the pool\'s own surface (no second sheet on it)', () => {
    const r = river(30);
    const all = riverGeometry([r], 'water')!;
    const pool = (x: number) => x >= 18 && x <= 24;
    const cut = riverGeometry([r], 'water', (x) => pool(x))!;
    expect(cut.index!.count).toBeLessThan(all.index!.count);
    const pos = cut.getAttribute('position');
    for (let i = 0; i < pos.count; i++) expect(pool(Math.round(pos.getX(i)))).toBe(false);
  });

  it('draws lava one cell lower (the lava blocks\' top), and each kind only once', () => {
    const lava = riverGeometry([river(12, 'lava'), river(12, 'water')], 'lava')!;
    expect(lava.getAttribute('position').count).toBe(24);
    const y = lava.getAttribute('position').getY(0);
    expect(y).toBeCloseTo(10 - LAVA_DROP, 1);
    expect(riverGeometry([river(12, 'lava')], 'water')).toBeNull();
    expect(riverGeometry([], 'water')).toBeNull();
    // Garbage in (WORLD's data is read by shape): skipped, never a throw.
    expect(riverGeometry([{ kind: 'water', points: [[1, 2]], width: 2 }, { kind: 'water', points: [[0, 0, Number.NaN]], width: 2 }], 'water')).toBeNull();
  });
});

describe('the works, the camp and the companion (VIS round 3)', () => {
  it('models the lever up and thrown, with its tell-tale bead', () => {
    expect(PROP_KINDS).toContain('lever' as PropKind);
    expect(PROP_VARIANTS['lever' as PropKind]).toBe(2);
    const up = buildPropModel('lever' as PropKind, { variant: 0 });
    const down = buildPropModel('lever' as PropKind, { variant: 1 });
    expect(up.glow).not.toBeNull();
    // Thrown, the arm hangs toward the room: a different model from the lever at rest.
    expect(Array.from(up.body.getAttribute('position').array)).not.toEqual(Array.from(down.body.getAttribute('position').array));
    // Bolted to the wall half a metre behind the prop's spot.
    expect(up.bounds.min.z).toBeCloseTo(-0.5, 1);
  });

  it('paints the works\' iron-bound door, its pressure plates and the crafted door', () => {
    expect(MATERIAL_NAMES).toContain('haldenDoor');
    expect(MATERIAL_NAMES).toContain('pressurePlate');
    expect(BLOCK_SURFACES[B.HALDEN_DOOR].side).toBe('haldenDoor');
    expect(BLOCK_SURFACES[B.PRESSURE_PLATE].top).toBe('pressurePlate');
    expect(BLOCK_SURFACES[B.DOOR].side).toBe('builtDoor');
  });

  it('models every camp upgrade LOOP builds, its trophies and the trader\'s cart', () => {
    for (const def of Object.values(CAMP_UPGRADES)) for (const lv of def.levels) for (const p of lv.props) expect(PROP_KINDS, p.kind).toContain(p.kind as PropKind);
    for (const k of ['guardianTrophy', 'traderCart', 'campChimney']) expect(PROP_KINDS).toContain(k as PropKind);
    expect(PROP_VARIANTS['guardianTrophy' as PropKind]).toBe(13);
    // Each trophy's plaque hangs 1.5 m up against the wall 0.4 m behind its spot (at LOOP's 0.55).
    for (let v = 0; v < 13; v++) {
      const m = buildPropModel('guardianTrophy' as PropKind, { variant: v });
      expect(m.bounds.min.z * 0.55).toBeCloseTo(-0.4, 1);
      expect(m.bounds.max.y * 0.55).toBeGreaterThan(1.6);
    }
    // The wall spans LOOP's twelve trophy spots (at the default decor scale 0.9).
    const wall = buildPropModel('trophyWall' as PropKind, { variant: 0 });
    expect(wall.bounds.max.x * 0.9).toBeGreaterThan(Math.max(...TROPHY_SPOTS.map((s) => s[0])));
    expect(wall.bounds.min.x * 0.9).toBeLessThan(Math.min(...TROPHY_SPOTS.map((s) => s[0])));
    expect(buildPropModel('traderCart' as PropKind, { variant: 0 }).glow).not.toBeNull();
  });

  it('lights the companion from MOBS\' light, or its tame body and glow', () => {
    expect(companionGlow(null)).toBeNull();
    expect(companionGlow({ companionLight: () => ({ x: 1, y: 2, z: 3, glow: 0.5 }) })).toEqual({ x: 1, y: 2, z: 3, glow: 0.5 });
    const mobs = { companion: () => ({ glow: 0.8 }), sim: { mobs: [{ tame: false, position: { x: 9, y: 9, z: 9 } }, { tame: true, dying: false, position: { x: 4, y: 5, z: 6 } }] } };
    expect(companionGlow(mobs)).toEqual({ x: 4, y: 5, z: 6, glow: 0.8 });
    expect(companionGlow({ companion: () => null, sim: mobs.sim })).toBeNull();
  });
});

describe('shader sources (VIS round 3)', () => {
  it('never name a variable with a word GLSL ES 3.00 reserves (a program that does never compiles)', async () => {
    // node:fs through a string specifier (the project has no Node types; as tests/unit/brand.test.ts).
    const NODE_FS: string = 'node:fs';
    const { readdirSync, readFileSync, statSync } = (await import(/* @vite-ignore */ NODE_FS)) as {
      readdirSync(p: string): string[];
      readFileSync(p: string, enc: 'utf8'): string;
      statSync(p: string): { isDirectory(): boolean };
    };
    const join = (a: string, b: string): string => `${a}/${b}`;
    const RESERVED = ['patch', 'sample', 'filter', 'input', 'output', 'common', 'partition', 'active', 'fixed', 'half', 'long', 'short', 'double', 'unsigned', 'cast', 'namespace', 'using', 'class', 'union', 'enum', 'typedef', 'template', 'this', 'goto', 'inline', 'noinline', 'volatile', 'public', 'static', 'extern', 'external', 'interface', 'superp', 'resource', 'coherent', 'restrict', 'readonly', 'writeonly', 'subroutine', 'noperspective', 'asm', 'sizeof', 'varying', 'attribute'];
    const decl = new RegExp(`\\b(?:float|int|bool|vec[234]|ivec[234]|mat[234]|const float|const int)\\s+(${RESERVED.join('|')})\\b`);
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    for (const d of ['src/render', 'src/game/effects']) walk(d);
    expect(files.length).toBeGreaterThan(40);
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line: string, i: number) => {
        const m = decl.exec(line);
        if (m) bad.push(`${f}:${i + 1} ${m[1]}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('light shafts (VIS round 3)', () => {
  it('lets a high light of a shaft biome fall to the floor, spaced apart, never in other biomes', async () => {
    const { VoxelWorld } = await import('../../src/world/VoxelWorld');
    const { strataBeams } = await import('../../src/game/effects/strataBeams');
    const w = new VoxelWorld(64, 48, 64, 16);
    for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) w.setRaw(x, 2, z, B.SLATE);
    const src = (x: number, z: number, biome: string, roof: number | null = 30) => ({ x, y: 28, z, biome, roof });
    const beams = strataBeams(w, [src(10, 10, 'amberHollows'), src(12, 10, 'amberHollows'), src(40, 40, 'amberHollows'), src(50, 10, 'mushroomForest'), src(30, 50, 'sunkenCity', null)]);
    // Two amber shafts (the second light 2 m from the first is skipped), none in the forest, none without a roof.
    expect(beams.length).toBe(2);
    for (const b of beams) {
      expect(b.from[1]).toBe(30);
      expect(b.to[1]).toBeCloseTo(3.3, 5);
      expect(b.r1).toBeGreaterThan(b.r0);
    }
    // A low room (under 7 m from the floor to the roof): no shaft.
    expect(strataBeams(w, [{ x: 10, y: 6, z: 10, biome: 'amberHollows', roof: 8 }]).length).toBe(0);
  });
});

describe('the bog\'s geysers (VIS round 3)', () => {
  it('huffs a column from the nearest vent within reach, then stops; none without vents', async () => {
    const THREE = await import('three');
    const { GeyserFx, GEYSER_TIME } = await import('../../src/game/effects/GeyserFx');
    const lighting = { uTime: { value: 0 } } as never;
    const fx = new GeyserFx(lighting);
    fx.setVents([[10, 5, 10], [60, 5, 60], [1, 2]]);
    expect(fx.ventCount).toBe(2);
    expect(fx.erupt(100, 5, 100)).toBe(false);
    expect(fx.erupt(14, 5, 12)).toBe(true);
    expect(fx.active).toEqual([10, 5, 10]);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(14, 6.6, 12);
    for (let t = 0; t < GEYSER_TIME + 0.2; t += 0.1) fx.update(0.1, cam);
    expect(fx.active).toBeNull();
    // On its own, the next column comes within a dozen seconds when the explorer is near a vent.
    for (let t = 0; t < 13; t += 0.1) fx.update(0.1, cam);
    expect(fx.eruptions).toBe(2);
    fx.setVents([]);
    expect(fx.erupt(10, 5, 10)).toBe(false);
    fx.dispose();
  });
});

describe('the Heart in two acts (VIS round 3)', () => {
  it('wakes with the shards (rose, beating, still dark air), and relights the deep at the ending', async () => {
    const { HeartFinale } = await import('../../src/game/effects/HeartFinale');
    const { TerrainRig } = await import('../../src/render/terrainRig');
    const { generateMaterials } = await import('../../src/render/materials');
    const { relightHeart } = await import('../../src/render/biomeLook');
    const lighting = { uTime: { value: 0 } } as never;
    const terrain = new TerrainRig(generateMaterials({ biomes: ['heart'] }));
    const f = new HeartFinale(lighting);
    f.setHeart({ centre: [10, 10, 10] }, 'dark');
    expect(f.kindled).toBe(0);
    f.awaken();
    expect(f.state).toBe('awake');
    const post = { flash: 0, flashColor: new (await import('three')).Color() };
    for (let i = 0; i < 30 * 4; i++) f.update(1 / 30, i / 30, terrain, post);
    expect(f.kindled).toBe(12);
    // Act I tints the shell rose and leaves the air dark.
    expect(terrain.uniforms.uSonarTint.value.g).toBeLessThan(0.5);
    expect(f.lit).toBe(0);
    for (let i = 0; i < 30 * 5; i++) f.update(1 / 30, 4 + i / 30, terrain, post);
    expect(f.playing).toBe(false);
    // The shell is the sonar's pale gold again for the explorer's own pings.
    expect(terrain.uniforms.uSonarTint.value.g).toBeCloseTo(0.8, 5);
    // Act II at the ending: lit within ~5 s (the end card comes at 6.5 s).
    f.start();
    for (let i = 0; i < 30 * 6; i++) f.update(1 / 30, 9 + i / 30, terrain, post);
    expect(f.lit).toBeGreaterThan(0.99);
    expect(terrain.uniforms.uSonarTint.value.g).toBeGreaterThan(0.8);
    // A save at each stage starts there.
    f.setHeart({ centre: [10, 10, 10] }, 'awake');
    expect(f.kindled).toBe(12);
    expect(f.lit).toBe(0);
    f.setHeart({ centre: [10, 10, 10] }, 'lit');
    expect(f.lit).toBe(1);
    relightHeart(0);
    f.dispose();
  });
});

describe('VisDirector on a stratum layout (VIS round 3, smoke)', () => {
  it('builds the rivers, falls, vents, levers and shafts of a layout, and keeps a thrown lever down', async () => {
    const THREE = await import('three');
    const { VoxelWorld } = await import('../../src/world/VoxelWorld');
    const { EventBus } = await import('../../src/core/events');
    const { VisDirector } = await import('../../src/game/effects/VisDirector');
    const { TerrainRig } = await import('../../src/render/terrainRig');
    const { PropRenderer } = await import('../../src/render/props/PropRenderer');
    const { generateMaterials } = await import('../../src/render/materials');
    const w = new VoxelWorld(64, 48, 64, 16);
    for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) {
      w.setRaw(x, 2, z, B.SLATE);
      w.setRaw(x, 40, z, B.SLATE);
    }
    w.setRaw(30, 38, 30, B.LIGHT_RUNE);
    const tex = (n: number) => new THREE.Data3DTexture(new Uint8Array(n * n * n * 4), n, n, n);
    const lighting = {
      uLightTex: { value: tex(2) }, uLanternTex: { value: tex(2) }, uWorldSize: { value: new THREE.Vector3(64, 48, 64) }, uLanternOrigin: { value: new THREE.Vector3() }, uLanternPos: { value: new THREE.Vector3() },
      uLanternColor: { value: new THREE.Color(1, 0.7, 0.4) }, uLanternRadius: { value: 11 }, uLanternIntensity: { value: 1 }, uAmbient: { value: new THREE.Color() }, uOpenAmbient: { value: new THREE.Color() }, uEmitGain: { value: 1.7 },
      uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 }, uTime: { value: 0 }, uDebug: { value: new THREE.Vector3() }, uGlowLight: { value: new THREE.Vector4() }, uGlowColor: { value: new THREE.Color() }, uBioWave: { value: 0 }, uTwinkle: { value: 0 },
    };
    const rig = { uniforms: lighting, setBiomeTargets: () => undefined };
    const terrain = new TerrainRig(generateMaterials({ biomes: ['sulphurBog', 'sunkenCity'] }));
    const props = new PropRenderer(lighting as never);
    const lever = { id: 'works_lever_0', kind: 'lever', x: 20.5, y: 3, z: 20.5, rotY: 0, scale: 1, anchor: null, emitters: [], seed: 1, interact: 'feature', feature: { kind: 'lever', id: 'works_lever_0' } } as never;
    const vent = { id: 'vent_0', kind: 'gasVent', x: 12.5, y: 3, z: 12.5, rotY: 0, scale: 1, anchor: [12, 2, 12], emitters: [], seed: 2 } as never;
    const pillar = { id: 'lair_pillar_0', kind: 'lairPillar', x: 45.5, y: 3, z: 40.5, rotY: 0, scale: 1, anchor: [45, 2, 40], emitters: [], seed: 3 } as never;
    const liveProps = new Map<string, unknown>([['works_lever_0', lever], ['vent_0', vent], ['lair_pillar_0', pillar]]);
    props.add(lever);
    const layout = {
      world: w, seed: 7, props: [lever, vent], landmarks: {}, structures: [], features: { lakes: [] },
      biomeAt: (x: number) => (x < 32 ? 'sulphurBog' : 'sunkenCity'),
      rivers: [{ kind: 'water', width: 2.2, points: Array.from({ length: 20 }, (_, i) => [5 + i, 3.75, 40]) }],
      falls: [{ kind: 'water', top: [50, 30, 50], bottom: [50, 3, 50], width: 3 }],
      dungeon: { puzzle: 'levers', levers: ['works_lever_0'], sockets: [[22, 5, 22]], vault: [25, 3, 25], door: [[24, 3, 24]] },
      secrets: [{ id: 's1', centre: [8, 3, 8] }], lairs: [{ biome: 'sunkenCity', centre: [40, 3, 40], radius: 8 }], hazards: [{ kind: 'gas', centre: [12, 3, 12], radius: 5 }], caverns: [], heart: null,
    };
    const session = { world: w, layout, rig, terrain, chunks: { chunkListeners: [], rebuildListeners: [], chunkDrawnAt: () => true }, liveProps, props };
    const bus = new EventBus();
    const highlight = { reveal: () => undefined, marks: { count: 0, clear: () => undefined } };
    let guardian: unknown = null;
    const vis = new VisDirector({ bus: bus as never, session: () => session as never, highlight: () => highlight as never, grade: null, particles: () => ({ sparkle: () => undefined, dust: () => undefined }) as never, mobs: () => ({ activeGuardian: () => guardian }) });
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(14, 4.6, 14);
    for (let i = 0; i < 5; i++) vis.update(1 / 30, i / 30, cam, 14, 3, 14);
    // The Heart's pulse follows the Dark Heart (MOBS' 21:42): asleep 2 s; its own beat while it
    // fights; HEART_BEAT by its phase without one; a heard lub sets the swell going.
    expect(vis.heart.tempo).toBe(2);
    guardian = { kind: 'heartOfDark', phase: 3, status: 'awake', beat: { period: 0.75, phase: 0.5 } };
    vis.update(1 / 30, 1, cam, 14, 3, 14);
    expect(vis.heart.tempo).toBe(0.75);
    expect((vis.heart as unknown as { beatPhase: number }).beatPhase).toBeCloseTo(0.7 + 1 / 30 / 0.75, 5);
    guardian = { kind: 'heartOfDark', phase: 2, status: 'awake' };
    vis.update(1 / 30, 1.1, cam, 14, 3, 14);
    expect(vis.heart.tempo).toBe(1);
    bus.emit('mob:sfx' as never, { name: 'guardian.heartbeat', pan: 0, gain: 1 } as never);
    expect((vis.heart as unknown as { beatPhase: number }).beatPhase).toBeCloseTo(0.2, 5);
    guardian = null;
    const r = vis.report();
    expect(r.riverQuads).toBe(19);
    expect(r.falls).toEqual(['water']);
    expect(r.vents).toBe(1);
    expect(r.veils).toBeGreaterThan(0);
    expect((lever as { modelVariant?: number }).modelVariant ?? 0).toBe(0);
    // The lair's standing stone wears its biome (the Sunken City's gilded capital: LOOK_BIOMES index 9).
    expect((pillar as { modelVariant?: number }).modelVariant).toBe(9);
    // WORLD lights the lever's socket lamp and tells the bus: the lever stays down.
    w.setRaw(22, 5, 22, B.LIGHT_RUNE);
    bus.emit('world:lever' as never, { id: 'works_lever_0', k: 0, set: 1, total: 1 } as never);
    expect((lever as { modelVariant?: number }).modelVariant).toBe(1);
    vis.dispose();
  });
});

describe('props that sit right in the strata (VIS round 3, the probe\'s fixes)', () => {
  it('spreads a glow-worm curtain only as far as the roof stays level round its light', async () => {
    const { VoxelWorld } = await import('../../src/world/VoxelWorld');
    const { findPockets, pocketProps, WORM_SPREAD } = await import('../../src/render/props/pocketModels');
    const w = new VoxelWorld(32, 32, 32, 16);
    w.blocks.fill(B.SLATE);
    for (let z = 2; z < 30; z++) for (let y = 2; y < 20; y++) for (let x = 2; x < 30; x++) w.setRaw(x, y, z, B.AIR);
    // A level roof at y 20 over (8, 8); a step in the roof right beside (20, 20).
    w.setRaw(8, 18, 8, B.LIGHT_CYAN);
    w.setRaw(20, 18, 20, B.LIGHT_CYAN);
    w.setRaw(21, 19, 20, B.SLATE);
    const pockets = findPockets(w, () => 'floodedGrottoes', new Set());
    const level = pockets.find((p) => p.x === 8)!;
    const stepped = pockets.find((p) => p.x === 20)!;
    expect(level.spread).toBe(2);
    expect(stepped.spread).toBe(0);
    const specs = pocketProps(pockets, 3);
    expect(specs.find((s) => s.x === 8.5)!.modelVariant).toBe(2);
    expect(specs.find((s) => s.x === 20.5)!.modelVariant).toBe(0);
    const narrow = buildPropModel('glowWormsBlue' as PropKind, { variant: 0 });
    expect(narrow.bounds.max.x).toBeLessThanOrEqual(WORM_SPREAD[0] + 0.05);
  });

  it('grows the fern up out of the floor, and keeps the ambient timber compact', () => {
    for (const v of [0, 1]) {
      const fern = buildPropModel('fern' as PropKind, { variant: v });
      expect(fern.bounds.min.y).toBeGreaterThan(-0.01);
      expect(fern.bounds.max.y).toBeGreaterThan(0.25);
      const stack = buildPropModel('timberProp' as PropKind, { variant: v });
      expect(stack.bounds.max.x - stack.bounds.min.x).toBeLessThan(1.6);
    }
    expect(PROP_KINDS).toContain('mineSet' as PropKind);
    expect(buildPropModel('mineSet' as PropKind, { variant: 0 }).bounds.max.y).toBeGreaterThan(2.2);
  });
});

describe('the arenas wear their biome (VIS round 3)', () => {
  it('styles a lair\'s stones and braziers per biome, and keeps the unstyled ones at variant 0', async () => {
    const { variantOf, CHOSEN_VARIANT_KINDS } = await import('../../src/render/props/models');
    const { LOOK_BIOMES } = await import('../../src/render/biomeLook');
    expect(PROP_VARIANTS['lairPillar' as PropKind]).toBe(LOOK_BIOMES.length);
    expect(PROP_VARIANTS['lairBrazier' as PropKind]).toBe(LOOK_BIOMES.length);
    // LOOP's camp braziers carry no variant: always the fire (0), never a seeded biome's flame.
    for (const seed of [1, 2, 3, 99, 12345]) expect(variantOf({ kind: 'lairBrazier' as PropKind, seed })).toBe(0);
    expect(CHOSEN_VARIANT_KINDS.has('lever')).toBe(true);
    expect(variantOf({ kind: 'lairPillar' as PropKind, seed: 5, modelVariant: 9 })).toBe(9);
    // A magic flame in the grottoes (blue), fire in the Amber Hollows; every pillar style builds.
    expect(buildPropModel('lairBrazier' as PropKind, { variant: 3 }).flames[0].tint).toBeDefined();
    expect(buildPropModel('lairBrazier' as PropKind, { variant: 0 }).flames[0].tint).toBeUndefined();
    for (let v = 0; v < LOOK_BIOMES.length; v++) {
      const m = buildPropModel('lairPillar' as PropKind, { variant: v });
      expect(m.glow, LOOK_BIOMES[v]).not.toBeNull();
      expect(m.bounds.min.y).toBeGreaterThan(-0.01);
    }
  });
});

describe('the last look pass (VIS round 3, lead 01:17)', () => {
  it('glows on the Glass Garden\'s spire tips only, and never on a voidshard vein in the floor', async () => {
    const { spireTipHalos } = await import('../../src/game/effects/VisDirector');
    const cells = new Map<string, number>();
    const set = (x: number, y: number, z: number, id: number) => cells.set(`${x},${y},${z}`, id);
    const w = { get: (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? (y < 10 ? B.OBSIDIAN : B.AIR) };
    // A spire on the floor (y 10..11 obsidian, its voidshard tip at 12, open air round and over it).
    set(20, 10, 20, B.OBSIDIAN);
    set(20, 11, 20, B.OBSIDIAN);
    set(20, 12, 20, B.VOIDSHARD);
    // A vein in the floor: voidshard at the floor's top with air over it but rock round it.
    set(24, 9, 20, B.VOIDSHARD);
    const garden = { name: 'glassGarden', centre: [22, 10, 20], radius: 8 };
    const tips = spireTipHalos(w, [garden]);
    expect(tips.map((t) => [t.x, t.y, t.z])).toEqual([[20, 12, 20]]);
    expect(tips[0].id).toBe(B.LIGHT_ABYSS);
    expect(tips[0].color![2]).toBeGreaterThan(tips[0].color![0]);
    // Another site, or the garden out of reach: none.
    expect(spireTipHalos(w, [{ ...garden, name: 'emberDeep' }])).toEqual([]);
    expect(spireTipHalos(w, [{ ...garden, centre: [60, 10, 60] }])).toEqual([]);
  });

  it('carries the Glowroot\'s lantern pool further (reach), the field with it, and gameplay keeps the radius', async () => {
    const THREE = await import('three');
    const { LanternLight } = await import('../../src/render/lanternLight');
    const { BIOME_LOOKS } = await import('../../src/render/biomeLook');
    const { LIGHTING_GLSL } = await import('../../src/render/lighting');
    const jungle = BIOME_LOOKS.glowrootJungle;
    expect(jungle.atmosphere.reach).toBeGreaterThan(1);
    // Brighter by its fill and its pool, not its saturation (0.9 since the 00:13 pass).
    expect(jungle.grade.saturation).toBeLessThanOrEqual(0.9);
    expect(LIGHTING_GLSL).toContain('min(uLanternRadius * reach, max(uLanternRadius, 15.0))');
    const u = { uLanternRadius: { value: 0 }, uLanternIntensity: { value: 0 }, uLanternColor: { value: new THREE.Color() }, uLanternReach: { value: 1.25 } } as never;
    const field = new LanternLight().update(u, { dt: 1 / 30, time: 0, fuel: 1, lit: true, tier: 1, radius: 11, intensity: 1, ember: 0.3 });
    expect((u as { uLanternRadius: { value: number } }).uLanternRadius.value).toBeCloseTo(11, 5);
    expect(field).toBeCloseTo(11 * 1.25, 5);
    // A uniform set without the reach (unit tests, the lab): the radius as before.
    const plain = { uLanternRadius: { value: 0 }, uLanternIntensity: { value: 0 }, uLanternColor: { value: new THREE.Color() } } as never;
    expect(new LanternLight().update(plain, { dt: 1 / 30, time: 0, fuel: 1, lit: true, tier: 1, radius: 11, intensity: 1, ember: 0.3 })).toBeCloseTo(11, 5);
  });

  it('lights the glass shard cluster from within', () => {
    const m = buildPropModel('glassShard' as PropKind, { variant: 0 });
    expect(m.glow).not.toBeNull();
    // The lit core: a five-sided shard (5 quads + 5 tip triangles) besides the three glints.
    expect(m.glow!.getAttribute('position').count).toBeGreaterThanOrEqual(3 * 24 + 5 * 4 + 5 * 3);
    expect(m.glowScale).toBeGreaterThan(1.5);
  });
});
