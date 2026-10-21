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
  switch (m.kind) {
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
      break;
  }
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
