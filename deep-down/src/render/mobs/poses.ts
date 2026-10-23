import * as THREE from 'three';
import { wormPoint, type SimMob } from '../../game/mobs/MobSim';
import type { MobModel } from './models';
import type { Rig } from './rig';

/**
 * The creatures' animation (round 2, MOBS): procedural, from the simulation's state (gait phase,
 * speed, jaw/shell opening, the telegraph's wind-up, alertness). Every attack has a pose that reads
 * from across a cavern: crawlers rear and spread their front legs, the Gnasher's lid lifts over its
 * teeth, the Stalker raises its long arms, the Sentinel lifts its fist slowly.
 */
export interface PoseOut {
  /** Emissive strength (uGlow). */
  glow: number;
  /** Extra offset of the whole body along its up axis (emerging, sinking, bobbing). */
  lift: number;
  /** Non-uniform body scale (squash and stretch). */
  sx: number;
  sy: number;
  sz: number;
  /** Extra pitch / roll of the whole body (radians). */
  pitch: number;
  roll: number;
}

const I = (m: MobModel, n: string): number => m.index[n] ?? -1;
const TAU = Math.PI * 2;

export function pose(m: SimMob, model: MobModel, rig: Rig, t: number, out: PoseOut): void {
  rig.reset();
  out.glow = 1;
  out.lift = 0;
  out.sx = out.sy = out.sz = 1;
  out.pitch = 0;
  out.roll = 0;
  const s = m.seed * 10;
  switch (poseAs(m)) {
    case 'crawler': {
      const g = m.gait;
      const rear = m.strike;
      const flat = m.state === 'recoil' || m.state === 'flee' ? 1 : 0;
      for (let i = 0; i < 5; i++)
        for (const side of [-1, 1]) {
          const ph = g * TAU + i * 1.25 + (side > 0 ? Math.PI : 0);
          const sw = Math.sin(ph) * 0.38 * Math.min(1, m.speedNow / 1.5 + 0.08);
          const lift = Math.max(0, Math.cos(ph)) * 0.32 * Math.min(1, m.speedNow / 1.5);
          let rx = 0;
          let rz = -side * lift;
          let ry = sw;
          // The telegraph: rearing up, the front pairs raised and spread wide.
          if (i < 2) {
            rz += -side * rear * (1.1 - i * 0.4);
            ry += side * rear * 0.35;
            rx -= rear * 0.3;
          }
          rz += side * flat * 0.25;
          rig.euler(I(model, `u${i}${side}`), rx, ry, rz);
          rig.euler(I(model, `l${i}${side}`), 0, 0, side * (0.1 * Math.sin(ph + 1) - flat * 0.3));
        }
      for (const side of [-1, 1]) rig.euler(I(model, `jaw${side}`), 0, side * (0.15 + 0.5 * rear + 0.12 * Math.sin(t * 9 + s)), 0);
      rig.euler(I(model, 'head'), -rear * 0.2 + Math.sin(t * 1.7 + s) * 0.06, Math.sin(t * 0.9 + s) * 0.18, 0);
      rig.euler(I(model, 'tail'), Math.sin(t * 2.1 + s) * 0.08 + rear * 0.3, Math.sin(g * TAU * 0.5) * 0.15, 0);
      out.pitch = -rear * 0.45 + (m.state === 'attack' ? 0.12 : 0);
      out.sy = 1 - flat * 0.15 + Math.sin(t * 3 + s) * 0.015;
      out.lift = rear * 0.1;
      break;
    }
    case 'gnasher': {
      const breath = Math.sin(t * 1.4 + s) * 0.5 + 0.5;
      const open = m.open;
      rig.euler(I(model, 'lid'), -open * 1.05 - breath * 0.035, 0, 0);
      // A tremble as it winds up.
      const tr = m.state === 'windup' ? Math.sin(t * 46) * 0.03 : 0;
      rig.euler(I(model, 'base'), tr, 0, tr * 0.6);
      rig.scl[I(model, 'maw')].setScalar(0.6 + open * 0.5);
      out.glow = 0.2 + open * 0.55 + (m.state === 'sleep' ? breath * 0.25 : 0);
      out.sy = 1 + breath * 0.015;
      break;
    }
    case 'wisp': {
      for (let i = 0; i < 7; i++) {
        const k = i / 6;
        const o = rig.off[I(model, `b${i}`)];
        o.set(Math.sin(t * 0.9 + i * 1.3 + s) * 0.06 * (0.3 + k), Math.sin(t * 1.3 + i * 0.7) * 0.04, Math.cos(t * 0.8 + i * 1.1 + s) * 0.06 * (0.3 + k));
        rig.scl[I(model, `b${i}`)].setScalar(1 + Math.sin(t * 1.7 + i * 2.1) * 0.08);
      }
      const feed = m.state === 'attack' ? 1 : 0;
      out.glow = 0.8 + feed * 0.6 + Math.sin(t * 5 + s) * 0.15 * feed;
      out.sy = 1 + feed * 0.08;
      out.pitch = feed * 0.25;
      break;
    }
    case 'stalker': {
      const g = m.gait * TAU;
      const walk = Math.min(1, m.speedNow / 1.2);
      for (const side of [-1, 1]) {
        const ph = g + (side > 0 ? Math.PI : 0);
        rig.euler(I(model, `th${side}`), -Math.sin(ph) * 0.42 * walk, 0, 0);
        rig.euler(I(model, `sn${side}`), Math.max(0, Math.sin(ph + 1.2)) * 0.7 * walk, 0, 0);
        // Arms: hanging, a slow sway; the wind-up raises them high and wide.
        const raise = m.strike;
        rig.euler(I(model, `ua${side}`), -raise * 2.5 + Math.sin(ph) * 0.18 * walk + Math.sin(t * 0.6 + side) * 0.03, 0, side * (0.08 + raise * 0.55));
        rig.euler(I(model, `fa${side}`), -raise * 0.5 - 0.12, 0, 0);
        rig.euler(I(model, `hd${side}`), -raise * 0.3, 0, side * 0.1);
      }
      // The head tilts slowly, as if listening.
      rig.euler(I(model, 'head'), 0.12 - m.alert * 0.1, Math.sin(t * 0.3 + s) * 0.2, Math.sin(t * 0.37 + s) * 0.32 * (0.3 + m.alert));
      rig.euler(I(model, 'chest'), 0.12 + m.strike * -0.25 + Math.sin(t * 0.8) * 0.02, 0, Math.sin(g) * 0.04 * walk);
      out.glow = 0.6 + m.alert * 0.6;
      out.lift = Math.abs(Math.sin(g)) * 0.04 * walk;
      break;
    }
    case 'sentinel': {
      const sleep = m.state === 'sleep' ? 1 : m.state === 'wake' ? 1 - Math.min(1, m.stateTime / 2) : 0;
      const g = m.gait * TAU;
      const walk = Math.min(1, m.speedNow / 0.6);
      for (const side of [-1, 1]) rig.euler(I(model, `leg${side}`), Math.sin(g + (side > 0 ? Math.PI : 0)) * 0.28 * walk, 0, 0);
      rig.euler(I(model, 'torso'), sleep * 0.55, Math.sin(g) * 0.05 * walk, Math.sin(g) * 0.05 * walk);
      rig.euler(I(model, 'head'), sleep * 0.5 + 0.05, Math.sin(t * 0.4) * 0.1 * (1 - sleep), 0);
      const st = m.strike;
      const atk = m.state === 'attack' ? Math.min(1, m.stateTime / 0.3) : 0;
      // The sweep: the right fist rises back slowly, then crosses in front.
      rig.euler(I(model, 'sh1'), -st * 2.3 + sleep * 0.4, atk * -1.6, st * 0.4);
      rig.euler(I(model, 'fa1'), -st * 0.6, 0, 0);
      rig.euler(I(model, 'sh-1'), sleep * 0.4 + Math.sin(g) * 0.2 * walk, 0, -0.08);
      rig.euler(I(model, 'fa-1'), -0.2, 0, 0);
      rig.euler(I(model, 'doorL'), 0, -m.open * 1.25, 0);
      rig.euler(I(model, 'doorR'), 0, m.open * 1.25, 0);
      rig.scl[I(model, 'core')].setScalar(0.85 + m.open * 0.25 + (m.open > 0.5 ? Math.sin(t * 7) * 0.05 : 0));
      out.glow = m.glow * (0.7 + m.open * 0.9);
      out.lift = -sleep * 0.35;
      break;
    }
    case 'worm':
      // Bones are placed in the world by posWorm.
      out.glow = 1;
      break;
    case 'lampling': {
      const follow = m.state === 'follow' ? 1 : 0;
      rig.euler(I(model, 'armL'), 0, 0, Math.sin(t * 7 + s) * 0.5);
      rig.euler(I(model, 'armR'), 0, 0, -Math.sin(t * 7 + s + 0.6) * 0.5);
      rig.euler(I(model, 'tail'), Math.sin(t * 4 + s) * 0.3, 0, Math.cos(t * 3.3 + s) * 0.3);
      rig.euler(I(model, 'cap'), Math.sin(t * 2.1) * 0.08, 0, Math.cos(t * 1.7) * 0.08);
      out.pitch = follow * 0.2;
      out.roll = Math.sin(t * 1.3 + s) * 0.12 + m.flash * Math.sin(t * 20) * 0.4;
      out.glow = 1.1 + Math.sin(t * 9 + s) * 0.08 + Math.sin(t * 23 + s) * 0.04;
      break;
    }
    case 'glimmerkin': {
      const run = Math.min(1, m.speedNow / 2);
      const g = m.gait * TAU * 1.4;
      for (const side of [-1, 1])
        for (const f of [1, -1]) rig.euler(I(model, `leg${side}${f}`), Math.sin(g + (side * f > 0 ? 0 : Math.PI)) * 0.7 * run, 0, 0);
      const curl = m.state === 'caught' ? m.open : 0;
      rig.euler(I(model, 'head'), 0.1 * Math.sin(t * 2.2 + s) * (1 - run) + curl * 0.6, Math.sin(t * 0.7 + s) * 0.3 * (1 - run), Math.sin(t * 1.1 + s) * 0.25 * (1 - run));
      for (const side of [-1, 1]) rig.euler(I(model, `ear${side}`), Math.sin(t * 6 + s + side) * 0.06 - run * 0.5, 0, side * (Math.max(0, Math.sin(t * 0.9 + s * side)) * 0.25));
      rig.euler(I(model, 'tail'), 0.3 + Math.sin(t * 5 + s) * 0.2, Math.sin(t * 3 + s) * 0.4, 0);
      out.lift = Math.abs(Math.sin(g)) * 0.05 * run - curl * 0.06;
      out.sx = 1 + curl * 0.1;
      out.sy = 1 - curl * 0.25 + Math.sin(t * 3 + s) * 0.02;
      out.glow = 0.8 + curl * 1.2 + Math.sin(t * 1.7 + s) * 0.15;
      break;
    }
    case 'shellback': {
      const pull = m.open;
      const crawl = Math.sin(t * 1.4 + s);
      rig.off[I(model, 'head')].set(0, -pull * 0.08, -pull * 0.28);
      rig.euler(I(model, 'head'), crawl * 0.04, Math.sin(t * 0.5 + s) * 0.25 * (1 - pull), 0);
      for (const side of [-1, 1]) {
        rig.euler(I(model, `stalk${side}`), Math.sin(t * 1.2 + side + s) * 0.15, 0, side * Math.sin(t * 0.8 + s) * 0.15);
        rig.scl[I(model, `stalk${side}`)].set(1, 1 - pull * 0.7, 1);
      }
      for (let c = 0; c < 4; c++) rig.scl[I(model, `cr${c}`)].setScalar(c < m.crystals ? 1 : 0.001);
      rig.euler(I(model, 'shell'), crawl * 0.02 - pull * 0.05, 0, Math.sin(t * 0.7 + s) * 0.03);
      out.sz = 1 + crawl * 0.03;
      out.glow = 0.9 + Math.sin(t * 1.1 + s) * 0.15;
      break;
    }
    case 'jelly': {
      const p = Math.sin(m.gait * TAU);
      rig.scl[I(model, 'bell')].set(1 + p * 0.09, 1 - p * 0.08, 1 + p * 0.09);
      for (let k = 0; k < 6; k++)
        for (let j = 0; j < 3; j++) rig.euler(I(model, `t${k}${j}`), Math.sin(m.gait * TAU - j * 0.9 + k) * 0.22, 0, Math.cos(m.gait * TAU - j * 0.9 + k * 1.3) * 0.2);
      out.glow = (m.tappable ? 1 : 0.45) * (0.9 + p * 0.15) + m.flash * 1.5;
      out.lift = p * 0.05;
      break;
    }
    case 'burrower': {
      const run = Math.min(1, m.speedNow / 2.2);
      const g = m.gait * TAU * 1.6;
      for (const side of [-1, 1]) {
        rig.euler(I(model, `claw${side}`), Math.sin(g + (side > 0 ? 0 : Math.PI)) * 0.8 * run - (m.state === 'idle' ? 0.6 + Math.sin(t * 9) * 0.3 : 0), 0, 0);
        rig.euler(I(model, `leg${side}`), Math.sin(g + (side > 0 ? Math.PI : 0)) * 0.7 * run, 0, 0);
      }
      rig.euler(I(model, 'head'), Math.sin(t * 8 + s) * 0.08 * (m.state === 'idle' ? 1 : 0.3), Math.sin(t * 2 + s) * 0.3 * (1 - run), 0);
      rig.euler(I(model, 'tail'), 0, Math.sin(t * 9 + s) * 0.5, 0);
      rig.scl[I(model, 'loot')].setScalar(m.carry > 0 ? 1 : 0.001);
      // Emerging from the ground, or digging away into it.
      const under = m.state === 'wake' || m.state === 'sleep' ? m.open : 0;
      out.lift = -under * 0.42 + Math.abs(Math.sin(g)) * 0.04 * run;
      out.pitch = m.state === 'sleep' ? m.open * 0.9 : m.state === 'wake' ? -m.open * 0.6 : 0;
      out.glow = m.treasure ? 1.3 : 0.8;
      break;
    }
    default:
      poseGeneric(m, model, rig, t, out);
      break;
  }
  if (m.kind === 'heartOfDark') heartPhases(m, model, rig, t, out);
  overlay(m, model, rig, t, out);
}

/** The Dark Heart's veins and core by phase (asleep, 1, 2, 3): the scale of their bones about its centre. */
export const HEART_VEINS = [0.9, 0.92, 1.26, 1.36] as const;
export const HEART_CORE = [1, 1, 1.6, 2.05] as const;

/** The Dark Heart's beat and its three phases: a closed shell, then cracked and bleeding light, then its last blaze. */
function heartPhases(m: SimMob, model: MobModel, rig: Rig, t: number, out: PoseOut): void {
  const b = boneMap(model);
  const ph = m.state === 'sleep' ? 0 : Math.max(1, Math.min(3, m.phase));
  // Lub-dub: two swells of its shell through each beat (the sim keeps the beat and its sound).
  const bt = m.beat;
  const pulse = Math.exp(-((bt / 0.05) ** 2)) + 0.65 * Math.exp(-(((bt - 0.17) / 0.05) ** 2));
  const amp = [0.03, 0.05, 0.075, 0.11][ph];
  if (b.sac >= 0) rig.scl[b.sac].setScalar(1 + pulse * amp);
  // Its shards orbit wider and faster with each phase, wobbling out of the plane at the end.
  const spin = [0.12, 0.3, 0.62, 1.15][ph];
  const spread = [1, 1, 1.12, 1.26][ph];
  b.tn.forEach((tb, k) => {
    rig.euler(tb, Math.sin(t * 0.9 + k * 1.7) * 0.08 * ph, t * spin + k * 0.3, Math.cos(t * 0.8 + k) * 0.05 * ph);
    rig.scl[tb].setScalar(spread);
  });
  // Its veins and its core (their own bones): inside the closed shell in phase 1; in phase 2 the
  // veins split it, glowing cracks across the shell; in phase 3 the core swells into its dents and
  // blazes through (the captures of round 3 showed the three phases alike: only their glow differed).
  const veins = model.index['veins'];
  const core = model.index['core'];
  if (veins !== undefined) rig.scl[veins].setScalar(HEART_VEINS[ph]);
  if (core !== undefined) rig.scl[core].setScalar(HEART_CORE[ph] * (1 + pulse * 0.05 * ph));
  // Its light: dim in its shell, bleeding through the cracks, then a flickering blaze.
  out.glow = [0.35, 0.6, 1.0, 1.45][ph] + pulse * (0.35 + 0.2 * ph) + (ph === 3 ? Math.sin(t * 23) * 0.12 : 0);
  out.sx *= 1 + pulse * amp * 0.4;
  out.sz *= 1 + pulse * amp * 0.4;
}

/**
 * Overlays on every kind's own pose (round 3, the second MOBS): the flinch of a blow, a guardian's
 * open guard, and the collapse of a creature struck down (before it dissolves).
 */
function overlay(m: SimMob, model: MobModel, rig: Rig, t: number, out: PoseOut): void {
  const b = boneMap(model);
  if (!m.dying) {
    // The flinch: the body jolts away from where the blow came from, squashes, its head snaps back;
    // the little ones hop.
    const h = m.hurt;
    if (h > 0.001) {
      const e = h * h;
      const sy = Math.sin(m.yaw);
      const cy = Math.cos(m.yaw);
      const f = m.hurtDir.x * sy + m.hurtDir.z * cy;
      const r = m.hurtDir.x * cy - m.hurtDir.z * sy;
      out.pitch += e * 0.34 * f;
      out.roll -= e * 0.34 * r;
      out.sy *= 1 - e * 0.1;
      out.sx *= 1 + e * 0.06;
      out.sz *= 1 + e * 0.06;
      out.glow += e * 0.35;
      if (m.def.size === 'tiny' || m.def.size === 'small') out.lift += e * 0.12;
      rig.turn(b.head, -e * 0.4, 0, 0);
    }
    if (m.guardian && m.vulnerable) {
      // Its guard is open: it sags, heaving, its head and arms down; its core blazes (MobRenderer).
      const w = m.openFor > 0 ? Math.min(1, m.openLeft / m.openFor) : 0.6;
      const s = Math.min(1, m.stateTime / 0.25) * Math.min(1, w / 0.18);
      out.lift -= s * 0.1 * m.def.lift;
      out.pitch += s * 0.12;
      out.sy *= 1 - s * 0.05 + Math.sin(t * 9) * 0.015 * s;
      out.glow *= 1 + 0.55 * s;
      rig.turn(b.head, s * 0.32, 0, 0);
      for (const u of b.ua) rig.turn(u, s * 0.55, 0, 0);
    }
    return;
  }
  // (Put away, or gone in a burst or a puff of smoke: no collapse.)
  if (!m.killed || m.collapse <= 0) return;
  // Struck down: its light flares once and goes out while the body goes down its own way.
  const k = Math.min(1, m.stateTime / m.collapse);
  const e = 1 - (1 - k) ** 3;
  const side = m.seed > 0.5 ? 1 : -1;
  out.glow = out.glow * (1 - 0.85 * e) + Math.exp(-k * 7) * 0.9;
  switch (deathStyle(m, b)) {
    case 'fall':
      // Fliers: the wings fold and it tumbles out of the air (the sim drops it).
      b.w.forEach((w, i) => rig.turn(w, 0, 0, (i === 0 ? 1 : -1) * e * 1.1));
      b.wt.forEach((w, i) => rig.turn(w, 0, 0, (i === 0 ? 1 : -1) * e * 0.8));
      out.roll += side * e * 1.4;
      out.pitch += e * 0.5;
      break;
    case 'flip':
      // Bugs and crawlers: over onto the back, the legs curling in.
      out.roll += side * e * Math.PI * 0.94;
      out.lift += Math.sin(k * Math.PI) * 0.18;
      for (const L of b.legs) {
        rig.turn(L.u, 0, 0, -L.side * e * 0.9);
        rig.turn(L.l, 0, 0, -L.side * e * 0.8);
      }
      break;
    case 'slump':
      // The tall ones: down onto the knees, the head drops, the arms hang, the body sags.
      out.lift -= e * m.def.lift * 0.45;
      out.pitch += e * 0.42;
      out.sy *= 1 - e * 0.16;
      for (const L of b.legs) {
        rig.turn(L.u, -e * 0.8, 0, 0);
        rig.turn(L.l, e * 1.5, 0, 0);
      }
      for (const u of b.ua) rig.turn(u, e * 0.7, 0, 0);
      rig.turn(b.head, e * 0.6, 0, 0);
      break;
    case 'sink':
      // Still things (mimics, the great bloom): they sag shut and settle.
      out.sy *= 1 - e * 0.35;
      out.sx *= 1 + e * 0.08;
      out.sz *= 1 + e * 0.08;
      out.lift -= e * 0.12 * m.def.lift;
      break;
    case 'heart':
      // The Dark Heart: its shell sinks, its shards drop and dim, its beat stops.
      out.lift -= e * 0.8;
      out.sy *= 1 - e * 0.12;
      b.tn.forEach((tb, i) => rig.off[tb].set(0, -e * (1.2 + (i % 3) * 0.4), 0));
      break;
    default:
      // Beasts: over onto the side, the legs stiff, the head down.
      out.roll += side * e * 1.45;
      out.lift -= e * m.def.lift * 0.3;
      for (const L of b.legs) rig.turn(L.u, -e * 0.25, 0, 0);
      rig.turn(b.head, e * 0.35, 0, 0);
  }
  if (m.guardian) {
    // A guardian shudders as it goes down.
    out.roll += Math.sin(t * 31) * 0.04 * (1 - k);
    out.pitch += Math.sin(t * 27 + 1) * 0.03 * (1 - k);
  }
}

type DeathStyle = 'fall' | 'flip' | 'slump' | 'sink' | 'heart' | 'topple';

/** How a creature goes down: by how it moves and the body it has. */
function deathStyle(m: SimMob, b: BoneMap): DeathStyle {
  if (m.kind === 'heartOfDark') return 'heart';
  const loco = m.def.locomotion;
  if (loco === 'fly') return 'fall';
  if (loco === 'crawl') return 'flip';
  if (loco === 'still' || poseAs(m) === 'gnasher' || m.kind === 'thornmother') return 'sink';
  if (b.legs.some((L) => L.sprawl) && m.def.size !== 'large') return 'flip';
  if (b.ua.length > 0 || m.def.height >= 3) return 'slump';
  return 'topple';
}

/** Which pose a creature takes: the first game's own, or one by its bones (the built bodies). */
function poseAs(m: SimMob): string {
  switch (m.kind) {
    case 'crawler':
    case 'gnasher':
    case 'wisp':
    case 'stalker':
    case 'sentinel':
    case 'worm':
    case 'lampling':
    case 'glimmerkin':
    case 'shellback':
    case 'jelly':
    case 'burrower':
      return m.kind;
    case 'snapjaw':
    case 'chestMimic':
    case 'cartMimic':
    case 'thornmother':
      return 'gnasher';
    case 'vinebell':
    case 'relicTurtle':
      return 'shellback';
    case 'hearthmite':
    case 'starmote':
      return 'lampling';
    default:
      return 'generic';
  }
}

interface LegInfo {
  i: number;
  side: number;
  u: number;
  l: number;
  /** Sprawled (insect, crab: the knee out to the side) or upright (beasts: the knee below the hip). */
  sprawl: boolean;
}

interface BoneMap {
  legs: LegInfo[];
  ua: number[];
  fa: number[];
  w: number[];
  wt: number[];
  t: number[];
  seg: number[];
  tn: number[];
  jaws: number[];
  jaw: number;
  head: number;
  chest: number;
  sac: number;
  ear: number[];
  cap: number;
  loot: number;
}

const maps = new WeakMap<MobModel, BoneMap>();

function boneMap(model: MobModel): BoneMap {
  let b = maps.get(model);
  if (b) return b;
  const ix = model.index;
  const legs: LegInfo[] = [];
  for (let i = 0; i < 6; i++)
    for (const side of [-1, 1]) {
      const u = ix[`u${i}${side}`];
      const l = ix[`l${i}${side}`];
      if (u === undefined || l === undefined) continue;
      const hip = model.bones[u].pivot;
      const knee = model.bones[l].pivot;
      legs.push({ i, side, u, l, sprawl: Math.abs(knee.x - hip.x) > Math.abs(knee.y - hip.y) * 0.8 });
    }
  const list = (pre: string, n = 12) => {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const v = ix[`${pre}${k}`];
      if (v !== undefined) out.push(v);
    }
    return out;
  };
  const pair = (pre: string) => [ix[`${pre}-1`], ix[`${pre}1`]].filter((v): v is number => v !== undefined);
  b = {
    legs,
    ua: pair('ua'),
    fa: pair('fa'),
    w: pair('w'),
    wt: pair('wt'),
    t: list('t', 4),
    seg: list('seg', 12),
    tn: list('tn', 10),
    jaws: pair('jaw'),
    jaw: ix.jaw ?? -1,
    head: ix.head ?? -1,
    chest: ix.chest ?? -1,
    sac: ix.sac ?? -1,
    ear: pair('ear'),
    cap: ix.cap ?? -1,
    loot: ix.loot ?? -1,
  };
  maps.set(model, b);
  return b;
}

/**
 * The built bodies' animation, by the bones they have and their archetype: legs walk (a sprawled
 * insect gait or a beast's stride), wings flap (and spread to hover in a dive's wind-up), arms rise
 * through a brute's wind-up and slam, jaws open with the strike, tails, segments and tendrils
 * sway, a spitter's throat sac and an exploder's body swell, a charger lowers its head, a stunned
 * one wobbles.
 */
export function poseGeneric(m: SimMob, model: MobModel, rig: Rig, t: number, out: PoseOut): void {
  const b = boneMap(model);
  const s = m.seed * 10;
  const st = m.strike;
  const brain = m.brain;
  const walk = Math.min(1, m.speedNow / Math.max(0.6, m.def.speed * 0.8));
  const g = m.gait * TAU * (m.def.size === 'tiny' ? 1.4 : 1);
  // Legs.
  for (const L of b.legs) {
    const ph = g + L.i * 1.7 + (L.side > 0 ? Math.PI : 0) + (L.sprawl ? 0 : L.i * 1.4);
    if (L.sprawl) {
      const sw = Math.sin(ph) * 0.42 * walk;
      const lift = Math.max(0, Math.cos(ph)) * 0.32 * walk;
      rig.euler(L.u, 0, sw, -L.side * lift - (st * 0.4 * L.side * (L.i === 0 ? 1 : 0)));
      rig.euler(L.l, 0, 0, L.side * 0.1 * Math.sin(ph + 1));
    } else {
      const sw = Math.sin(ph) * 0.55 * walk;
      rig.euler(L.u, -sw - (brain === 'charge' ? st * 0.25 : 0), 0, 0);
      rig.euler(L.l, Math.max(0, Math.sin(ph + 1.3)) * 0.7 * walk, 0, 0);
    }
  }
  // Arms: idle sway; a wind-up raises them overhead, the blow brings them down.
  const atk = m.state === 'attack' ? Math.min(1, m.stateTime / 0.18) : 0;
  b.ua.forEach((u, k) => {
    const side = k === 0 ? -1 : 1;
    const sway = Math.sin(g + (side > 0 ? Math.PI : 0)) * 0.3 * walk + Math.sin(t * 0.8 + side + s) * 0.04;
    const raise = brain === 'slam' || m.guardian ? st * 2.4 - atk * 2.9 : st * 1.2;
    rig.euler(u, -raise + sway, 0, side * (0.12 + st * 0.35));
  });
  b.fa.forEach((f) => rig.euler(f, -0.25 - st * 0.6 + atk * 0.5, 0, 0));
  // Wings.
  const flying = m.def.locomotion === 'fly';
  b.w.forEach((w, k) => {
    const side = k === 0 ? -1 : 1;
    const rate = m.guardian ? 3.2 : 13;
    const hover = m.state === 'windup' ? 1 : 0;
    const dive = m.state === 'attack' && brain === 'dive' ? 1 : 0;
    const amp = (flying ? 0.75 : 0.15) * (1 - dive * 0.8) * (1 - hover * 0.5);
    const a = Math.sin(t * rate + s) * amp + hover * 0.5 - dive * 0.9;
    rig.euler(w, 0, dive * side * 0.5, side * a);
    const wt = b.wt[k];
    if (wt !== undefined) rig.euler(wt, 0, 0, side * Math.sin(t * rate + s - 0.9) * amp * 0.8);
  });
  // Jaws and mandibles.
  const open = Math.max(st, m.open * 0.8) + (m.state === 'attack' ? 0.3 : 0);
  if (b.jaw >= 0) rig.euler(b.jaw, Math.min(0.9, open * 0.75 + Math.max(0, Math.sin(t * 2.3 + s)) * 0.05), 0, 0);
  b.jaws.forEach((j, k) => rig.euler(j, 0, (k === 0 ? -1 : 1) * (0.15 + open * 0.55 + 0.1 * Math.sin(t * 9 + s)), 0));
  // Tails, segments, tendrils.
  b.t.forEach((tb, i) => rig.euler(tb, Math.sin(t * 1.7 + i * 0.6 + s) * 0.08, Math.sin(t * (2.2 + walk * 4) + i * 0.7 + s) * (0.22 + walk * 0.15), 0));
  b.seg.forEach((sb, i) => rig.euler(sb, Math.sin(t * 1.9 - i * 0.7 + s) * 0.05, Math.sin(g * 0.5 + t * 1.2 - i * 0.8 + s) * (0.12 + walk * 0.12), 0));
  b.tn.forEach((tb, k) => {
    if (m.kind === 'heartOfDark') rig.euler(tb, 0, t * 0.35 + (m.phase - 1) * t * 0.2, 0);
    else rig.euler(tb, Math.sin(t * 1.3 + k * 1.1 + s) * 0.28, 0, Math.cos(t * 1.1 + k * 0.9 + s) * 0.28);
  });
  // The head: it looks about, drops for a charge, rears for a spit.
  if (b.head >= 0) {
    const look = m.state === 'stalk' || m.state === 'idle' || m.state === 'wander' || m.state === 'sleep' ? Math.sin(t * 0.6 + s) * 0.25 : 0;
    const pitch = brain === 'charge' ? st * 0.35 : brain === 'spit' ? -st * 0.3 : brain === 'pack' ? st * 0.2 : 0;
    rig.euler(b.head, pitch + Math.sin(t * 1.3 + s) * 0.04, look, Math.sin(t * 0.7 + s) * 0.05);
  }
  if (b.chest >= 0) rig.euler(b.chest, (brain === 'slam' || m.guardian ? -st * 0.25 + atk * 0.35 : 0) + Math.sin(t * 1.1 + s) * 0.02, Math.sin(g) * 0.05 * walk, 0);
  b.ear.forEach((e, k) => rig.euler(e, Math.sin(t * 5 + s + k) * 0.06 - walk * 0.3, 0, 0));
  // The sac (a spitter's throat, an exploder's body, the Heart's heartbeat).
  if (b.sac >= 0) {
    const beat = m.kind === 'heartOfDark' ? Math.pow(Math.max(0, Math.sin(t * (2.2 + m.phase * 0.6))), 8) * 0.08 : 0;
    const swell = brain === 'fuse' ? st * 0.35 : brain === 'spit' || m.guardian ? st * 0.5 : 0;
    rig.scl[b.sac].setScalar(1 + swell + beat + Math.sin(t * 2 + s) * 0.02);
  }
  if (b.cap >= 0) rig.euler(b.cap, 0, 0, t * 0.6);
  if (b.loot >= 0) rig.scl[b.loot].setScalar(m.carry > 0 ? 1 : 0.001);
  // The whole body.
  out.glow = 0.75 + st * 0.75 + (m.guardian ? m.glow * 0.3 : 0) + (brain === 'fuse' && m.fused ? Math.sin(t * 30) * 0.3 : 0);
  if (flying) out.lift = Math.sin(t * 2.1 + s) * 0.05 * (m.guardian ? 3 : 1);
  if (brain === 'charge' && m.state === 'windup') out.pitch = st * 0.12 + Math.sin(t * 30) * 0.01 * st;
  if (brain === 'charge' && m.state === 'attack') out.pitch = 0.1;
  if (m.state === 'stunned') {
    out.roll = Math.sin(t * 7) * 0.14;
    out.pitch = 0.08;
  }
  if (brain === 'pack' && m.state === 'windup') {
    out.sy = 1 - st * 0.18;
    out.sz = 1 + st * 0.1;
  }
  if (brain === 'fuse') {
    const k = st * 0.28;
    out.sx = out.sz = 1 + k;
    out.sy = 1 + k * 0.8;
  }
  if (brain === 'dig' || (m.guardian && m.pattern === 'burrow')) {
    // Emerging, or sinking back into the ground.
    if (m.state === 'recoil' && m.stateTime < 0.45) out.lift = -(1 - m.stateTime / 0.45) * m.bounds.radius * 1.6;
    if (m.state === 'sleep') out.lift = -m.open * m.bounds.radius * 1.8;
    if (m.mode === 'under' || m.state === 'burrow') out.lift = -m.bounds.radius * 3;
  }
  if (brain === 'drop' && m.state === 'windup') out.roll = Math.sin(t * 40) * 0.04 * st;
  if (brain === 'spit' && m.state === 'windup') out.pitch = -st * 0.1;
  if ((brain === 'slam' || m.guardian) && m.state === 'attack' && m.stateTime < 0.2) out.sy = 1 - (1 - m.stateTime / 0.2) * 0.08;
}

const tp = new THREE.Vector3();
const ta = new THREE.Vector3();
const tq = new THREE.Quaternion();
const tz = new THREE.Vector3(0, 0, 1);
const tm = new THREE.Matrix4();
const tm2 = new THREE.Matrix4();
const one = new THREE.Vector3(1, 1, 1);

/** The Deep Worm's segments along its pass (bone matrices in world space). */
export function poseWorm(m: SimMob, model: MobModel, rig: Rig): void {
  const p = m.path;
  if (!p) return;
  const n = model.bones.length;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * 30;
    const ti = p.t - s / p.len;
    wormPoint(p, ti, tp);
    wormPoint(p, ti + 0.02, ta);
    ta.sub(tp).normalize();
    tq.setFromUnitVectors(tz, ta);
    const piv = model.bones[i].pivot;
    tm.compose(tp, tq, one).multiply(tm2.makeTranslation(-piv.x, -piv.y, -piv.z));
    rig.matrices[i].copy(tm);
  }
}
