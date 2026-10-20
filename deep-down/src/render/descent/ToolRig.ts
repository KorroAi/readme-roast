import * as THREE from 'three';
import { VoxBuilder } from '../voxModel';
import { CUT_Z, SHAFT_X0 } from './DescentCamera';

/**
 * The strike ghost (SPEC §3.3): the Lantern Pick, a glowing copy of the tool, appears at the impact pose on the
 * tapped cell in the frame of the tap, with an additive smear arc (90 degrees, alpha 0.7 -> 0 over 90 ms); it
 * follows through 18 degrees over 120 ms and fades over 80 ms. Tiers 1-4 in W1 (head 0.6 / 0.7 / 0.8 / 1.0 m);
 * later tiers reuse tier 4's model scaled to their head length until W2.
 */
export const TOOL_TIERS = [
  { head: 0.6, color: 0xc08a5a, glow: 0xffb35c },
  { head: 0.7, color: 0xe58444, glow: 0xffa060 },
  { head: 0.8, color: 0xb8c0cc, glow: 0xd8e8ff },
  { head: 1.0, color: 0xd0d8e4, glow: 0xffffff },
] as const;

const HEAD_LENGTHS = [0.6, 0.7, 0.8, 1.0, 1.2, 1.4, 1.7, 2.0, 2.4, 2.9, 3.5, 4.2, 5.0, 6.0, 7.0];

/** Ghost head length of a tier (1-based); 16+ stays at 7 m. */
export const headLength = (tier: number): number => HEAD_LENGTHS[Math.max(0, Math.min(HEAD_LENGTHS.length - 1, tier - 1))];

const GHOSTS = 3;
const IMPACT_MS = 120;
const FADE_MS = 80;
const SMEAR_MS = 90;

interface Ghost {
  group: THREE.Group;
  pick: THREE.Mesh;
  smear: THREE.Mesh;
  t: number;
  dir: number;
  active: boolean;
}

export class ToolRig {
  readonly group = new THREE.Group();
  private readonly ghosts: Ghost[] = [];
  private readonly pickMats: THREE.MeshBasicMaterial[] = [];
  private readonly smearMat: THREE.MeshBasicMaterial;
  private readonly pickGeos: THREE.BufferGeometry[] = [];
  private next = 0;
  private tier = 1;

  constructor() {
    this.group.name = 'toolRig';
    for (const t of TOOL_TIERS) this.pickGeos.push(buildGhostPick(t.head));
    this.smearMat = new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    // A 90 degree arc band (the smear) around the swing pivot.
    const smearGeo = new THREE.RingGeometry(0.55, 1.05, 18, 1, Math.PI * 0.5, Math.PI * 0.5);
    for (let i = 0; i < GHOSTS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: TOOL_TIERS[0].glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this.pickMats.push(mat);
      const pick = new THREE.Mesh(this.pickGeos[0], mat);
      const smear = new THREE.Mesh(smearGeo, this.smearMat.clone());
      const g = new THREE.Group();
      g.add(pick, smear);
      g.visible = false;
      g.renderOrder = 20;
      pick.renderOrder = 21;
      smear.renderOrder = 20;
      this.group.add(g);
      this.ghosts.push({ group: g, pick, smear, t: 1e9, dir: 1, active: false });
    }
  }

  setTier(tier: number): void {
    this.tier = Math.max(1, tier);
  }

  /** The ghost strikes cell (row, col) now (frame 0 shows the impact pose). */
  strike(row: number, col: number, crit: boolean): void {
    const g = this.ghosts[this.next];
    this.next = (this.next + 1) % GHOSTS;
    const ti = Math.min(TOOL_TIERS.length - 1, this.tier - 1);
    g.pick.geometry = this.pickGeos[ti];
    (g.pick.material as THREE.MeshBasicMaterial).color.setHex(crit ? 0xfff0c0 : TOOL_TIERS[ti].glow);
    const scale = headLength(this.tier) / TOOL_TIERS[ti].head;
    // Swing from the upper side away from the shaft centre, so the head lands on the cell's top face.
    g.dir = col < 3 ? -1 : 1;
    const x = SHAFT_X0 + col + 0.5;
    const y = -row;
    g.group.position.set(x + g.dir * 0.65, y + 0.75, CUT_Z + 0.45);
    g.group.scale.set(g.dir * scale, scale, scale);
    g.t = 0;
    g.active = true;
    g.group.visible = true;
    this.applyPose(g);
  }

  update(dtMs: number): void {
    for (const g of this.ghosts) {
      if (!g.active) continue;
      g.t += dtMs;
      if (g.t > IMPACT_MS + FADE_MS) {
        g.active = false;
        g.group.visible = false;
        continue;
      }
      this.applyPose(g);
    }
  }

  private applyPose(g: Ghost): void {
    // Impact pose: the haft points from the pivot down-inward to the cell; follow-through 18 degrees.
    const follow = Math.min(1, g.t / IMPACT_MS);
    const ease = 1 - (1 - follow) ** 3;
    g.pick.rotation.z = -1.05 - ease * (18 * Math.PI) / 180;
    const fade = g.t <= IMPACT_MS ? 1 : 1 - (g.t - IMPACT_MS) / FADE_MS;
    (g.pick.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, fade);
    const sm = Math.max(0, 1 - g.t / SMEAR_MS);
    (g.smear.material as THREE.MeshBasicMaterial).opacity = 0.7 * sm;
    g.smear.rotation.z = -0.15 - ease * 0.3;
  }

  /** Live ghosts (debug). */
  get live(): number {
    return this.ghosts.filter((g) => g.active).length;
  }
}

/** A pick silhouette for the ghost: haft along +y from the pivot (0,0), the head at the far end. */
function buildGhostPick(head: number): THREE.BufferGeometry {
  const b = new VoxBuilder();
  const L = 1.05;
  b.box(-0.035, 0, -0.035, 0.035, L, 0.035, 0xffffff, 1, false);
  // The head: a curved bar across the haft's end, pointed both sides.
  const h = head / 2;
  b.box(-h, L - 0.06, -0.05, h, L + 0.06, 0.05, 0xffffff, 1, false);
  b.box(-h - 0.08, L - 0.04, -0.03, -h, L + 0.02, 0.03, 0xffffff, 1, false);
  b.box(h, L - 0.04, -0.03, h + 0.08, L + 0.02, 0.03, 0xffffff, 1, false);
  return b.build();
}
