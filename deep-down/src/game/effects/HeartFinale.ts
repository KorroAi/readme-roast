import * as THREE from 'three';
import type { LightingUniforms } from '../../render/lighting';
import { createEntityMaterial } from '../../render/entityMaterial';
import { VoxBuilder } from '../../render/voxModel';
import { relightHeart } from '../../render/biomeLook';
import type { TerrainRig } from '../../render/terrainRig';
import { HaloSystem } from './Halos';
import { LightBeams } from './LightBeams';
import { B, SOLID } from '../../config/blocks';
import type { VoxelWorld } from '../../world/VoxelWorld';

/**
 * Round 3 (VIS stretch): the Heart of the deep, and its relighting (the main quest's end), in two acts.
 *
 * The Heart hangs over its chamber (WORLD's layout.heart): a great faceted crystal, dark and slowly
 * turning, a dull rose ember deep inside, twelve dead shards circling it.
 *
 * Act I, the Heart wakes ('quest:heartLit': the explorer brings the twelve shards; the Dark Heart, its
 * guardian, wakes with it): the shards kindle one by one round the core (3 s), the core flushes rose,
 * a rose ring runs out over the chamber's rock, and from then on the Heart beats, slowly, while the
 * last fight goes on.
 *
 * Act II, the deep relit ('quest:ending': the Dark Heart has fallen; the end card follows at 6.5 s):
 * - a warm gold flash at the screen's edge (0-2 s), the core blazing from within;
 * - a great ring of gold light sweeping out over the rock of the whole stratum (30 m/s, to 230 m),
 *   every glowing thing it passes flaring and keeping some of it;
 * - the Heart's air turning from dark rose to a clear warm gold by ~5 s (relightHeart), its lights
 *   burning brighter, the motes rising thick;
 * - a column of light rising from the floor under the Heart to the roof (1-5 s), and staying, softer;
 * - and it stays lit (a save with the Heart lit starts lit).
 * Calm, like everything: no shake, one slow ring per act, the flash at the edge only.
 */

export type HeartState = 'dark' | 'awake' | 'lit';

const CORE_LIFT = 7;
const SHARDS = 12;
const ROSE = new THREE.Color(1.0, 0.34, 0.44);
const GOLD = new THREE.Color(1.0, 0.84, 0.55);
const SONAR_GOLD = new THREE.Color(1, 0.8, 0.5);

function coreGeometry(): { body: THREE.BufferGeometry; glow: THREE.BufferGeometry; shard: THREE.BufferGeometry } {
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
  // One orbiting shard (instanced twelve times: each kindles on its own).
  const shard = new VoxBuilder();
  shard.push().rotateZ(0.4);
  shard.crystal(0.09, 0.46, 0.13, 5, 0xffc0a0, 0xd8486a, 0.95);
  shard.push().rotateX(Math.PI);
  shard.crystal(0.08, 0.22, 0.1, 5, 0xffc0a0, 0xd8486a, 0.9);
  shard.pop();
  shard.pop();
  return { body: body.build(), glow: glow.build(), shard: shard.build() };
}

const ease = (a: number, b: number, x: number): number => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export class HeartFinale {
  readonly group = new THREE.Group();
  private readonly core = new THREE.Group();
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly bodyMat: THREE.ShaderMaterial;
  private readonly shardMat: THREE.ShaderMaterial;
  private readonly shards: THREE.InstancedMesh;
  private readonly orbit = new THREE.Group();
  private readonly halo: HaloSystem;
  private beam: LightBeams | null = null;
  private readonly lighting: LightingUniforms;
  private readonly noise: THREE.Texture | null;
  private centre: THREE.Vector3 | null = null;
  /** The act playing and its clock (null: none). */
  private act: 'wake' | 'relight' | null = null;
  private t = 0;
  state: HeartState = 'dark';
  /** 0 dark .. 1 lit (the air and grade: relightHeart). */
  lit = 0;
  /** Shards kindled (0..12). */
  kindled = 0;
  /** The motes' boost while an act plays (VisDirector multiplies its motes by it). */
  moteBoost = 1;
  private orbitSpeed = 0.12;
  /**
   * Seconds per beat (VisDirector keeps it in step with the Dark Heart's own heartbeat, MOBS' sim:
   * 2.2 s asleep, 1.25 / 0.95 / 0.68 s by phase), and the beat's phase (accumulated, so a change of
   * tempo never jumps the pulse).
   */
  tempo = 1.2;
  private beatPhase = 0;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpC = new THREE.Color();

  constructor(lighting: LightingUniforms, noise: THREE.Texture | null = null) {
    this.group.name = 'heart';
    this.lighting = lighting;
    this.noise = noise;
    const g = coreGeometry();
    this.bodyMat = createEntityMaterial(lighting);
    this.glowMat = createEntityMaterial(lighting, { emissiveScale: 0.4, crystal: true });
    this.shardMat = createEntityMaterial(lighting, { emissiveScale: 2.2, crystal: true });
    this.core.add(new THREE.Mesh(g.body, this.bodyMat), new THREE.Mesh(g.glow, this.glowMat));
    this.shards = new THREE.InstancedMesh(g.shard, this.shardMat, SHARDS);
    this.shards.name = 'heartShards';
    this.shards.frustumCulled = false;
    for (let k = 0; k < SHARDS; k++) {
      const a = (k / SHARDS) * Math.PI * 2;
      this.tmpM.makeRotationY(-a).setPosition(Math.cos(a) * 2.4, Math.sin(k * 1.7) * 0.6, Math.sin(a) * 2.4);
      this.shards.setMatrixAt(k, this.tmpM);
      this.shards.setColorAt(k, this.tmpC.setRGB(0.22, 0.1, 0.12));
    }
    this.orbit.add(this.shards);
    this.core.add(this.orbit);
    this.core.visible = false;
    this.halo = new HaloSystem(lighting, []);
    this.halo.mesh.name = 'heartHalo';
    const size = new THREE.Vector2();
    this.halo.mesh.onBeforeRender = (r, _s, cam) => this.halo.setPixelScale(r.getDrawingBufferSize(size).y, (cam as THREE.PerspectiveCamera).fov ?? 72);
    this.group.add(this.core, this.halo.mesh);
  }

  /**
   * The Heart's chamber of the loaded stratum (null: none) and how far the story is (dark, awake:
   * the shards are in and the Dark Heart fights, lit: the ending was seen). `world` finds the floor
   * and the roof for its column of light.
   */
  setHeart(heart: { centre: readonly number[] } | null, state: HeartState | boolean, world: VoxelWorld | null = null): void {
    this.act = null;
    this.state = state === true ? 'lit' : state === false ? 'dark' : state;
    this.centre = heart ? new THREE.Vector3(heart.centre[0], heart.centre[1] + CORE_LIFT, heart.centre[2]) : null;
    this.core.visible = !!this.centre;
    if (this.centre) this.core.position.copy(this.centre);
    this.halo.setSources([]);
    if (this.beam) {
      this.group.remove(this.beam.mesh);
      this.beam.dispose();
      this.beam = null;
    }
    if (heart && this.noise) {
      // The column: from the floor under the Heart to the roof over it.
      const x = Math.floor(heart.centre[0]);
      const z = Math.floor(heart.centre[2]);
      let floor = heart.centre[1];
      let roof = heart.centre[1] + 30;
      if (world) {
        for (let y = Math.floor(heart.centre[1]) + 1; y > Math.floor(heart.centre[1]) - 12; y--) if (SOLID[world.get(x, y - 1, z)]) {
          floor = y;
          break;
        }
        for (let y = Math.floor(heart.centre[1]) + CORE_LIFT; y < Math.floor(heart.centre[1]) + 70; y++) if (SOLID[world.get(x, y, z)]) {
          roof = y;
          break;
        }
      }
      this.beam = new LightBeams(this.lighting, this.noise, [{ from: [heart.centre[0], floor, heart.centre[2]], to: [heart.centre[0], roof, heart.centre[2]], r0: 1.4, r1: 3.0, color: [0.07, 0.05, 0.024] }]);
      this.beam.mesh.name = 'heartColumn';
      this.group.add(this.beam.mesh);
    }
    this.kindled = this.state === 'dark' ? 0 : SHARDS;
    this.setLit(this.state === 'lit' ? 1 : 0);
    this.setShards(this.kindled, this.state === 'lit' ? 1.8 : this.state === 'awake' ? 1.2 : 0, 0);
    if (this.beam) this.beam.intensity = this.state === 'lit' ? 0.55 : 0;
    this.orbitSpeed = this.state === 'lit' ? 0.16 : this.state === 'awake' ? 0.3 : 0.12;
  }

  get playing(): boolean {
    return this.act !== null;
  }

  /** Act I: the twelve shards are in, the Heart wakes ('quest:heartLit'). */
  awaken(): void {
    if (this.state !== 'dark') return;
    this.state = 'awake';
    if (!this.centre) {
      this.kindled = SHARDS;
      return;
    }
    this.act = 'wake';
    this.t = 0;
  }

  /** Act II: the deep relit ('quest:ending'); from the dark too (a save that skipped act I). */
  start(): void {
    this.state = 'lit';
    if (!this.centre) {
      this.setLit(1);
      return;
    }
    this.act = 'relight';
    this.t = 0;
  }

  private setLit(k: number): void {
    this.lit = k;
    relightHeart(k);
    this.glowMat.uniforms.uEmissiveScale.value = 0.4 + 2.6 * k;
  }

  /** Kindle `n` shards (`glow`: their brightness; `flare`: the one kindling now flares). */
  private setShards(n: number, glow: number, flare: number): void {
    for (let k = 0; k < SHARDS; k++) {
      const on = k < Math.floor(n);
      const f = on ? glow + (k === Math.floor(n) - 1 ? flare : 0) : 0.22;
      this.shards.setColorAt(k, this.tmpC.setRGB(f, on ? f * 0.62 : 0.1, on ? f * 0.58 : 0.12));
    }
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
  }

  private setHalo(size: number, c: THREE.Color, k: number): void {
    const p = this.centre;
    if (!p) {
      if (this.halo.count) this.halo.setSources([]);
      return;
    }
    // Built once per chamber, then retuned in place (the beat runs every frame).
    if (this.halo.tune(0, [c.r * k, c.g * k, c.b * k], size)) return;
    this.halo.setSources([{ x: p.x - 0.5, y: p.y - 0.5, z: p.z - 0.5, id: B.LIGHT_EMBER, color: [c.r * k, c.g * k, c.b * k], size, lift: 0.5 }]);
  }

  /**
   * Each frame. While an act plays it drives the terrain's sonar shell (its ring), the post flash and
   * the motes' boost; between acts the Heart turns (and beats while it is awake).
   */
  update(dt: number, time: number, terrain: TerrainRig, post: { flash: number; flashColor: THREE.Color } | null): void {
    if (this.core.visible) {
      this.core.rotation.y = time * (0.05 + 0.1 * this.lit);
      this.core.position.y = (this.centre?.y ?? 0) + Math.sin(time * 0.4) * 0.25;
      this.orbit.rotation.y = -time * this.orbitSpeed;
    }
    // The beat (calm: the halo swells and settles), in step with the Dark Heart's own heartbeat.
    this.beatPhase = (this.beatPhase + dt / Math.max(0.3, this.tempo)) % 1;
    const beat = Math.pow(Math.max(0, Math.sin(this.beatPhase * Math.PI * 2)), 8);
    if (!this.act) {
      this.moteBoost = 1;
      if (this.state === 'awake') {
        this.glowMat.uniforms.uEmissiveScale.value = 1.2 + 0.6 * beat;
        this.setHalo(4.2 + 1.1 * beat, ROSE, 1.2 + 0.5 * beat);
      } else if (this.state === 'lit') this.setHalo(7, GOLD, 1.5 + 0.1 * Math.sin(time * 0.6));
      // Dark, the Heart still beats, faintly and slowly, deep inside.
      else this.setHalo(3 + 0.3 * beat, ROSE, 0.5 + 0.25 * beat);
      return;
    }
    this.t += dt;
    const t = this.t;
    const u = terrain.uniforms;
    const c = this.centre!;
    if (this.act === 'wake') {
      // The shards kindle one by one, the core flushes rose, a rose ring runs over the chamber.
      this.kindled = Math.min(SHARDS, t / 0.24);
      const sinceLast = (t / 0.24) % 1;
      this.setShards(this.kindled, 1.2, t < SHARDS * 0.24 ? 1.6 * (1 - sinceLast) : 0);
      this.glowMat.uniforms.uEmissiveScale.value = 0.4 + 1.0 * ease(0.2, 3, t) + 0.5 * beat * ease(3, 4, t);
      this.setHalo(3 + 1.6 * ease(0.5, 3.5, t), ROSE, 0.5 + 0.9 * ease(0.5, 3.5, t));
      if (post && t < 1.4) {
        post.flashColor.copy(ROSE);
        post.flash = Math.max(post.flash, 0.3 * (1 - ease(0.1, 1.4, t)));
      }
      u.uSonarTint?.value.copy(ROSE);
      u.uSonar.value.set(c.x, c.y - CORE_LIFT + 1, c.z, Math.max(0, (t - 0.6) * 13));
      u.uSonarFx.value.set(2.6, 1 - ease(3.6, 5.4, t), 48, 1 - ease(4, 6.5, t));
      this.moteBoost = 1 + 0.6 * ease(0.5, 2, t) * (1 - ease(4, 7, t));
      this.orbitSpeed = 0.12 + 0.18 * ease(0, 3, t);
      if (t > 7) this.endAct(u);
      return;
    }
    // Act II: the relighting.
    this.setLit(ease(0.2, 5, t));
    this.glowMat.uniforms.uEmissiveScale.value = 0.4 + 2.6 * this.lit + 1.6 * ease(0.1, 0.8, t) * (1 - ease(2, 6, t));
    this.kindled = SHARDS;
    this.setShards(SHARDS, 1.2 + 1.8 * ease(0.2, 1, t) - 1.2 * ease(4, 10, t), 0);
    this.setHalo(4.5 + 4.5 * ease(0.2, 4, t), this.tmpC.copy(ROSE).lerp(GOLD, ease(0.2, 3, t)), 1.4 + 1.2 * ease(0.2, 2, t) * (1 - ease(6, 14, t)) + 0.4 * ease(3, 6, t));
    if (post && t < 2.2) {
      post.flashColor.copy(GOLD);
      post.flash = Math.max(post.flash, 0.75 * (1 - ease(0.2, 2.2, t)));
    }
    u.uSonarTint?.value.copy(GOLD);
    u.uSonar.value.set(c.x, c.y - CORE_LIFT + 1, c.z, Math.max(0, (t - 0.4) * 30));
    u.uSonarFx.value.set(3.4, 1 - ease(7.5, 9.5, t), 230, 1 - ease(8, 12.5, t));
    if (this.beam) this.beam.intensity = ease(1, 5, t) * (1 - 0.45 * ease(7, 13, t));
    this.moteBoost = 1 + 1.5 * ease(0.8, 2.5, t) * (1 - ease(9, 18, t));
    this.orbitSpeed = 0.3 + 0.5 * ease(0, 1.5, t) * (1 - ease(5, 14, t)) - 0.14 * ease(10, 16, t);
    if (t > 16) {
      this.setLit(1);
      if (this.beam) this.beam.intensity = 0.55;
      this.orbitSpeed = 0.16;
      this.endAct(u);
    }
  }

  private endAct(u: TerrainRig['uniforms']): void {
    this.act = null;
    u.uSonarFx.value.y = 0;
    u.uSonarFx.value.w = 0;
    u.uSonarTint?.value.copy(SONAR_GOLD);
    this.moteBoost = 1;
  }

  dispose(): void {
    for (const c of this.core.children) if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
    this.shards.geometry.dispose();
    this.bodyMat.dispose();
    this.glowMat.dispose();
    this.shardMat.dispose();
    this.halo.dispose();
    this.beam?.dispose();
  }
}
