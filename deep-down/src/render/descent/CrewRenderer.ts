import * as THREE from 'three';
import { crewLine } from '../../idle/config/crew';

const rigOf = (line: number) => crewLine(line).rig;
import { createEntityMaterial } from '../entityMaterial';
import type { LightingUniforms } from '../lighting';
import { VoxBuilder } from '../voxModel';
import { CUT_Z, SHAFT_X0 } from './DescentCamera';

/**
 * Crew rigs on screen (SPEC §6.9): lines 0-3 as figures and machines, lines 4-14 as wall machines (the 6 highest owned
 * lines of 4-14 at once), crowned rigs wearing a gold circlet and growing 8 % per crown (W2 MUST 6). Each owned line shows 1 + floor(L / 25) figures (lines 0-2 up
 * to 4, line 3 up to 3) on the floor edges, a scaffold, the left wall's rail and a gantry over the centre,
 * striking on the model's impact frames (A's `CREW[line].rig`: phase = model time mod period). Rigs stand in
 * the z band behind the foreman (CRITIQUE B11: z 1-2.5 m behind the cut) and never cover the dig row.
 */
interface Figure {
  root: THREE.Group;
  arm: THREE.Group;
  line: number;
  index: number;
}

const BODY = 0x4a3a2c;
const COAT = 0x5c4630;
const SKIN = 0xc8a07a;
const HELMET = 0xb08a3a;
const STEEL = 0x8a929c;
const WOOD = 0x6a4c32;
const BRASS = 0xd8b064;

function miner(tool: 'shovel' | 'pick'): { body: THREE.BufferGeometry; arm: THREE.BufferGeometry } {
  const b = new VoxBuilder();
  b.box(-0.13, 0, -0.08, -0.03, 0.42, 0.08, BODY);
  b.box(0.03, 0, -0.08, 0.13, 0.42, 0.08, BODY);
  b.box(-0.17, 0.42, -0.11, 0.17, 0.86, 0.11, COAT);
  b.box(-0.11, 0.86, -0.1, 0.11, 1.06, 0.1, SKIN);
  b.box(-0.14, 1.03, -0.13, 0.14, 1.12, 0.13, HELMET);
  b.box(-0.04, 1.04, 0.13, 0.04, 1.1, 0.17, 0xffe0a0, 1.4, false);
  const a = new VoxBuilder();
  a.box(-0.05, -0.32, -0.05, 0.05, 0, 0.05, COAT);
  if (tool === 'shovel') {
    a.box(-0.02, -0.95, -0.02, 0.02, -0.25, 0.02, WOOD);
    a.box(-0.1, -1.15, -0.02, 0.1, -0.92, 0.02, STEEL);
  } else {
    a.box(-0.02, -0.85, -0.02, 0.02, -0.25, 0.02, WOOD);
    a.box(-0.26, -0.9, -0.03, 0.26, -0.82, 0.03, STEEL);
  }
  return { body: b.build(), arm: a.build() };
}

/** The deep lines' machines (4-14): where each mounts, its model and its moving part. */
interface Machine {
  line: number;
  root: THREE.Group;
  part: THREE.Group;
  crown: THREE.Mesh;
  /** Mount: side (-1 left wall, 1 right wall, 0 back wall top) and height above the floor (m). */
  side: number;
  up: number;
}

const DEEP = [
  { name: 'blastTeam', body: 0x6a4a30, metal: 0x8a8c92, glow: 0xff9a40 },
  { name: 'tunnelBorer', body: 0x5a5048, metal: 0xb8b0a0, glow: 0xffc070 },
  { name: 'crystalResonator', body: 0x3a4a6a, metal: 0x8fe3ee, glow: 0x6fe8ff },
  { name: 'magmaLance', body: 0x3a2a24, metal: 0x6a5a50, glow: 0xff7a2e },
  { name: 'fossilGolem', body: 0xd8ccb0, metal: 0xb8a888, glow: 0xffb000 },
  { name: 'rimeAuger', body: 0x6a8aa8, metal: 0xd8f0ff, glow: 0x7fd8ff },
  { name: 'loomWeaver', body: 0x5a4a3a, metal: 0xe8dcc0, glow: 0xfff4d0 },
  { name: 'gravityWell', body: 0x2a2440, metal: 0x8a7aff, glow: 0xb9a2ff },
  { name: 'starForge', body: 0x5a4020, metal: 0xd8b064, glow: 0xfff1c2 },
  { name: 'voidMaw', body: 0x1a1430, metal: 0x4a3a8a, glow: 0x6a5cff },
  { name: 'gateEngine', body: 0x3a3048, metal: 0xe2b673, glow: 0x8fe3ee },
];

/** A deep line's machine: a wall mount, a body, and its moving part (a drill, an arm, a fist, a ring). */
function machine(line: number): { body: THREE.BufferGeometry; part: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const d = DEEP[(line - 4) % DEEP.length];
  const b = new VoxBuilder();
  const p = new VoxBuilder();
  // The wall mount: a brass plate bolted to the rock, a bracket arm.
  b.box(-0.08, -0.5, -0.4, 0.08, 0.5, 0.4, 0x5a4a3a);
  b.box(-0.05, -0.42, -0.32, 0.12, 0.42, 0.32, BRASS);
  b.box(0.1, -0.12, -0.12, 0.6, 0.12, 0.12, d.metal);
  switch (line) {
    case 4: // Blast Team: a plunger box and a coil of fuse.
      b.box(0.5, -0.3, -0.25, 1.0, 0.15, 0.25, d.body);
      p.box(0.68, 0.15, -0.04, 0.82, 0.6, 0.04, d.metal).box(0.6, 0.55, -0.08, 0.9, 0.62, 0.08, d.metal);
      p.box(0.62, -0.05, 0.25, 0.88, 0.05, 0.27, d.glow, 1);
      break;
    case 5: // Tunnel Borer: a drum and a toothed bit that spins.
      b.box(0.5, -0.35, -0.35, 1.1, 0.35, 0.35, d.body);
      for (let i = 0; i < 6; i++) p.push().rotateX((i / 6) * Math.PI * 2).box(1.1, -0.06, 0.12, 1.5, 0.06, 0.32, d.metal).pop();
      p.box(1.1, -0.1, -0.1, 1.7, 0.1, 0.1, d.glow, 0.6);
      break;
    case 6: // Crystal Resonator: a tuning fork of crystal that rings.
      b.box(0.5, -0.2, -0.2, 0.8, 0.2, 0.2, d.body);
      p.box(0.75, -0.06, -0.3, 1.5, 0.06, -0.18, d.metal, 0.9).box(0.75, -0.06, 0.18, 1.5, 0.06, 0.3, d.metal, 0.9);
      p.box(1.4, -0.1, -0.1, 1.6, 0.1, 0.1, d.glow, 1);
      break;
    case 7: // Magma Lance: a cannon with a glowing throat.
      b.box(0.4, -0.3, -0.3, 1.0, 0.3, 0.3, d.body);
      p.box(0.9, -0.16, -0.16, 1.9, 0.16, 0.16, d.metal).box(1.85, -0.12, -0.12, 1.95, 0.12, 0.12, d.glow, 1);
      break;
    case 8: // Fossil Golem: a bone fist on a bone arm.
      p.box(0.5, -0.12, -0.12, 1.4, 0.12, 0.12, d.body).box(1.3, -0.3, -0.3, 1.8, 0.3, 0.3, d.metal);
      p.box(1.55, -0.32, 0.28, 1.65, -0.22, 0.32, d.glow, 1);
      break;
    case 9: // Rime Auger: an ice screw that turns.
      for (let i = 0; i < 8; i++) p.push().rotateX(i * 0.8).box(0.6 + i * 0.15, -0.05, -0.28, 0.72 + i * 0.15, 0.05, 0.28, d.metal, 0.5).pop();
      p.box(0.6, -0.06, -0.06, 1.9, 0.06, 0.06, d.glow, 0.9);
      break;
    case 10: // Loom Weaver: a frame with glowing threads.
      b.box(0.5, -0.6, -0.5, 0.6, 0.6, 0.5, d.body).box(1.4, -0.6, -0.5, 1.5, 0.6, 0.5, d.body);
      for (let i = 0; i < 6; i++) p.box(0.6, -0.5 + i * 0.2, -0.02, 1.4, -0.48 + i * 0.2, 0.02, d.glow, 1);
      break;
    case 11: // Gravity Well: a ring that pulls.
      for (let i = 0; i < 14; i++) p.push().translate(1.2, 0, 0).rotateX((i / 14) * Math.PI * 2).box(-0.06, 0.5, -0.08, 0.06, 0.62, 0.08, i % 2 ? d.metal : d.glow, i % 2 ? 0.3 : 1).pop();
      break;
    case 12: // Star Forge: a furnace with a star inside.
      b.box(0.5, -0.5, -0.45, 1.4, 0.5, 0.45, d.body);
      p.push().translate(0.95, 0, 0.46).rotateZ(0.78).box(-0.18, -0.18, 0, 0.18, 0.18, 0.06, d.glow, 1).pop();
      break;
    case 13: // Void Maw: a toothed mouth that opens.
      for (let i = 0; i < 10; i++) p.push().translate(1.1, 0, 0).rotateX((i / 10) * Math.PI * 2).box(-0.05, 0.3, -0.06, 0.05, 0.55, 0.06, i % 2 ? d.metal : d.body).pop();
      p.box(1.0, -0.15, -0.15, 1.2, 0.15, 0.15, d.glow, 1);
      break;
    default: // Gate Engine: a rune wheel.
      b.box(0.5, -0.4, -0.4, 0.7, 0.4, 0.4, d.body);
      for (let i = 0; i < 8; i++) p.push().translate(1.0, 0, 0).rotateX((i / 8) * Math.PI * 2).box(-0.05, 0.25, -0.1, 0.05, 0.6, 0.1, i % 2 ? d.metal : d.glow, i % 2 ? 0.2 : 1).pop();
  }
  // The crown: a gold circlet on the mount (shown from its first crown).
  const c = new VoxBuilder();
  for (let i = 0; i < 5; i++) c.box(-0.1, 0.5 + (i % 2) * 0.08, -0.3 + i * 0.15, 0.1, 0.62 + (i % 2) * 0.08, -0.22 + i * 0.15, 0xffd060, 0.8);
  return { body: b.build(), part: p.build(), crown: c.build() };
}

export class CrewRenderer {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly figures: Figure[] = [];
  private readonly cart: THREE.Mesh;
  private readonly rail: THREE.Mesh;
  private readonly gantry: THREE.Group;
  private readonly bit: THREE.Mesh;
  private readonly scaffold: THREE.Mesh;
  private levels: number[] = [];
  private readonly machines: Machine[] = [];
  /** Crowns per line (every 50 levels): the rigs glow and wear a circlet. */
  crownsOf: (line: number) => number = (line) => Math.floor((this.levels[line] ?? 0) / 50);
  /** Impacts that landed this frame (line, figure): the scene puffs dust there. */
  readonly impacts: Array<{ line: number; x: number; y: number }> = [];
  private lastPhase: number[] = [];

  constructor(lighting: LightingUniforms) {
    this.group.name = 'crew';
    this.material = createEntityMaterial(lighting, { emissiveScale: 2 });
    const shovel = miner('shovel');
    const pick = miner('pick');
    // Line 0: Shovel Hands at the floor edges (up to 4). Line 1: the Pick Crew on a scaffold (up to 4).
    for (let line = 0; line < 2; line++)
      for (let i = 0; i < 4; i++) {
        const g = line === 0 ? shovel : pick;
        const root = new THREE.Group();
        const body = new THREE.Mesh(g.body, this.material);
        const arm = new THREE.Group();
        arm.position.set(0.18, 0.82, 0);
        arm.add(new THREE.Mesh(g.arm, this.material));
        root.add(body, arm);
        root.visible = false;
        root.scale.setScalar(line === 0 ? 0.82 : 0.78);
        this.group.add(root);
        this.figures.push({ root, arm, line, index: i });
      }
    // Line 2: the Mine Cart on a rail down the left wall's margin.
    this.rail = new THREE.Mesh(new VoxBuilder().box(-0.05, -6, -0.05, 0.05, 0, 0.05, STEEL).box(0.25, -6, -0.05, 0.35, 0, 0.05, STEEL).build(), this.material);
    this.cart = new THREE.Mesh(
      new VoxBuilder().box(-0.32, 0, -0.25, 0.32, 0.42, 0.25, 0x5a4a3a).box(-0.34, 0.38, -0.27, 0.34, 0.46, 0.27, BRASS).box(-0.22, 0.42, -0.18, 0.22, 0.52, 0.18, 0xd07a3a, 0.6).build(),
      this.material,
    );
    this.rail.visible = this.cart.visible = false;
    // Line 3: the Steam Drill's gantry over the centre column, its bit plunging on the impacts.
    this.gantry = new THREE.Group();
    this.gantry.add(new THREE.Mesh(new VoxBuilder().box(-3.3, 0, -0.18, 3.3, 0.22, 0.18, 0x3a3e46).box(-0.3, -0.5, -0.3, 0.3, 0.05, 0.3, BRASS).build(), this.material));
    this.bit = new THREE.Mesh(new VoxBuilder().box(-0.09, -1.4, -0.09, 0.09, 0, 0.09, STEEL).box(-0.14, -1.7, -0.14, 0.14, -1.4, 0.14, 0xc8d0da).build(), this.material);
    this.gantry.add(this.bit);
    this.gantry.visible = false;
    this.scaffold = new THREE.Mesh(new VoxBuilder().box(-0.7, -0.08, -0.3, 0.7, 0, 0.3, WOOD).box(-0.66, -1.6, -0.04, -0.6, 0, 0.04, WOOD).box(0.6, -1.6, -0.04, 0.66, 0, 0.04, WOOD).build(), this.material);
    this.scaffold.visible = false;
    const scaffold2 = this.scaffold.clone();
    scaffold2.name = 'scaffold2';
    this.group.add(this.rail, this.cart, this.gantry, this.scaffold, scaffold2);
    // Lines 4-14: machines on the shaft walls (the side margins, 1.5 m behind the cut) and over the back wall,
    // ≥ 1.6 m above the floor so the 1.5 m above it stays the foreman's (CRITIQUE B11).
    const mounts: Array<[number, number]> = [[-1, 2.1], [1, 2.4], [-1, 3.4], [1, 3.7], [0, 4.2], [-1, 4.6], [1, 5.0], [0, 5.6], [-1, 2.8], [1, 3.1], [0, 4.9]];
    for (let line = 4; line < 15; line++) {
      const g = machine(line);
      const root = new THREE.Group();
      root.add(new THREE.Mesh(g.body, this.material));
      const part = new THREE.Group();
      part.add(new THREE.Mesh(g.part, this.material));
      root.add(part);
      const crown = new THREE.Mesh(g.crown, this.material);
      crown.visible = false;
      root.add(crown);
      root.visible = false;
      const [side, up] = mounts[line - 4];
      this.group.add(root);
      this.machines.push({ line, root, part, crown, side, up });
    }
  }

  /** Lines drawn as machines now (the 6 highest owned lines of 4-14; SPEC §6.9). */
  private shownDeep(): Set<number> {
    const owned: number[] = [];
    for (let l = 14; l >= 4; l--) if ((this.levels[l] ?? 0) > 0) owned.push(l);
    return new Set(owned.slice(0, 6));
  }

  /** Owned levels per line (index = line). */
  setLevels(levels: ArrayLike<number>): void {
    this.levels.length = 0;
    for (let i = 0; i < levels.length; i++) this.levels.push(levels[i]);
  }

  /** Visible figures of a line for level L (SPEC: 1 + floor(L / 25), capped). */
  static figuresFor(line: number, level: number): number {
    if (level <= 0) return 0;
    const cap = line <= 2 ? 4 : line <= 5 ? 3 : 2;
    return Math.min(cap, 1 + Math.floor(level / 25));
  }

  /**
   * @param floorY world y of the floor's top edge (the followed floor, so rigs ride the thunk)
   * @param phaseOf seconds into line `line`'s loop (the model clock)
   */
  update(floorY: number, phaseOf: (line: number) => number): void {
    this.impacts.length = 0;
    const lv = (l: number) => this.levels[l] ?? 0;
    const zBack = CUT_Z - 2.2;
    for (const f of this.figures) {
      const n = CrewRenderer.figuresFor(f.line, lv(f.line));
      f.root.visible = f.index < n;
      if (!f.root.visible) continue;
      const rig = rigOf(f.line);
      // Alternate sides; each figure offsets its phase so a crew is not one machine.
      const left = f.index % 2 === 0;
      const slot = Math.floor(f.index / 2);
      const phase = (phaseOf(f.line) + (f.line === 1 ? (f.index % 2) * (rig.period / 2) : slot * 0.11)) % rig.period;
      const u = phase / rig.period;
      if (f.line === 0) f.root.position.set(SHAFT_X0 + (left ? 0.35 + slot * 0.5 : 6.65 - slot * 0.5), floorY, zBack + slot * 0.3);
      else f.root.position.set(SHAFT_X0 + (left ? 0.55 + slot * 0.55 : 6.45 - slot * 0.55), floorY + 1.6, zBack - 0.3);
      f.root.rotation.y = left ? 0.5 : -0.5;
      // The swing: raise slowly, strike fast at the impact time.
      const imp = rig.impacts[0] / rig.period;
      const k = u < imp ? u / imp : 1 - (u - imp) / (1 - imp);
      const strikeAng = u < imp ? -2.2 * Math.pow(k, 0.6) : -2.2 * Math.pow(Math.max(0, k), 3);
      f.arm.rotation.x = strikeAng;
      const prev = this.lastPhase[f.line * 8 + f.index] ?? phase;
      for (const t of rig.impacts) if (prev < t && phase >= t) this.impacts.push({ line: f.line, x: f.root.position.x, y: floorY });
      this.lastPhase[f.line * 8 + f.index] = phase;
    }
    // The deep lines: each machine strikes on its line's impact frames (the part lunges, spins or rings).
    const shown = this.shownDeep();
    for (const m of this.machines) {
      m.root.visible = shown.has(m.line);
      if (!m.root.visible) continue;
      const rig = rigOf(m.line);
      const ph = phaseOf(m.line) % rig.period;
      let hit = 0;
      for (const t of rig.impacts) {
        const d = ph - t;
        if (d > -0.15 && d < 0.25) hit = Math.max(hit, d < 0 ? 1 + d / 0.15 : 1 - d / 0.25);
      }
      const x = m.side < 0 ? SHAFT_X0 - 0.75 : m.side > 0 ? SHAFT_X0 + 7.75 : SHAFT_X0 + 3.5;
      m.root.position.set(x, floorY + m.up, m.side === 0 ? CUT_Z - 3.3 : CUT_Z - 1.4);
      // Wall mounts point into the shaft; the back-wall ones point down at the floor.
      m.root.rotation.set(0, m.side > 0 ? Math.PI : 0, m.side === 0 ? -Math.PI / 2 : -0.35);
      const spin = m.line === 5 || m.line === 9 || m.line === 11 || m.line === 13 || m.line === 14;
      if (spin) m.part.rotation.x = phaseOf(m.line) * (2 + 6 * hit);
      else m.part.position.x = 0.35 * hit;
      const crowns = this.crownsOf(m.line);
      m.crown.visible = crowns > 0;
      m.root.scale.setScalar(1 + Math.min(0.4, 0.08 * crowns));
      const prev = this.lastPhase[m.line * 8 + 7] ?? ph;
      for (const t of rig.impacts) if (prev < t && ph >= t) this.impacts.push({ line: m.line, x: SHAFT_X0 + 1 + ((m.line * 3) % 6), y: floorY });
      this.lastPhase[m.line * 8 + 7] = ph;
    }
    // Scaffolds under the Pick Crew.
    const pc = CrewRenderer.figuresFor(1, lv(1));
    const s2 = this.group.getObjectByName('scaffold2') as THREE.Mesh;
    this.scaffold.visible = pc > 0;
    s2.visible = pc > 1;
    this.scaffold.position.set(SHAFT_X0 + 0.9, floorY + 1.6, zBack - 0.3);
    s2.position.set(SHAFT_X0 + 6.1, floorY + 1.6, zBack - 0.3);
    // The Mine Cart: descends the left rail, dumps at the impact, climbs back.
    const cartOn = lv(2) > 0;
    this.rail.visible = this.cart.visible = cartOn;
    if (cartOn) {
      const rig = rigOf(2);
      const ph = phaseOf(2) % rig.period;
      const imp = rig.impacts[0];
      const down = ph < imp ? ph / imp : 1 - (ph - imp) / (rig.period - imp);
      this.rail.position.set(SHAFT_X0 - 0.55, floorY + 5.5, CUT_Z + 0.25);
      this.cart.position.set(SHAFT_X0 - 0.4, floorY + 4.4 - 4.1 * (1 - (1 - down) ** 2), CUT_Z + 0.3);
      this.cart.rotation.z = ph > imp - 0.15 && ph < imp + 0.25 ? -0.5 : 0;
      const prev = this.lastPhase[2 * 8 + 7] ?? ph;
      if (prev < imp && ph >= imp) this.impacts.push({ line: 2, x: SHAFT_X0 + 0.5, y: floorY });
      this.lastPhase[2 * 8 + 7] = ph;
    }
    // The Steam Drill.
    const drillOn = lv(3) > 0;
    this.gantry.visible = drillOn;
    if (drillOn) {
      const rig = rigOf(3);
      const ph = phaseOf(3) % rig.period;
      let plunge = 0;
      for (const t of rig.impacts) {
        const d = ph - t;
        if (d > -0.12 && d < 0.18) plunge = Math.max(plunge, d < 0 ? 1 + d / 0.12 : 1 - d / 0.18);
      }
      this.gantry.position.set(SHAFT_X0 + 3.5, floorY + 3.6, zBack + 0.4);
      this.bit.position.y = -0.2 - 1.55 * plunge;
      const prev = this.lastPhase[3 * 8 + 7] ?? ph;
      for (const t of rig.impacts) if (prev < t && ph >= t) this.impacts.push({ line: 3, x: SHAFT_X0 + 3.5, y: floorY });
      this.lastPhase[3 * 8 + 7] = ph;
    }
  }

  /** Figures and machines on screen (debug). */
  get visible(): number {
    return this.figures.filter((f) => f.root.visible).length + (this.cart.visible ? 1 : 0) + (this.gantry.visible ? 1 : 0) + this.machines.filter((m) => m.root.visible).length;
  }
}
