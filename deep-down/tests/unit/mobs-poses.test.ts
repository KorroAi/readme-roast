import { describe, expect, it } from 'vitest';
import { SimMob } from '../../src/game/mobs/MobSim';
import { ALL_KINDS } from '../../src/game/mobs/species';
import { mobModel } from '../../src/render/mobs/models';
import { pose, type PoseOut } from '../../src/render/mobs/poses';
import { Rig } from '../../src/render/mobs/rig';
import type { MobKind, MobState } from '../../src/game/mobs/types';

// Every creature's bones stay on its body in every state (round 3, MOBS): a pose or an overlay (the
// hit flinch, the death collapse, a guardian's open guard, the Heart's phases) that scaled bones down
// a chain or turned one by a NaN would fling pieces of the body about the cave. Model space: every
// bone's matrix finite, its scale at most 3 and its pivot within reach of the body.

const STATES: MobState[] = ['idle', 'wander', 'lurk', 'stalk', 'windup', 'attack', 'recoil', 'flee', 'follow', 'sleep', 'wake', 'burrow', 'stunned', 'dying'];

function check(kind: MobKind, label: string, m: SimMob, rig: Rig, model: ReturnType<typeof mobModel>, out: PoseOut, t: number): string | null {
  pose(m, model, rig, t, out);
  rig.update();
  const reach = model.radius * 3 + 1.5;
  for (let i = 0; i < model.bones.length; i++) {
    const e = rig.matrices[i].elements;
    if (!e.every((x) => Number.isFinite(x))) return `${kind} ${label}: bone ${i} not finite`;
    for (const c of [0, 4, 8]) {
      const s = Math.hypot(e[c], e[c + 1], e[c + 2]);
      // (0 is a part hidden on purpose: a crystal not grown yet, the loot it carries.)
      if (s > 3) return `${kind} ${label}: bone ${i} (${model.bones[i].name ?? ''}) scaled ${s.toFixed(2)}`;
    }
    // Where the bone's pivot ends up.
    const p = model.bones[i].pivot;
    const x = e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12];
    const y = e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13];
    const z = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14];
    const d = Math.hypot(x, y, z);
    if (d > reach) return `${kind} ${label}: bone ${i} (${model.bones[i].name ?? ''}) pivot ${d.toFixed(2)} m out (reach ${reach.toFixed(2)})`;
  }
  for (const k of ['glow', 'lift', 'sx', 'sy', 'sz', 'pitch', 'roll'] as const) if (!Number.isFinite(out[k])) return `${kind} ${label}: out.${k} not finite`;
  return null;
}

describe('creature poses keep every bone on the body', () => {
  it.each(ALL_KINDS.filter((k) => k !== 'worm' && k !== 'moth'))('%s, in every state, struck, dying and open', (kind) => {
    const model = mobModel(kind);
    const rig = new Rig(model.bones);
    const out: PoseOut = { glow: 1, lift: 0, sx: 1, sy: 1, sz: 1, pitch: 0, roll: 0 };
    const errors: string[] = [];
    const m = new SimMob(kind, 0.37);
    for (const st of STATES) {
      for (const t of [0.4, 2.7, 13.9]) {
        m.state = st;
        m.stateTime = t * 0.3;
        m.gait = t * 0.7;
        m.speedNow = 1.2;
        m.strike = st === 'windup' || st === 'attack' ? 0.8 : 0;
        m.open = st === 'attack' ? 1 : 0.3;
        m.alert = 1;
        const e = check(kind, `${st} t ${t}`, m, rig, model, out, t);
        if (e) errors.push(e);
      }
    }
    // Struck (the flinch), then killed and collapsing, then a guardian's open guard and its phases.
    m.state = 'stalk';
    m.hurt = 0.25;
    m.hurtDir.x = 0.6;
    m.hurtDir.z = -0.8;
    let e = check(kind, 'struck', m, rig, model, out, 1);
    if (e) errors.push(e);
    m.hurt = 0;
    m.state = 'dying';
    m.killed = true;
    for (const c of [0.05, 0.5, 1, 3]) {
      m.collapse = c;
      m.stateTime = c;
      e = check(kind, `collapse ${c}`, m, rig, model, out, 2);
      if (e) errors.push(e);
    }
    m.killed = false;
    m.collapse = 0;
    if (m.guardian) {
      for (const ph of [1, 2, 3]) {
        m.state = 'recoil';
        m.phase = ph;
        m.openLeft = 1.5;
        m.openFor = 2.4;
        m.beat = 0.3;
        e = check(kind, `open, phase ${ph}`, m, rig, model, out, 4);
        if (e) errors.push(e);
      }
    }
    expect(errors.slice(0, 5)).toEqual([]);
  });
});

describe("the Dark Heart's three phases read apart", () => {
  // Round 3's capture sheets (heart-phase1..3.png) showed its phases alike: its veins and its core sat
  // inside the shell, so only their glow changed. Now, posed: in phase 1 the shell stays closed; in
  // phase 2 its veins split it (glowing cracks); in phase 3 its core blazes through the shell's dents.
  it('veins out through the shell from phase 2, the core through it in phase 3', () => {
    const model = mobModel('heartOfDark');
    const rig = new Rig(model.bones);
    const out: PoseOut = { glow: 1, lift: 0, sx: 1, sy: 1, sz: 1, pitch: 0, roll: 0 };
    const m = new SimMob('heartOfDark', 0.37);
    m.state = 'stalk';
    // Between two swells of its beat (no pulse).
    m.beat = 0.6;
    const pos = model.geometry.getAttribute('position');
    const bone = model.geometry.getAttribute('aBone');
    const radiiOf = (b: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        if (Math.round(bone.getX(i)) !== b) continue;
        const e = rig.matrices[b].elements;
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        out.push(Math.hypot(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]));
      }
      return out.sort((a, b) => a - b);
    };
    const { sac, veins, core } = model.index;
    expect(veins, 'its veins on a bone of their own').toBeDefined();
    expect(core, 'its core on a bone of their own').toBeDefined();
    const seen: Record<number, { veinsOut: number; coreShows: number; glow: number }> = {};
    for (const ph of [1, 2, 3]) {
      m.phase = ph;
      pose(m, model, rig, 4, out);
      rig.update();
      const shell = radiiOf(sac);
      const median = shell[Math.floor(shell.length / 2)];
      const v = radiiOf(veins);
      const c = radiiOf(core);
      const coreR = c[Math.floor(c.length / 2)];
      // The share of its veins out beyond the shell, and of the shell the core shows through (its dents).
      seen[ph] = { veinsOut: v.filter((r) => r > median).length / v.length, coreShows: shell.filter((r) => r < coreR).length / shell.length, glow: out.glow };
    }
    // Phase 1: a closed shell (a vein tip at most here and there, no core).
    expect(seen[1].veinsOut).toBeLessThan(0.1);
    expect(seen[1].coreShows).toBe(0);
    // Phase 2: the veins split it; the core still within.
    expect(seen[2].veinsOut).toBeGreaterThan(0.3);
    expect(seen[2].coreShows).toBe(0);
    // Phase 3: the core blazes through its dents (the shell still there), and it burns brightest.
    expect(seen[3].coreShows).toBeGreaterThan(0.15);
    expect(seen[3].coreShows).toBeLessThan(0.6);
    expect(seen[3].glow).toBeGreaterThan(seen[2].glow);
    expect(seen[2].glow).toBeGreaterThan(seen[1].glow);
    // On the beat itself (its lub: the shell swells) the shell still shows over most of it (the first
    // capture of phase 3, held on a lub, showed one blazing ball).
    m.beat = 0;
    pose(m, model, rig, 4, out);
    rig.update();
    const shell = radiiOf(sac);
    const c = radiiOf(core);
    const coreR = c[Math.floor(c.length / 2)];
    expect(shell.filter((r) => r < coreR).length / shell.length).toBeLessThan(0.6);
  });
});
