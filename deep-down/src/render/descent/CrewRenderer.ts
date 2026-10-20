import * as THREE from 'three';
import { crewLine } from '../../idle/config/crew';

const rigOf = (line: number) => crewLine(line).rig;
import { createEntityMaterial } from '../entityMaterial';
import type { LightingUniforms } from '../lighting';
import { VoxBuilder } from '../voxModel';
import { CUT_Z, SHAFT_X0 } from './DescentCamera';

/**
 * Crew rigs on screen (SPEC §6.9, W1: lines 0-3). Each owned line shows 1 + floor(L / 25) figures (lines 0-2 up
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
    return this.figures.filter((f) => f.root.visible).length + (this.cart.visible ? 1 : 0) + (this.gantry.visible ? 1 : 0);
  }
}
