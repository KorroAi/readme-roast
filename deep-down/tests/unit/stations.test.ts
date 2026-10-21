import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SOLID } from '../../src/config/blocks';
import { NODES } from '../../src/config/recipes';
import { STATION_SCALE } from '../../src/game/Stations';
import { buildPropModel } from '../../src/render/props/models';
import { defaultProgression, normalizeProgression } from '../../src/save/saveData';
import { reachableCells, standable } from '../../src/world/analysis/reachability';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { PlotDef, PropSpec, WorldLayout } from '../../src/world/gen/types';

/** The props and landmarks of the world before the progression pass (final pass W2, fed160e). */
const W2_PROP_IDS = ["campfire_0", "workbench_1", "chest_2", "bedroll_3", "crate_4", "crate_5", "crate_6", "barrel_7", "barrel_8", "crate_9", "pickaxeRack_10", "ropeCoil_11", "hangingLantern_12", "hangingLantern_13", "lanternPost_14", "crystalCluster_15", "crystalCluster_16", "crystalCluster_17", "lanternPost_18", "lanternPost_19", "lanternPost_20", "lanternPost_21", "lanternPost_22", "lanternPost_23", "lanternPost_24", "lanternPost_25", "lanternPost_26", "lanternPost_27", "lanternPost_28", "abyssMonolith_29", "crystalCluster_30", "crystalCluster_31", "crystalCluster_32", "crystalCluster_33", "lanternPost_34", "lanternPost_35", "tablet_36", "crystalCluster_37", "lanternPost_38", "crystalCluster_39", "crystalCluster_40", "crystalCluster_41", "crystalCluster_42", "lanternPost_43", "lanternPost_44", "lanternPost_45", "lanternPost_46", "lanternPost_47", "brokenCart_48", "crate_49", "ropeCoil_50", "lanternPost_51", "lanternPost_52", "f_office_0", "f_office_1", "f_office_2", "f_office_3", "f_office_4", "f_office_5", "f_office_6", "f_grotto_0", "f_grotto_1", "f_grotto_2", "f_landing_0", "f_gate_0", "f_gate_1", "f_gate_2", "f_gate_3", "f_gate_4", "f_gate_5", "f_yard_0", "f_yard_1", "f_yard_2", "f_yard_3", "f_yard_4", "f_yard_5", "f_yard_6", "f_yard_7", "f_yard_8", "f_yard_9", "f_adit_0", "f_reliquary_0", "f_reliquary_1", "f_reliquary_2", "f_rift_0", "f_rift_1", "f_rift_2", "f_rift_3", "f_rift_4", "f_rift_5", "f_rift_6", "f_rift_7", "f_gallery_0", "f_gallery_1", "f_gallery_2"];
const W2_LANDMARKS: Record<string, [number, number, number]> = {"campfire": [36.5, 101, 41.5], "workbench": [40.5, 101, 37.5], "firstCrystals": [77, 96, 55], "ledge": [92, 88, 76], "stairsTop": [96.5, 88, 73.5], "landing": [122.5, 65, 74.5], "stairsBottom": [122.5, 42, 104], "fallTop": [113.5, 96, 128.5], "fallBottom": [113.5, 8, 128.5], "spindle": [100.5, 41, 124.5], "bridge": [122.5, 42, 128.5], "monolith": [123.5, 6, 135.5], "seal": [136.5, 42, 100.5], "balcony": [136, 25, 127], "shrineDoor": [62, 42, 103.5], "tablet": [55.5, 42, 104], "hollowCrystals": [113, 42, 108], "oldCamp": [101, 42, 103.5], "office": [58, 100, 35], "grotto": [60.5, 92, 64.5], "surveyPost": [125.6, 65, 77.6], "hoistTop": [87, 88, 82.5], "hoistFoot": [85.5, 41, 84.5], "haldenFace": [103.5, 43, 56], "reliquary": [122.5, 42, 145.5], "ropeTop": [133.5, 25, 124.5], "ropeBottom": [130.5, 7, 124.5], "lastCamp": [124.4, 6, 125.4], "stonePortal": [123.5, 8, 141.5], "descentHook": [114.5, 6, 134.5], "gallery": [146.5, 25, 135.5]};

let layout: WorldLayout;
beforeAll(() => {
  layout = generateWorld();
}, 60_000);

/** World-space box of a prop's model (rotation about Y and scale applied). */
function propBox(p: Pick<PropSpec, 'kind' | 'x' | 'y' | 'z' | 'rotY' | 'scale'>, variant = 0): THREE.Box3 {
  const m = buildPropModel(p.kind, { variant });
  const mat = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY), new THREE.Vector3(p.scale, p.scale, p.scale));
  return m.bounds.clone().applyMatrix4(mat);
}

const plotBox = (p: PlotDef) => new THREE.Box3(new THREE.Vector3(p.x - 1, p.y, p.z - 1), new THREE.Vector3(p.x + 1, p.y + 3, p.z + 1));

describe('the camp plots and stations', () => {
  it('keeps every earlier prop id and landmark (the progression pass only appends)', () => {
    // The deep beyond the rift (f_glowroot_, f_choir_, f_ember_), the content pass (c_) and the focal points (f_focal_) come after.
    const ids = layout.props.map((p) => p.id).filter((id) => !/^(plotStake|runeStone)_\d+$/.test(id) && !/^(f_(glowroot|choir|ember|focal)|c)_/.test(id));
    expect(ids).toEqual(W2_PROP_IDS);
    for (const [k, v] of Object.entries(W2_LANDMARKS)) {
      expect(layout.landmarks[k], k).toBeDefined();
      layout.landmarks[k].forEach((n, i) => expect(n, k).toBeCloseTo(v[i], 2));
    }
  });

  it('has three plots, each 2 x 2 standable with 3 m headroom, a stake that opens the tree', () => {
    const plots = layout.progression!.plots;
    expect(plots.map((p) => p.station).sort()).toEqual(['forge', 'relicShelf', 'surveyTable']);
    const w = layout.world;
    for (const p of plots) {
      expect(p.cells.length).toBe(4);
      for (const [x, y, z] of p.cells) {
        expect(standable(w, x, y, z), `${p.station} ${x},${y},${z}`).toBe(true);
        for (let k = 0; k < 3; k++) expect(SOLID[w.get(x, y + k, z)], `${p.station} headroom`).toBe(0);
      }
      const stake = layout.props.find((q) => q.kind === 'plotStake' && q.station === p.station)!;
      expect(stake).toMatchObject({ interact: 'station', x: p.x, z: p.z });
      expect(NODES[p.station].result).toEqual({ kind: 'station', station: p.station });
    }
  });

  it('keeps 2.2 m from every other prop, and stays off the walk from the spawn to the camp exit', () => {
    const plots = layout.progression!.plots;
    for (const p of plots) {
      const box = plotBox(p);
      for (const q of layout.props) {
        if (q.kind === 'plotStake' || Math.abs(q.y - p.y) > 4) continue;
        const d = box.distanceToPoint(new THREE.Vector3(q.x, p.y + 0.5, q.z));
        expect(d, `${p.station} vs ${q.id}`).toBeGreaterThanOrEqual(2.2 - 1e-6);
      }
    }
    // The shortest walk from the spawn to the camp's way out (the route's first point).
    const w = layout.world;
    const sp = layout.spawn;
    const [ex, ey, ez] = layout.route[0];
    const seen = reachableCells(w, Math.floor(sp.x), Math.floor(sp.y) + 1, Math.floor(sp.z));
    const start = w.index(Math.floor(sp.x), Math.floor(sp.y), Math.floor(sp.z));
    const goal = w.index(Math.floor(ex), Math.floor(ey), Math.floor(ez));
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let h = 0; h < queue.length && !prev.has(goal); h++) {
      const i = queue[h];
      const x = i % w.sx;
      const y = Math.floor(i / w.sx) % w.sy;
      const z = Math.floor(i / (w.sx * w.sy));
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]) {
        if (!w.inBounds(x + dx, y + dy, z + dz)) continue;
        const j = w.index(x + dx, y + dy, z + dz);
        if (!seen[j] || prev.has(j)) continue;
        prev.set(j, i);
        queue.push(j);
      }
    }
    expect(prev.has(goal)).toBe(true);
    const path: number[] = [];
    for (let i = goal; i !== -1; i = prev.get(i)!) path.push(i);
    for (const p of plots) {
      const box = plotBox(p);
      for (const i of path) {
        const x = (i % w.sx) + 0.5;
        const z = Math.floor(i / (w.sx * w.sy)) + 0.5;
        expect(box.containsPoint(new THREE.Vector3(x, p.y + 0.5, z)), `${p.station} on the walk out`).toBe(false);
      }
    }
  });

  it('a built station overlaps no other prop', () => {
    for (const p of layout.progression!.plots) {
      const station = propBox({ kind: p.station, x: p.x, y: p.y, z: p.z, rotY: p.rotY, scale: STATION_SCALE[p.station] }, p.station === 'relicShelf' ? 0xff : 0);
      expect(station.max.x - station.min.x, p.station).toBeLessThanOrEqual(2.4);
      for (const q of layout.props) {
        if (q.kind === 'plotStake' || q.kind === 'hangingLantern') continue;
        const other = propBox(q);
        expect(station.intersectsBox(other), `${p.station} vs ${q.id}`).toBe(false);
      }
    }
  });
});

describe('the progression save (v2 as frozen at W3, plus the v3 content fields)', () => {
  it('fills every field with its default, and keeps what it knows', () => {
    const d = defaultProgression();
    expect(Object.keys(d).sort()).toEqual(['cache', 'compassTarget', 'day', 'expeditions', 'feats', 'finale', 'foundAt', 'gear', 'hintsShown', 'life', 'looted', 'minedDay', 'records', 'relics', 'seams', 'stations', 'trip'].sort());
    expect(d).toMatchObject({ looted: [], feats: [], life: { blocksMined: 0, embers: 0, caches: 0, secrets: 0, firsts: [] } });
    expect(normalizeProgression({ looted: ['c_chest_1', 3], feats: ['firstCopper'], life: { blocksMined: 5, walked: -3, firsts: ['copperOre', 2] } })).toMatchObject({ looted: ['c_chest_1'], feats: ['firstCopper'], life: { blocksMined: 5, walked: 0, firsts: ['copperOre'] } });
    expect(d).toMatchObject({ day: 0, expeditions: 0, trip: null, cache: null, stations: [], gear: [], relics: [], seams: [], minedDay: [], hintsShown: [], finale: false, compassTarget: null, foundAt: {} });
    // An empty or old progression object normalizes to the defaults.
    expect(normalizeProgression({})).toMatchObject({ stations: [], gear: [], relics: [], finale: false, compassTarget: null, foundAt: {} });
    const kept = normalizeProgression({ ...d, stations: ['forge', 7], gear: ['gripBoots'], relics: ['runeEye'], finale: true, compassTarget: 'haldenFace', foundAt: { hollow: [2, 62], bad: [1], worse: 'x', neg: [-1, 3] } });
    expect(kept.stations).toEqual(['forge']);
    expect(kept.gear).toEqual(['gripBoots']);
    expect(kept.relics).toEqual(['runeEye']);
    expect(kept.finale).toBe(true);
    expect(kept.compassTarget).toBe('haldenFace');
    expect(kept.foundAt).toEqual({ hollow: [2, 62] });
  });
});

describe('the debug surface', () => {
  it('mutating helpers run only under automation or with ?debug=1', async () => {
    const { vi } = await import('vitest');
    const { debugMutationsAllowed } = await import('../../src/debug/DebugApi');
    try {
      vi.stubGlobal('navigator', { webdriver: false });
      vi.stubGlobal('location', { search: '' });
      expect(debugMutationsAllowed()).toBe(false);
      vi.stubGlobal('location', { search: '?debug=0' });
      expect(debugMutationsAllowed()).toBe(false);
      vi.stubGlobal('location', { search: '?lab&debug=1' });
      expect(debugMutationsAllowed()).toBe(true);
      vi.stubGlobal('location', { search: '' });
      vi.stubGlobal('navigator', { webdriver: true });
      expect(debugMutationsAllowed()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
