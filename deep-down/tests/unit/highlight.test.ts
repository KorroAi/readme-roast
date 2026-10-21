import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { RARITY_CODE } from '../../src/config/rarity';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { HI_SIZE, TerrainRig } from '../../src/render/terrainRig';
import { HIGHLIGHT_PULSE_S, HIGHLIGHT_RANGE, HighlightSystem } from '../../src/render/highlight';
import type { PropRenderer } from '../../src/render/props/PropRenderer';
import type { PropSpec } from '../../src/world/gen/types';
import { LanternLight } from '../../src/render/lanternLight';
import { TargetMarker } from '../../src/game/effects/TargetMarker';
import type { LightingUniforms } from '../../src/render/lighting';

const tinyAtlas = { size: 1, layers: 1, data: new Uint8Array(4) };

function setup(props: PropSpec[] = [], usable?: (s: PropSpec) => boolean) {
  const world = new VoxelWorld(32, 32, 32);
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) for (let y = 0; y < 10; y++) world.setRaw(x, y, z, B.SLATE);
  world.setRaw(16, 10, 12, B.COPPER_ORE);
  world.setRaw(17, 10, 12, B.IRON_ORE);
  world.setRaw(18, 10, 12, B.LANTERNSTONE);
  const terrain = new TerrainRig(tinyAtlas);
  const glow = vi.fn();
  const fakeProps = { setRarityGlow: glow, meshesOf: () => null, onFocus: null, bounds: () => new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)) } as unknown as PropRenderer;
  const hs = new HighlightSystem({ terrain, props: fakeProps, world: () => world, liveProps: () => props, usable });
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(16.5, 11.6, 16.5);
  return { world, terrain, hs, cam, glow };
}

const code = (t: TerrainRig, x: number, y: number, z: number) => {
  const o = t.uniforms.uHiOrigin.value;
  const d = t.uniforms.uHiTex.value.image.data as Uint8Array;
  return d[(x - o.x) + HI_SIZE * ((y - o.y) + HI_SIZE * (z - o.z))];
};

describe('HighlightSystem (rarity highlights, VIS)', () => {
  it('codes the cells around the eye: air 0, plain rock 1, finds 2..6 by rarity', () => {
    const { terrain, hs, cam } = setup();
    hs.update(1 / 30, 0, cam);
    expect(terrain.uniforms.uHiOrigin.value.w).toBe(1);
    expect(code(terrain, 16, 11, 12)).toBe(0);
    expect(code(terrain, 16, 9, 12)).toBe(1);
    expect(code(terrain, 16, 10, 12)).toBe(RARITY_CODE[B.COPPER_ORE] + 1);
    expect(code(terrain, 16, 10, 12)).toBe(2); // common
    expect(code(terrain, 17, 10, 12)).toBe(3); // uncommon
    expect(code(terrain, 18, 10, 12)).toBe(6); // legendary
  });

  it('rebuilds the volume when the world changes, not every frame', () => {
    const { world, terrain, hs, cam } = setup();
    hs.update(1 / 30, 0, cam);
    const tex = terrain.uniforms.uHiTex.value;
    const v0 = tex.version;
    hs.update(1 / 30, 0.1, cam);
    expect(tex.version).toBe(v0);
    world.set(16, 10, 12, B.AIR);
    hs.update(1 / 30, 0.2, cam);
    expect(tex.version).toBeGreaterThan(v0);
    expect(code(terrain, 16, 10, 12)).toBe(0);
  });

  it('selects a block with its rarity code, eases in, and clears', () => {
    const { terrain, hs, cam } = setup();
    hs.select({ kind: 'block', x: 17, y: 10, z: 12 });
    for (let i = 0; i < 10; i++) hs.update(1 / 30, i / 30, cam);
    const sel = terrain.uniforms.uHiSel.value;
    expect([sel.x, sel.y, sel.z, sel.w]).toEqual([17, 10, 12, 3]);
    expect(terrain.uniforms.uHiFx.value.y).toBeCloseTo(1, 5);
    hs.select({ kind: 'block', x: 17, y: 10, z: 12 }, { blocked: true });
    hs.update(1 / 30, 1, cam);
    expect(terrain.uniforms.uHiFx.value.z).toBe(1);
    hs.select(null);
    hs.update(1 / 30, 1.1, cam);
    expect(terrain.uniforms.uHiSel.value.w).toBe(0);
  });

  it('lists the exposed finds near the eye for the tap hit-test', () => {
    const { hs, cam } = setup();
    hs.update(1 / 30, 0, cam);
    const list = hs.targetsNear(cam.position, 14);
    const blocks = list.filter((t) => t.kind === 'block').map((t) => `${(t as { x: number }).x}:${t.rarity}`);
    expect(blocks.sort()).toEqual(['16:common', '17:uncommon', '18:legendary']);
  });

  it('breathes calmly (one pulse every 2.5 s or slower) and reaches about 14 m', () => {
    expect(HIGHLIGHT_PULSE_S).toBeGreaterThanOrEqual(2.5);
    expect(HIGHLIGHT_RANGE).toBe(14);
  });

  it('lights props in range by rarity, never beyond 14 m, never an opened cache', () => {
    const mk = (id: string, x: number, kind: PropSpec['kind'], extra: Partial<PropSpec> = {}) =>
      ({ id, kind, x, y: 11, z: 16.5, rotY: 0, scale: 1, seed: 1, anchor: null, emitters: [], ...extra }) as unknown as PropSpec;
    const cache = { interact: 'feature', feature: { kind: 'cache' } } as Partial<PropSpec>;
    const near = mk('crate-near', 18, 'crate', cache);
    const far = mk('crate-far', 16.5 + 20, 'crate', cache);
    const opened = mk('cache-open', 15, 'chest', { interact: 'feature', feature: { kind: 'cache' } } as Partial<PropSpec>);
    const lamp = mk('lamp', 17, 'hangingLantern');
    const { hs, cam, glow } = setup([near, far, opened, lamp], (s) => s.id !== 'cache-open');
    hs.update(1 / 30, 0, cam);
    const lit = new Set(glow.mock.calls.filter((c) => c[1] !== null).map((c) => c[0]));
    expect(lit.has('crate-near')).toBe(true);
    expect(lit.has('crate-far')).toBe(false);
    expect(lit.has('cache-open')).toBe(false);
    expect(lit.has('lamp')).toBe(false);
  });

  it('selects the focused interactable when it is a find, and lets go when focus leaves', () => {
    const cache = { interact: 'feature', feature: { kind: 'cache' } } as Partial<PropSpec>;
    const chest = { id: 'chest-1', kind: 'chest', x: 17, y: 11, z: 15, rotY: 0, scale: 1, seed: 1, anchor: null, emitters: [], ...cache } as unknown as PropSpec;
    const bench = { id: 'bench', kind: 'workbench', x: 15, y: 11, z: 15, rotY: 0, scale: 1, seed: 1, anchor: null, emitters: [], interact: 'craft' } as unknown as PropSpec;
    const { hs } = setup([chest, bench]);
    const props = (hs as unknown as { opts: { props: PropRenderer } }).opts.props;
    props.onFocus?.('chest-1');
    expect(hs.selection).toMatchObject({ kind: 'prop', id: 'chest-1' });
    props.onFocus?.(null);
    expect(hs.selection).toBeNull();
    props.onFocus?.('bench'); // no rarity: never outlined
    expect(hs.selection).toBeNull();
    // A selection the game made itself is not cleared when the use focus moves on.
    hs.select({ kind: 'prop', id: 'chest-1' });
    props.onFocus?.(null);
    expect(hs.selection).toMatchObject({ kind: 'prop', id: 'chest-1' });
  });

  it('shows the progress ring on its target and hides it when progress ends', () => {
    const { hs, cam } = setup();
    const ring = hs.group.children[0] as THREE.Mesh;
    hs.progress({ kind: 'block', x: 16, y: 10, z: 12, point: { x: 16.5, y: 11, z: 12.5 } }, 0.5);
    for (let i = 0; i < 8; i++) hs.update(1 / 30, i / 30, cam);
    expect(ring.visible).toBe(true);
    const c = (ring.material as THREE.ShaderMaterial).uniforms.uCenter.value as THREE.Vector3;
    expect(c.distanceTo(new THREE.Vector3(16.5, 11, 12.5))).toBeLessThan(0.2);
    hs.progress(null, 0);
    for (let i = 0; i < 20; i++) hs.update(1 / 30, 1 + i / 30, cam);
    expect(ring.visible).toBe(false);
  });

  it('drives the rim of mobs that carry a rarity and highlight uniforms', () => {
    const { hs, cam } = setup();
    const mat = new THREE.ShaderMaterial({ uniforms: { uHiColor: { value: new THREE.Vector3() }, uHi: { value: new THREE.Vector2() } } });
    const obj = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    obj.position.set(17, 11, 15);
    hs.setMobSource(() => [{ id: 7, position: obj.position, rarity: 'epic', tappable: true, object: obj }]);
    hs.update(1 / 30, 0, cam);
    expect((mat.uniforms.uHi.value as THREE.Vector2).x).toBeGreaterThan(0.5);
    hs.select({ kind: 'object', id: 'mob-7', object: obj, rarity: 'epic' });
    for (let i = 0; i < 10; i++) hs.update(1 / 30, i / 30, cam);
    expect((mat.uniforms.uHi.value as THREE.Vector2).y).toBeCloseTo(1, 5);
    // The game's selection id (`mob:7`) names the same creature: one entry, still selected.
    hs.select({ kind: 'object', id: 'mob:7', object: obj, rarity: 'epic' });
    for (let i = 0; i < 10; i++) hs.update(1 / 30, i / 30, cam);
    expect((mat.uniforms.uHi.value as THREE.Vector2).y).toBeCloseTo(1, 5);
    expect((hs as unknown as { objects: Map<string, unknown> }).objects.size).toBe(1);
    hs.setMobSource(() => []);
    hs.select(null);
    hs.update(1 / 30, 1, cam);
    expect((mat.uniforms.uHi.value as THREE.Vector2).x + (mat.uniforms.uHi.value as THREE.Vector2).y).toBe(0);
  });
});

describe('TargetMarker drives the selection and the ring while mining', () => {
  it('outlines a find being mined, never plain rock, and leaves other selections alone', () => {
    const { hs, cam } = setup();
    const tiles = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1);
    const marker = new TargetMarker(tiles, null);
    marker.highlight = hs;
    marker.set({ x: 16, y: 10, z: 12, point: { x: 16.5, y: 11, z: 12.5 } }, 0.4, false, true);
    expect(hs.selection).toMatchObject({ kind: 'block', x: 16, y: 10, z: 12 });
    for (let i = 0; i < 8; i++) hs.update(1 / 30, i / 30, cam);
    expect((hs.group.children[0] as THREE.Mesh).visible).toBe(true);
    marker.set(null, 0, false, false);
    expect(hs.selection).toBeNull();
    marker.set({ x: 16, y: 9, z: 12 }, 0.4, false, true); // plain slate
    expect(hs.selection).toBeNull();
    hs.select({ kind: 'prop', id: 'chest' });
    marker.set(null, 0, false, false);
    expect(hs.selection).toMatchObject({ kind: 'prop', id: 'chest' });
    // A hover (not struck, no damage) leaves the focused selection alone.
    marker.set({ x: 17, y: 10, z: 12 }, 0, false, false);
    expect(hs.selection).toMatchObject({ kind: 'prop', id: 'chest' });
  });

  it('polish 2: a broken block drops its outline at once (no leftover polygons)', () => {
    const { world, terrain, hs, cam } = setup();
    hs.select({ kind: 'block', x: 16, y: 10, z: 12 });
    hs.update(1 / 30, 0, cam);
    expect(terrain.uniforms.uHiSel.value.w).toBe(2);
    world.set(16, 10, 12, B.AIR);
    hs.update(1 / 30, 0.04, cam);
    expect(terrain.uniforms.uHiSel.value.w).toBe(0);
    expect(code(terrain, 16, 10, 12)).toBe(0); // the shader skips air cells even if still selected
  });

  it('polish 2: hands the lens focal factor to the terrain, so outlines stay off cells that fill the view', () => {
    const { terrain, hs } = setup();
    const cam = new THREE.PerspectiveCamera(78, 390 / 844, 0.06, 200);
    cam.position.set(16.5, 11.6, 16.5);
    cam.updateProjectionMatrix();
    hs.update(1 / 30, 0, cam);
    const k = terrain.uniforms.uHiView.value.x;
    expect(k).toBeCloseTo(0.5 / Math.tan((39 * Math.PI) / 180), 4);
    // A 1 m cell at 1.2 m spans about half the screen height: far past the line cut-off (18 %).
    expect(k / 1.2).toBeGreaterThan(0.18);
    // At 8 m a cell is under 10 %: its outline is drawn in full.
    expect(k / 8).toBeLessThan(0.1);
  });
});

describe('LanternLight (the lantern light, VIS)', () => {
  const uniforms = () =>
    ({ uLanternRadius: { value: 0 }, uLanternIntensity: { value: 0 }, uLanternColor: { value: new THREE.Color() } }) as unknown as LightingUniforms;
  const run = (fuel: number, tier = 1, lit = true, frames = 60) => {
    const u = uniforms();
    const l = new LanternLight();
    let r = 0;
    for (let i = 0; i < frames; i++) r = l.update(u, { dt: 1 / 30, time: i / 30, fuel, lit, tier, radius: 11, intensity: 1, ember: 0.38 });
    return { r, u, l };
  };

  it('shrinks and dims the pool as the oil drains, an ember when out', () => {
    const full = run(1);
    const quarter = run(0.25);
    const empty = run(0, 1, false);
    expect(full.r).toBeCloseTo(11, 1);
    expect(quarter.r).toBeLessThan(full.r * 0.86);
    expect(quarter.r).toBeGreaterThan(full.r * 0.7);
    expect(empty.r).toBeCloseTo(11 * 0.38, 1);
    expect(empty.l.flame).toBeLessThan(0.3);
  });

  it('flickers gently (within a few percent at full oil)', () => {
    const u = uniforms();
    const l = new LanternLight();
    let lo = 9;
    let hi = 0;
    for (let i = 0; i < 900; i++) {
      l.update(u, { dt: 1 / 30, time: i / 30, fuel: 1, lit: true, tier: 1, radius: 11, intensity: 1, ember: 0.38 });
      lo = Math.min(lo, l.flicker);
      hi = Math.max(hi, l.flicker);
    }
    expect(hi - lo).toBeGreaterThan(0.02);
    expect(lo).toBeGreaterThan(0.88);
    expect(hi).toBeLessThan(1.06);
  });

  it('gives each lantern tier its own flame colour, warmer as the oil runs low', () => {
    const c1 = run(1, 1).u.uLanternColor.value.clone();
    const c3 = run(1, 3).u.uLanternColor.value.clone();
    expect(c3.b / c3.r).toBeGreaterThan(c1.b / c1.r); // the attuned lantern is paler
    const low = run(0.05, 1).u.uLanternColor.value.clone();
    expect(low.b / low.r).toBeLessThan(c1.b / c1.r); // deeper red-amber
  });
});
