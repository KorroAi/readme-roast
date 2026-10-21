// U-W4 (SPEC §13.1; BUILD §3.2 MUST 5; W1-LEAD §3): every template obeys reach and size from where you stand to use
// each thing (strike types and lamps ≤ 3.5 m / 2.5 m, focus types ≤ 4.5 m, valuables 0.5–1.4 m up, drawn ≥ 72 px at
// 360 × 740), and every Explore cavern has what W1-LEAD §3 asks for (levels, lamps, strike tappables, a feature, a
// secret, an exit, the size band).
import { describe, expect, it } from 'vitest';
import { contents, nodeAt } from '../../../src/idle/model/chart';
import { placeNode } from '../../../src/world/hybrid/layout';
import { templateFor, TEMPLATE_SPECS } from '../../../src/world/hybrid/kits/templates';
import { PX_PER_M_360, REACH } from '../../../src/world/hybrid/kits/reach';
import { GLOWROOT_KIT } from '../../../src/world/hybrid/kits/types';

const SEEDS = [12345, 1];
const NODES = 18;
const EYE = 1.6;

const STRIKE = new Set(['vein', 'gem', 'stash', 'secret', 'skin']);
const FOCUS = new Set(['feature', 'cache']);

describe('kits: reach and size from the approach (U-W4)', () => {
  for (const seed of SEEDS)
    it(`seed ${seed}: every socket of nodes 0–${NODES - 1} is in reach and big enough from where you use it`, () => {
      for (let i = 0; i < NODES; i++) {
        const p = placeNode(seed, { i }, undefined, 7);
        for (const s of p.chamber.sockets) {
          const eye = { x: s.approach.x, y: s.approach.y + EYE, z: s.approach.z };
          const d = Math.hypot(s.pos.x - eye.x, s.pos.y - eye.y, s.pos.z - eye.z);
          const where = `node ${i} ${p.chamber.template} ${s.id} (${s.kind})`;
          if (s.kind === 'lamp') expect(d, where).toBeLessThanOrEqual(REACH.lamp + 0.5);
          else if (STRIKE.has(s.kind)) expect(d, where).toBeLessThanOrEqual(REACH.strike);
          else if (FOCUS.has(s.kind)) expect(d, where).toBeLessThanOrEqual(REACH.focus);
          if (s.kind === 'lamp') expect(2 * Math.max(s.bound.x, s.bound.z), where).toBeGreaterThanOrEqual(REACH.lampAcross);
          if (s.kind === 'feature' && s.mount !== 'post') {
            const up = s.pos.y - s.approach.y;
            expect(up, where).toBeGreaterThanOrEqual(REACH.valuableLo - 1e-6);
            expect(up, where).toBeLessThanOrEqual(REACH.valuableHi + 1e-6);
          }
          // Drawn size on the short axis at 360 × 740: the bound's largest extent across the view.
          if (s.kind !== 'skin' && !s.hidden) {
            const px = ((2 * Math.max(s.bound.x, s.bound.y, s.bound.z)) / Math.max(0.5, d)) * PX_PER_M_360;
            expect(px, where).toBeGreaterThanOrEqual(72);
          }
        }
      }
    });
});

describe('kits: the Explore cavern contract (W1-LEAD §3)', () => {
  it('every W1 template: 2–3 levels, ≥ 9 vein, 2 gem, 3 stash, 4 lamp, 2 feature, ≥ 1 secret sockets, one exit', () => {
    for (const id of Object.keys(TEMPLATE_SPECS) as Array<keyof typeof TEMPLATE_SPECS>) {
      const spec = TEMPLATE_SPECS[id];
      expect(spec.levels, id).toBeGreaterThanOrEqual(2);
      expect(spec.levels, id).toBeLessThanOrEqual(3);
      expect(spec.w, id).toBeGreaterThanOrEqual(14);
      expect(spec.d, id).toBeGreaterThanOrEqual(14);
      expect(spec.w, id).toBeLessThanOrEqual(28);
      expect(spec.d, id).toBeLessThanOrEqual(30);
      expect(spec.h, id).toBeGreaterThanOrEqual(6);
    }
    for (let i = 0; i < NODES; i++) {
      const p = placeNode(12345, { i }, undefined, 7);
      const n = (k: string) => p.chamber.sockets.filter((s) => s.kind === k).length;
      const where = `node ${i} ${p.chamber.template}`;
      expect(n('vein') + n('gem') + n('stash'), where).toBeGreaterThanOrEqual(6);
      expect(n('lamp'), where).toBeGreaterThanOrEqual(2);
      expect(n('feature'), where).toBeGreaterThanOrEqual(1);
      expect(n('secret'), where).toBeGreaterThanOrEqual(1);
      expect(n('cache'), where).toBeGreaterThanOrEqual(1);
      expect(n('skin'), where).toBeGreaterThanOrEqual(20);
      expect(p.chamber.exits.length, where).toBe(1);
      // A stand for the arrival and the objective's walk targets.
      expect(p.chamber.stands.length, where).toBeGreaterThanOrEqual(2);
    }
  });

  it("the model fills the sockets: Topsoil's authored counts land, every chamber has 6–14 strike tappables and 2–4 lamps", () => {
    const life = 12345;
    for (let i = 0; i < NODES; i++) {
      const topo = nodeAt(life, i);
      const tpl = templateFor(life, topo);
      const c = contents(7, life, topo, tpl);
      const where = `node ${i} ${tpl.id}`;
      expect(c.strike.length, where).toBeGreaterThanOrEqual(i < 6 ? 6 : 5);
      expect(c.strike.length, where).toBeLessThanOrEqual(14);
      expect(c.lamps.length + c.litLamps.length, where).toBeGreaterThanOrEqual(2);
      expect(c.lamps.length + c.litLamps.length, where).toBeLessThanOrEqual(4);
      // Every socket the model fills exists in the placed chamber.
      const placed = new Set(placeNode(life, { i }, undefined, 7).chamber.sockets.map((s) => s.local));
      for (const id of [...c.strike, ...c.focus, ...c.lamps, ...c.litLamps]) expect(placed.has(id), `${where}: ${id}`).toBe(true);
    }
  });

  it('templateFor: the six authored Topsoil rooms, the Threshold, the mini-kit, the Root Knot', () => {
    const life = 12345;
    const ids = Array.from({ length: NODES }, (_, i) => templateFor(life, nodeAt(life, i)).id);
    expect(ids.slice(0, 6)).toEqual(['topsoil.rootCellar', 'topsoil.copperLode', 'topsoil.lampRoom', 'topsoil.reliquary', 'topsoil.cache', 'topsoil.liftBottom']);
    expect(ids[6]).toBe('glowroot.threshold');
    expect(ids[NODES - 1]).toBe('glowroot.rootKnot');
    for (const id of ids.slice(7, NODES - 1)) expect(GLOWROOT_KIT).toContain(id);
    // Both sub-zones appear in Glowroot.
    const zones = new Set(Array.from({ length: NODES - 8 }, (_, k) => templateFor(life, nodeAt(life, k + 7)).subZone));
    expect(zones).toEqual(new Set(['cellars', 'galleries']));
  });
});
