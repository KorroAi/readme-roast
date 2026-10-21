// The first-person viewmodel (SPEC §3.7): the lantern lower left and the tool lower right, drawn in their own pass with
// their own camera (vertical FOV 58°, depth cleared) after the world and before the HUD (Renderer overlay). Perfectly
// still at rest and in glides; a strike shows the contact pose on frame 0 (no wind-up), solved so the head swings
// toward the tapped point with a ≤ 0.1 m lunge, then recovers over 220 ms. Mirrored for the left hand.
//
// Lighting: every part is shaded by 1E's shade() at a *virtual* world position (W1-LEAD §5: "the viewmodel pass gives
// shade() world positions too"): the part's camera-space position shifted so the drawn lantern's flame coincides with
// the key light (−0.30, −0.45, −0.35 m from the eye, SPEC §8.3). The brass therefore catches its own flame and the
// room's fill exactly as a lantern held there would.
//
// CONTRACT (W1, 1C): the API below is stable; the body grows.

import * as THREE from 'three';
import { LIGHTING_GLSL, lightingUniforms } from '../light/chunk';
import { BRASS, GOLD, OLD_WOOD, PropBuilder, WOOD, type Finish } from '../lantern/props';
import { TINT } from '../lantern/propSurface';
import { LAYER } from '../lantern/layers';
import { TILE_M, type StoneTextures } from '../lantern/painter';
import type { Rect, Vec3 } from './types';
import { DEFAULT_VIEWMODEL, LUNGE_MAX_M, RAISE_HOLD_S, RAISE_UP_S, STRIKE_RECOVER_S, type ViewmodelState } from './viewmodelState';

export const VIEWMODEL_VFOV = 58;

/** The key light (the flame the world sees), camera space (SPEC §8.3). */
export const KEY_LIGHT_CAM = new THREE.Vector3(-0.3, -0.45, -0.35);
/** Where the lantern and the tool are drawn (camera space of the 58° viewmodel camera). */
const LANTERN_AT = new THREE.Vector3(-0.2, -0.47, -1.0);
const TOOL_AT = new THREE.Vector3(0.19, -0.56, -0.95);
/** The flame inside the lantern model (model space). */
const FLAME_LOCAL = new THREE.Vector3(0, 0.068, 0);
const LANTERN_SCALE = 1.0;

const VM_VERT = /* glsl */ `
attribute vec4 aProp;
uniform mat4 uCamWorld;
uniform vec3 uVmDelta;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
flat varying vec4 vProp;
void main() {
  vec4 vp = modelMatrix * vec4(position, 1.0);   // viewmodel-camera space (the group sits at the camera)
  vWorld = (uCamWorld * vec4(vp.xyz + uVmDelta, 1.0)).xyz;
  vNormal = normalize(mat3(uCamWorld) * (mat3(modelMatrix) * normal));
  vUv = uv;
  vProp = aProp;
  gl_Position = projectionMatrix * vp;
}
`;

const VM_FRAG = /* glsl */ `
${LIGHTING_GLSL}
uniform highp sampler2DArray tStoneA;
uniform highp sampler2DArray tStoneB;
uniform vec3 uHeat;
uniform float uFlame;
uniform vec3 uEye;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
flat varying vec4 vProp;
void main() {
  vec3 ng = normalize(vNormal);
  if (!gl_FrontFacing) ng = -ng;
  float layer = vProp.x;
  int tint = int(vProp.y + 0.5);
  int glow = int(vProp.w + 0.5);
  vec2 uv = vUv / ${TILE_M.toFixed(3)} + vProp.z * 5.1;
  vec4 ta = texture(tStoneA, vec3(uv, layer));
  vec4 tb = texture(tStoneB, vec3(uv, layer));
  vec3 alb = ta.rgb;
  float rough = tb.z;
  float metal = 0.0;
  vec3 emis = vec3(0.0);
  if (tint == ${TINT.brass}) { alb = mix(vec3(0.55, 0.38, 0.14), vec3(0.86, 0.64, 0.3), ta.g); metal = 1.0; rough = mix(0.32, 0.55, tb.w < 0.6 ? 1.0 : 0.0); }
  else if (tint == ${TINT.gold}) { alb = vec3(0.95, 0.68, 0.26); metal = 1.0; rough = 0.3; }
  // Forged iron: dark, half oxidised (a dielectric scale over metal), so the lantern reads on every face of the head
  // instead of a mirror of the dark; the worn edges are brighter bare metal.
  else if (tint == ${TINT.darkIron}) { float wear = smoothstep(0.55, 0.85, ta.g); alb = mix(alb * vec3(0.5, 0.47, 0.45), vec3(0.56, 0.55, 0.53), wear); metal = mix(0.35, 0.9, wear); rough = mix(0.58, 0.34, wear); }
  else if (tint == ${TINT.copper}) { alb = mix(vec3(0.6, 0.25, 0.12), vec3(0.95, 0.55, 0.32), ta.g); metal = 1.0; rough = 0.3; }
  else if (tint == ${TINT.oldWood}) { alb *= 0.85; rough = 0.75; }
  // Combo heat glows in the head (bone → amber → cyan → violet), never brighter than a highlight.
  if (glow == 4) emis = uHeat;
  vec3 n = normalize(ng + (tb.xy * 2.0 - 1.0).x * 0.0);
  Surface s = surfaceInit(alb, n);
  s.geoNormal = ng;
  s.roughness = rough;
  s.metal = metal;
  s.emission = emis;
  s.specCap = 1.6;
  vec3 V = normalize(uEye - vWorld);
  vec3 col = shade(s, vWorld, V);
  if (glow == 1) {
    // The flame and the lit glass (emissive, the lantern's heart).
    float core = pow(abs(dot(ng, V)), 1.4);
    col = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.9, 0.7), core) * 5.0 * uFlame;
  } else if (glow == 2) {
    // Smoky glass: lit from inside, cool sheen at grazing angles.
    float ndv = abs(dot(ng, V));
    col = vec3(1.0, 0.62, 0.3) * 0.32 * uFlame * (0.4 + 0.6 * ndv) + vec3(0.05, 0.07, 0.08) * pow(1.0 - ndv, 3.0);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/** The lantern (W1: Tin Lamp, tier 1; Brass Lantern tier 2): a hexagonal brass frame with bevels, glass, a burner,
 *  a bail, the flame. Model space: foot at the origin, ~0.2 m tall. */
function lanternModel(tier: number): { solid: THREE.BufferGeometry; glass: THREE.BufferGeometry; flame: THREE.BufferGeometry } {
  const pb = new PropBuilder();
  const glass = new PropBuilder();
  const flame = new PropBuilder();
  const frame: Finish = tier >= 2 ? BRASS : { layer: LAYER.iron, tint: TINT.darkIron };
  const trim: Finish = tier >= 2 ? GOLD : BRASS;
  const sides = 6;
  const rot = Math.PI / sides;
  const cyl = (rt: number, rb: number, h: number, y: number, f: Finish, b: PropBuilder = pb, open = false) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, sides, 1, open);
    g.rotateY(rot);
    b.geometry(g, new THREE.Matrix4().makeTranslation(0, y, 0), f, 0.4, 0.3);
    g.dispose();
  };
  cyl(0.046, 0.054, 0.018, 0.009, frame);
  cyl(0.05, 0.05, 0.006, 0.02, trim);
  cyl(0.041, 0.046, 0.012, 0.027, frame);
  // Glass chimney (lit from inside).
  {
    const g = new THREE.CylinderGeometry(0.036, 0.036, 0.086, sides, 1, true);
    g.rotateY(rot);
    glass.geometry(g, new THREE.Matrix4().makeTranslation(0, 0.076, 0), { layer: 0, glow: 2 }, 0.5);
    g.dispose();
  }
  // Corner posts with a bevel, every other corner.
  for (let i = 0; i < sides; i += 2) {
    const a = (i / sides) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    pb.box(new THREE.Vector3(Math.cos(a) * 0.039, 0.076, Math.sin(a) * 0.039), new THREE.Vector3(0.0045, 0.047, 0.0045), q, frame, 0.3, 0.0015);
  }
  cyl(0.044, 0.044, 0.006, 0.122, trim);
  cyl(0.015, 0.05, 0.03, 0.14, frame);
  cyl(0.011, 0.013, 0.016, 0.163, frame);
  cyl(0.017, 0.017, 0.004, 0.172, trim);
  {
    const t = new THREE.TorusGeometry(0.021, 0.0024, 5, 20);
    pb.geometry(t, new THREE.Matrix4().makeTranslation(0, 0.193, 0), frame, 0.2, 0.3);
    t.dispose();
  }
  cyl(0.012, 0.016, 0.012, 0.039, trim);
  // The flame: a teardrop.
  const fg = new THREE.SphereGeometry(0.0085, 12, 10);
  const fp = fg.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) / 0.0085;
    const k = y > 0 ? 1 - 0.75 * y * y : 1;
    fp.setXYZ(i, fp.getX(i) * k, fp.getY(i) * (y > 0 ? 2.3 : 1.1), fp.getZ(i) * k);
  }
  fg.computeVertexNormals();
  flame.geometry(fg, new THREE.Matrix4().makeTranslation(FLAME_LOCAL.x, FLAME_LOCAL.y - 0.004, FLAME_LOCAL.z), { layer: 0, glow: 1 }, 0.5);
  fg.dispose();
  return { solid: pb.build(), glass: glass.build(), flame: flame.build() };
}

/** The pick (Rusty form 0, Copper 1, Iron 2): a turned handle with a grip wrap, a ferrule, a curved head; temper bands.
 *  Model space: the grip at the origin, the handle along +y, the head's point toward +z. */
function pickModel(form: number, temper: number): THREE.BufferGeometry {
  const pb = new PropBuilder();
  const head: Finish = form === 1 ? { layer: LAYER.brass, tint: TINT.copper } : form >= 2 ? { layer: LAYER.iron, tint: TINT.darkIron } : { layer: LAYER.iron, tint: TINT.darkIron };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  pb.cylinder(V(0, -0.08, 0), V(0, 0.52, 0), 0.016, 0.019, form === 0 ? OLD_WOOD : WOOD, 8, 0.3);
  // Grip wrap (leather-dark rope bands) near the bottom.
  for (let i = 0; i < 4; i++) pb.cylinder(V(0, -0.04 + i * 0.03, 0), V(0, -0.02 + i * 0.03, 0), 0.0185, 0.0185, { layer: LAYER.timber, tint: TINT.rope }, 8, 0.5 + i * 0.1);
  // Temper bands (a brass band per step, max 4 shown).
  for (let i = 0; i < Math.min(4, temper); i++) pb.cylinder(V(0, 0.3 + i * 0.035, 0), V(0, 0.315 + i * 0.035, 0), 0.0205, 0.0205, BRASS, 8, 0.2);
  // Ferrule and the head: a socket and two tapered, slightly curved arms (pick and adze), bevelled.
  pb.cylinder(V(0, 0.47, 0), V(0, 0.55, 0), 0.026, 0.024, head, 8, 0.4);
  const arm = (dir: number, len: number, w: number) => {
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const z0 = dir * len * t0, z1 = dir * len * t1;
      const y0 = 0.53 - 0.06 * t0 * t0, y1 = 0.53 - 0.06 * t1 * t1;
      const c = V(0, (y0 + y1) / 2, (z0 + z1) / 2);
      const hw = w * (1 - 0.7 * ((t0 + t1) / 2));
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.atan2(y1 - y0, z1 - z0) * dir);
      pb.box(c, V(hw * 0.75, hw, Math.abs(z1 - z0) / 2 + 0.004), q, head, 0.3 + i * 0.1, 0.004);
    }
  };
  arm(1, 0.2, 0.024);
  arm(-1, 0.12, 0.026);
  // The edge glint for temper ≥ 1: a bright brass edge on the point.
  if (temper > 0) pb.box(V(0, 0.48, 0.19), V(0.006, 0.006, 0.02), new THREE.Quaternion(), { layer: LAYER.brass, tint: TINT.gold, glow: 4 }, 0.5, 0.002);
  pb.box(V(0, 0.52, 0.05), V(0.012, 0.012, 0.02), new THREE.Quaternion(), { layer: LAYER.iron, tint: TINT.darkIron, glow: 4 }, 0.5, 0.002);
  return pb.build();
}

const HEAT = [new THREE.Color(0, 0, 0), new THREE.Color(0.5, 0.22, 0.04), new THREE.Color(0.08, 0.4, 0.5), new THREE.Color(0.32, 0.12, 0.55)];

export class Viewmodel {
  /** The viewmodel's own scene and camera (the Renderer draws them as the overlay after the world). */
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VIEWMODEL_VFOV, 390 / 844, 0.02, 4);
  readonly state: ViewmodelState = { ...DEFAULT_VIEWMODEL };
  /** Seconds since the last strike (≥ 0.22 = at rest). */
  protected sinceStrike = 1e9;
  protected sinceRaise = 1e9;
  private readonly lantern = new THREE.Group();
  private readonly tool = new THREE.Group();
  private readonly toolPivot = new THREE.Group();
  private lanternMeshes: THREE.Mesh[] = [];
  private toolMesh: THREE.Mesh | null = null;
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly heat = new THREE.Color();
  private built = { form: -1, temper: -1, tier: -1, mirror: false };
  /** The strike's aim (radians about x and y of the tool pivot) and lunge direction, eased back over 220 ms. */
  private readonly aim = { pitch: 0, yaw: 0 };
  private readonly lunge = new THREE.Vector3();
  private readonly raiseTo = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly camWorld = new THREE.Matrix4();
  private readonly eye = new THREE.Vector3();
  private tex: StoneTextures | null = null;
  /** Lantern flame strength (the Pulse gauge [W2]; 1 in W1). */
  flame = 1;
  /** The mine cart's front rim (the Ride phase, W1-LEAD §3): drawn low across the frame while you ride. */
  private readonly cart = new THREE.Group();
  private cartBuilt = false;

  constructor() {
    this.scene.name = 'viewmodel';
    this.scene.add(this.lantern, this.tool);
    this.tool.add(this.toolPivot);
    this.camera.position.set(0, 0, 0);
    this.camera.updateMatrixWorld(true);
  }

  /** Bind the painted layers (the materials need them) and build the models. */
  init(tex: StoneTextures): void {
    this.tex = tex;
    this.rebuild();
  }

  private material(delta: THREE.Vector3): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...lightingUniforms(),
        tStoneA: { value: this.tex?.albedo ?? null },
        tStoneB: { value: this.tex?.normal ?? null },
        uCamWorld: { value: this.camWorld },
        uVmDelta: { value: delta.clone() },
        uHeat: { value: this.heat },
        uFlame: { value: 1 },
        uEye: { value: this.eye },
      },
      vertexShader: VM_VERT,
      fragmentShader: VM_FRAG,
    });
    m.name = 'viewmodel';
    this.mats.push(m);
    return m;
  }

  private rebuild(): void {
    if (!this.tex) return;
    const st = this.state;
    for (const m of [...this.lanternMeshes, ...(this.toolMesh ? [this.toolMesh] : [])]) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
    const sx = st.mirror ? -1 : 1;
    // The lantern: its flame maps onto the key light.
    const lanternAt = LANTERN_AT.clone().setX(LANTERN_AT.x * sx);
    const key = KEY_LIGHT_CAM.clone().setX(KEY_LIGHT_CAM.x * sx);
    const flameCam = FLAME_LOCAL.clone().multiplyScalar(LANTERN_SCALE).add(lanternAt);
    const lDelta = key.clone().sub(flameCam);
    const lm = lanternModel(st.lanternLevel);
    const lmat = this.material(lDelta);
    const gmat = this.material(lDelta);
    gmat.transparent = true;
    gmat.blending = THREE.AdditiveBlending;
    gmat.depthWrite = false;
    gmat.side = THREE.DoubleSide;
    this.lanternMeshes = [lm.solid, lm.flame, lm.glass].map((g, i) => {
      const mesh = new THREE.Mesh(g, i === 2 ? gmat : lmat);
      mesh.frustumCulled = false;
      mesh.renderOrder = i;
      return mesh;
    });
    this.lantern.add(...this.lanternMeshes);
    this.lantern.position.copy(lanternAt);
    this.lantern.rotation.set(0.05, -0.55 * sx, 0.04 * sx);
    this.lantern.scale.setScalar(LANTERN_SCALE);
    // The tool: shaded as if held at the right hand (0.3, −0.45, −0.4).
    const toolAt = TOOL_AT.clone().setX(TOOL_AT.x * sx);
    const tDelta = new THREE.Vector3(0.3 * sx, -0.45, -0.4).sub(toolAt);
    const tm = new THREE.Mesh(pickModel(st.form, st.temper), this.material(tDelta));
    tm.frustumCulled = false;
    this.toolMesh = tm;
    this.toolPivot.add(tm);
    this.tool.position.copy(toolAt);
    // At rest: the grip low at the right edge, the handle leaning in, the head just inside the lower-right corner, the
    // point away from the face (calm, still; nothing in the central 50 % column).
    this.tool.rotation.set(-0.25, 0.5 * sx, 0.85 * sx);
    this.tool.scale.setScalar(0.6);
    this.built = { form: st.form, temper: st.temper, tier: st.lanternLevel, mirror: st.mirror };
  }

  /** Show the cart's front rim (the Ride's cart run) or hide it. */
  setCart(on: boolean): void {
    if (on && !this.cartBuilt && this.tex) {
      const pb = new PropBuilder();
      const q = new THREE.Quaternion();
      // The cart's front edge and its two side rails, seen from inside, at the bottom of the frame.
      pb.box(new THREE.Vector3(0, -0.6, -1.05), new THREE.Vector3(0.62, 0.05, 0.03), q, OLD_WOOD, 0.4, 0.015);
      pb.box(new THREE.Vector3(0, -0.545, -1.05), new THREE.Vector3(0.64, 0.012, 0.04), q, { layer: LAYER.iron, tint: TINT.darkIron }, 0.3, 0.004);
      for (const sx of [-1, 1]) pb.box(new THREE.Vector3(sx * 0.62, -0.62, -0.8), new THREE.Vector3(0.03, 0.05, 0.28), q, OLD_WOOD, 0.5, 0.012);
      const m = new THREE.Mesh(pb.build(), this.material(new THREE.Vector3(0, 0.1, 0.5)));
      m.frustumCulled = false;
      this.cart.add(m);
      this.scene.add(this.cart);
      this.cartBuilt = true;
    }
    this.cart.visible = on;
  }

  /** Set any of the state fields (form, temper, heat, mirror, lanternLevel). */
  set(patch: Partial<ViewmodelState>): void {
    Object.assign(this.state, patch);
    const st = this.state;
    const b = this.built;
    if (st.form !== b.form || st.temper !== b.temper || st.lanternLevel !== b.tier || st.mirror !== b.mirror) this.rebuild();
  }

  /**
   * A strike lands now: the contact pose aims the tool head toward `contact` (world point; null = straight ahead).
   * `worldCamera` is the world camera of this frame (to bring the point into the viewmodel's space).
   */
  strike(contact: Vec3 | null, worldCamera: THREE.Camera, crit = false): void {
    void crit;
    this.sinceStrike = 0;
    // Aim: the direction to the point in camera space, as a swing of the pivot (≤ 0.5 rad), and a lunge ≤ 0.1 m.
    const d = this.tmp.set(0, 0, -1);
    if (contact) {
      d.set(contact.x, contact.y, contact.z).applyMatrix4(worldCamera.matrixWorldInverse).normalize();
    }
    this.aim.pitch = 0.9 + Math.max(-0.4, Math.min(0.4, d.y * 0.8));
    this.aim.yaw = Math.max(-0.4, Math.min(0.4, -d.x * 0.6));
    this.lunge.set(d.x * 0.03, d.y * 0.03, -1).normalize().multiplyScalar(LUNGE_MAX_M);
  }

  /** Lantern Raise toward a world point (SPEC §2.2): lifts in 0.2 s, holds 1.4 s, eases back. */
  raise(point: Vec3, worldCamera: THREE.Camera): void {
    this.sinceRaise = 0;
    this.raiseTo.set(point.x, point.y, point.z).applyMatrix4(worldCamera.matrixWorldInverse).normalize();
  }

  /** Advance the strike recovery and the raise (FX clock seconds). */
  update(dt: number): void {
    this.sinceStrike += dt;
    this.sinceRaise += dt;
  }

  /** Place the viewmodel for this frame's world camera (its own 58° camera sits at the eye). */
  frame(worldCamera: THREE.PerspectiveCamera, aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camWorld.copy(worldCamera.matrixWorld);
    worldCamera.getWorldPosition(this.eye);
    const st = this.state;
    const sx = st.mirror ? -1 : 1;
    // The strike: frame 0 at the contact pose, then an ease-out back to rest over 220 ms.
    const k = this.sinceStrike < STRIKE_RECOVER_S ? 1 - this.sinceStrike / STRIKE_RECOVER_S : 0;
    const e = k * k * (3 - 2 * k);
    this.toolPivot.rotation.set(-this.aim.pitch * e, this.aim.yaw * e, 0);
    this.toolPivot.position.copy(this.lunge).multiplyScalar(e);
    // The Lantern Raise: up 0.2 s, hold 1.4 s, ease back 0.4 s.
    const r = this.sinceRaise;
    const lift = r < RAISE_UP_S ? r / RAISE_UP_S : r < RAISE_UP_S + RAISE_HOLD_S ? 1 : Math.max(0, 1 - (r - RAISE_UP_S - RAISE_HOLD_S) / 0.4);
    const le = lift * lift * (3 - 2 * lift);
    const base = LANTERN_AT.clone().setX(LANTERN_AT.x * sx);
    this.lantern.position.set(base.x + this.raiseTo.x * 0.05 * le, base.y + 0.09 * le, base.z);
    // Heat: bone → amber at 10 → cyan at 25 → violet at 50 (0..1 over 0..50).
    const h = st.heat * 50;
    const a = h < 10 ? h / 10 : h < 25 ? 1 + (h - 10) / 15 : 2 + Math.min(1, (h - 25) / 25);
    const i = Math.min(2, Math.floor(a));
    this.heat.copy(HEAT[i]).lerp(HEAT[i + 1], a - i).multiplyScalar(st.heat > 0.02 ? 1 : 0);
    for (const m of this.mats) m.uniforms.uFlame.value = this.flame;
    this.scene.updateMatrixWorld(true);
  }

  /** True while the tool is moving (an FX group for the budget). */
  get moving(): boolean {
    return this.sinceStrike < STRIKE_RECOVER_S || this.sinceRaise < RAISE_UP_S + RAISE_HOLD_S + 0.4;
  }

  /** The lantern's and the tool's screen bounds (CSS px) for a viewport (the Pulse's deliberate gesture, C8, E19). */
  bounds(width: number, height: number): { lantern: Rect; tool: Rect } {
    const lw = 0.26 * width;
    const lh = 0.17 * height;
    const left: Rect = { x: 0.02 * width, y: 0.74 * height, w: lw, h: lh };
    const right: Rect = { x: width - 0.02 * width - lw, y: 0.74 * height, w: lw, h: lh };
    return this.state.mirror ? { lantern: right, tool: left } : { lantern: left, tool: right };
  }

  /** Where the lantern flame is in world space this frame (the key light). */
  flameWorld(worldCamera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    const x = this.state.mirror ? -KEY_LIGHT_CAM.x : KEY_LIGHT_CAM.x;
    // The raise lifts the light with the drawn lantern.
    const r = this.sinceRaise;
    const lift = r < RAISE_UP_S ? r / RAISE_UP_S : r < RAISE_UP_S + RAISE_HOLD_S ? 1 : Math.max(0, 1 - (r - RAISE_UP_S - RAISE_HOLD_S) / 0.4);
    return out.set(x, KEY_LIGHT_CAM.y + 0.12 * lift, KEY_LIGHT_CAM.z).applyMatrix4(worldCamera.matrixWorld);
  }

  dispose(): void {
    for (const m of [...this.lanternMeshes, ...(this.toolMesh ? [this.toolMesh] : [])]) m.geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}
