import * as THREE from 'three';
import { createEntityMaterial } from '../../render/entityMaterial';
import type { LightingUniforms } from '../../render/lighting';
import { RigidBatch } from '../../render/fx/rigidBatch';
import { lanternModel } from '../../render/props/descentModels';

/**
 * The lanterns of the descent (SPEC §6.8, §7.7, §7.8; BUILD W2 MUST 5), one mesh for all of them:
 * - planted lanterns: one at each Rekindle depth, on stakes against the left shaft wall, tappable once per run for
 *   +2 % damage (`lantern:<n>`); a used one dims;
 * - the ghost lantern: pale blue, hanging beside the right wall at the depth the par run had reached at this run
 *   time; overtaking it bursts it (the scene throws the blue sparks);
 * - the Other Lantern: a warm point deep in the haze, always 600 m below the record (so it is never reached),
 *   pulsing at 0.25 Hz. It is drawn as a halo far behind the cut at the bottom of the view, so its colour is
 *   absorbed by the haze of the biomes between (the atmosphere does it).
 */
export interface LanternView {
  id: string;
  n: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** Where the Other Lantern hangs below the record (m). */
export const OTHER_LANTERN_BELOW = 600;

const PLANT_X = 28 - 0.45;
const PLANT_Z = 58.6;
const GHOST_X = 35 + 0.45;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Lanterns {
  readonly group = new THREE.Group();
  /** The Other Lantern's halo (a soft additive sprite, far behind the cut). */
  readonly other: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly planted = new Map<number, { depth: number; mesh: THREE.Mesh; used: boolean }>();
  private readonly ghostMesh: THREE.Mesh;
  private readonly batch: RigidBatch;
  private readonly views_: LanternView[] = [];
  private ghostDepth: number | null = null;
  private record = 0;
  private floor = 0;
  private dirty = false;
  /** The ghost was just overtaken (the scene bursts it once). */
  passed = false;

  constructor(lighting: LightingUniforms) {
    this.group.name = 'lanterns';
    this.material = createEntityMaterial(lighting, { emissiveScale: 3 });
    const g = lanternModel(true);
    this.ghostMesh = new THREE.Mesh(g.body, this.material);
    this.ghostMesh.visible = false;
    this.group.add(this.ghostMesh);
    this.batch = new RigidBatch(this.group, this.material);
    // The Other Lantern (SPEC §7.8): a warm point with a soft pool, its colour absorbed by the haze between
    // (uFogColor), pulsing at 0.25 Hz. Drawn over the rock (no depth test): it is seen through the haze, not in it.
    const haloMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uPulse: { value: 1 }, uColor: { value: new THREE.Color(0xffc070) }, uFogColor: lighting.uFogColor ?? { value: new THREE.Color(0x202028) }, uFade: { value: 1 } },
      vertexShader: /* glsl */ `out vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `precision highp float; in vec2 vUv; uniform float uPulse; uniform float uFade; uniform vec3 uColor; uniform vec3 uFogColor; layout(location = 0) out highp vec4 o;
        void main() {
          float d = length(vUv);
          float core = exp(-d * d * 60.0);
          float pool = exp(-d * d * 6.0) * 0.32;
          vec3 haze = mix(uColor, uColor * 0.55 + normalize(uFogColor + 1e-3) * 0.45, 0.35);
          float a = (core * 2.2 + pool) * uPulse * uFade;
          o = vec4(mix(haze, vec3(1.0, 0.93, 0.8), core) * a, 0.0);
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.other = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
    this.other.name = 'otherLantern';
    this.other.renderOrder = 9;
    this.other.frustumCulled = false;
    this.group.add(this.other);
  }

  /**
   * Put the Other Lantern at the bottom edge of the world view (`ndcY`, centred) on a plane far behind the cut,
   * `px` CSS px across: it keeps its place on screen and drifts only with the parallax of the sway.
   */
  placeOther(camera: THREE.PerspectiveCamera, ndcY: number, sizeNdc: number, fade: number): void {
    const far = -150;
    const a = _v.set(0, ndcY, 0.5).unproject(camera).sub(camera.position);
    const t = (far - camera.position.z) / a.z;
    this.other.position.copy(camera.position).addScaledVector(a, t);
    const b = _w.set(sizeNdc, ndcY, 0.5).unproject(camera).sub(camera.position);
    const tb = (far - camera.position.z) / b.z;
    const width = Math.abs(b.multiplyScalar(tb).x - a.multiplyScalar(t).x);
    this.other.scale.set(width, width, 1);
    (this.other.material as THREE.ShaderMaterial).uniforms.uFade.value = fade;
  }

  /** The planted lanterns of past runs (depth, Rekindle number). */
  setPlanted(list: ReadonlyArray<{ depth: number; n: number }>): void {
    const keep = new Set(list.map((p) => p.n));
    for (const [n, p] of this.planted)
      if (!keep.has(n)) {
        this.group.remove(p.mesh);
        this.planted.delete(n);
        this.dirty = true;
      }
    const model = lanternModel(false);
    for (const p of list) {
      if (this.planted.has(p.n)) continue;
      const mesh = new THREE.Mesh(model.body, this.material);
      // Alternate a little in z so a trail of lanterns reads as a trail.
      mesh.position.set(PLANT_X, -p.depth, PLANT_Z - (p.n % 3) * 0.35);
      mesh.scale.setScalar(0.9);
      this.group.add(mesh);
      this.planted.set(p.n, { depth: p.depth, mesh, used: false });
      this.dirty = true;
    }
  }

  /** A planted lantern was tapped (used for this run): it dims. */
  usePlanted(n: number): void {
    const p = this.planted.get(n);
    if (!p) return;
    p.used = true;
    p.mesh.scale.setScalar(0.75);
  }

  /** The ghost lantern's depth now (null: hidden). */
  setGhost(depth: number | null): void {
    this.ghostDepth = depth;
  }

  /** The ghost was overtaken: burst. */
  passGhost(): void {
    this.passed = true;
  }

  /** The lifetime record (the Other Lantern hangs 600 m below it). */
  setRecord(depth: number): void {
    this.record = Math.max(this.record, depth);
  }

  /** Where the Other Lantern is (world). */
  otherAt(out: THREE.Vector3): THREE.Vector3 {
    return out.set(31.5, -(this.record + OTHER_LANTERN_BELOW), -120);
  }

  /** Planted lanterns in reach (tappable once per run). */
  views(): readonly LanternView[] {
    return this.views_;
  }

  update(dt: number, time: number, floor: number): void {
    void dt;
    this.floor = floor;
    this.views_.length = 0;
    for (const [n, p] of this.planted) {
      const near = Math.abs(p.depth - floor) < 12;
      p.mesh.visible = near;
      if (near && !p.used) this.views_.push({ id: `lantern:${n}`, n, x: PLANT_X, y: -p.depth + 0.85, z: p.mesh.position.z, radius: 0.4 });
    }
    const g = this.ghostDepth;
    const show = g !== null && Math.abs(g - floor) < 9;
    this.ghostMesh.visible = show;
    if (show && g !== null) this.ghostMesh.position.set(GHOST_X, -g + 0.4 + Math.sin(time * 1.3) * 0.08, PLANT_Z);
    // The Other Lantern pulses at 0.25 Hz (placeOther puts it at the bottom edge of the view each frame).
    (this.other.material as THREE.ShaderMaterial).uniforms.uPulse.value = 0.75 + 0.25 * Math.sin(time * Math.PI * 0.5);
    if (this.dirty) {
      this.dirty = false;
      this.batch.rebuild();
    } else this.batch.update();
  }

  get floorNow(): number {
    return this.floor;
  }
}
