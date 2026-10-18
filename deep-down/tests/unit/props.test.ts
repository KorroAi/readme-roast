import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PropKind, PropSpec } from '../../src/world/gen/types';
import type { LightingUniforms } from '../../src/render/lighting';
import { PropRenderer } from '../../src/render/props/PropRenderer';
import { PROP_KINDS, PROP_VARIANTS, buildPropModel, propVariant, type PropModel } from '../../src/render/props/models';

/** Lighting uniforms with tiny placeholder volumes: enough to construct materials in Node. */
function lighting(): LightingUniforms {
  const tex = (n: number) => new THREE.Data3DTexture(new Uint8Array(n * n * n * 4), n, n, n);
  return {
    uLightTex: { value: tex(2) },
    uLanternTex: { value: tex(2) },
    uWorldSize: { value: new THREE.Vector3(160, 128, 160) },
    uLanternOrigin: { value: new THREE.Vector3() },
    uLanternPos: { value: new THREE.Vector3() },
    uLanternColor: { value: new THREE.Color(1, 0.7, 0.4) },
    uLanternRadius: { value: 11 },
    uLanternIntensity: { value: 1 },
    uAmbient: { value: new THREE.Color() },
    uOpenAmbient: { value: new THREE.Color() },
    uEmitGain: { value: 1.7 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.02 },
    uTime: { value: 0 },
    uDebug: { value: new THREE.Vector3() },
  };
}

function spec(kind: PropKind, over: Partial<PropSpec> = {}): PropSpec {
  return { id: `${kind}_t`, kind, x: 0, y: 0, z: 0, rotY: 0, scale: 1, anchor: null, emitters: [], seed: 3, ...over };
}

/** Expected model size per kind (width X, height Y, depth Z ranges in meters, unscaled). */
const SIZE: Record<PropKind, [[number, number], [number, number], [number, number]]> = {
  campfire: [[0.75, 1.1], [0.45, 0.9], [0.75, 1.1]],
  workbench: [[1.45, 1.8], [0.85, 1.25], [0.6, 1.0]],
  chest: [[0.8, 1.05], [0.55, 0.7], [0.55, 0.75]],
  bedroll: [[0.6, 1.0], [0.1, 0.3], [1.6, 2.1]],
  crate: [[0.7, 0.9], [0.7, 0.9], [0.7, 0.9]],
  barrel: [[0.55, 0.85], [0.85, 1.05], [0.55, 0.85]],
  lanternPost: [[0.3, 0.7], [1.3, 1.6], [0.4, 0.8]],
  hangingLantern: [[0.15, 0.4], [1.5, 2.0], [0.15, 0.4]],
  crystalCluster: [[0.5, 1.2], [0.6, 1.4], [0.5, 1.2]],
  tablet: [[0.5, 0.9], [0.9, 1.15], [0.4, 0.8]],
  pickaxeRack: [[0.7, 1.1], [0.9, 1.4], [0.3, 0.7]],
  ropeCoil: [[0.35, 1.1], [0.1, 0.3], [0.35, 0.8]],
  brokenCart: [[0.9, 1.8], [0.5, 1.4], [0.7, 1.5]],
  abyssMonolith: [[12, 16], [24, 28], [12, 16]],
};

function geometries(m: PropModel): THREE.BufferGeometry[] {
  return [m.body, ...(m.glow ? [m.glow] : []), ...m.parts.map((p) => p.geometry)];
}

function checkGeometry(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const emi = g.getAttribute('aEmissive');
  expect(pos.count).toBeGreaterThan(0);
  expect(nrm.count).toBe(pos.count);
  expect(col.count).toBe(pos.count);
  expect(col.itemSize).toBe(3);
  expect(col.normalized).toBe(true);
  expect(emi.count).toBe(pos.count);
  const n = new THREE.Vector3();
  let invalid = 0;
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nrm, i);
    if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)) || Math.abs(n.length() - 1) > 1e-3) invalid++;
  }
  expect(invalid).toBe(0);
  // Every triangle faces the way its stored normal says (outward, counter-clockwise).
  const idx = g.getIndex()!;
  expect(idx.count % 3).toBe(0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let bad = 0;
  for (let t = 0; t < idx.count; t += 3) {
    if (Math.max(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)) >= pos.count) bad++;
    a.fromBufferAttribute(pos, idx.getX(t));
    b.fromBufferAttribute(pos, idx.getX(t + 1));
    c.fromBufferAttribute(pos, idx.getX(t + 2));
    const geo = b.sub(a).cross(c.sub(a));
    n.fromBufferAttribute(nrm, idx.getX(t));
    if (geo.lengthSq() > 1e-14 && geo.normalize().dot(n) < 0.9) bad++;
  }
  expect(bad).toBe(0);
}

describe('prop models', () => {
  for (const kind of PROP_KINDS) {
    it(`${kind}: valid geometry and sensible size in every variant`, () => {
      for (let v = 0; v < PROP_VARIANTS[kind]; v++) {
        const m = buildPropModel(kind, { variant: v, hangHeight: kind === 'hangingLantern' ? 1.8 : undefined });
        for (const g of geometries(m)) checkGeometry(g);
        const size = m.bounds.getSize(new THREE.Vector3());
        const [w, h, d] = SIZE[kind];
        expect(size.x, `${kind}#${v} width`).toBeGreaterThanOrEqual(w[0]);
        expect(size.x, `${kind}#${v} width`).toBeLessThanOrEqual(w[1]);
        expect(size.y, `${kind}#${v} height`).toBeGreaterThanOrEqual(h[0]);
        expect(size.y, `${kind}#${v} height`).toBeLessThanOrEqual(h[1]);
        expect(size.z, `${kind}#${v} depth`).toBeGreaterThanOrEqual(d[0]);
        expect(size.z, `${kind}#${v} depth`).toBeLessThanOrEqual(d[1]);
        // Props stand on their base point: nothing sinks into the floor.
        expect(m.bounds.min.y).toBeGreaterThan(-0.005);
        expect(m.hitBoxes.length).toBeGreaterThan(0);
      }
    });
  }

  it('glowing kinds carry emissive vertices and furniture does not glow', () => {
    const maxEmissive = (m: PropModel) =>
      Math.max(...geometries(m).map((g) => Math.max(...(g.getAttribute('aEmissive').array as Uint8Array))));
    for (const kind of ['campfire', 'lanternPost', 'hangingLantern', 'crystalCluster', 'tablet', 'abyssMonolith'] as const) {
      const m = buildPropModel(kind, { variant: 0 });
      expect(m.anim).not.toBe('none');
      expect(maxEmissive(m)).toBeGreaterThan(100);
    }
    for (const kind of ['workbench', 'chest', 'crate', 'barrel', 'bedroll', 'pickaxeRack', 'ropeCoil', 'brokenCart'] as const) {
      expect(maxEmissive(buildPropModel(kind, { variant: 0 }))).toBe(0);
    }
  });

  it('is deterministic per kind and variant', () => {
    for (const kind of ['crystalCluster', 'campfire', 'abyssMonolith'] as const) {
      const a = buildPropModel(kind, { variant: 0 }).body.getAttribute('position').array;
      const b = buildPropModel(kind, { variant: 0 }).body.getAttribute('position').array;
      expect(Array.from(a)).toEqual(Array.from(b));
    }
    expect(propVariant('crate', 1234)).toBe(propVariant('crate', 1234));
  });

  it('keeps the monolith under its box budget', () => {
    const m = buildPropModel('abyssMonolith', { variant: 0 });
    const vertices = geometries(m).reduce((n, g) => n + g.getAttribute('position').count, 0);
    expect(vertices / 24).toBeLessThan(1500);
  });

  it('hangs lanterns from the ceiling height they are given', () => {
    const short = buildPropModel('hangingLantern', { variant: 0, hangHeight: 1.0 });
    const long = buildPropModel('hangingLantern', { variant: 0, hangHeight: 2.4 });
    expect(short.bounds.max.y).toBeCloseTo(1.0, 2);
    expect(long.bounds.max.y).toBeCloseTo(2.4, 2);
    expect(long.sway!.y).toBeCloseTo(2.4, 5);
  });
});

describe('PropRenderer', () => {
  it('adds, finds and removes props, sharing geometry per kind and variant', () => {
    const r = new PropRenderer(lighting());
    const a = spec('crate', { id: 'a', seed: 1 });
    const b = spec('crate', { id: 'b', seed: 1, x: 3 });
    r.add(a);
    r.add(b);
    expect(r.has('a')).toBe(true);
    expect(r.has('b')).toBe(true);
    expect(r.has('c')).toBe(false);
    expect(r.modelCount).toBe(1);
    expect(r.group.children.length).toBe(2);

    const body = (r.group.children[0].children[0] as THREE.Mesh).geometry;
    let disposed = 0;
    body.addEventListener('dispose', () => disposed++);
    r.remove('a');
    expect(r.has('a')).toBe(false);
    expect(disposed).toBe(0);
    r.remove('b');
    expect(disposed).toBe(1);
    expect(r.modelCount).toBe(0);
    expect(r.group.children.length).toBe(0);
    r.remove('missing');
  });

  it('places props at their base point with rotation and scale', () => {
    const r = new PropRenderer(lighting());
    r.add(spec('crate', { id: 'b', x: 10, y: 5, z: -4, rotY: 0.3, scale: 2 }));
    const box = r.bounds('b')!;
    expect(box.min.y).toBeCloseTo(5, 3);
    expect(box.max.y - box.min.y).toBeCloseTo(1.6, 1);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(10, 1);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(-4, 1);
    expect(r.bounds('nope')).toBeNull();
  });

  it('raycasts the nearest prop in front and misses behind or out of range', () => {
    const r = new PropRenderer(lighting());
    r.add(spec('crate', { id: 'near', x: 5, z: 5 }));
    r.add(spec('crate', { id: 'far', x: 5, z: 9 }));
    const dir = new THREE.Vector3(0, 0, 1);
    const hit = r.raycast(new THREE.Vector3(5, 0.4, 0), dir, 20)!;
    expect(hit.id).toBe('near');
    expect(hit.distance).toBeGreaterThan(4.5);
    expect(hit.distance).toBeLessThan(4.7);
    expect(hit.point.z).toBeCloseTo(hit.distance, 5);
    expect(r.raycast(new THREE.Vector3(5, 0.4, 0), dir, 3)).toBeNull();
    expect(r.raycast(new THREE.Vector3(5, 0.4, 12), dir, 20)).toBeNull();
    expect(r.raycast(new THREE.Vector3(5, 2, 0), dir, 20)).toBeNull();
    // From between the crates, looking back, the near one is found.
    const back = r.raycast(new THREE.Vector3(5, 0.4, 7), new THREE.Vector3(0, 0, -1), 20)!;
    expect(back.id).toBe('near');
  });

  it('tests rays against oriented boxes, not world-aligned ones', () => {
    const r = new PropRenderer(lighting());
    r.add(spec('crate', { id: 'turned', rotY: Math.PI / 4 }));
    const hit = r.raycast(new THREE.Vector3(-3, 0.4, 0), new THREE.Vector3(1, 0, 0), 10)!;
    // A 0.81 m crate turned 45 degrees presents its corner: about 0.57 m from its center.
    expect(hit.distance).toBeCloseTo(3 - 0.405 * Math.SQRT2, 1);
    // Straight down through a corner of its world AABB, outside the turned footprint: a miss.
    const down = new THREE.Vector3(0, -1, 0);
    expect(r.raycast(new THREE.Vector3(0.45, 3, 0.45), down, 10)).toBeNull();
    expect(r.raycast(new THREE.Vector3(0.1, 3, 0.1), down, 10)!.distance).toBeCloseTo(2.2, 2);
  });

  it('picks the monolith by its stepped tiers', () => {
    const r = new PropRenderer(lighting());
    r.add(spec('abyssMonolith', { id: 'm' }));
    const dir = new THREE.Vector3(0, 0, -1);
    const hit = r.raycast(new THREE.Vector3(0, 10, 30), dir, 60)!;
    expect(hit.id).toBe('m');
    expect(hit.distance).toBeGreaterThan(25);
    expect(r.raycast(new THREE.Vector3(6, 10, 30), dir, 60)).toBeNull();
  });

  it('animates without NaNs, flashes and highlights', () => {
    const r = new PropRenderer(lighting());
    for (const kind of PROP_KINDS) r.add(spec(kind, { id: kind, x: PROP_KINDS.indexOf(kind) * 3 }));
    const cam = new THREE.Vector3(0, 2, 5);
    for (let i = 0; i < 120; i++) r.update(1 / 60, i / 60, cam);
    r.group.updateMatrixWorld(true);
    r.group.traverse((o) => {
      for (const e of o.matrixWorld.elements) expect(Number.isFinite(e)).toBe(true);
    });

    const crate = r.group.getObjectByName('crate')!.children[0] as THREE.Mesh;
    const shared = crate.material;
    r.flash('crate');
    const flashing = crate.material as THREE.ShaderMaterial;
    expect(flashing).not.toBe(shared);
    expect(flashing.uniforms.uFlash.value).toBeGreaterThan(0.5);
    r.update(0.5, 2.5, cam);
    expect(crate.material).toBe(shared);

    r.setHighlight('crate');
    const lit = crate.material as THREE.ShaderMaterial;
    expect(lit).not.toBe(shared);
    expect((lit.uniforms.uTint.value as THREE.Color).r).toBeGreaterThan(1);
    r.setHighlight(null);
    expect(crate.material).toBe(shared);

    r.dispose();
    expect(r.group.children.length).toBe(0);
  });

  it('flickers fire and sways hanging lanterns over time', () => {
    const r = new PropRenderer(lighting());
    r.add(spec('campfire', { id: 'fire' }));
    r.add(spec('hangingLantern', { id: 'lamp', x: 2, y: 2, anchor: [2, 4, 0] }));
    const cam = new THREE.Vector3(0, 1.6, 3);
    const flame = r.group.getObjectByName('fire')!.children.find((c) => c.position.y > 0) as THREE.Mesh;
    const heights = new Set<number>();
    for (let i = 0; i < 30; i++) {
      r.update(1 / 30, i / 30, cam);
      heights.add(Math.round(flame.scale.y * 1000));
    }
    expect(heights.size).toBeGreaterThan(5);
    const lamp = r.group.getObjectByName('lamp')!;
    const pivot = lamp.children[0];
    expect(pivot.position.y).toBeCloseTo(2, 3);
    expect(Math.abs(pivot.rotation.x) + Math.abs(pivot.rotation.z)).toBeGreaterThan(0.001);
    // Its top reaches the ceiling block it hangs from.
    expect(r.bounds('lamp')!.max.y).toBeCloseTo(4, 2);
  });

  it('hides props beyond the view distance', () => {
    const r = new PropRenderer(lighting());
    r.add(spec('crate', { id: 'c', x: 200 }));
    r.update(1 / 60, 0, new THREE.Vector3(0, 0, 0));
    expect(r.group.getObjectByName('c')!.visible).toBe(false);
    r.update(1 / 60, 0, new THREE.Vector3(190, 0, 0));
    expect(r.group.getObjectByName('c')!.visible).toBe(true);
  });
});
