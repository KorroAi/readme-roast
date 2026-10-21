import * as THREE from 'three';
import { clamp, damp, saturate } from '../../core/math';
import { SCENE_ENCODE } from '../../render/lighting';
import { LANTERN_LIGHT_CAM } from './constants';
import { buildGlove, buildLantern, buildPickaxe, buildSleeve } from './viewmodelParts';

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

const VERT = /* glsl */ `
in vec3 color;
in vec3 aMat;
uniform mat4 uVmProj;
out vec3 vPos;
out vec3 vN;
out vec3 vColor;
out vec3 vMat;
void main() {
  // The mesh's world matrix is the camera's times the viewmodel transform: view * model brings it
  // back to camera space exactly.
  vec4 cs = viewMatrix * modelMatrix * vec4(position, 1.0);
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
in vec3 vPos;
in vec3 vN;
in vec3 vColor;
in vec3 vMat;
layout(location = 0) out highp vec4 fragColor;

vec3 sceneOut(vec3 c) {
  return uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c;
}

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(-vPos);
#ifdef GLASS
  // Smoky glass lit from inside: warm at the centre, a cool sheen at grazing angles.
  float ndv = abs(dot(n, V));
  vec3 g = vec3(1.0, 0.6, 0.28) * (0.12 + 0.26 * ndv) * uFlame + vec3(0.03, 0.04, 0.05) * pow(1.0 - ndv, 3.0);
  fragColor = vec4(sceneOut(g), 1.0);
#else
  float emit = vMat.x;
  float metal = vMat.y;
  float rough = vMat.z;
  if (emit >= 2.0) {
    // The flame: hot core, warm rim.
    float core = pow(abs(dot(n, V)), 1.3);
    vec3 f = mix(vec3(1.0, 0.45, 0.12), vColor * 1.6, core) * 3.6 * (emit - 2.0) * uFlame;
    fragColor = vec4(sceneOut(f), 1.0);
    return;
  }
  vec3 L = uFlamePos - vPos;
  float d = length(L);
  L /= max(d, 1e-4);
  float att = 1.0 / (1.0 + 14.0 * d * d);
  float ndl = dot(n, L);
  float wrap = clamp(ndl * 0.75 + 0.25, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float shin = mix(90.0, 6.0, rough);
  float spec = pow(max(dot(n, H), 0.0), shin) * (shin + 2.0) / 8.0 * step(0.0, ndl);
  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 5.0);
  vec3 f0 = mix(vec3(0.04), vColor, metal);
  float hemi = 0.6 + 0.4 * dot(n, uUp);
  vec3 amb = uAmbient * hemi;
  vec3 key = uFlameColor * att;
  vec3 diffuse = vColor * (1.0 - metal) * (amb + key * wrap);
  // Metals keep a dim reflection of the room (fresnel-weighted) so they never read as holes.
  vec3 sheen = mix(f0, vec3(1.0), fres * 0.5) * amb * mix(0.15, 0.9, metal);
  vec3 specular = mix(f0, vec3(1.0), fres) * key * spec;
  vec3 c = diffuse + sheen + specular + vColor * emit * 0.8;
  fragColor = vec4(sceneOut(c), 1.0);
#endif
}
`;

export interface ViewmodelState {
  pickTier: number;
  lanternTier: number;
  mirror: boolean;
}

function makeMaterial(uniforms: Record<string, THREE.IUniform>, glass: boolean): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: glass ? { GLASS: '' } : {},
    side: glass ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (glass) {
    m.transparent = true;
    m.blending = THREE.AdditiveBlending;
    m.depthWrite = false;
  }
  m.name = glass ? 'viewmodel-glass' : 'viewmodel';
  return m;
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

export class Viewmodel {
  readonly group = new THREE.Group();
  readonly state: ViewmodelState = { pickTier: 1, lanternTier: 1, mirror: false };
  /** Fuel 0..1 and lit: the flame and the light on the tools follow it. */
  flame = 1;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly mat: THREE.ShaderMaterial;
  private readonly glassMat: THREE.ShaderMaterial;
  private readonly pick = new THREE.Group();
  private readonly pickSwing = new THREE.Group();
  private readonly lantern = new THREE.Group();
  private readonly lanternSwing = new THREE.Group();
  private pickMesh: THREE.Mesh | null = null;
  private lanternMeshes: THREE.Mesh[] = [];
  private gloveGeo: THREE.BufferGeometry;
  private sleeveGeo: THREE.BufferGeometry;
  private readonly gloves: THREE.Mesh[] = [];
  private readonly sleeves: THREE.Mesh[] = [];
  /** The pick's rest pose for the current screen shape (recomputed when it changes). */
  private readonly pickRest = new THREE.Quaternion();
  private pickScale = 1;
  private poseKey = '';
  private readonly wrist = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly qTmp = new THREE.Quaternion();
  private readonly qAim = new THREE.Quaternion();
  private readonly eAim = new THREE.Euler();
  private readonly eYaw = new THREE.Euler();
  /** Camera-space axis the pick swings about (perpendicular to the handle and the view). */
  private readonly swingAxis = new THREE.Vector3(-1, 0, 0);
  private flameLocal = new THREE.Vector3(0, -0.15, 0);
  private built = { pick: -1, lantern: -1 };
  private readonly vmProj = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();
  // Swing.
  private swingT = 1;
  private swingDur = 0.42;
  private contact = 0.55;
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
  private visibleNow = true;

  constructor() {
    this.uniforms = {
      uVmProj: { value: this.vmProj },
      uFlamePos: { value: new THREE.Vector3() },
      uFlameColor: { value: new THREE.Color(1.0, 0.62, 0.32) },
      uAmbient: { value: new THREE.Color(0.05, 0.05, 0.06) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uFlame: { value: 1 },
      uSceneEncode: SCENE_ENCODE,
    };
    this.mat = makeMaterial(this.uniforms, false);
    this.glassMat = makeMaterial(this.uniforms, true);
    this.group.name = 'viewmodel';
    this.group.matrixAutoUpdate = false;
    this.group.add(this.pick, this.lantern);
    this.pick.add(this.pickSwing);
    this.lantern.add(this.lanternSwing);
    this.gloveGeo = buildGlove();
    this.sleeveGeo = buildSleeve();
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
      this.pickSwing.add(this.pickMesh);
      this.built.pick = st.pickTier;
    }
    if (st.lanternTier !== this.built.lantern) {
      for (const m of this.lanternMeshes) {
        m.geometry.dispose();
        m.removeFromParent();
      }
      const lg = buildLantern(st.lanternTier);
      this.flameLocal.copy(lg.flame);
      this.lanternMeshes = [this.mesh(lg.solid, this.mat, 2), this.mesh(lg.glass, this.glassMat, 3)];
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

  /**
   * A swing starts now: it lasts `duration` s and the head meets the rock at `contact` of it. The
   * head aims toward `target` (world point) if given.
   */
  swing(duration: number, contact: number, target: THREE.Vector3 | null, camera: THREE.Camera): void {
    this.swingT = 0;
    this.swingDur = Math.max(0.15, duration);
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

  /** True while the pick is swinging (a moving foreground effect). */
  get swinging(): boolean {
    return this.swingT < 1;
  }

  /**
   * Advance and place the viewmodel for this frame's camera.
   * @param speed horizontal walking speed (m/s) of the explorer
   * @param lateral sideways velocity in camera space (m/s, + right)
   * @param ambient world light at the eye (linear)
   * @param flameColor the lantern light's colour times its intensity (linear)
   */
  update(dt: number, camera: THREE.PerspectiveCamera, aspect: number, speed: number, lateral: number, ambient: THREE.Color, flameColor: THREE.Color): void {
    this.swingT = Math.min(1, this.swingT + dt / this.swingDur);
    this.raiseT += dt;
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
    this.restPose(aspect, D, sx);

    // The lantern: lower left, hanging from the glove at its bail; a raise lifts it toward the middle.
    const lscale = (0.62 * D * TAN_HALF * Math.min(1, aspect * 1.15)) / 0.22;
    at((-0.62 + 0.12 * lift) * sx, -0.52 + 0.3 * lift, D, this.lantern.position);
    this.lantern.rotation.set(0.1, 0.4 * sx, 0.0);
    this.lantern.scale.setScalar(lscale);
    this.lanternSwing.rotation.set(this.swayX, 0, this.swayZ);
    // The fist round the bail, knuckles outward.
    this.gloves[1].position.set(0, 0.005, 0);
    this.gloves[1].rotation.set(0, sx > 0 ? Math.PI : 0, 0);

    // The pick: grip lower right, the handle leaning in, the head toward the upper right of the tools.
    const bob = Math.sin(this.walkPhase * 2) * 0.004 * this.moving;
    at(0.86 * sx, -0.98 + bob, D, this.pick.position);
    this.pick.scale.setScalar(this.pickScale);
    // The swing turns the whole pick about its grip, in the plane of the handle and the view
    // direction: the head goes forward into the scene (toward the crosshair), then comes home.
    const u = this.swingT;
    const a = swingAngle(u, this.contact);
    const strike = saturate(-a);
    this.qTmp.setFromAxisAngle(this.swingAxis, -a * 0.95);
    this.pick.quaternion.copy(this.qTmp).multiply(this.pickRest);
    // The strike reaches in toward the middle of the view (plus the aim at the struck point).
    this.qAim.setFromEuler(this.eAim.set((this.aim.pitch + 0.12) * strike, (this.aim.yaw + 0.22 * sx) * strike, 0, 'YXZ'));
    this.pick.quaternion.premultiply(this.qAim);
    this.pickSwing.position.set(0, 0, -0.03 * strike);
    this.gloves[0].position.set(0, 0.0, 0);
    this.gloves[0].rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0);

    // Shading inputs (camera space): place the group at the camera's origin first.
    this.group.matrix.identity();
    this.group.updateMatrixWorld(true);
    this.lanternSwing.localToWorld(this.tmp.copy(this.flameLocal));
    (this.uniforms.uFlamePos.value as THREE.Vector3).copy(this.tmp);
    (this.uniforms.uUp.value as THREE.Vector3).set(0, 1, 0).transformDirection(this.tmpM.copy(camera.matrixWorldInverse));
    // The forearms: from each wrist back toward the lower corners, out of view.
    this.placeSleeve(this.sleeves[0], this.gloves[0], WRIST_PICK, 0.05 * sx, 0.3);
    // The lantern arm comes in from the left edge, above the lantern (never in front of it).
    this.placeSleeve(this.sleeves[1], this.gloves[1], WRIST_LANTERN, -0.3 * sx, 0.06);
    (this.uniforms.uAmbient.value as THREE.Color).copy(ambient);
    (this.uniforms.uFlameColor.value as THREE.Color).copy(flameColor);
    this.uniforms.uFlame.value = this.flame;
    // World placement: the camera's world matrix times the viewmodel transform.
    this.group.matrix.copy(camera.matrixWorld);
    this.group.matrixWorldNeedsUpdate = true;
    this.group.updateMatrixWorld(true);
  }

  /**
   * The pick's rest orientation and size for a screen shape: the handle runs from the grip (just
   * off the lower right corner) to the head (about a third in from the right, below the middle),
   * the point turned forward and in.
   */
  private restPose(aspect: number, D: number, sx: number): void {
    const key = `${aspect.toFixed(3)}:${sx}`;
    if (key === this.poseKey) return;
    this.poseKey = key;
    const k = D * TAN_HALF;
    const grip = new THREE.Vector3(0.86 * sx * k * aspect, -0.98 * k, -D);
    const head = new THREE.Vector3(0.44 * sx * k * aspect, -0.4 * k, -D * 1.2);
    const along = head.clone().sub(grip);
    this.pickScale = along.length() / 0.44;
    along.normalize();
    const qa = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    // Roll about the handle so the point (model -z) faces forward and in.
    const want = new THREE.Vector3(-1 * sx, 0.3, -0.5).normalize();
    want.sub(along.clone().multiplyScalar(want.dot(along))).normalize();
    const p0 = new THREE.Vector3(0, 0, -1).applyQuaternion(qa);
    const ang = Math.atan2(new THREE.Vector3().crossVectors(p0, want).dot(along), p0.dot(want));
    this.pickRest.setFromAxisAngle(along, ang).multiply(qa);
    this.swingAxis.crossVectors(along, new THREE.Vector3(0, 0, -1)).normalize();
  }

  /**
   * Stretch a sleeve from a glove's wrist (glove-local point) down and back to an elbow well below
   * the bottom of the view, so the forearm leaves the frame at the bottom edge.
   */
  private placeSleeve(sleeve: THREE.Mesh, glove: THREE.Object3D, wristLocal: THREE.Vector3, dx: number, dy: number): void {
    glove.localToWorld(this.wrist.copy(wristLocal));
    this.elbow.set(this.wrist.x + dx, this.wrist.y - dy, this.wrist.z + 0.36);
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

  dispose(): void {
    this.pickMesh?.geometry.dispose();
    for (const m of this.lanternMeshes) m.geometry.dispose();
    this.gloveGeo.dispose();
    this.sleeveGeo.dispose();
    this.mat.dispose();
    this.glassMat.dispose();
  }
}
