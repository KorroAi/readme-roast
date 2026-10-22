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
