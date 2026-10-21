// The set pieces of W1 (BUILD §3.3 MUST 8, SPEC §3.3, §4.13, §5.5, §7; W1-LEAD §1.2, §3), keyed on 1B's chamber anchors
// (`placement.chamber.anchors`: wonder, skyShaft, hatch, cage, otherLantern, balcony, knot0..2, leak, pool) and on the
// camp placement:
//   the dusk sky (the camp, and every sky shaft looking up), the camp's stations (the crew board, the lantern maker),
//   the Halden Hatch (timber floor hatch, iron straps, chains to the dead hoist cage, the brass padlock weak point),
//   the Other Lantern (a warm point of light far below that is not yours), the Root Knot (three amber knots, closed in
//   W1), the wonder of each room (a root chandelier, a crystal crown, a glowing root tangle), mirror pools, the green
//   leak through the Cache's floor cracks.
// Everything is built in the bevel language and lit by 1E's shade(); the only animation is the padlock's light when
// the seal's weak point is lit (a state, never a pulse).

import * as THREE from 'three';
import type { CampPlacement, NodePlacement } from '../../world/hybrid/placement';
import type { V3 } from '../../world/hybrid/grid';
import { LAYER } from '../lantern/layers';
import { BRASS, CrystalBuilder, GOLD, IRON, OLD_WOOD, PropBuilder, ROOT, WOOD, chain, dripstone, haldenLamp, rng, roots, type Finish } from '../lantern/props';
import { TINT, type PropMaterials } from '../lantern/propSurface';
import { LIGHTING_GLSL, lightingUniforms } from '../light/chunk';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const v = (p: V3) => V(p.x, p.y, p.z);
const qY = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const WATER: Finish = { layer: LAYER.slate, tint: TINT.water };
const GLOWROOT: Finish = { layer: LAYER.rootwood, glow: 3 };
const AMBER_KNOT: Finish = { layer: LAYER.rootwood, tint: TINT.oreAmber };

// ------------------------------------------------------------------------------------------------------ dusk sky
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunDir;
varying vec3 vDir;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  vec3 sd = normalize(uSunDir);
  float sun = max(dot(d, sd), 0.0);
  // Azimuth toward the set sun (0 behind you .. 1 toward it): the horizon is warm there, cool lavender elsewhere.
  float az = 0.5 + 0.5 * dot(normalize(d.xz + 1e-4), normalize(sd.xz + 1e-4));
  vec3 horizon = mix(uHorizon * vec3(0.78, 0.8, 1.0), mix(uHorizon, uGlow * 0.55, 0.45), az * az);
  vec3 mid = mix(uZenith, uHorizon, 0.45) * vec3(0.92, 0.9, 1.05);
  vec3 col = up < 0.18 ? mix(horizon, mid, smoothstep(-0.02, 0.18, up)) : mix(mid, uZenith, smoothstep(0.18, 0.75, up));
  // The afterglow over the set sun: a wide warm band and a tight hot rim at the horizon.
  col += uGlow * (pow(sun, 5.0) * 0.45 + pow(sun, 28.0) * 0.6) * smoothstep(-0.08, 0.12, up + 0.06) * (1.0 - smoothstep(0.05, 0.45, up));
  // Stratus streaks (static): long thin bands low over the hills, their bellies lit amber toward the sun, slate away.
  vec2 cp = d.xz / max(0.06, up + 0.12);
  float band = fbm(cp * vec2(0.35, 1.6) + 3.0) - 0.48 + 0.18 * fbm(cp * 1.7);
  float cloud = smoothstep(0.02, 0.22, band) * smoothstep(0.02, 0.12, up) * (1.0 - smoothstep(0.32, 0.6, up));
  vec3 lit = mix(vec3(0.16, 0.16, 0.24), uGlow * 0.9, pow(az, 3.0) * smoothstep(0.35, 0.0, up));
  col = mix(col, lit * (0.7 + 0.5 * fbm(cp * 3.0)), cloud * 0.75);
  // Stars, sized and weighted (a few bright, many faint), only in the clear high sky.
  vec2 g = vec2(atan(d.z, d.x) * 90.0, d.y * 90.0);
  vec2 gi = floor(g), gf = fract(g) - 0.5;
  float r = h21(gi);
  float star = step(0.985, r) * exp(-dot(gf, gf) * 28.0) * (0.25 + 1.6 * pow((r - 0.985) / 0.015, 3.0));
  col += vec3(0.78, 0.82, 1.0) * star * smoothstep(0.22, 0.6, up) * (1.0 - cloud);
  // A thin moon high behind you (cool, low gain: never a second key).
  vec3 md = normalize(vec3(0.45, 0.62, 0.64));
  float m = dot(d, md);
  float disc = smoothstep(0.99955, 0.9997, m);
  float bite = smoothstep(0.99955, 0.9997, dot(d, normalize(md + vec3(0.012, 0.006, -0.004))));
  col += vec3(0.85, 0.88, 1.0) * max(0.0, disc - bite) * 1.4 + vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 600.0) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

function duskSky(): THREE.Mesh {
  const lin = (hex: number, k = 1) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(k);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: lin(0x16223a, 0.9) },
      uHorizon: { value: lin(0x6f7fa0, 0.75) },
      uGlow: { value: lin(0xffa060, 0.9) },
      uSunDir: { value: new THREE.Vector3(-0.6, 0.04, -0.8).normalize() },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  m.name = 'duskSky';
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.noShadow = true;
  return mesh;
}

// ------------------------------------------------------------------------------------------------- the Other Lantern
const POINT_FRAG = /* glsl */ `
${LIGHTING_GLSL}
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = dot(q, q);
  float a = exp(-r * 6.0) + 0.6 * exp(-r * 40.0);
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;
const POINT_VERT = /* glsl */ `
varying vec2 vUv;
uniform float uSize;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += (uv - 0.5) * uSize;
  gl_Position = projectionMatrix * mv;
}
`;

function warmPoint(size: number, color: number, gain: number): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...lightingUniforms(), uColor: { value: new THREE.Color().setHex(color, THREE.SRGBColorSpace).multiplyScalar(gain) }, uSize: { value: size } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.renderOrder = 4;
  return mesh;
}

// --------------------------------------------------------------------------------------------------- the Hatch
export interface HatchView {
  group: THREE.Group;
  /** The padlock (the weak point) world bound and the hatch's. */
  weakBox: THREE.Box3;
  bodyBox: THREE.Box3;
  padGlow: THREE.Mesh;
  planks: THREE.Mesh;
}

function hatch(at: THREE.Vector3, cage: THREE.Vector3 | null, mats: PropMaterials): HatchView {
  const pb = new PropBuilder();
  const r = rng(77);
  const S = 1.0; // half size (a 2 × 2 m hatch)
  // The frame (bevelled timber kerb) and six planks with gaps, two iron straps across, nail heads.
  for (const [dx, dz, hx, hz] of [[0, S + 0.08, S + 0.16, 0.08], [0, -S - 0.08, S + 0.16, 0.08], [S + 0.08, 0, 0.08, S], [-S - 0.08, 0, 0.08, S]] as const)
    pb.box(at.clone().add(V(dx, 0.04, dz)), V(hx, 0.07, hz), new THREE.Quaternion(), OLD_WOOD, r(), 0.02);
  for (let i = 0; i < 6; i++) {
    const x = -S + (i + 0.5) * ((2 * S) / 6);
    pb.box(at.clone().add(V(x, 0.0, (r() - 0.5) * 0.02)), V((S / 6) * 0.92, 0.05, S - 0.02), qY((r() - 0.5) * 0.015), WOOD, r(), 0.012);
  }
  for (const z of [-S * 0.55, S * 0.55]) {
    pb.box(at.clone().add(V(0, 0.06, z)), V(S - 0.04, 0.012, 0.06), new THREE.Quaternion(), IRON, r(), 0.004);
    for (let i = -2; i <= 2; i++) pb.box(at.clone().add(V(i * 0.4, 0.075, z)), V(0.014, 0.008, 0.014), new THREE.Quaternion(), IRON, r(), 0.003);
  }
  // Iron rings and chains from the hatch's corners up to the dead hoist cage (or to the ceiling above).
  const top = cage ? cage.clone().add(V(0, 2.4, 0)) : at.clone().add(V(0, 4, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const ring = at.clone().add(V(sx * (S - 0.12), 0.08, sz * (S - 0.12)));
    const t = new THREE.TorusGeometry(0.06, 0.012, 4, 10);
    t.rotateX(Math.PI / 2);
    pb.geometry(t, new THREE.Matrix4().makeTranslation(ring.x, ring.y, ring.z), IRON, r(), 0.3);
    t.dispose();
    chain(pb, ring, top.clone().add(V(sx * 0.4, 0, sz * 0.4)), 0.25);
  }
  // The padlock: a brass body on a hasp across the centre seam.
  const lockAt = at.clone().add(V(0, 0.16, 0.0));
  pb.box(at.clone().add(V(0, 0.07, 0)), V(0.16, 0.014, 0.05), new THREE.Quaternion(), IRON, 0.5, 0.004);
  pb.box(lockAt, V(0.09, 0.08, 0.04), new THREE.Quaternion(), BRASS, 0.5, 0.015);
  const shackle = new THREE.TorusGeometry(0.055, 0.012, 5, 12, Math.PI);
  pb.geometry(shackle, new THREE.Matrix4().makeTranslation(lockAt.x, lockAt.y + 0.07, lockAt.z), IRON, 0.5, 0.3);
  shackle.dispose();
  pb.box(lockAt.clone().add(V(0, -0.01, 0.042)), V(0.012, 0.022, 0.004), new THREE.Quaternion(), IRON, 0.5, 0.002);
  const planks = new THREE.Mesh(pb.build(), mats.prop);
  // The weak point's light: a warm keyhole glow on the padlock (shown only while the weak point is lit).
  const glow = new PropBuilder();
  glow.box(lockAt.clone().add(V(0, 0, 0.046)), V(0.06, 0.06, 0.004), new THREE.Quaternion(), { layer: 0, glow: 1 }, 0.5, 0.01);
  const padGlow = new THREE.Mesh(glow.build(), mats.glow);
  padGlow.visible = false;
  const group = new THREE.Group();
  group.add(planks, padGlow);
  return {
    group,
    planks,
    padGlow,
    weakBox: new THREE.Box3().setFromCenterAndSize(lockAt, V(0.36, 0.36, 0.36)),
    bodyBox: new THREE.Box3(at.clone().add(V(-S - 0.2, -0.2, -S - 0.2)), at.clone().add(V(S + 0.2, 0.3, S + 0.2))),
  };
}

// ----------------------------------------------------------------------------------------- the camp stations
/** The crew board: a timber frame on two posts with pinned tags and notes, a lamp on a bracket. */
function crewBoard(pb: PropBuilder, glow: PropBuilder, at: THREE.Vector3, yaw: number): void {
  const q = qY(yaw);
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(at);
  for (const sx of [-1, 1]) pb.box(L(sx * 0.75, 0.9, 0), V(0.05, 0.9, 0.05), q, OLD_WOOD, 0.3, 0.014);
  pb.box(L(0, 1.25, 0.02), V(0.8, 0.45, 0.025), q, WOOD, 0.5, 0.01);
  const r = rng(5);
  for (let i = 0; i < 7; i++) pb.box(L(-0.6 + (i % 4) * 0.38 + (r() - 0.5) * 0.06, 1.05 + Math.floor(i / 4) * 0.42 + (r() - 0.5) * 0.06, 0.05), V(0.12, 0.09, 0.004), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), (r() - 0.5) * 0.2)), { layer: LAYER.masonry, tint: TINT.chalk }, r(), 0.002);
  pb.box(L(0, 1.78, 0.02), V(0.86, 0.04, 0.06), q, OLD_WOOD, 0.4, 0.01);
  haldenLamp(pb, glow, L(0.9, 1.6, 0.1), yaw, false, 0.6);
}

/** The lantern maker's bench: a workbench with an anvil, three lanterns on hooks, a crate of glass. */
function lanternMaker(pb: PropBuilder, glow: PropBuilder, at: THREE.Vector3, yaw: number): void {
  const q = qY(yaw);
  const L = (x: number, y: number, z: number) => V(x, y, z).applyQuaternion(q).add(at);
  pb.box(L(0, 0.82, 0), V(0.8, 0.05, 0.35), q, WOOD, 0.3, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) pb.box(L(sx * 0.7, 0.4, sz * 0.27), V(0.04, 0.4, 0.04), q, OLD_WOOD, 0.5, 0.01);
  pb.box(L(-0.35, 0.95, 0), V(0.12, 0.08, 0.08), q, IRON, 0.4, 0.01);
  pb.box(L(0, 1.7, -0.3), V(0.9, 0.03, 0.03), q, OLD_WOOD, 0.4, 0.008);
  for (const x of [-0.5, 0, 0.5]) haldenLamp(pb, glow, L(x, 1.6, -0.3), yaw, false, x + 0.7);
  pb.box(L(0.45, 0.95, 0.05), V(0.14, 0.08, 0.12), q, GOLD, 0.6, 0.01);
}

// -------------------------------------------------------------------------------------------- the room wonders
function wonder(pb: PropBuilder, cb: CrystalBuilder, template: string, at: THREE.Vector3, biome: number): void {
  const r = rng(template.length * 31 + Math.round(at.x * 7));
  if (template === 'topsoil.copperLode' || template === 'topsoil.reliquary') {
    // A crystal crown high on a ledge (the Topsoil rose and amber crystals).
    cb.cluster(at, V(0.1, 1, 0.1), 9, 1.3, 0.6, (i) => (i % 3 === 0 ? 3 : 2), 41);
    return;
  }
  if (biome >= 1) {
    // A glowing root tangle (Glowroot): hanging glowroots and a few jade crystals in its heart.
    const anchors: Array<[THREE.Vector3, number]> = [];
    for (let i = 0; i < 9; i++) anchors.push([at.clone().add(V((r() - 0.5) * 3, 2.2 + r() * 0.5, (r() - 0.5) * 3)), 2 + r() * 2.2]);
    roots(pb, anchors, 91, GLOWROOT);
    cb.cluster(at.clone().add(V(0, -0.6, 0)), V(0, -1, 0), 6, 0.6, 0.6, 4, 43);
    return;
  }
  // A root chandelier under the earth vault (Topsoil): a knot of roots with amber root-knots and dripstone around it.
  const anchors: Array<[THREE.Vector3, number]> = [];
  for (let i = 0; i < 8; i++) anchors.push([at.clone().add(V((r() - 0.5) * 2.6, 1.2 + r() * 0.5, (r() - 0.5) * 2.6)), 1.4 + r() * 2.0]);
  roots(pb, anchors, 93, ROOT);
  for (let i = 0; i < 4; i++) {
    const p = at.clone().add(V((r() - 0.5) * 1.6, -0.4 - r() * 1.2, (r() - 0.5) * 1.6));
    pb.geometry(new THREE.DodecahedronGeometry(0.09 + r() * 0.06, 0), new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), AMBER_KNOT, r(), 0.3);
  }
  for (let i = 0; i < 3; i++) dripstone(pb, at.clone().add(V((r() - 0.5) * 3.5, 1.3, (r() - 0.5) * 3.5)), 0.8 + r() * 0.8, 0.12, false, 95 + i);
}

/** The set pieces of one node (and of the camp), as one group with the pick boxes the scene needs. */
export class SetPieces {
  readonly group = new THREE.Group();
  readonly sky: THREE.Mesh;
  private readonly nodes = new Map<number, { group: THREE.Group; hatch: HatchView | null; points: THREE.Mesh[] }>();
  private camp: { group: THREE.Group; stations: Array<{ id: string; box: THREE.Box3; centre: THREE.Vector3 }> } | null = null;
  private sealLeft = 1;

  constructor(private readonly mats: PropMaterials) {
    this.group.name = 'setPieces';
    this.sky = duskSky();
    this.group.add(this.sky);
  }

  /** Build (or rebuild) node i's set pieces from its placement. */
  build(p: NodePlacement): void {
    this.drop(p.node);
    const a = p.chamber.anchors ?? {};
    const g = new THREE.Group();
    const pb = new PropBuilder(), cb = new CrystalBuilder(), glow = new PropBuilder();
    if (a.wonder) wonder(pb, cb, p.chamber.template, v(a.wonder), p.biome);
    if (a.pool) {
      const shape = new THREE.Shape();
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        const rr = 1.8 + 0.4 * Math.sin(t * 3 + 1);
        if (i === 0) shape.moveTo(Math.cos(t) * rr, Math.sin(t) * rr);
        else shape.lineTo(Math.cos(t) * rr, Math.sin(t) * rr);
      }
      const sg = new THREE.ShapeGeometry(shape);
      sg.rotateX(-Math.PI / 2);
      pb.geometry(sg, new THREE.Matrix4().makeTranslation(a.pool.x, a.pool.y + 0.02, a.pool.z), WATER, 0.5, 1);
      sg.dispose();
    }
    if (a.leak) {
      // The green light leaking from below through floor cracks (the Cache's tease, SPEC §7).
      const r = rng(17);
      for (let i = 0; i < 7; i++) {
        const c = v(a.leak).add(V((r() - 0.5) * 2.4, 0.012, (r() - 0.5) * 2.4));
        glow.box(c, V(0.25 + r() * 0.35, 0.006, 0.012), qY(r() * Math.PI), { layer: 0, glow: 3 }, r(), 0.003);
      }
    }
    for (let j = 0; j < 3; j++) {
      const k = a[`knot${j}`];
      if (!k) continue;
      // A root knot: a tangle of root bark around an amber heart (dim: closed in W1).
      const anchors: Array<[THREE.Vector3, number]> = [];
      for (let i = 0; i < 4; i++) anchors.push([v(k).add(V((i - 1.5) * 0.25, 0.9, 0)), 1.6]);
      roots(pb, anchors, 101 + j, ROOT);
      pb.geometry(new THREE.DodecahedronGeometry(0.22, 1), new THREE.Matrix4().makeTranslation(k.x, k.y, k.z), AMBER_KNOT, 0.4 + j * 0.1, 0.5);
    }
    if (pb.vertexCount) g.add(new THREE.Mesh(pb.build(), this.mats.prop));
    if (cb.pos.length) g.add(new THREE.Mesh(cb.build(), this.mats.crystal));
    if (glow.vertexCount) g.add(new THREE.Mesh(glow.build(), this.mats.glow));
    let hv: HatchView | null = null;
    if (a.hatch) {
      hv = hatch(v(a.hatch), a.cage ? v(a.cage) : null, this.mats);
      g.add(hv.group);
    }
    const points: THREE.Mesh[] = [];
    if (a.otherLantern) {
      // The Other Lantern (SPEC §4.14): a warm point far below that is not yours.
      const pt = warmPoint(1.2, 0xffc078, 3.0);
      pt.position.copy(v(a.otherLantern));
      g.add(pt);
      points.push(pt);
    }
    for (const m of g.children) {
      m.matrixAutoUpdate = false;
      m.updateMatrix();
    }
    for (const pt of points) {
      pt.matrixAutoUpdate = true;
    }
    this.group.add(g);
    this.nodes.set(p.node, { group: g, hatch: hv, points });
  }

  drop(node: number): void {
    const n = this.nodes.get(node);
    if (!n) return;
    this.group.remove(n.group);
    n.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.nodes.delete(node);
  }

  /** The camp: its dressing is NodeDressing's; here the two stations (board, lantern maker) and their pick boxes. */
  buildCamp(c: CampPlacement): void {
    if (this.camp) {
      this.group.remove(this.camp.group);
      this.camp.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const pb = new PropBuilder(), glow = new PropBuilder();
    const stations: Array<{ id: string; box: THREE.Box3; centre: THREE.Vector3 }> = [];
    const adit = c.stations.find((s) => s.id === 'adit');
    for (const s of c.stations) {
      const at = v(s.feet);
      const face = adit ? Math.atan2(adit.feet.x - s.feet.x, adit.feet.z - s.feet.z) : s.yaw;
      // The prop stands 1.4 m beyond the station's feet, facing back toward it.
      if (s.id === 'board') {
        const p = at.clone().add(V(Math.sin(face + Math.PI) * 1.2, 0, Math.cos(face + Math.PI) * 1.2));
        crewBoard(pb, glow, p, face);
        stations.push({ id: `camp:${s.id}`, box: new THREE.Box3().setFromCenterAndSize(p.clone().add(V(0, 1.1, 0)), V(1.8, 2.2, 0.6)), centre: p.clone().add(V(0, 1.2, 0)) });
      } else if (s.id === 'lantern') {
        const p = at.clone().add(V(Math.sin(face + Math.PI) * 1.2, 0, Math.cos(face + Math.PI) * 1.2));
        lanternMaker(pb, glow, p, face);
        stations.push({ id: `camp:${s.id}`, box: new THREE.Box3().setFromCenterAndSize(p.clone().add(V(0, 1.0, 0)), V(1.8, 2.0, 0.9)), centre: p.clone().add(V(0, 1.0, 0)) });
      } else stations.push({ id: `camp:${s.id}`, box: new THREE.Box3().setFromCenterAndSize(at.clone().add(V(0, 1.5, 0)), V(3.2, 3.2, 1.2)), centre: at.clone().add(V(0, 1.5, 0)) });
    }
    const g = new THREE.Group();
    if (pb.vertexCount) g.add(new THREE.Mesh(pb.build(), this.mats.prop));
    if (glow.vertexCount) g.add(new THREE.Mesh(glow.build(), this.mats.glow));
    this.group.add(g);
    this.camp = { group: g, stations };
  }

  /** Camp stations as nav targets (the shell walks between them, then into the adit). */
  get stations(): ReadonlyArray<{ id: string; box: THREE.Box3; centre: THREE.Vector3 }> {
    return this.camp?.stations ?? [];
  }

  /** The seal's view: padlock lit while the weak point is; planks darken and sag as HP falls. */
  seal(left: number, weakLit: boolean): void {
    this.sealLeft = left;
    for (const n of this.nodes.values()) if (n.hatch) n.hatch.padGlow.visible = weakLit && left > 0;
  }

  /** The hatch splits: hide it (the FX's shards fall from where it was). Returns its centre for the burst. */
  breakSeal(): THREE.Vector3 | null {
    for (const n of this.nodes.values())
      if (n.hatch && n.hatch.group.visible) {
        n.hatch.group.visible = false;
        return n.hatch.bodyBox.getCenter(new THREE.Vector3());
      }
    return null;
  }

  /** Ray against the seal (the padlock first): 'weak' or 'body'. */
  raycastSeal(ray: THREE.Ray, maxT: number): { weak: boolean; t: number; point: THREE.Vector3 } | null {
    const hit = new THREE.Vector3();
    for (const n of this.nodes.values()) {
      if (!n.hatch || !n.hatch.group.visible) continue;
      if (ray.intersectBox(n.hatch.weakBox, hit) && hit.distanceTo(ray.origin) <= maxT) return { weak: true, t: hit.distanceTo(ray.origin), point: hit.clone() };
      if (ray.intersectBox(n.hatch.bodyBox, hit) && hit.distanceTo(ray.origin) <= maxT) return { weak: false, t: hit.distanceTo(ray.origin), point: hit.clone() };
    }
    return null;
  }

  /** Ray against the camp stations. */
  raycastStation(ray: THREE.Ray, maxT: number): { id: string; t: number; point: THREE.Vector3 } | null {
    const hit = new THREE.Vector3();
    let best: { id: string; t: number; point: THREE.Vector3 } | null = null;
    for (const s of this.stations) {
      if (!ray.intersectBox(s.box, hit)) continue;
      const t = hit.distanceTo(ray.origin);
      if (t <= maxT && (!best || t < best.t)) best = { id: s.id, t, point: hit.clone() };
    }
    return best;
  }

  /** The seal's weak point and body on screen (CSS px) for the hit test. */
  sealBoxes(): Array<{ id: string; weak: boolean; box: THREE.Box3 }> {
    const out: Array<{ id: string; weak: boolean; box: THREE.Box3 }> = [];
    for (const [i, n] of this.nodes) if (n.hatch && n.hatch.group.visible) out.push({ id: `seal:${i}:weak`, weak: true, box: n.hatch.weakBox }, { id: `seal:${i}:body`, weak: false, box: n.hatch.bodyBox });
    return out;
  }

  get hp(): number {
    return this.sealLeft;
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
