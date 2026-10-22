import * as THREE from 'three';
import type { LightingUniforms } from '../../render/lighting';
import { createEntityMaterial } from '../../render/entityMaterial';
import { VoxBuilder } from '../../render/voxModel';
import { relightHeart } from '../../render/biomeLook';
import type { TerrainRig } from '../../render/terrainRig';
import { HaloSystem } from './Halos';
import { B } from '../../config/blocks';

/**
 * Round 3 (VIS stretch): the Heart of the deep, and its relighting (the main quest's end).
 *
 * The Heart hangs over its chamber (WORLD's layout.heart): a great faceted crystal, dark and slowly
 * turning, a dull rose ember deep inside, until the twelve shards relight it ('quest:heartLit').
 * Then, over about fourteen seconds:
 * - the core flares from within (0-2 s) and a rose-gold flash touches the screen's edge;
 * - a great ring of light sweeps out from it over the rock of the whole stratum (the sonar's shell,
 *   at 16 m/s to 170 m), every glowing thing it passes flaring and keeping some of it;
 * - the Heart's air turns from dark rose to warm clear gold and its lights burn brighter
 *   (relightHeart), the motes rise thick for a while;
 * - and it stays lit (a save with the Heart lit starts lit).
 * Calm, like everything: no shake, one slow ring, the flash at the edge only.
 */

const CORE_LIFT = 7;

function coreGeometry(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const body = new VoxBuilder();
  const glow = new VoxBuilder();
  // The heart crystal: a double point of rose-black glass with a cage of dark facets.
  glow.crystal(0.9, 3.4, 1.0, 8, 0xff6a80, 0x8a1426, 0.9);
  glow.push().rotateX(Math.PI);
  glow.crystal(0.9, 2.4, 0.9, 8, 0xff6a80, 0x8a1426, 0.85);
  glow.pop();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    body.push().rotateY(a).translate(1.05, 0, 0).rotateZ(0.12);
    body.crystal(0.16, 2.2, 0.3, 4, 0x1a0c14, 0x0c060a, 0);
    body.pop();
    body.push().rotateY(a + 0.4).translate(0.95, 0, 0).rotateZ(Math.PI - 0.15);
    body.crystal(0.13, 1.6, 0.25, 4, 0x1a0c14, 0x0c060a, 0);
    body.pop();
  }
  // Shards orbiting it: twelve, one for each guardian.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    glow.push().rotateY(a).translate(2.3, Math.sin(k * 1.7) * 0.6, 0).rotateZ(0.4);
    glow.crystal(0.08, 0.42, 0.12, 5, 0xffc0a0, 0xd8486a, 0.95);
    glow.pop();
  }
  return { body: body.build(), glow: glow.build() };
}

export class HeartFinale {
  readonly group = new THREE.Group();
  private readonly core = new THREE.Group();
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly bodyMat: THREE.ShaderMaterial;
  private readonly halo: HaloSystem;
  private centre: THREE.Vector3 | null = null;
  /** Seconds since the relighting began (-1: not playing). */
  private t = -1;
  /** 0 dark .. 1 lit. */
  lit = 0;
  /** The motes' boost while the finale plays (VisDirector multiplies its motes by it). */
  moteBoost = 1;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'heart';
    const g = coreGeometry();
    this.bodyMat = createEntityMaterial(lighting);
    this.glowMat = createEntityMaterial(lighting, { emissiveScale: 0.4, crystal: true });
    this.core.add(new THREE.Mesh(g.body, this.bodyMat), new THREE.Mesh(g.glow, this.glowMat));
    this.core.visible = false;
    this.halo = new HaloSystem(lighting, []);
    this.halo.mesh.name = 'heartHalo';
    const size = new THREE.Vector2();
    this.halo.mesh.onBeforeRender = (r, _s, cam) => this.halo.setPixelScale(r.getDrawingBufferSize(size).y, (cam as THREE.PerspectiveCamera).fov ?? 72);
    this.group.add(this.core, this.halo.mesh);
  }

  /** The Heart's chamber of the loaded stratum (null: none), and whether the Heart is already lit. */
  setHeart(heart: { centre: readonly number[] } | null, lit: boolean): void {
    this.t = -1;
    this.centre = heart ? new THREE.Vector3(heart.centre[0], heart.centre[1] + CORE_LIFT, heart.centre[2]) : null;
    this.core.visible = !!this.centre;
    if (this.centre) this.core.position.copy(this.centre);
    this.setLit(lit ? 1 : 0);
  }

  get playing(): boolean {
    return this.t >= 0;
  }

  /** Relight the Heart (quest:heartLit). */
  start(): void {
    if (!this.centre) {
      this.setLit(1);
      return;
    }
    this.t = 0;
  }

  private setLit(k: number): void {
    this.lit = k;
    relightHeart(k);
    this.glowMat.uniforms.uEmissiveScale.value = 0.4 + 2.6 * k;
    if (this.centre) {
      const c = this.centre;
      this.halo.setSources([{ x: c.x - 0.5, y: c.y - 0.5, z: c.z - 0.5, id: B.LIGHT_EMBER, color: [0.5 + 1.6 * k, 0.12 + 0.7 * k, 0.16 + 0.3 * k], size: 3 + 5 * k, lift: 0.5 }]);
    } else this.halo.setSources([]);
  }

  /**
   * Each frame. While the finale plays it drives the terrain's sonar shell (the great ring), the
   * post flash and the motes' boost.
   */
  update(dt: number, time: number, terrain: TerrainRig, post: { flash: number; flashColor: THREE.Color } | null): void {
    if (this.core.visible) {
      this.core.rotation.y = time * (0.05 + 0.1 * this.lit);
      this.core.position.y = (this.centre?.y ?? 0) + Math.sin(time * 0.4) * 0.25;
    }
    if (this.t < 0) {
      this.moteBoost = 1;
      return;
    }
    this.t += dt;
    const t = this.t;
    const s = (a: number, b: number, x: number) => {
      const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    this.setLit(s(0.3, 9, t));
    // The flash at the edge: rose-gold, the first two seconds.
    if (post && t < 2.2) {
      post.flashColor.setRGB(1, 0.62, 0.42);
      post.flash = Math.max(post.flash, 0.75 * (1 - s(0.2, 2.2, t)));
    }
    // The great ring over the stratum's rock.
    const u = terrain.uniforms;
    const c = this.centre!;
    const r = Math.max(0, (t - 0.9) * 16);
    u.uSonar.value.set(c.x, c.y - CORE_LIFT + 1, c.z, r);
    u.uSonarFx.value.set(3.2, 1 - s(10.5, 13, t), 170, 1 - s(9, 13.5, t));
    this.moteBoost = 1 + 1.4 * s(1, 3, t) * (1 - s(9, 20, t));
    if (t > 20) {
      this.t = -1;
      u.uSonarFx.value.y = 0;
      u.uSonarFx.value.w = 0;
      this.setLit(1);
    }
  }

  dispose(): void {
    for (const c of this.core.children) (c as THREE.Mesh).geometry.dispose();
    this.bodyMat.dispose();
    this.glowMat.dispose();
    this.halo.dispose();
  }
}
