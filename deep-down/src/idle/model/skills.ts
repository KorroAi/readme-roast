// Skills (SPEC §5.4; BUILD §2.1 SHOULD 1): Dynamite, Gold Rush, Overdrive, Earthquake and Cataclysm.
// Pure; the skill row (C) calls `useSkill`. Cooldowns run on model time.

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import { rowsCostLog10 } from '../config/curves';
import { CATACLYSM, dynamiteRows, earthquakeSeconds, skillDef, SKILLS } from '../config/skills';
import { activeDpsLog10, crewDpsLog10 } from './run';
import { analyticRows, settleFloor } from './shaft';
import { CELL, type IdleState } from './state';

const L10 = Math.log10;

/** Seconds of cooldown left (0: ready; Infinity: not unlocked). */
export function cooldownLeft(s: IdleState, id: string): number {
  const k = s.run.skills[id];
  if (!k || k.lvl <= 0) return Infinity;
  if (k.charges > 0) return 0;
  return Math.max(0, k.cdEnd - s.time);
}

/** True while a timed skill runs. */
export function skillActive(s: IdleState, id: string): boolean {
  const k = s.run.skills[id];
  return !!k && k.activeEnd > s.time;
}

/** Recent uses for Cataclysm (model times). */
const lastUse = new WeakMap<IdleState, Record<string, number>>();

/** Use a skill. @returns false when not ready, not unlocked or blocked (a seal holds Dynamite). */
export function useSkill(s: IdleState, id: string, bus?: IdleBus): boolean {
  const def = skillDef(id);
  const k = s.run.skills[id];
  if (!def || !k || k.lvl <= 0) return false;
  if (cooldownLeft(s, id) > 0) return false;
  if (k.charges > 0) k.charges--;
  else k.cdEnd = s.time + def.cooldown;
  if (def.duration > 0) k.activeEnd = s.time + def.duration;
  if (!s.meta.firstTime.includes(`used:${id}`)) s.meta.firstTime.push(`used:${id}`);
  bus?.emit('skill:use', { id, level: k.lvl });
  if (id === 'dynamite') dynamite(s, k.lvl, bus);
  else if (id === 'earthquake') earthquake(s, k.lvl, bus);
  // Cataclysm: all four used within 5 s.
  let rec = lastUse.get(s);
  if (!rec) {
    rec = {};
    lastUse.set(s, rec);
  }
  rec[id] = s.time;
  if (SKILLS.every((d) => rec[d.id] !== undefined && s.time - rec[d.id] <= CATACLYSM.window)) {
    s.run.frenzyEnd = Math.max(s.run.frenzyEnd, s.time + CATACLYSM.duration);
    for (const d of SKILLS) delete rec[d.id];
    bus?.emit('skill:cataclysm', { duration: CATACLYSM.duration });
  }
  return true;
}

/** Dynamite: destroys the next N rows at once, paying their gold (never through a seal). */
function dynamite(s: IdleState, level: number, bus?: IdleBus): void {
  const rows = dynamiteRows(level);
  const from = s.run.depth;
  if (s.shaft.rows[0].kinds[0] === CELL.SEAL) return;
  const work = rowsCostLog10(from, from + rows) + 1e-9;
  const before = s.run.gold.clone();
  analyticRows(s, work, bus, 'skill');
  settleFloor(s, bus, 'skill');
  const gold = s.run.gold.sub(before).floorZeroIn();
  bus?.emit('skill:dynamite', { from, rows: s.run.depth - from, gold });
}

/** Earthquake: 60 s (+15 s per level) of total DPS at once. */
function earthquake(s: IdleState, level: number, bus?: IdleBus): void {
  const dps = activeDpsLog10(s, 5, crewDpsLog10(s));
  const work = dps + L10(earthquakeSeconds(level));
  const from = s.run.depth;
  if (s.shaft.rows[0].kinds[0] !== CELL.SEAL) analyticRows(s, work, bus, 'skill');
  bus?.emit('skill:earthquake', { dmg: Big.fromLog10(work), rows: s.run.depth - from });
}

/** Ready pings and ends of timed skills. */
export function tickSkills(s: IdleState, bus?: IdleBus): void {
  for (const def of SKILLS) {
    const k = s.run.skills[def.id];
    if (!k) continue;
    if (k.cdEnd > 0 && s.time >= k.cdEnd) {
      k.cdEnd = 0;
      bus?.emit('skill:ready', { id: def.id });
    }
    if (k.activeEnd > 0 && s.time >= k.activeEnd) {
      k.activeEnd = 0;
      bus?.emit('skill:end', { id: def.id });
    }
  }
}

