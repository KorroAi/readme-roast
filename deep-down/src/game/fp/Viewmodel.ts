import * as THREE from 'three';
import { clamp, damp, saturate } from '../../core/math';
import { SCENE_ENCODE } from '../../render/lighting';
import { LANTERN_LIGHT_CAM } from './constants';
import { buildGlove, buildLantern, buildPickaxe, buildSleeve, buildWeapon, type WeaponModelId } from './viewmodelParts';
import { flameSize, lanternFlicker } from './flame';

/**
 * The first-person viewmodel: the pickaxe lower right and the lantern lower left (mirrored for the
 * left hand), each in a gloved hand. Never the explorer.
 *
 * Drawn in the world scene but in their own lens: every vertex goes through the viewmodel's
 * projection (60 degrees tall) and into the nearest 1.5 % of the depth range, so the tools are
 * drawn over the world (they never clip into a wall the player stands against) while still
 * sorting against themselves, and they pass through the same tone mapping, bloom and colour grade
 * as the world. The meshes carry `userData.viewmodel` (and THREE layer VIEWMODEL_LAYER) so a pass
 * that renders the scene for depth or shadows can leave them out.
 *
 * Shading: the lantern's flame is the key light (camera space), the world's light at the eye is
 * the ambient (set each frame by Game), metals get a fresnel sheen of it.
 *
 * Motion: the pick swings at each strike, timed so the head lands on the frame the hit lands
 * (MiningController's impact at `contact` of the swing interval), aimed toward the struck point;
 * the lantern hangs on a stiff damped pendulum driven by walking and turning (still at rest), and
 * lifts for a lantern raise. No idle bobbing.
 */

export const VIEWMODEL_LAYER = 5;
/** The viewmodel lens (vertical field of view, deg). */
export const VIEWMODEL_VFOV = 60;
const TAN_HALF = Math.tan((VIEWMODEL_VFOV * Math.PI) / 360);
const UP = new THREE.Vector3(0, 1, 0);
/** Wrist points in each glove's space (the back of the hand). */
const WRIST_PICK = new THREE.Vector3(-0.045, 0, 0);
const WRIST_LANTERN = new THREE.Vector3(-0.04, 0, 0);
/** The lantern fist's turn: rod (glove y) along the bail top (x), knuckles (glove x) away (-z), the back of the hand up. */
const LANTERN_GRIP = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));

const VERT = /* glsl */ `
in vec3 color;
in vec3 aMat;
uniform mat4 uVmProj;
#ifdef FLAME
uniform float uTime;
uniform vec3 uFlameBase;
uniform vec3 uFlameScale;
out float vH;
#endif
out vec3 vPos;
out vec3 vN;
out vec3 vColor;
out vec3 vMat;
void main() {
  vec3 p = position;
#ifdef FLAME
  // The flame stands on the wick: scaled from its base (oil, flicker) and licking sideways a
  // little more toward the tip.
  vec3 q = p - uFlameBase;
  float h = clamp(q.y / 0.03, 0.0, 1.0);
  q *= uFlameScale;
  q.x += (sin(uTime * 10.3 + h * 3.1) * 0.0011 + sin(uTime * 23.7) * 0.0004) * h * uFlameScale.y;
  q.z += sin(uTime * 8.1 + 1.3 + h * 2.7) * 0.0008 * h * uFlameScale.y;
  vH = h;
  p = uFlameBase + q;
#endif
  // The mesh's world matrix is the camera's times the viewmodel transform: view * model brings it
  // back to camera space exactly.
  vec4 cs = viewMatrix * modelMatrix * vec4(p, 1.0);
  vPos = cs.xyz;
  vN = normalize(mat3(viewMatrix) * (mat3(modelMatrix) * normal));
  vColor = color;
  vMat = aMat;
  vec4 clip = uVmProj * cs;
  // Into the nearest 1.5 % of the depth range: in front of the world, sorted among themselves.
  clip.z = (-1.0 + (clip.z / clip.w + 1.0) * 0.0075) * clip.w;
  gl_Position = clip;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uFlamePos;
uniform vec3 uFlameColor;
uniform vec3 uAmbient;
uniform vec3 uUp;
uniform float uFlame;
uniform float uSceneEncode;
uniform float uFlash;
in vec3 vPos;
in vec3 vN;
in vec3 vColor;
in vec3 vMat;
#ifdef FLAME
in float vH;
#endif
layout(location = 0) out highp vec4 fragColor;

vec3 sceneOut(vec3 c) {
  return uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c;
}

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(-vPos);
#if defined(FLAME)
  // A real flame: a blue foot on the wick, a white-gold heart, an orange skin, soft at the edges.
  float ndv = abs(dot(n, V));
  float core = pow(ndv, 1.6);
  vec3 skin = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.62, 0.22), vH);
  vec3 heart = mix(vColor * 1.25, vec3(1.0, 0.97, 0.88), 0.45);
  vec3 c = mix(skin, heart, core);
  c = mix(vec3(0.25, 0.45, 1.0) * 0.8, c, smoothstep(0.0, 0.22, vH));
  float a = smoothstep(0.0, 0.5, ndv) * (1.0 - smoothstep(0.75, 1.0, vH) * (1.0 - core));
  fragColor = vec4(sceneOut(c * a * 3.2 * uFlame), 1.0);
#elif defined(GLOW)
  // The halo round the flame inside the glass: a soft radial falloff (the quad's uv in vColor.xy).
  vec2 d = vColor.xy * 2.0 - 1.0;
  float r = dot(d, d);
  float g = exp(-r * 5.5) * (1.0 - smoothstep(0.7, 1.0, r));
  fragColor = vec4(sceneOut(vec3(1.0, 0.58, 0.24) * g * 0.55 * uFlame), 1.0);
#elif defined(GLASS)
  // Clear glass lit from inside: warm where it faces the eye, a cool sheen and a hot glint of the
  // flame at grazing angles.
  float ndv = abs(dot(n, V));
  vec3 L = normalize(uFlamePos - vPos);
  float glint = pow(max(dot(reflect(-L, n), V), 0.0), 24.0);
  vec3 g = vec3(1.0, 0.62, 0.3) * (0.06 + 0.16 * ndv) * uFlame + vec3(0.04, 0.05, 0.065) * pow(1.0 - ndv, 3.0) + vec3(1.0, 0.8, 0.55) * glint * 0.35 * uFlame;
  fragColor = vec4(sceneOut(g), 1.0);
#else
  float emit = vMat.x;
  float metal = vMat.y;
  float rough = vMat.z;
  vec3 L = uFlamePos - vPos;
  float d = length(L);
  L /= max(d, 1e-4);
  float att = 1.0 / (1.0 + 14.0 * d * d);
  float ndl = dot(n, L);
  float wrap = clamp(ndl * 0.75 + 0.25, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float shin = mix(110.0, 6.0, rough);
  float spec = pow(max(dot(n, H), 0.0), shin) * (shin + 2.0) / 8.0 * step(0.0, ndl);
  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 5.0);
  vec3 f0 = mix(vec3(0.04), vColor, metal);
  float up = dot(n, uUp);
  float hemi = 0.6 + 0.4 * up;
  vec3 amb = uAmbient * hemi;
  vec3 key = uFlameColor * att;
  // The room: its light from above, and the lantern's own warm pool on the stone round the
  // explorer bouncing back (strongest from below), so the gloves, sleeves and tools never read as
  // black cut-outs, and brass and steel always read as metal.
  vec3 bounce = uFlameColor * 0.055 * (0.5 + 0.5 * max(-up, 0.0));
  vec3 room = uAmbient * (0.55 + 0.75 * max(up, 0.0)) + bounce;
  vec3 diffuse = vColor * (1.0 - metal) * (amb + key * wrap + bounce);
  vec3 sheen = mix(f0, vec3(1.0), fres * 0.6) * room * mix(0.2, 1.0, metal);
  // A broad soft highlight from that room light (the shape of the metal reads in the dark).
  vec3 Hs = normalize(uUp * 0.8 + V);
  float soft = pow(max(dot(n, Hs), 0.0), mix(28.0, 4.0, rough)) * metal;
  vec3 specular = mix(f0, vec3(1.0), fres) * (key * spec + room * soft * 0.8);
  vec3 c = diffuse + sheen + specular + vColor * emit * 0.8;
  // A struck monster's flash is on the monster; the weapon only glints on contact.
  c += vec3(1.0, 0.85, 0.6) * uFlash * metal * 0.35;
  fragColor = vec4(sceneOut(c), 1.0);
#endif
}
`;

export interface ViewmodelState {
  pickTier: number;
  lanternTier: number;
  mirror: boolean;
}

type MatKind = 'solid' | 'glass' | 'flame' | 'glow';

function makeMaterial(uniforms: Record<string, THREE.IUniform>, kind: MatKind = 'solid'): THREE.ShaderMaterial {
  const defines: Record<string, string> = kind === 'glass' ? { GLASS: '' } : kind === 'flame' ? { FLAME: '' } : kind === 'glow' ? { GLOW: '' } : {};
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    side: kind === 'solid' ? THREE.FrontSide : THREE.DoubleSide,
  });
  if (kind !== 'solid') {
    m.transparent = true;
    m.blending = THREE.AdditiveBlending;
    m.depthWrite = false;
  }
  m.name = kind === 'solid' ? 'viewmodel' : `viewmodel-${kind}`;
  return m;
}

/** 0 on an upright phone .. 1 on a wide screen. */
const wide = (aspect: number) => {
  const t = saturate((aspect - 0.7) / 0.7);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export interface PickLayout {
  /** The head's eye in viewmodel-lens NDC. */
  headX: number;
  headY: number;
  /** The handle's lean from grip to head: in toward the middle, and away (+) or toward the eye (-). */
  leanX: number;
  leanZ: number;
  /** Model scale. */
  scale: number;
  /** How far the point turns in toward the middle, and up. */
  pointIn: number;
  pointUp: number;
}

/** Tuning overrides for the pick's layout (dev captures only; empty in play). */
export const PICK_TUNE: Partial<PickLayout> = {};

/** Where the pick sits for a screen shape. */
export function pickLayout(aspect: number): PickLayout {
  const w = wide(aspect);
  return { headX: mix(0.88, 0.8, w), headY: mix(-0.52, -0.44, w), leanX: mix(0.1, 0.2, w), leanZ: -0.2, scale: mix(0.55, 0.74, w), pointIn: mix(0.16, 0.2, w), pointUp: 0.2, ...PICK_TUNE };
}

/** What the right hand can hold: the pickaxe, or a weapon (config/weapons ids). */
export type RightTool = 'pick' | WeaponModelId;

/**
 * Where each weapon sits at rest, relative to the pick's layout for the screen shape: the machete
 * like the pick but a little taller, the spear low and pointing on into the scene, the sling and a
 * Flash Charge held up in the lower right.
 */
export function toolLayout(tool: RightTool, aspect: number): PickLayout {
  const base = pickLayout(aspect);
  const w = wide(aspect);
  if (tool === 'machete') return { ...base, headX: base.headX - 0.02, headY: base.headY + 0.02, leanX: base.leanX + 0.06, scale: base.scale * 1.02, pointIn: 0.5, pointUp: -0.1 };
  if (tool === 'spear') return { ...base, headX: mix(0.72, 0.68, w), headY: mix(-0.44, -0.38, w), leanX: 0.42, leanZ: 1.5, scale: base.scale * 0.95, pointIn: 0.2, pointUp: 0.0 };
  if (tool === 'sling') return { ...base, headX: mix(0.78, 0.72, w), headY: mix(-0.68, -0.6, w), leanX: 0.12, leanZ: 0.1, scale: base.scale * 1.12, pointIn: 0, pointUp: 0 };
  if (tool === 'flash') return { ...base, headX: mix(0.8, 0.74, w), headY: mix(-0.76, -0.68, w), leanX: 0.15, leanZ: 0.15, scale: base.scale * 1.15, pointIn: 0, pointUp: 0 };
  return base;
}

/** Where the lantern hangs for a screen shape: its bail in NDC and its height (NDC). */
export function lanternLayout(aspect: number): { x: number; y: number; height: number } {
  const w = wide(aspect);
  return { x: mix(-0.79, -0.78, w), y: mix(-0.55, -0.49, w), height: mix(0.29, 0.35, w) };
}

const smooth = (x: number) => {
  const t = saturate(x);
  return t * t * (3 - 2 * t);
};

/** Pick swing angle (rad, + lifts back, - strikes forward) at phase u of a swing whose head lands at `contact`. */
export function swingAngle(u: number, contact: number): number {
  if (u <= 0 || u >= 1) return 0;
  const lift = contact * 0.45;
  if (u < lift) return 0.42 * smooth(u / lift);
  if (u < contact) {
    // Accelerating into the strike (ease in), landing exactly at `contact`.
    const k = (u - lift) / (contact - lift);
    return 0.42 - 1.42 * k * k;
  }
  // A beat held on the rock (the hit lands), a small rebound, then home.
  const r = (u - contact) / (1 - contact);
  if (r < 0.1) return -1;
  if (r < 0.26) return -1 + 0.14 * smooth((r - 0.1) / 0.16);
  return -0.86 * (1 - smooth((r - 0.26) / 0.74));
}


/** One frame of a tool's action (mining swing or attack), as offsets from the rest pose. */
export interface ActionPose {
  /** Turn about the swing axis (rad; + lifts back, - strikes forward). */
  angle: number;
  /** Along the tool's length (model metres x scale; + toward its head). */
  thrust: number;
  /** Up and in toward the middle of the view (0..1 of a raise). */
  lift: number;
  /** The recoil at release (rad, ranged tools). */
  kick: number;
}

/** The pose of `tool`'s action at phase u (0..1) when the hit (or the release) lands at `contact`. */
export function actionPose(tool: RightTool, u: number, contact: number): ActionPose {
  const out: ActionPose = { angle: 0, thrust: 0, lift: 0, kick: 0 };
  if (u <= 0 || u >= 1) return out;
  if (tool === 'pick' || tool === 'machete') {
    out.angle = swingAngle(u, contact) * (tool === 'machete' ? 1.15 : 1);
    return out;
  }
  const r = (u - contact) / Math.max(1e-3, 1 - contact);
  if (tool === 'spear') {
    // Drawn back, then driven forward to land at contact, held a beat, eased home.
    if (u < contact * 0.6) out.thrust = -0.07 * smooth(u / (contact * 0.6));
    else if (u < contact) {
      const k = (u - contact * 0.6) / (contact * 0.4);
      out.thrust = -0.07 + 0.29 * k * k;
    } else out.thrust = r < 0.12 ? 0.22 : 0.22 * (1 - smooth((r - 0.12) / 0.88));
    out.angle = -0.08 * saturate(out.thrust / 0.22);
    return out;
  }
  if (tool === 'sling') {
    // Raised to aim, the band let go at contact (a small kick), lowered again.
    out.lift = u < contact ? smooth(u / contact) : 1 - smooth(r);
    out.kick = u < contact ? 0 : 0.22 * Math.exp(-r * 9) * (r < 0.02 ? r / 0.02 : 1);
    return out;
  }
  // A Flash Charge: drawn back and low, then thrown forward and up, released at contact.
  if (u < contact) {
    const k = smooth(u / contact);
    out.thrust = -0.06 * k;
    out.lift = -0.35 * k;
  } else {
    out.thrust = -0.06 + 0.32 * smooth(r * 2.2);
    out.lift = -0.35 + 0.95 * smooth(r * 2.2) - 0.9 * smooth((r - 0.45) / 0.55);
    out.angle = -0.5 * smooth(r * 2.2);
  }
  return out;
}

/** Action durations and contact fractions when a caller gives none (the weapons' own come from config/weapons). */
const ACTION_DEFAULT: Record<RightTool, { dur: number; contact: number }> = {
  pick: { dur: 0.45, contact: 0.55 },
  machete: { dur: 0.32, contact: 0.4 },
  spear: { dur: 0.6, contact: 0.42 },
  sling: { dur: 0.6, contact: 0.36 },
  flash: { dur: 0.6, contact: 0.45 },
};

/** Lowering the old tool out of view and raising the new one (s each way). */
const SWAP_DOWN = 0.1;
const SWAP_UP = 0.16;

interface ToolPose {
  rest: THREE.Quaternion;
  grip: THREE.Vector3;
  scale: number;
  /** The tool's length direction (camera space, unit). */
  along: THREE.Vector3;
  axis: THREE.Vector3;
}

export class Viewmodel {
  readonly group = new THREE.Group();
  readonly state: ViewmodelState = { pickTier: 1, lanternTier: 1, mirror: false };
  /** Flame strength 0..1 (the glass glow and the light on the tools follow it). */
  flame = 1;
  /** Oil left 0..1: the flame shrinks on the wick as it drains. */
  oil = 1;
  /** The lantern is lit (out: a small ember). */
  lit = true;
  /** A gust's dimming (game/events, Lantern.dim): 1 normal, lower while a gust holds the flame down. */
  dim = 1;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly flameUniforms: Record<string, THREE.IUniform>;
  private readonly mat: THREE.ShaderMaterial;
  private readonly glassMat: THREE.ShaderMaterial;
  private readonly flameMat: THREE.ShaderMaterial;
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly pick = new THREE.Group();
  private readonly pickSwing = new THREE.Group();
  private readonly lantern = new THREE.Group();
  private readonly lanternSwing = new THREE.Group();
  private pickMesh: THREE.Mesh | null = null;
  private lanternMeshes: THREE.Mesh[] = [];
  private flameMesh: THREE.Mesh | null = null;
  private glowMesh: THREE.Mesh | null = null;
  private gloveGeo: THREE.BufferGeometry;
  private sleeveGeo: THREE.BufferGeometry;
  private glowGeo: THREE.BufferGeometry;
  private readonly gloves: THREE.Mesh[] = [];
  private readonly sleeves: THREE.Mesh[] = [];
  /** Built weapon models (the pick is pickMesh), and their glowing loads. */
  private readonly weaponMeshes = new Map<WeaponModelId, { mesh: THREE.Mesh; load: THREE.Mesh | null; head: number }>();
  /** The right hand's tool shown now, and the one it is changing to. */
  private shown: RightTool = 'pick';
  private wanted: RightTool = 'pick';
  /** 0 up in hand .. 1 lowered out of view (swap in progress). */
  private lowered = 0;
  private readonly poses = new Map<string, ToolPose>();
  private readonly wrist = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly qTmp = new THREE.Quaternion();
  private readonly qAim = new THREE.Quaternion();
  private readonly eAim = new THREE.Euler();
  private readonly eYaw = new THREE.Euler();
  private flameLocal = new THREE.Vector3(0, -0.15, 0);
  private built = { pick: -1, lantern: -1 };
  private readonly vmProj = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();
  // The action (a mining swing or an attack).
  private actT = 1;
  private actDur = 0.42;
  private contact = 0.55;
  private actTool: RightTool = 'pick';
  private freeze = 0;
  private flashT = 0;
  /** The Flash Charge in hand was thrown (its bulb stays gone until the hand changes). */
  private spent = false;
  private readonly aim = { yaw: 0, pitch: 0 };
  // Lantern pendulum (rad) and its drive.
  private swayX = 0;
  private swayZ = 0;
  private swayVX = 0;
  private swayVZ = 0;
  private lastYaw = NaN;
  private walkPhase = 0;
  private moving = 0;
  private raiseT = 1e9;
  private time = 0;
  /** The game clock (s), when the caller drives it: the flame's flicker then matches the light's (fp/flame). */
  clock: number | null = null;
  private flickerNow = 1;
  private visibleNow = true;

  constructor() {
    this.uniforms = {
      uVmProj: { value: this.vmProj },
      uFlamePos: { value: new THREE.Vector3() },
      uFlameColor: { value: new THREE.Color(1.0, 0.62, 0.32) },
      uAmbient: { value: new THREE.Color(0.05, 0.05, 0.06) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uFlame: { value: 1 },
      uFlash: { value: 0 },
      uSceneEncode: SCENE_ENCODE,
    };
    this.flameUniforms = {
      ...this.uniforms,
      uFlame: { value: 1 },
      uTime: { value: 0 },
      uFlameBase: { value: new THREE.Vector3() },
      uFlameScale: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.mat = makeMaterial(this.uniforms, 'solid');
    this.glassMat = makeMaterial(this.uniforms, 'glass');
    this.flameMat = makeMaterial(this.flameUniforms, 'flame');
    this.glowMat = makeMaterial(this.flameUniforms, 'glow');
    this.group.name = 'viewmodel';
    this.group.matrixAutoUpdate = false;
    this.group.add(this.pick, this.lantern);
    this.pick.add(this.pickSwing);
    this.lantern.add(this.lanternSwing);
    this.gloveGeo = buildGlove();
    this.sleeveGeo = buildSleeve();
    this.glowGeo = buildGlowQuad();
    for (let i = 0; i < 2; i++) {
      this.gloves.push(this.mesh(this.gloveGeo, this.mat, 0));
      const sl = this.mesh(this.sleeveGeo, this.mat, 0);
      this.sleeves.push(sl);
      this.group.add(sl);
    }
    this.pickSwing.add(this.gloves[0]);
    this.lantern.add(this.gloves[1]);
    this.rebuild();
  }

  private mesh(g: THREE.BufferGeometry, m: THREE.Material, order: number): THREE.Mesh {
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 900 + order;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.viewmodel = true;
    mesh.layers.enable(VIEWMODEL_LAYER);
    return mesh;
  }

  /** Change the tools (tiers) or the hand they are in. */
  set(patch: Partial<ViewmodelState>): void {
    Object.assign(this.state, patch);
    if ('mirror' in patch) this.poses.clear();
    this.rebuild();
  }

  private rebuild(): void {
    const st = this.state;
    if (st.pickTier !== this.built.pick) {
      if (this.pickMesh) {
        this.pickMesh.geometry.dispose();
        this.pickMesh.removeFromParent();
      }
      this.pickMesh = this.mesh(buildPickaxe(st.pickTier), this.mat, 1);
      if (this.shown === 'pick') this.pickSwing.add(this.pickMesh);
      this.built.pick = st.pickTier;
    }
    if (st.lanternTier !== this.built.lantern) {
      for (const m of this.lanternMeshes) {
        if (m.geometry !== this.glowGeo) m.geometry.dispose();
        m.removeFromParent();
      }
      const lg = buildLantern(st.lanternTier);
      this.flameLocal.copy(lg.flameAt);
      (this.flameUniforms.uFlameBase.value as THREE.Vector3).copy(lg.flameBase);
      this.flameMesh = this.mesh(lg.flame, this.flameMat, 3);
      this.glowMesh = this.mesh(this.glowGeo, this.glowMat, 5);
      this.glowMesh.position.copy(lg.flameAt);
      this.lanternMeshes = [this.mesh(lg.solid, this.mat, 2), this.flameMesh, this.mesh(lg.glass, this.glassMat, 4), this.glowMesh];
      this.lanternSwing.add(...this.lanternMeshes);
      this.built.lantern = st.lanternTier;
    }
  }

  setVisible(b: boolean): void {
    this.visibleNow = b;
    this.group.visible = b;
  }

  get visible(): boolean {
    return this.visibleNow;
  }

  /** The tool the right hand holds (or is changing to). */
  get rightHand(): RightTool {
    return this.wanted;
  }

  /**
   * Put `tool` in the right hand: the one held is lowered out of view and the new one raised
   * (about a quarter of a second), or at once with `instant`.
   */
  setRightHand(tool: string, instant = false): void {
    const t = (tool === 'machete' || tool === 'spear' || tool === 'sling' || tool === 'flash' ? tool : 'pick') as RightTool;
    this.wanted = t;
    if (instant) {
      this.showTool(t);
      this.lowered = 0;
    }
  }

  private showTool(t: RightTool): void {
    if (t === this.shown && (t !== 'pick' || this.pickMesh?.parent === this.pickSwing)) return;
    this.spent = false;
    if (this.shown === 'pick') this.pickMesh?.removeFromParent();
    else {
      const w = this.weaponMeshes.get(this.shown);
      w?.mesh.removeFromParent();
      w?.load?.removeFromParent();
    }
    this.shown = t;
    if (t === 'pick') {
      if (this.pickMesh) this.pickSwing.add(this.pickMesh);
      return;
    }
    let w = this.weaponMeshes.get(t);
    if (!w) {
      const g = buildWeapon(t);
      w = { mesh: this.mesh(g.geo, this.mat, 1), load: g.load ? this.mesh(g.load, this.mat, 1) : null, head: g.head };
      this.weaponMeshes.set(t, w);
    }
    this.pickSwing.add(w.mesh);
    if (w.load) this.pickSwing.add(w.load);
  }

  /**
   * A mining swing starts now: it lasts `duration` s and the head meets the rock at `contact` of it.
   * The head aims toward `target` (world point) if given.
   */
  swing(duration: number, contact: number, target: THREE.Vector3 | null, camera: THREE.Camera): void {
    this.act('pick', duration, contact, target, camera);
  }

  /**
   * An attack with `tool` (a weapon, or the pick on a monster): wind-up, the hit (or the release) at
   * `contact` of `duration`, recovery. The weapon comes to hand at once if it was not there.
   */
  attack(tool: string, target: THREE.Vector3 | null, camera: THREE.Camera, duration?: number, contact?: number): void {
    const t = (tool === 'machete' || tool === 'spear' || tool === 'sling' || tool === 'flash' ? tool : 'pick') as RightTool;
    const d = ACTION_DEFAULT[t];
    this.act(t, duration ?? d.dur, contact ?? d.contact, target, camera);
  }

  private act(tool: RightTool, duration: number, contact: number, target: THREE.Vector3 | null, camera: THREE.Camera): void {
    if (this.shown !== tool) {
      // Straight to hand: the action itself carries it in (no lowering beat before a strike).
      this.wanted = tool;
      this.showTool(tool);
      this.lowered = Math.min(this.lowered, 0.35);
    }
    this.wanted = tool;
    this.actTool = tool;
    this.actT = 0;
    this.freeze = 0;
    this.actDur = Math.max(0.15, duration);
    this.contact = clamp(contact, 0.2, 0.8);
    if (target) {
      const d = this.tmp.copy(target).applyMatrix4(camera.matrixWorldInverse);
      const len = Math.max(1e-3, d.length());
      // Toward the struck point: left/right turns the swing plane, up/down tips the arc.
      this.aim.yaw = clamp(Math.atan2(-d.x, -d.z) * 0.6, -0.35, 0.5);
      this.aim.pitch = clamp(Math.asin(clamp(d.y / len, -1, 1)) * 0.5, -0.35, 0.3);
    } else {
      this.aim.yaw = 0;
      this.aim.pitch = 0;
    }
  }

  /** Seconds the current action lasts. */
  get attackDuration(): number {
    return this.actDur;
  }

  /** Hold the action still for `seconds` (a hit stop: the blow lands and weighs). */
  hitStop(seconds: number): void {
    this.freeze = Math.max(this.freeze, seconds);
    this.flashT = 0.12;
  }

  /** Lift the lantern for a moment (a tap into the dark): up 0.2 s, held 1.2 s, down 0.45 s. */
  raise(): void {
    this.raiseT = 0;
  }

  /** 0..1: how high the lantern is raised now. */
  get raised(): number {
    const r = this.raiseT;
    const up = 0.2;
    const hold = 1.2;
    const down = 0.45;
    if (r < up) return smooth(r / up);
    if (r < up + hold) return 1;
    return 1 - smooth((r - up - hold) / down);
  }

  /** True while a swing or an attack is in progress (a moving foreground effect). */
  get swinging(): boolean {
    return this.actT < 1;
  }

  /** The flame's flicker this frame (1 = steady): the world's lantern light uses the same. */
  get flicker(): number {
    return this.flickerNow;
  }

  /**
   * Advance and place the viewmodel for this frame's camera.
   * @param speed horizontal walking speed (m/s) of the explorer
   * @param lateral sideways velocity in camera space (m/s, + right)
   * @param ambient world light at the eye (linear)
   * @param flameColor the lantern light's colour times its intensity (linear)
   */
  update(dt: number, camera: THREE.PerspectiveCamera, aspect: number, speed: number, lateral: number, ambient: THREE.Color, flameColor: THREE.Color): void {
    this.time = this.clock ?? this.time + dt;
    if (this.freeze > 0) this.freeze = Math.max(0, this.freeze - dt);
    else this.actT = Math.min(1, this.actT + dt / this.actDur);
    this.flashT = Math.max(0, this.flashT - dt);
    this.raiseT += dt;
    // The swap: lower the old tool, change, raise the new one.
    if (this.wanted !== this.shown) {
      this.lowered = Math.min(1, this.lowered + dt / SWAP_DOWN);
      if (this.lowered >= 1) this.showTool(this.wanted);
    } else if (this.lowered > 0) this.lowered = Math.max(0, this.lowered - dt / SWAP_UP);
    // The viewmodel lens.
    this.vmProj.makePerspective(-TAN_HALF * aspect * 0.02, TAN_HALF * aspect * 0.02, TAN_HALF * 0.02, -TAN_HALF * 0.02, 0.02, 4);
    const sx = this.state.mirror ? -1 : 1;
    // Anchors in the viewmodel lens (NDC at depth D).
    const D = 0.62;
    const at = (ndcX: number, ndcY: number, depth: number, out: THREE.Vector3) => out.set(ndcX * depth * TAN_HALF * aspect, ndcY * depth * TAN_HALF, -depth);

    // Walking: a slow phase for a very slight lantern bob (no camera bob).
    this.moving = damp(this.moving, saturate(speed / 2.5), 6, dt);
    this.walkPhase += dt * speed * 1.6;
    // The lantern pendulum: driven by sideways motion and turning; stiff and damped (still at rest).
    const yaw = camera.rotation.y;
    let yawRate = 0;
    if (Number.isFinite(this.lastYaw) && dt > 0) {
      const dy = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
      yawRate = clamp(dy / dt, -8, 8);
    }
    this.lastYaw = yaw;
    if (dt > 0) {
      const k = 70;
      const c = 2 * Math.sqrt(k) * 0.55;
      const tz = clamp(-lateral * 0.045 + yawRate * 0.028, -0.22, 0.22) * sx;
      const tx = clamp(speed * 0.02 + Math.sin(this.walkPhase) * 0.012 * this.moving, -0.12, 0.16);
      this.swayVZ += (k * (tz - this.swayZ) - c * this.swayVZ) * dt;
      this.swayZ += this.swayVZ * dt;
      this.swayVX += (k * (tx - this.swayX) - c * this.swayVX) * dt;
      this.swayX += this.swayVX * dt;
    }
    const lift = this.raised;

    // The lantern: lower left, hanging from the glove at its bail; a raise lifts it toward the middle.
    const lay = lanternLayout(aspect);
    const lscale = (lay.height * D * TAN_HALF) / 0.22;
    at((lay.x + 0.1 * lift) * sx, lay.y + 0.28 * lift, D, this.lantern.position);
    this.lantern.rotation.set(0.1, 0.4 * sx, 0.0);
    this.lantern.scale.setScalar(lscale);
    this.lanternSwing.rotation.set(this.swayX, 0, this.swayZ);
    // The fist round the grip of the bail (the rod across, along x), knuckles away from the eye,
    // the wrist toward it.
    this.gloves[1].position.set(0, -0.0035, 0);
    this.gloves[1].quaternion.copy(LANTERN_GRIP);
    // The flame: it breathes with the shared flicker, shrinks with the oil, stands up for a raise.
    this.flickerNow = this.lit ? lanternFlicker(this.time, this.oil) : 1 + Math.sin(this.time * 5.3) * 0.08;
    const size = flameSize(this.oil, this.lit) * (1 + 0.12 * lift) * (0.55 + 0.45 * saturate(this.dim));
    const f = this.flickerNow;
    (this.flameUniforms.uFlameScale.value as THREE.Vector3).set(size * (1 - (f - 1) * 0.6), size * f, size * (1 - (f - 1) * 0.6));
    this.flameUniforms.uTime.value = this.time;
    this.flameUniforms.uFlame.value = (this.lit ? 0.72 + 0.28 * Math.sqrt(saturate(this.oil)) : 0.3) * f * (0.5 + 0.5 * saturate(this.dim));

    // The right hand: the pick or a weapon, at its rest pose for this screen, plus its action.
    const tool = this.shown;
    const pose = this.restPose(tool, aspect, D, sx);
    const k = D * TAN_HALF;
    const bob = Math.sin(this.walkPhase * 2) * 0.004 * this.moving;
    this.pick.position.copy(pose.grip);
    this.pick.position.y += bob * k;
    this.pick.scale.setScalar(pose.scale);
    const acting = this.actT < 1 && this.actTool === tool;
    const a = acting ? actionPose(tool, this.actT, this.contact) : { angle: 0, thrust: 0, lift: 0, kick: 0 };
    const strike = saturate(-a.angle);
    if (tool === 'machete') {
      // A diagonal slash: the swing plane tipped across the view.
      this.tmp2.copy(pose.axis).addScaledVector(this.tmp.set(0, 0, -1), 0.55 * sx).normalize();
      this.qTmp.setFromAxisAngle(this.tmp2, -a.angle * 0.95);
    } else this.qTmp.setFromAxisAngle(pose.axis, -a.angle * 0.95 - a.kick);
    this.pick.quaternion.copy(this.qTmp).multiply(pose.rest);
    // The strike reaches in toward the middle of the view (plus the aim at the struck point).
    if (tool === 'pick' || tool === 'machete') {
      this.qAim.setFromEuler(this.eAim.set((this.aim.pitch + 0.1) * strike, (this.aim.yaw + 0.42 * sx) * strike, 0, 'YXZ'));
      this.pick.quaternion.premultiply(this.qAim);
    } else if (tool === 'spear' && acting) {
      this.qAim.setFromEuler(this.eAim.set(this.aim.pitch * 0.6 * saturate(a.thrust / 0.2), this.aim.yaw * 0.6 * saturate(a.thrust / 0.2), 0, 'YXZ'));
      this.pick.quaternion.premultiply(this.qAim);
    }
    this.pick.position.addScaledVector(pose.along, a.thrust * pose.scale);
    if (a.lift !== 0) this.pick.position.add(this.tmp.set(-0.12 * sx * k * aspect, 0.2 * k, 0).multiplyScalar(a.lift));
    this.pickSwing.position.set(0, 0, -0.03 * strike);
    // Lowered for a swap: down and tipped away.
    if (this.lowered > 0) {
      const lw = smooth(this.lowered);
      this.pick.position.y -= 0.55 * k * lw;
      this.qTmp.setFromAxisAngle(pose.axis, 0.7 * lw);
      this.pick.quaternion.premultiply(this.qTmp);
    }
    this.gloves[0].position.set(0, 0.0, 0);
    this.gloves[0].rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    // A ranged tool's load leaves at the release and is back in hand once the action ends.
    const w = tool === 'pick' ? null : this.weaponMeshes.get(tool);
    // A thrown Flash Charge is gone until the hand changes; the sling is loaded again.
    if (tool === 'flash' && acting && this.actT >= this.contact) this.spent = true;
    if (w?.load) w.load.visible = !(acting && this.actT >= this.contact) && !(tool === 'flash' && this.spent);
    this.uniforms.uFlash.value = this.flashT > 0 ? this.flashT / 0.12 : 0;

    // Shading inputs (camera space): place the group at the camera's origin first.
    this.group.matrix.identity();
    this.group.updateMatrixWorld(true);
    this.lanternSwing.localToWorld(this.tmp.copy(this.flameLocal));
    (this.uniforms.uFlamePos.value as THREE.Vector3).copy(this.tmp);
    (this.uniforms.uUp.value as THREE.Vector3).set(0, 1, 0).transformDirection(this.tmpM.copy(camera.matrixWorldInverse));
    // The halo faces the eye whatever the lantern's swing.
    if (this.glowMesh) {
      this.lanternSwing.getWorldQuaternion(this.qTmp);
      this.glowMesh.quaternion.copy(this.qTmp.invert());
      this.glowMesh.scale.setScalar(0.75 + 0.25 * size * f);
    }
    // The forearms: from each wrist back toward the lower corners, out of view.
    this.placeSleeve(this.sleeves[0], this.gloves[0], WRIST_PICK, 0.05 * sx, 0.3);
    // The lantern arm: out to the side and back toward the eye, a little raised (it passes above
    // the lantern, never in front of it), so only the glove and its cuff show before it leaves the
    // frame at the left edge.
    this.placeSleeve(this.sleeves[1], this.gloves[1], WRIST_LANTERN, -0.24 * sx, 0.1);
    (this.uniforms.uAmbient.value as THREE.Color).copy(ambient);
    (this.uniforms.uFlameColor.value as THREE.Color).copy(flameColor);
    this.uniforms.uFlame.value = this.flame * f;
    // World placement: the camera's world matrix times the viewmodel transform.
    this.group.matrix.copy(camera.matrixWorld);
    this.group.matrixWorldNeedsUpdate = true;
    this.group.updateMatrixWorld(true);
  }

  /**
   * A tool's rest orientation, size and grip for a screen shape: the head sits in the right quarter
   * of the view, low, its point aimed forward and a little up into the scene (so the forged profile
   * reads while the tool stays out of the central column); the handle leans in, down to the gloved
   * grip at the bottom edge.
   */
  private restPose(tool: RightTool, aspect: number, D: number, sx: number): ToolPose {
    const key = `${tool}:${aspect.toFixed(3)}:${sx}`;
    const cached = this.poses.get(key);
    if (cached) return cached;
    const k = D * TAN_HALF;
    const lay = toolLayout(tool, aspect);
    const head = new THREE.Vector3(lay.headX * sx * k * aspect, lay.headY * k, -D * 1.2);
    const along = new THREE.Vector3(-lay.leanX * sx, 1, -lay.leanZ).normalize();
    const len = tool === 'pick' ? 0.44 : (this.weaponMeshes.get(tool)?.head ?? 0.4);
    const grip = head.clone().addScaledVector(along, -len * lay.scale);
    const qa = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    // Roll about the handle so the point (model -z) aims forward into the scene, a little in.
    const want = new THREE.Vector3(-lay.pointIn * sx, lay.pointUp, -1).normalize();
    want.sub(along.clone().multiplyScalar(want.dot(along))).normalize();
    const p0 = new THREE.Vector3(0, 0, -1).applyQuaternion(qa);
    const ang = Math.atan2(new THREE.Vector3().crossVectors(p0, want).dot(along), p0.dot(want));
    const rest = new THREE.Quaternion().setFromAxisAngle(along, ang).multiply(qa);
    const axis = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 0, -1)).normalize();
    const pose: ToolPose = { rest, grip, scale: lay.scale, along, axis };
    if (this.poses.size > 64) this.poses.clear();
    this.poses.set(key, pose);
    return pose;
  }

  /**
   * Stretch a sleeve from a glove's wrist (glove-local point) back toward the eye to an elbow out of
   * the view, so the forearm leaves the frame at the nearest edge.
   */
  private placeSleeve(sleeve: THREE.Mesh, glove: THREE.Object3D, wristLocal: THREE.Vector3, dx: number, dy: number): void {
    glove.localToWorld(this.wrist.copy(wristLocal));
    // The elbow stays in front of the lens (a tool held close, like the spear, would put it behind
    // the eye and the sleeve across the view).
    this.elbow.set(this.wrist.x + dx, this.wrist.y - dy, Math.min(this.wrist.z + 0.36, -0.06));
    const dir = this.tmp.subVectors(this.elbow, this.wrist);
    const len = dir.length();
    sleeve.position.copy(this.wrist);
    sleeve.quaternion.copy(this.qTmp.setFromUnitVectors(UP, dir.normalize()));
    const s = glove.getWorldScale(this.tmp).x;
    sleeve.scale.set(s, len, s);
    sleeve.updateMatrixWorld();
  }

  /**
   * Where the lantern's light hangs in the world this frame (camera space LANTERN_LIGHT_CAM, lifted
   * by a raise), before any clearance against rock.
   */
  lightWorld(camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    const sx = this.state.mirror ? -1 : 1;
    const lift = this.raised;
    // The hand holds the lantern at the body, not at the head: the offset turns with the view's
    // yaw only, so looking up or down never swings the light behind or above the eye.
    const yaw = this.eYaw.setFromQuaternion(camera.quaternion, 'YXZ').y;
    const lx = LANTERN_LIGHT_CAM[0] * sx * (1 - 0.4 * lift);
    const ly = LANTERN_LIGHT_CAM[1] + 0.3 * lift;
    const lz = LANTERN_LIGHT_CAM[2];
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    camera.getWorldPosition(out);
    return out.set(out.x + lx * c + lz * sn, out.y + ly, out.z - lx * sn + lz * c);
  }

  /** Where the right hand's tool head is in the world (the sling's shard leaves from here). */
  toolWorld(out: THREE.Vector3): THREE.Vector3 {
    this.pickSwing.updateWorldMatrix(true, false);
    const head = this.shown === 'pick' ? 0.44 : (this.weaponMeshes.get(this.shown)?.head ?? 0.3);
    return this.pickSwing.localToWorld(out.set(0, head, 0));
  }

  dispose(): void {
    this.pickMesh?.geometry.dispose();
    for (const m of this.lanternMeshes) if (m.geometry !== this.glowGeo) m.geometry.dispose();
    for (const w of this.weaponMeshes.values()) {
      w.mesh.geometry.dispose();
      w.load?.geometry.dispose();
    }
    this.gloveGeo.dispose();
    this.sleeveGeo.dispose();
    this.glowGeo.dispose();
    this.mat.dispose();
    this.glassMat.dispose();
    this.flameMat.dispose();
    this.glowMat.dispose();
  }
}

/** The flame's halo: a unit quad (0.07 m) facing +z, its uv in the colour attribute. */
function buildGlowQuad(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(0.075, 0.09).toNonIndexed();
  const uv = g.getAttribute('uv');
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const mat = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = uv.getX(i);
    col[i * 3 + 1] = uv.getY(i);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(mat, 3));
  return g;
}
