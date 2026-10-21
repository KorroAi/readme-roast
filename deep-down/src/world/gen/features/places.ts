import { B, SOLID, isEmitter } from '../../../config/blocks';
import { LIVING_TABLES } from '../../../config/livingRock';
import { hash32 } from '../../../core/math';
import type { PropSpec } from '../types';
import type { FeatureBuilder } from './index';
import { applyLiving, rollLiving } from './living';
import type { LivingSite, V3 } from './types';
import { deepZones } from './deep';

/**
 * The places of the feature pass, in build order. Coordinates are world voxels; "walk y" is the
 * explorer's feet (the floor voxel is walk y - 1). Every site was checked for solid rock before
 * carving and for reachability after (tests/unit/worldFeatures.test.ts).
 */
export function buildPlaces(b: FeatureBuilder): void {
  surveyOffice(b);
  mothGrotto(b);
  landingPost(b);
  gateWay(b);
  haldenYard(b);
  reliquary(b);
  riftFloor(b);
  lampGallery(b);
  frayedRope(b);
  bloomSites(b);
  areas(b);
  // The deep beyond the rift (finished game, content): last, with its own random stream.
  deepZones(b);
}

const ROCK = new Set<number>([B.SLATE, B.DEEP_SLATE, B.UMBER, B.GRAVEL, B.SOIL, B.MOSS]);
const GLIMMER = (min: number, max: number) => ({ hardness: 2.5, tier: 1, drop: 'glimmerShard' as const, min, max });

// ---------------------------------------------------------------------------------------------
// P1. The Halden Survey Office: a timber-lined room off the first bare stretch of the tunnel, where
// the earlier expedition kept its books (the first Halden log).

function surveyOffice(b: FeatureBuilder): void {
  b.box('office', [52, 99, 30], [63, 105, 40]);
  for (let z = 31; z <= 37; z++)
    for (let x = 53; x <= 62; x++) {
      const wob = b.noise.noise2(x * 0.4, z * 0.4) * 0.6;
      const h = 3 + (x > 55 && x < 61 && z > 32 && z < 36 ? 1 : 0) + (wob > 0.3 ? 1 : 0);
      for (let y = 100; y < 100 + h; y++) b.carve(x, y, z);
      b.put(x, 99, z, B.PLANK);
    }
  // The door off the tunnel's north wall, framed in timber.
  for (let z = 38; z <= 39; z++) for (let x = 55; x <= 56; x++) for (let y = 100; y <= 101; y++) b.carve(x, y, z);
  b.beam('f_office_post_w', [55.0, 100, 39.86], [55.0, 102.1, 39.86], 0.24, 0.28);
  b.beam('f_office_post_e', [57.0, 100, 39.86], [57.0, 102.1, 39.86], 0.24, 0.28);
  b.beam('f_office_lintel', [54.75, 102.2, 39.86], [57.25, 102.2, 39.86], 0.28, 0.28);
  // Two ceiling timbers across the room (hidden collision where they cross open space).
  for (const z of [33, 36]) {
    for (let x = 53; x <= 62; x++) if (b.isAir(x, 103, z)) b.put(x, 103, z, B.STRUCTURE_TIMBER);
    b.beam(`f_office_ceiling_${z}`, [52.8, 103.17, z + 0.5], [63.2, 103.17, z + 0.5], 0.28, 0.34);
  }
  // The warm practical: a lantern hung from the first timber over the desk.
  b.prop('office', { kind: 'hangingLantern', x: 59.5, y: 101.3, z: 33.5, anchor: [59, 103, 33], emitters: [[59, 101, 33]] });
  const desk = b.prop('office', { kind: 'crate', x: 60.5, y: 100, z: 33.0, rotY: 0.1, anchor: [60, 99, 33] });
  b.prop('office', { kind: 'haldenNote', x: 60.4, y: 100.8, z: 33.05, rotY: -0.35, anchor: desk.anchor, variant: [0, 2], interact: 'feature', feature: { kind: 'note', id: 'office' } });
  b.prop('office', { kind: 'crate', x: 61.6, y: 100, z: 36.2, rotY: -0.25, scale: 0.8 });
  b.prop('office', { kind: 'barrel', x: 53.8, y: 100, z: 32.0, rotY: 0.6 });
  b.prop('office', { kind: 'pickaxeRack', x: 53.6, y: 100, z: 35.5, rotY: Math.PI / 2 });
  b.prop('office', { kind: 'ropeCoil', x: 57.5, y: 100, z: 36.6, rotY: 1.1 });
  // The far corner caved in: rubble and a timber brought down with it.
  b.ctx.blob([62, 100, 31], 1.6, (x, y, z) => {
    if (y >= 100 && x <= 63 && z >= 30 && b.isAir(x, y, z)) b.put(x, y, z, (x + y + z) % 3 === 0 ? B.SLATE : B.GRAVEL);
  });
  b.beam('f_office_fallen', [59.0, 100.3, 31.4], [62.5, 101.8, 32.8], 0.3, 0.36, 2, 0.2);
  // Two small copper veins in the walls, the first ore inside the camp's reach.
  const veins: V3[] = [];
  for (const at of [[53, 101, 34], [62, 101, 35]] as V3[]) {
    const v = growVein(b, at, B.COPPER_ORE, 2 + (b.rng.next() < 0.5 ? 1 : 0), [52, 99, 30], [63, 105, 40]);
    if (v) veins.push(v);
  }
  b.landmark('office', [58, 100, 35]);
  b.poi('office.door', [55.5, 101, 39.5], 'sight');
  b.poi('office.desk', [60.5, 100.8, 33], 'sight');
  b.poi('office.lantern', [59.5, 101.6, 33.5], 'sight');
  for (const [k, v] of veins.entries()) b.poi(`office.copper${k}`, [v[0] + 0.5, v[1] + 0.5, v[2] + 0.5], 'pickup');
}

// ---------------------------------------------------------------------------------------------
// P2. The Moth Grotto (secret 1): a crack in the tunnel's west wall, a gravel plug the rusty pick
// opens, a squeeze one metre wide, and a crystal geode alive with moths.

function mothGrotto(b: FeatureBuilder): void {
  b.box('grotto', [53, 90, 57], [71, 100, 71]);
  // The squeeze: one metre wide, four tall and straight (the camera stays behind the explorer
  // along it instead of pressing into a side wall at a bend), a step down near its far end.
  const squeeze: V3[] = [[69, 94, 61], [68, 94, 61], [67, 94, 61], [66, 94, 61], [65, 93, 61], [64, 93, 61], [63, 92, 61], [62, 92, 61]];
  // (Three tall where it meets the tunnel's wall, x 68..69: a fourth cell there would let a walker
  // drop in from the tunnel's upper floor beside it, past the plug.)
  for (const [x, y, z] of squeeze) for (let k = 0; k < (x >= 68 ? 3 : 4); k++) b.carve(x, y + k, z);
  // The plug the pick opens, and the slit over it the cold light leaks through.
  // Round 2: loose stone (plain gravel no longer yields to the pick).
  b.put(70, 94, 61, B.RUBBLE);
  b.put(70, 95, 61, B.RUBBLE);
  b.carve(70, 96, 61);
  b.carve(69, 96, 61);
  // Crystal in the squeeze: one in its roof a few metres in (its cold light reaches the slit) and a
  // glint on its far wall seen straight through the slit from the tunnel.
  for (const [x, y, z] of [[66, 98, 61], [63, 96, 61]] as V3[]) if (ROCK.has(b.get(x, y, z))) b.put(x, y, z, B.CRYSTAL);
  // The geode.
  for (let z = 59; z <= 70; z++)
    for (let x = 54; x <= 66; x++)
      for (let y = 92; y <= 99; y++) {
        const e = Math.hypot((x + 0.5 - 60.5) / 5.2, (y - 92) / 4.2, (z + 0.5 - 64.5) / 4.6) + b.noise.noise3(x * 0.3, y * 0.3, z * 0.3) * 0.18;
        if (e < 1) b.carve(x, y, z);
      }
  b.ctx.crystalSeam([58, 93, 69], [62, 94, 69], 0.9, 3);
  // Its cold key light hangs at the squeeze's mouth: it fills the geode and leaks back up the squeeze.
  b.keyLight(63, 94, 61, B.LIGHT_CYAN);
  for (const [x, z, s, r] of [[58, 66.5, 1.1, 0.4], [62.5, 61.8, 0.8, 2.1], [56.8, 63.2, 0.9, 4.0]] as const) {
    b.prop('grotto', { kind: 'crystalCluster', x, y: b.ground(x, z, 92), z, rotY: r, scale: s, minable: GLIMMER(1, 2) });
  }
  // Fossil sockets for the content stream: exposed cells of the west wall.
  const fossil: V3[] = [];
  for (let z = 62; z <= 66 && fossil.length < 6; z++)
    for (let y = 92; y <= 94 && fossil.length < 6; y++)
      for (let x = 54; x <= 57; x++) {
        if (!ROCK.has(b.get(x, y, z)) || !b.isAir(x + 1, y, z)) continue;
        fossil.push([x, y, z]);
        break;
      }
  b.layout.sockets.fossil = fossil;
  b.discovery('mothGrotto', [55, 91, 59], [66, 98, 70]);
  b.moths('grottoCrack', [71.35, 96.35, 61.5], 3, 0.22, true);
  b.moths('grotto', [60.5, 94.6, 64.5], 10, 2.4);
  b.landmark('grotto', [60.5, 92, 64.5]);
  b.poi('grotto.crack', [70.5, 96.3, 61.5], 'sight');
  b.poi('grotto.squeeze', [66.5, 95, 61.5], 'sight');
  b.poi('grotto.geode', [60.5, 94, 64.5], 'landmark');
  b.poi('grotto.cluster', [58, 92.5, 66.5], 'pickup');
  b.poi('grotto.seam', [60, 93.5, 69], 'pickup');
}

// ---------------------------------------------------------------------------------------------
// P6. The landing's survey post: the second Halden log, pointing at the rope on the far balcony.

function landingPost(b: FeatureBuilder): void {
  b.beam('f_landing_post', [125.6, 65, 77.6], [125.6, 66.3, 77.6], 0.18, 0.18);
  b.beam('f_landing_board', [125.6, 65.85, 77.18], [125.6, 65.85, 78.02], 0.06, 0.2);
  b.prop('landing', { kind: 'haldenNote', x: 125.6, y: 66.3, z: 77.6, rotY: -2.35, anchor: [125, 64, 77], variant: [1, 2], interact: 'feature', feature: { kind: 'note', id: 'landing' } });
  b.landmark('surveyPost', [125.6, 65, 77.6]);
  b.poi('landing.post', [125.6, 66.3, 77.6], 'sight');
}

// ---------------------------------------------------------------------------------------------
// The way beyond the seal: the Halden carried their rigging this way to the balcony. A cache of it
// in the corridor, and a lamp they hung in a niche halfway down the gate stair.

function gateWay(b: FeatureBuilder): void {
  b.prop('gate', { kind: 'crate', x: 145.3, y: 42, z: 99.6, rotY: 0.15, scale: 0.9 });
  b.prop('gate', { kind: 'crate', x: 145.35, y: 42.72, z: 99.6, rotY: 0.7, scale: 0.65, anchor: [145, 41, 99] });
  b.prop('gate', { kind: 'barrel', x: 146.75, y: 42, z: 99.55, rotY: 0.4, scale: 0.9 });
  b.prop('gate', { kind: 'ropeCoil', x: 144.0, y: 42, z: 99.8, rotY: 1.9 });
  b.poi('gate.cache', [145.8, 42.6, 99.6], 'sight');
  // The niche in the stair's west wall (the stair walks x 147..151, one metre down per metre).
  b.box('gateNiche', [145, 35, 106], [147, 41, 109]);
  for (let z = 107; z <= 108; z++) for (let y = 38; y <= 39; y++) b.carve(146, y, z);
  if (b.solid(146, 40, 107)) b.prop('gate', { kind: 'hangingLantern', x: 146.5, y: 38.7, z: 107.5, anchor: [146, 40, 107], emitters: [[146, 38, 107]], light: B.LIGHT_LAMP });
  b.prop('gate', { kind: 'ropeCoil', x: 146.5, y: 38, z: 108.4, rotY: 0.6, variant: [1, 2] });
  b.poi('gate.niche', [146.5, 39, 107.8], 'sight');
}

// ---------------------------------------------------------------------------------------------
// P3. The Halden Yard and the hoist (the shortcut): a headframe on the ledge's brink, a 47 m rope
// to a stage on the hall floor, a track with a cart, a spoil heap, and the Halden Face adit with
// its living walls. Chained from below until released.

function haldenYard(b: FeatureBuilder): void {
  b.box('yard', [76, 40, 50], [110, 94, 95]);
  // Hoist head: clear the crags on the brink where the cage comes up.
  for (let z = 81; z <= 84; z++) for (let x = 85; x <= 88; x++) for (let y = 88; y <= 91; y++) if (b.solid(x, y, z)) b.carve(x, y, z);
  // Shear legs leaning out over the drop, braced back onto the ledge, the sheave under their apex.
  const apex: V3 = [85.6, 92.45, 82.5];
  b.beam('f_yard_leg_n', [85.35, 87.95, 81.2], apex, 0.26, 0.26);
  b.beam('f_yard_leg_s', [89.3, 87.95, 83.35], apex, 0.26, 0.26);
  b.beam('f_yard_stay', [88.45, 87.95, 81.35], apex, 0.22, 0.22);
  b.beam('f_yard_tie', [85.45, 90.0, 81.75], [87.75, 90.0, 82.95], 0.14, 0.14);
  b.prop('yard', { kind: 'hoistWinch', x: 85.6, y: 91.6, z: 82.5, rotY: Math.PI / 2, anchor: null, variant: [0, 2] });
  b.lamp('yard', 88.5, 88, 80.5, 0.6, B.LIGHT_LAMP);
  // The brake drum at the head: the top end of the ride.
  b.prop('yard', { kind: 'hoistWinch', x: 89.0, y: 88, z: 82.3, rotY: -Math.PI / 2, anchor: [89, 87, 82], variant: [1, 2], interact: 'feature', feature: { kind: 'hoist', id: 'hoist', end: 'top' } });
  // (The rope and the cage it carries are drawn by game/WorldFeatures: they move with the ride.)

  // The foot stage on the hall floor (walk y 41): a plank deck on the voxel floor.
  for (let z = 83; z <= 87; z++)
    for (let x = 83; x <= 88; x++) {
      b.put(x, 40, z, B.PLANK);
      for (let y = 41; y <= 44; y++) if (b.solid(x, y, z)) b.carve(x, y, z);
    }
  b.structure({ kind: 'deck', id: 'f_yard_deck', x0: 83, x1: 89, z0: 83, z1: 88, y: 41.1, along: 'x', seed: b.rng.int(0, 1 << 30) });
  b.prop('yard', { kind: 'hoistWinch', x: 86.8, y: 41.1, z: 85.6, rotY: Math.PI / 2, anchor: [86, 40, 85], variant: [1, 2], interact: 'feature', feature: { kind: 'hoist', id: 'hoist', end: 'bottom' } });
  b.prop('yard', { kind: 'crate', x: 84.0, y: 41.1, z: 86.4, rotY: 0.2, anchor: [84, 40, 86] });
  b.prop('yard', { kind: 'barrel', x: 87.8, y: 41.1, z: 83.4, rotY: 1.3, anchor: [87, 40, 83] });
  b.lamp('yard', 88.6, 41.1, 87.4, -0.8, B.LIGHT_AMBER, true);
  b.beam('f_yard_notepost', [83.6, 41.1, 85.0], [83.6, 42.6, 85.0], 0.2, 0.2);
  b.prop('yard', { kind: 'haldenNote', x: 83.6, y: 42.6, z: 85.0, rotY: Math.PI / 2, anchor: [83, 40, 85], variant: [1, 2], interact: 'feature', feature: { kind: 'note', id: 'yard' } });

  // The track east of the stage: ballast, sleepers, rails, a buffer stop and the cart off its end.
  for (let x = 89; x <= 99; x++)
    for (const z of [85, 86]) {
      for (let y = 41; y <= 43; y++) if (b.solid(x, y, z)) b.carve(x, y, z);
      b.put(x, 40, z, B.GRAVEL);
    }
  for (let x = 88.9; x <= 99.4; x += 0.8) b.beam(`f_yard_sleeper_${Math.round(x * 10)}`, [x, 41.06, 84.9], [x, 41.06, 86.1], 0.22, 0.12);
  for (let x0 = 88.5; x0 < 99.4; x0 += 3) {
    const x1 = Math.min(99.6, x0 + 3);
    for (const z of [85.1, 85.9]) b.beam(`f_yard_rail_${Math.round(x0)}_${Math.round(z * 10)}`, [x0, 41.165, z], [x1, 41.165, z], 0.07, 0.09);
  }
  for (const z of [85.0, 86.0]) b.beam(`f_yard_buffer_${Math.round(z)}`, [99.8, 41.0, z], [99.8, 41.9, z], 0.2, 0.2);
  b.beam('f_yard_buffer_bar', [99.8, 41.7, 84.65], [99.8, 41.7, 86.35], 0.18, 0.24);
  b.prop('yard', { kind: 'brokenCart', x: 100.8, y: b.ground(100.8, 87.2, 41), z: 87.2, rotY: 2.6 });
  b.lamp('yard', 98.7, 41, 87.4, -1.2, B.LIGHT_LAMP);

  // The spoil heap, with copper still in it.
  const spoil: V3[] = [];
  b.ctx.blob([95, 41, 79.5], 2.4, (x, y, z) => {
    if (y >= 39 && b.isAir(x, y, z) && !isEmitter(b.get(x, y, z))) b.put(x, y, z, B.GRAVEL);
  });
  for (let z = 77; z <= 82; z++)
    for (let x = 92; x <= 98; x++)
      for (let y = 44; y >= 40; y--) {
        if (b.get(x, y, z) !== B.GRAVEL || !b.isAir(x, y + 1, z)) continue;
        spoil.push([x, y, z]);
        break;
      }
  for (let k = 0; k < 4 && spoil.length; k++) {
    const [x, y, z] = spoil.splice(Math.floor(b.rng.next() * spoil.length), 1)[0];
    b.put(x, y, z, B.COPPER_ORE);
  }

  // The Halden Face: an adit north from the terrace under the first flight, two timber sets, a
  // track stub, a lamp hung from the roof, and walls that grow back.
  for (let z = 53; z <= 62; z++)
    for (let x = 102; x <= 104; x++) {
      for (let y = 43; y <= 45; y++) b.carve(x, y, z);
      b.put(x, 42, z, B.GRAVEL);
    }
  for (const z of [61.6, 59.2]) {
    const id = Math.round(z * 10);
    b.beam(`f_adit_post_w_${id}`, [102.12, 43, z], [102.12, 45.8, z], 0.24, 0.24);
    b.beam(`f_adit_post_e_${id}`, [104.88, 43, z], [104.88, 45.8, z], 0.24, 0.24);
    b.beam(`f_adit_cap_${id}`, [101.9, 45.86, z], [105.1, 45.86, z], 0.26, 0.28);
  }
  for (const z of [56.8, 58.6, 60.4]) b.beam(`f_adit_sleeper_${Math.round(z * 10)}`, [102.6, 43.06, z], [104.4, 43.06, z], 0.22, 0.12);
  for (const x of [103.1, 103.9]) b.beam(`f_adit_rail_${Math.round(x * 10)}`, [x, 43.165, 56.2], [x, 43.165, 62.4], 0.07, 0.09);
  // Hung from the roof rock over the second set (the first solid cell above the adit).
  let roof = 46;
  while (roof < 50 && !b.solid(103, roof, 60)) roof++;
  if (b.solid(103, roof, 60)) b.prop('adit', { kind: 'hangingLantern', x: 103.5, y: 44.3, z: 60.4, anchor: [103, roof, 60], emitters: [[103, 44, 60]], light: B.LIGHT_AMBER });
  else b.lamp('adit', 102.6, 43, 61.0, 0.4, B.LIGHT_LAMP);
  const cells: number[] = [];
  const host: number[] = [];
  const take = (x: number, y: number, z: number) => {
    const id = b.get(x, y, z);
    if (!ROCK.has(id)) return;
    cells.push(b.w.index(x, y, z));
    host.push(id);
  };
  for (let z = 53; z <= 61; z++) for (let y = 43; y <= 45; y++) for (const x of [101, 105]) take(x, y, z);
  for (let y = 43; y <= 45; y++) for (let x = 102; x <= 104; x++) take(x, y, 52);
  livingSite(b, { id: 'haldenFace', area: 'adit', cells, host, box: { id: 'haldenFace', min: [100, 42, 51], max: [106, 47, 63] } });

  // The ride: up from the stage to the brink in one pull.
  b.layout.links.push({
    id: 'hoist',
    kind: 'hoist',
    top: [87, 88, 82.5],
    bottom: [85.5, 41, 84.5],
    path: [[87.0, 88, 82.5], [85.6, 88.05, 82.5], [85.6, 41.05, 82.5], [85.5, 41, 84.5]],
    speedDown: 9,
    speedUp: 9,
    lock: 'releaseAtBottom',
  });
  b.discovery('hoist', [0, 0, 0], [0, 0, 0]);
  b.moths('hoistLamp', [88.6, 43.6, 87.4], 3, 0.8);
  b.landmark('hoistTop', [87, 88, 82.5]);
  b.landmark('hoistFoot', [85.5, 41, 84.5]);
  b.landmark('haldenFace', [103.5, 43, 56]);
  b.poi('yard.headframe', [85.6, 91.5, 82.5], 'landmark', false);
  b.poi('yard.hoistTop', [87, 88.5, 82.5], 'sight');
  b.poi('yard.stage', [85.5, 41.5, 85.5], 'sight');
  b.poi('yard.note', [83.6, 42.6, 85.0], 'sight');
  b.poi('yard.track', [94, 41.3, 85.5], 'sight');
  b.poi('yard.cart', [100.8, 41.5, 87.2], 'sight');
  b.poi('yard.spoil', [95, 42, 79.5], 'pickup');
  b.poi('adit.mouth', [103.5, 44, 61.5], 'sight');
  b.poi('adit.face', [103.5, 44, 53.5], 'pickup');
  b.layout.eventSites.push({ id: 'headframe', p: [85.6, 90, 82.5], r: 3, tag: 'yardCeiling' }, { id: 'adit', p: [103.5, 44.5, 57], r: 3, tag: 'adit' });
}

// ---------------------------------------------------------------------------------------------
// P4. The Reliquary behind rune door 1 (secret 2): where the bridge ran into blank rock, a
// Lantern-bearer door that wakes to any lit lantern and sinks into the floor.

function reliquary(b: FeatureBuilder): void {
  b.box('reliquary', [116, 40, 137], [128, 50, 151]);
  const M = B.ANCIENT_BRICK;
  for (let x = 120; x <= 124; x++) for (let y = 42; y <= 45; y++) b.put(x, y, 138, M);
  const cells: V3[] = [];
  const lintel: V3[] = [];
  for (let x = 121; x <= 123; x++) {
    b.put(x, 45, 138, B.GLYPH_STONE);
    lintel.push([x, 45, 138]);
    b.put(x, 41, 138, B.ANCIENT_TILE);
    for (let y = 42; y <= 44; y++) cells.push([x, y, 138]);
  }
  // The passage, then the corbel-vaulted room (as in the shrine).
  for (let z = 139; z <= 141; z++)
    for (let x = 120; x <= 124; x++)
      for (let y = 41; y <= 46; y++) {
        const inside = x >= 121 && x <= 123 && y >= 42 && y <= 45;
        b.put(x, y, z, inside ? B.AIR : y === 41 && x >= 121 && x <= 123 ? B.ANCIENT_TILE : M);
      }
  for (let z = 141; z <= 150; z++)
    for (let x = 117; x <= 127; x++)
      for (let y = 41; y <= 49; y++) {
        const inside = x >= 118 && x <= 126 && z >= 142 && z <= 149 && y >= 42 && y <= 48;
        if (!inside) {
          if (!(z === 141 && x >= 121 && x <= 123 && y >= 42 && y <= 45)) b.put(x, y, z, y === 41 ? B.ANCIENT_TILE : M);
          continue;
        }
        const fromWall = Math.min(x - 118, 126 - x);
        if (y >= 46 && fromWall <= y - 46) b.put(x, y, z, M);
        else b.put(x, y, z, B.AIR);
      }
  b.put(122, 42, 148, M);
  for (const z of [143, 145, 147]) {
    b.carve(117, 43, z);
    b.carve(127, 43, z);
  }
  b.prop('reliquary', { kind: 'tablet', x: 122.5, y: 43, z: 148.5, rotY: Math.PI, anchor: [122, 42, 148], variant: [0, 2], interact: 'feature', feature: { kind: 'relic', id: 'reliquary' } });
  b.prop('reliquary', { kind: 'crystalCluster', x: 118.8, y: 42, z: 148.7, rotY: 0.9, scale: 1.2, minable: GLIMMER(2, 3) });
  b.prop('reliquary', { kind: 'crystalCluster', x: 126.2, y: 42, z: 143.3, rotY: 2.7, scale: 1.0, minable: GLIMMER(2, 3) });
  b.layout.runeDoors.push({ id: 'reliquary', cells, lintel, wake: [122.5, 42, 136.6], radius: 2.8, hold: 1.2, minLanternTier: 1 });
  b.moths('runeDoor1', [122.5, 44.6, 137.25], 4, 0.3, true);
  b.moths('reliquary', [122.5, 44.6, 146], 5, 1.8);
  b.landmark('reliquary', [122.5, 42, 145.5]);
  b.poi('reliquary.door', [122.5, 43.5, 137.6], 'sight');
  b.poi('reliquary.room', [122.5, 44, 145.5], 'landmark');
  b.poi('reliquary.relic', [122.5, 43.4, 148.2], 'pickup');
}

// ---------------------------------------------------------------------------------------------
// P5. The rift floor and the black stone (the climax): a Halden rope over the balcony's parapet,
// the crew's last camp at its foot, the monolith made something to stand at, and living walls.

function riftFloor(b: FeatureBuilder): void {
  b.box('rift', [104, 4, 112], [144, 30, 152]);
  const { props } = b.ctx;
  // The black stone: the existing monolith prop, bedded a little deeper (its plinth steps then meet
  // whole voxels) and given collision cells, so the explorer can walk round it and up to its portal.
  const stone = props.find((p) => p.kind === 'abyssMonolith');
  if (stone) {
    stone.y = 5.75;
    stone.interact = 'feature';
    stone.feature = { kind: 'monolith', id: 'monolith' };
    monolithCollision(b, stone);
  }
  // The rope: from a stand inside the parapet, over the coping, down to the floor.
  // The foot: the rope lands on the slope at the edge of the bowl (walk y 7), a step above the floor.
  const bottom = standableNear(b, 130.5, 7, 124.5) ?? [130.5, 7, 124.5];
  const fy = floorWalk(b, 131, 124, 12);
  b.layout.links.push({
    id: 'riftRope',
    kind: 'rope',
    top: [133.5, 25, 124.5],
    bottom,
    path: [[133.5, 25, 124.5], [133.5, 26.5, 124.5], [131.3, 26.5, 124.5], [131.3, fy + 0.6, 124.5], bottom],
    speedDown: 4.6,
    speedUp: 4.2,
  });
  b.prop('rift', { kind: 'hoistWinch', x: 134.4, y: 25, z: 125.8, rotY: -Math.PI / 2, anchor: [134, 24, 125], variant: [1, 2], interact: 'feature', feature: { kind: 'rope', id: 'riftRope', end: 'top' } });
  b.lamp('rift', 134.5, 25, 123.0, 0.3, B.LIGHT_LAMP);
  // The rope hangs just off the balcony's face, in front of a climber on the ride's line (x 131.3).
  b.beam('f_rift_rope', [131.78, 26.4, 124.5], [131.78, fy + 0.25, 124.5], 0.06, 0.06);
  b.beam('f_rift_rope_over', [131.78, 26.4, 124.5], [132.4, 26.32, 124.5], 0.06, 0.06);
  b.beam('f_rift_rope_tie', [132.4, 26.32, 124.5], [134.15, 25.55, 125.55], 0.06, 0.06);
  b.prop('rift', { kind: 'ropeCoil', x: 131.9, y: b.ground(131.9, 124.0, 8), z: 124.0, rotY: 0.4, interact: 'feature', feature: { kind: 'rope', id: 'riftRope', end: 'bottom' } });
  // The Halden's last camp, on the open floor north of the stone.
  const camp: V3 = [124.4, 6, 125.4];
  b.prop('rift', { kind: 'bedroll', x: 122.5, y: b.ground(122.5, 125.6, 6), z: 125.6, rotY: 0.4 });
  const crate = b.prop('rift', { kind: 'crate', x: 125.6, y: b.ground(125.6, 124.2, 6), z: 124.2, rotY: -0.3, scale: 0.9 });
  b.prop('rift', { kind: 'haldenNote', x: 125.55, y: crate.y + 0.72, z: 124.25, rotY: 2.6, anchor: crate.anchor, variant: [0, 2], interact: 'feature', feature: { kind: 'note', id: 'rift' } });
  b.prop('rift', { kind: 'ropeCoil', x: 121.4, y: b.ground(121.4, 124.4, 6), z: 124.4, rotY: 2.2, variant: [1, 2] });
  // A lamp still smouldering after a generation: the warm mark of the way back.
  b.lamp('rift', 124.1, 6, 126.9, 2.4, B.LIGHT_EMBER);
  // The living walls of the bowl: exposed rock at y 6..11, a third of it, away from the camp, the
  // rope foot and the stone.
  const cells: number[] = [];
  const host: number[] = [];
  const anchors = new Set(props.filter((p) => p.anchor).map((p) => b.w.index(p.anchor![0], p.anchor![1], p.anchor![2])));
  for (let z = 112; z <= 152; z++)
    for (let y = 6; y <= 11; y++)
      for (let x = 104; x <= 144; x++) {
        const id = b.get(x, y, z);
        if (!ROCK.has(id)) continue;
        const side = b.isAir(x + 1, y, z) || b.isAir(x - 1, y, z) || b.isAir(x, y, z + 1) || b.isAir(x, y, z - 1);
        if (!side) continue;
        if (Math.hypot(x + 0.5 - bottom[0], z + 0.5 - bottom[2]) < 4) continue;
        if (Math.hypot(x + 0.5 - camp[0], z + 0.5 - camp[2]) < 3.5) continue;
        if (x >= 114 && x <= 132 && z >= 126 && z <= 144) continue; // the stone's plinth and its margin
        if (hash32(Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) % 3 !== 0) continue;
        const i = b.w.index(x, y, z);
        if (anchors.has(i)) continue;
        cells.push(i);
        host.push(id);
      }
  livingSite(b, { id: 'riftWalls', area: 'rift', cells, host, box: { id: 'riftWalls', min: [104, 5, 112], max: [145, 12, 153] } });
  b.moths('monolith', [123.5, 9.7, 141.5], 10, 1.7);
  b.landmark('ropeTop', [133.5, 25, 124.5]);
  b.landmark('ropeBottom', bottom);
  b.landmark('lastCamp', camp);
  b.landmark('stonePortal', [123.5, 8, 141.5]);
  b.landmark('descentHook', [114.5, 6, 134.5]);
  b.poi('rift.ropeHead', [132.5, 27, 124.5], 'landmark');
  b.poi('rift.ropeFoot', [bottom[0], bottom[1] + 0.5, bottom[2]], 'sight');
  b.poi('rift.lastCamp', [camp[0], 6.5, camp[2]], 'sight');
  b.poi('rift.note', [125.55, crate.y + 0.8, 124.25], 'sight');
  b.poi('rift.stone', [123.5, 10, 135.5], 'landmark', false);
  b.poi('rift.portal', [123.5, 8.6, 141.4], 'sight');
  b.poi('rift.formationW', [110.5, 12.5, 127.5], 'pickup', false);
  b.poi('rift.formationE', [137.5, 16.5, 140.5], 'pickup', false);
  b.layout.eventSites.push({ id: 'riftFloor', p: [123.5, 6, 126], r: 6, tag: 'riftFloor' }, { id: 'bridgeMid', p: [122.5, 42, 128.5], r: 3, tag: 'bridgeMid' });
}

/** Collision for the monolith prop (render/props/monolith.ts, bedded at y 5.75): its two plinth steps and the shaft. */
function monolithCollision(b: FeatureBuilder, stone: PropSpec): void {
  const cx = stone.x;
  const cz = stone.z;
  const fill = (x: number, y: number, z: number) => {
    if (b.get(x, y, z) === B.AIR) b.put(x, y, z, B.STRUCTURE);
  };
  // Plinth: half-widths 7.4 (up to 1.1 m) and 6.3 (up to 2.4 m), cells whose centres lie inside.
  for (const [y, hw] of [[6, 7.4], [7, 6.3]] as const)
    for (let z = Math.floor(cz - hw); z <= cz + hw; z++)
      for (let x = Math.floor(cx - hw); x <= cx + hw; x++) if (Math.abs(x + 0.5 - cx) <= hw - 0.3 && Math.abs(z + 0.5 - cz) <= hw - 0.3) fill(x, y, z);
  // The battered shaft (half-width 4.7 at its foot to 3.0 at 21.5 m), kept 0.45 m inside its faces.
  for (let y = 8; y <= 27; y++) {
    const rel = y + 0.5 - stone.y;
    const hw = 4.7 + ((3.0 - 4.7) * (rel - 2.4)) / (21.5 - 2.4) - 0.45;
    for (let z = Math.floor(cz - hw); z <= cz + hw; z++)
      for (let x = Math.floor(cx - hw); x <= cx + hw; x++) if (Math.abs(x + 0.5 - cx) <= hw && Math.abs(z + 0.5 - cz) <= hw) fill(x, y, z);
  }
}

// ---------------------------------------------------------------------------------------------
// P7. The Lamp Gallery behind rune door 2 (secret 3): at the foot of the gate stair, a door only
// the copper lantern wakes.

function lampGallery(b: FeatureBuilder): void {
  b.box('gallery', [141, 23, 129], [151, 32, 142]);
  const M = B.ANCIENT_BRICK;
  // Shell and the vaulted gallery (spring y 28).
  for (let z = 130; z <= 141; z++)
    for (let x = 142; x <= 150; x++)
      for (let y = 24; y <= 32; y++) {
        const inside = x >= 143 && x <= 149 && z >= 131 && z <= 140 && y >= 25 && y <= 31;
        if (!inside) {
          b.put(x, y, z, y === 24 && x >= 143 && x <= 149 ? B.ANCIENT_TILE : M);
          continue;
        }
        const fromWall = Math.min(x - 143, 149 - x);
        b.put(x, y, z, y >= 28 && fromWall <= y - 28 ? M : B.AIR);
      }
  const cells: V3[] = [];
  const lintel: V3[] = [];
  for (let x = 145; x <= 147; x++) {
    for (let y = 25; y <= 27; y++) cells.push([x, y, 130]);
    b.put(x, 28, 130, B.GLYPH_STONE);
    lintel.push([x, 28, 130]);
  }
  for (const z of [132, 134, 136, 138]) {
    b.carve(142, 26, z);
    b.carve(150, 26, z);
  }
  b.put(146, 25, 139, M);
  b.prop('gallery', { kind: 'tablet', x: 146.5, y: 26, z: 139.5, rotY: Math.PI, anchor: [146, 25, 139], variant: [1, 2], interact: 'feature', feature: { kind: 'relic', id: 'gallery' } });
  b.prop('gallery', { kind: 'crystalCluster', x: 144.2, y: 25, z: 137.6, rotY: 1.7, scale: 1.0, minable: GLIMMER(2, 3) });
  b.prop('gallery', { kind: 'crystalCluster', x: 148.7, y: 25, z: 133.3, rotY: 4.1, scale: 0.85, minable: GLIMMER(2, 2) });
  b.layout.runeDoors.push({ id: 'gallery', cells, lintel, wake: [146.5, 25, 128.4], radius: 2.8, hold: 1.2, minLanternTier: 2 });
  b.moths('runeDoor2', [146.5, 27.6, 129.3], 3, 0.3, true);
  b.landmark('gallery', [146.5, 25, 135.5]);
  b.poi('gallery.door', [146.5, 26.5, 129.6], 'sight');
  b.poi('gallery.relic', [146.5, 26.4, 139.2], 'pickup');
}

// ---------------------------------------------------------------------------------------------
// C-b. A frayed Halden rope off the bridge's east parapet: someone tried to climb down here.

function frayedRope(b: FeatureBuilder): void {
  b.beam('f_bridge_rope_tie', [124.45, 43.32, 128.6], [125.12, 43.22, 128.6], 0.05, 0.05);
  b.beam('f_bridge_rope', [125.12, 43.22, 128.6], [125.18, 35.4, 128.55], 0.05, 0.05, 2);
  b.poi('bridge.frayedRope', [125.1, 41.5, 128.6], 'sight', false);
}

// ---------------------------------------------------------------------------------------------
// The glimmer bloom's six sites (one per expedition, game/WorldFeatures), and named areas.

function bloomSites(b: FeatureBuilder): void {
  const sites: Array<[string, number, number, number, string]> = [
    ['grotto', 61, 92, 66, 'grotto'],
    ['adit', 103, 43, 55, 'adit'],
    ['riftWest', 114.6, 6, 131, 'rift'],
    ['spindleSouth', 104, 42, 136, 'hall'],
    ['chasmEast', 128, 42, 114, 'hall'],
    ['landing', 124, 65, 72, 'landing'],
  ];
  for (const [id, x, y, z, area] of sites) {
    const p = standableNear(b, x, y, z) ?? [x + 0.5, y, z + 0.5];
    b.layout.blooms.push({ id, p, rotY: (hash32(id.length * 977 + Math.round(x * 7)) % 628) / 100, area });
  }
}

function areas(b: FeatureBuilder): void {
  b.layout.areas.push(
    { id: 'office', p: [58, 100, 34], r: 7 },
    { id: 'grotto', p: [60.5, 93, 64.5], r: 8 },
    { id: 'yard', p: [91, 41, 84], r: 12 },
    { id: 'adit', p: [103.5, 43, 57], r: 7 },
    { id: 'hall', p: [104, 42, 110], r: 34 },
    { id: 'landing', p: [122.5, 65, 74.5], r: 8 },
    { id: 'reliquary', p: [122.5, 43, 145], r: 7 },
    { id: 'gallery', p: [146.5, 25, 135], r: 7 },
    { id: 'rift', p: [123.5, 6, 132], r: 18 },
  );
}

// ---------------------------------------------------------------------------------------------
// Helpers

function livingSite(b: FeatureBuilder, s: { id: LivingSite['id']; area: string; cells: number[]; host: number[]; box: LivingSite['box'] }): void {
  const site: LivingSite = { id: s.id, area: s.area, cells: Int32Array.from(s.cells), host: Uint8Array.from(s.host), table: LIVING_TABLES[s.id].map((r) => ({ ...r })), box: s.box };
  // The generated world is epoch 0.
  const ids = rollLiving(site, b.ctx.seed, 0);
  const w = b.w;
  applyLiving(w.blocks, w.blocks.slice(), w, site, ids, (i, id) => {
    w.blocks[i] = id;
  });
  b.layout.living.push(site);
}

/** Grow a small vein from the exposed rock cell nearest `at` (inside the box). @returns its first cell. */
function growVein(b: FeatureBuilder, at: V3, ore: number, size: number, min: V3, max: V3): V3 | null {
  const inBox = (x: number, y: number, z: number) => x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
  const exposed = (x: number, y: number, z: number) => b.isAir(x + 1, y, z) || b.isAir(x - 1, y, z) || b.isAir(x, y, z + 1) || b.isAir(x, y, z - 1);
  let start: V3 | null = null;
  let best = Infinity;
  for (let dz = -2; dz <= 2; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = at[0] + dx;
        const y = at[1] + dy;
        const z = at[2] + dz;
        if (!inBox(x, y, z) || !ROCK.has(b.get(x, y, z)) || !exposed(x, y, z)) continue;
        const d = Math.hypot(dx, dy, dz);
        if (d < best) {
          best = d;
          start = [x, y, z];
        }
      }
  if (!start) return null;
  let cur: V3 = start;
  for (let k = 0; k < size; k++) {
    if (inBox(...cur) && ROCK.has(b.get(...cur))) b.put(cur[0], cur[1], cur[2], ore);
    const dirs: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const next = dirs.map(([dx, dy, dz]) => [cur[0] + dx, cur[1] + dy, cur[2] + dz] as V3).filter((c) => inBox(...c) && ROCK.has(b.get(...c)) && exposed(...c));
    if (!next.length) break;
    cur = next[Math.floor(b.rng.next() * next.length)];
  }
  return start;
}

/** Feet height of the floor in column (x, z) at or below `y`. */
function floorWalk(b: FeatureBuilder, x: number, z: number, y: number): number {
  let fy = y;
  while (fy > 1 && !(b.isAir(x, fy, z) && SOLID[b.get(x, fy - 1, z)])) fy--;
  return fy;
}

/** The standable cell (feet position, cell centre) nearest a point, searching 4 cells round and 3 up/down. */
function standableNear(b: FeatureBuilder, x: number, y: number, z: number): V3 | null {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  let best: V3 | null = null;
  let bd = Infinity;
  for (let dy = -3; dy <= 3; dy++)
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -4; dx <= 4; dx++) {
        const cx = fx + dx;
        const cy = fy + dy;
        const cz = fz + dz;
        if (!(b.isAir(cx, cy, cz) && b.isAir(cx, cy + 1, cz) && SOLID[b.get(cx, cy - 1, cz)])) continue;
        const d = Math.hypot(cx + 0.5 - x, (cy - y) * 1.5, cz + 0.5 - z);
        if (d < bd) {
          bd = d;
          best = [cx + 0.5, cy, cz + 0.5];
        }
      }
  return best;
}
