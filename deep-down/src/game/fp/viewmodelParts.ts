import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The first-person tools' geometry: the pickaxe and the lantern by tier, built from bevelled
 * primitives into one non-indexed geometry per part with per-vertex material data.
 *
 * Attributes: position, normal, color (linear RGB), aMat (x: emission, >= 2 means the flame: its
 * strength follows the fuel; y: metalness; z: roughness).
 */

export interface Finish {
  color: number;
  metal?: number;
  rough?: number;
  emit?: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class PartBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly mat: number[] = [];
  private readonly c = new THREE.Color();

  /** Add a geometry under `m` with a finish (the geometry is disposed). */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, f: Finish, shade = 1): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.applyMatrix4(m);
    const p = geo.getAttribute('position');
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const n = geo.getAttribute('normal');
    this.c.setHex(f.color).multiplyScalar(shade);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.mat.push(f.emit ?? 0, f.metal ?? 0, f.rough ?? 0.6);
    }
    geo.dispose();
    return this;
  }

  /** A rounded box centred at `c` with half extents `h`, turned by `q`. */
  box(c: THREE.Vector3, h: THREE.Vector3, f: Finish, q = new THREE.Quaternion(), r = 0.004, shade = 1): this {
    const rr = Math.min(r, h.x * 0.9, h.y * 0.9, h.z * 0.9);
    const g = new RoundedBoxGeometry(h.x * 2, h.y * 2, h.z * 2, 2, rr);
    return this.add(g, new THREE.Matrix4().compose(c, q, V(1, 1, 1)), f, shade);
  }

  /** A tapered cylinder from a to b (radius ra at a, rb at b). */
  rod(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, f: Finish, sides = 10, shade = 1): this {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const g = new THREE.CylinderGeometry(rb, ra, len, sides, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    return this.add(g, new THREE.Matrix4().compose(mid, q, V(1, 1, 1)), f, shade);
  }

  /** A ring (torus) at c, its axis along `axis`. */
  ring(c: THREE.Vector3, radius: number, tube: number, axis: THREE.Vector3, f: Finish): this {
    const g = new THREE.TorusGeometry(radius, tube, 6, 18);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), axis.clone().normalize());
    return this.add(g, new THREE.Matrix4().compose(c, q, V(1, 1, 1)), f);
  }

  /**
   * A turned (lathe) form round the y axis through `c`: `profile` is [radius, y] from top to
   * bottom (relative to c); smooth round the axis, faceted where the profile turns sharply.
   */
  lathe(c: THREE.Vector3, profile: ReadonlyArray<readonly [number, number]>, f: Finish, segments = 20, shade = 1): this {
    const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y));
    // LatheGeometry sweeps bottom to top for outward normals.
    pts.reverse();
    const g = new THREE.LatheGeometry(pts, segments);
    return this.add(g, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), f, shade);
  }

  /** A sphere (or an ellipsoid with `s`) at c. */
  ball(c: THREE.Vector3, r: number, f: Finish, s = V(1, 1, 1), seg = 12): this {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.75)));
    return this.add(g, new THREE.Matrix4().compose(c, new THREE.Quaternion(), s), f);
  }

  /**
   * A forged bar: chamfered-rectangle sections (8 facets) swept along a spine, sharp between the
   * facets and smooth along the length, with flat end caps. Each ring: centre `c`, half extents
   * `hw` (along `side`) and `hh` (along the in-plane normal), chamfer `ch` (m). `finish(i)` is the
   * finish of the band from ring i to ring i + 1 (the caps take the end bands').
   */
  loft(rings: Array<{ c: THREE.Vector3; hw: number; hh: number; ch: number }>, side: THREE.Vector3, finish: (i: number) => Finish): this {
    const n = rings.length;
    if (n < 2) return this;
    const sideN = side.clone().normalize();
    // Section corners (8) per ring, in world (model) space.
    const corners: THREE.Vector3[][] = [];
    const tangents: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = rings[Math.max(0, i - 1)].c;
      const b = rings[Math.min(n - 1, i + 1)].c;
      const tng = new THREE.Vector3().subVectors(b, a).normalize();
      tangents.push(tng);
      const up = new THREE.Vector3().crossVectors(tng, sideN).normalize();
      const r = rings[i];
      const ch = Math.min(r.ch, r.hw * 0.95, r.hh * 0.95);
      const pts2: Array<[number, number]> = [
        [r.hw, r.hh - ch], [r.hw - ch, r.hh], [-(r.hw - ch), r.hh], [-r.hw, r.hh - ch],
        [-r.hw, -(r.hh - ch)], [-(r.hw - ch), -r.hh], [r.hw - ch, -r.hh], [r.hw, -(r.hh - ch)],
      ];
      corners.push(pts2.map(([x, y]) => r.c.clone().addScaledVector(sideN, x).addScaledVector(up, y)));
    }
    // Facet normals per band and strip; vertex normals average the two bands meeting at a ring.
    const faceN: THREE.Vector3[][] = [];
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (let i = 0; i < n - 1; i++) {
      const row: THREE.Vector3[] = [];
      const mid = new THREE.Vector3().addVectors(rings[i].c, rings[i + 1].c).multiplyScalar(0.5);
      for (let j = 0; j < 8; j++) {
        const A = corners[i][j], B = corners[i][(j + 1) % 8], C = corners[i + 1][(j + 1) % 8], D = corners[i + 1][j];
        const nn = new THREE.Vector3().crossVectors(e1.subVectors(C, A), e2.subVectors(D, B));
        if (nn.lengthSq() < 1e-14) nn.crossVectors(e1.subVectors(B, A), e2.subVectors(D, A));
        const centre = new THREE.Vector3().add(A).add(B).add(C).add(D).multiplyScalar(0.25);
        if (nn.dot(centre.sub(mid)) < 0) nn.negate();
        row.push(nn.normalize());
      }
      faceN.push(row);
    }
    const vn = (i: number, j: number) => {
      const v = new THREE.Vector3();
      if (i > 0) v.add(faceN[i - 1][j]);
      if (i < n - 1) v.add(faceN[i][j]);
      return v.normalize();
    };
    const tri = (pts: THREE.Vector3[], nrm: THREE.Vector3[], f: Finish) => {
      // Wind each triangle to face along its normal (the material draws front faces only).
      const cr = new THREE.Vector3().crossVectors(e1.subVectors(pts[1], pts[0]), e2.subVectors(pts[2], pts[0]));
      const order = cr.dot(nrm[0].clone().add(nrm[1]).add(nrm[2])) >= 0 ? [0, 1, 2] : [0, 2, 1];
      this.c.setHex(f.color);
      for (const k of order) {
        this.pos.push(pts[k].x, pts[k].y, pts[k].z);
        this.nrm.push(nrm[k].x, nrm[k].y, nrm[k].z);
        this.col.push(this.c.r, this.c.g, this.c.b);
        this.mat.push(f.emit ?? 0, f.metal ?? 0, f.rough ?? 0.6);
      }
    };
    for (let i = 0; i < n - 1; i++) {
      const f = finish(i);
      for (let j = 0; j < 8; j++) {
        const j1 = (j + 1) % 8;
        const A = corners[i][j], B = corners[i][j1], C = corners[i + 1][j1], D = corners[i + 1][j];
        const nA = vn(i, j), nC = vn(i + 1, j);
        tri([A, B, C], [nA, nA, nC], f);
        tri([A, C, D], [nA, nC, nC], f);
      }
    }
    // Flat caps at both ends.
    for (const [i, out, f] of [[0, tangents[0].clone().negate(), finish(0)], [n - 1, tangents[n - 1].clone(), finish(n - 2)]] as Array<[number, THREE.Vector3, Finish]>) {
      const c = rings[i].c;
      for (let j = 0; j < 8; j++) tri([c, corners[i][j], corners[i][(j + 1) % 8]], [out, out, out], f);
    }
    return this;
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// The pickaxe. Model space: the grip at the origin, the handle up +y, the pick point toward -z
// (away from the eye at rest), the adze toward +z.

interface PickStyle {
  head: Finish;
  headDark: Finish;
  edge: Finish | null;
  handle: Finish;
  wrap: Finish;
  band: Finish | null;
  /** Pick arm and adze lengths (m), head thickness. */
  point: number;
  adze: number;
  thick: number;
  collar: boolean;
  crystal: boolean;
}

const WOOD_OLD: Finish = { color: 0x6e5a46, rough: 0.85 };
const WOOD: Finish = { color: 0x8a6440, rough: 0.7 };
const WOOD_DARK: Finish = { color: 0x5a3e28, rough: 0.65 };
const LEATHER: Finish = { color: 0x3c2a1e, rough: 0.8 };
const BRASS: Finish = { color: 0xd2a15a, metal: 1, rough: 0.35 };
const IRON_DARK: Finish = { color: 0x3a3b40, metal: 0.8, rough: 0.5 };

function pickStyle(tier: number): PickStyle {
  if (tier <= 1)
    return {
      head: { color: 0x7d6a5a, metal: 0.45, rough: 0.75 },
      headDark: { color: 0x6b3a22, metal: 0.2, rough: 0.9 },
      edge: null,
      handle: WOOD_OLD,
      wrap: { color: 0x4a3a2c, rough: 0.9 },
      band: null,
      point: 0.15,
      adze: 0.085,
      thick: 0.02,
      collar: false,
      crystal: false,
    };
  if (tier === 2)
    return {
      head: { color: 0xd9864b, metal: 1, rough: 0.32 },
      headDark: { color: 0x9a5a30, metal: 1, rough: 0.45 },
      edge: { color: 0xf3b07a, metal: 1, rough: 0.22 },
      handle: WOOD,
      wrap: LEATHER,
      band: BRASS,
      point: 0.18,
      adze: 0.1,
      thick: 0.022,
      collar: false,
      crystal: false,
    };
  if (tier === 3)
    return {
      head: { color: 0x9aa3ad, metal: 1, rough: 0.3 },
      headDark: { color: 0x5d646d, metal: 1, rough: 0.42 },
      edge: { color: 0xdfe6ee, metal: 1, rough: 0.18 },
      handle: WOOD_DARK,
      wrap: LEATHER,
      band: IRON_DARK,
      point: 0.2,
      adze: 0.115,
      thick: 0.025,
      collar: true,
      crystal: false,
    };
  return {
    head: { color: 0x7fc8d4, metal: 0.85, rough: 0.25 },
    headDark: { color: 0x3c6f7c, metal: 0.9, rough: 0.35 },
    edge: { color: 0x8fe3ee, emit: 1.6, rough: 0.2 },
    handle: WOOD_DARK,
    wrap: { color: 0x2a3440, rough: 0.7 },
    band: BRASS,
    point: 0.215,
    adze: 0.12,
    thick: 0.025,
    collar: true,
    crystal: true,
  };
}

/** The pickaxe of `tier` (1 rusty, 2 copper, 3 iron, 4 glimmer). The head is at y ~ 0.44. */
export function buildPickaxe(tier: number): THREE.BufferGeometry {
  const s = pickStyle(tier);
  const b = new PartBuilder();
  const top = 0.44;
  // The haft in short lengths of slightly different tone: grain and wear without a texture.
  const shades = [1, 0.9, 1.04, 0.95, 1.07, 0.92, 1];
  for (let i = 0; i < shades.length; i++) {
    const y0 = -0.1 + ((top + 0.13) * i) / shades.length;
    const y1 = -0.1 + ((top + 0.13) * (i + 1)) / shades.length;
    const r = (y: number) => 0.0175 - 0.002 * ((y + 0.1) / (top + 0.13));
    b.rod(V(0, y0, 0), V(0, y1 + 0.001, 0), r(y0), r(y1), s.handle, 10, shades[i]);
  }
  // A grip wrap: leather bands near the bottom of the handle.
  for (let i = 0; i < 5; i++) b.rod(V(0, -0.06 + i * 0.026, 0), V(0, -0.044 + i * 0.026, 0), 0.0195, 0.0195, s.wrap, 10, i % 2 ? 0.85 : 1);
  if (s.band) for (let i = 0; i < 2; i++) b.rod(V(0, 0.28 + i * 0.03, 0), V(0, 0.29 + i * 0.03, 0), 0.0185, 0.0185, s.band, 10);
  // The head, forged in one piece: a chamfered bar from the pick point (-z) through the eye to
  // the adze blade (+z), both arms tapering and curving down toward the grip. The polished edge
  // finish (tiers 2+) takes the last fifth of each arm.
  const t = s.thick;
  const eye = t * 1.15;
  const rings: Array<{ c: THREE.Vector3; hw: number; hh: number; ch: number }> = [];
  const zones: Array<'tip' | 'body'> = [];
  const add = (z: number, hw: number, hh: number, tipBand: boolean) => {
    const d = Math.max(0, Math.abs(z) - eye);
    const y = top - 0.36 * d * d - 0.04 * d;
    rings.push({ c: V(0, y, z), hw, hh, ch: Math.min(hw, hh) * 0.32 });
    zones.push(tipBand ? 'tip' : 'body');
  };
  const SEG = 9;
  // The point: tapering in both directions to a short square point.
  for (let i = SEG; i >= 1; i--) {
    const f = i / SEG;
    const e = Math.pow(f, 0.85);
    add(-(eye + s.point * f), t * (0.95 - 0.83 * e), t * (1.22 - 1.08 * e), f > 0.8);
  }
  // Through the eye: a little fuller (the boss).
  add(-eye, t * 0.98, t * 1.28, false);
  add(0, t * 1.02, t * 1.32, false);
  add(eye, t * 0.98, t * 1.28, false);
  // The adze: thinning to a straight edge and flaring a little wider.
  for (let i = 1; i <= SEG; i++) {
    const f = i / SEG;
    add(eye + s.adze * f, t * (0.95 + 0.38 * f), t * (1.22 - 1.04 * Math.pow(f, 0.8)), f > 0.8);
  }
  const edge = s.edge ?? s.headDark;
  b.loft(rings, V(1, 0, 0), (i) => (zones[i] === 'tip' && zones[i + 1] === 'tip' ? edge : zones[i] === 'tip' || zones[i + 1] === 'tip' ? s.headDark : s.head));
  // The socket boss round the handle, proud of the arms, and a wedge of end grain on top.
  b.box(V(0, top, 0), V(t * 1.16, t * 1.42, eye * 0.92), s.headDark, undefined, t * 0.35);
  b.box(V(0, top + t * 1.42, 0), V(0.0125, 0.0025, 0.0125), s.handle, undefined, 0.002, 0.8);
  if (s.collar) b.box(V(0, top - t * 1.42 - 0.006, 0), V(t * 1.05, 0.006, t * 1.05), s.headDark, undefined, 0.003);
  if (s.crystal) {
    // A glimmer shard set in the side of the boss.
    const g = new THREE.OctahedronGeometry(0.012, 0);
    b.add(g, new THREE.Matrix4().compose(V(t * 1.18, top, 0), new THREE.Quaternion(), V(0.7, 1.5, 1)), { color: 0x8fe3ee, emit: 1.8, rough: 0.1 });
  }
  // The pommel cap.
  b.box(V(0, -0.105, 0), V(0.019, 0.008, 0.019), s.headDark, undefined, 0.005);
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// The lantern. Model space: hangs from the top of its bail at the origin; the body below (y < 0).
// A brass storm lantern: wire bail, domed and vented cap, six glass panes in a brass frame, a
// wire guard (copper and attuned), a turned oil fount with a wick key, the burner and its flame.

interface LanternStyle {
  /** The cap, the collars and the fount. */
  body: Finish;
  /** Rims, bands, the bail and the wick key. */
  trim: Finish;
  /** The frame posts and the guard wires. */
  frame: Finish;
  cage: boolean;
  rune: boolean;
  size: number;
  flame: number;
}

const TARNISHED_BRASS: Finish = { color: 0xa07a42, metal: 0.92, rough: 0.48 };
const DARK_BRONZE: Finish = { color: 0x6b5232, metal: 0.9, rough: 0.55 };

function lanternStyle(tier: number): LanternStyle {
  if (tier <= 1) return { body: TARNISHED_BRASS, trim: { color: 0xc09a58, metal: 1, rough: 0.38 }, frame: DARK_BRONZE, cage: false, rune: false, size: 0.94, flame: 0xffc070 };
  if (tier === 2) return { body: { color: 0xc8764a, metal: 1, rough: 0.3 }, trim: { color: 0xe0b468, metal: 1, rough: 0.26 }, frame: { color: 0xb8864e, metal: 1, rough: 0.34 }, cage: true, rune: false, size: 1, flame: 0xffc878 };
  return { body: { color: 0xe0b86c, metal: 1, rough: 0.22 }, trim: { color: 0xf2dcae, metal: 1, rough: 0.18 }, frame: { color: 0xc89a55, metal: 1, rough: 0.28 }, cage: true, rune: true, size: 1.06, flame: 0xfff0d0 };
}

export interface LanternGeometry {
  solid: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  /** The flame alone (its own material flickers it and shrinks it with the oil). */
  flame: THREE.BufferGeometry;
  /** The flame's centre in model space (the key light on the tools). */
  flameAt: THREE.Vector3;
  /** Where the flame stands on the wick (its scale origin). */
  flameBase: THREE.Vector3;
}

/** The lantern of `tier` (1 oil, 2 copper, 3 attuned). */
export function buildLantern(tier: number): LanternGeometry {
  const st = lanternStyle(tier);
  const k = st.size;
  const b = new PartBuilder();
  const glass = new PartBuilder();
  const P = (r: number, y: number) => [r * k, y * k] as const;
  const at = (x: number, y: number, z: number) => V(x * k, y * k, z * k);
  const SIDES = 6;
  // The bail: a wire arc over the top from lugs on the cap, a little flattened, with a wooden grip
  // in the middle where the fist closes.
  const bail = new THREE.TorusGeometry(0.047 * k, 0.0028 * k, 6, 24, Math.PI);
  b.add(bail, new THREE.Matrix4().compose(at(0, -0.049, 0), new THREE.Quaternion(), V(1, 1.02, 1)), st.trim);
  b.rod(at(-0.016, -0.0035, 0), at(0.016, -0.0035, 0), 0.0055 * k, 0.0055 * k, WOOD_DARK, 10);
  for (const s of [-1, 1]) {
    b.ring(at(s * 0.047, -0.052, 0), 0.0048 * k, 0.0018 * k, V(0, 0, 1), st.trim);
    b.box(at(s * 0.047, -0.06, 0), V(0.003 * k, 0.008 * k, 0.003 * k), st.body, undefined, 0.0012);
  }
  // The chimney and its vent: a little hat on a vented collar.
  b.lathe(at(0, -0.032, 0), [P(0.0, 0), P(0.009, -0.0015), P(0.016, -0.006), P(0.017, -0.0075), P(0.011, -0.009)], st.trim, 18);
  b.lathe(at(0, -0.041, 0), [P(0.0105, 0), P(0.0105, -0.008), P(0.013, -0.0095)], DARK_BRONZE, 18);
  // The domed cap: a smooth turned dome to a rolled rim.
  b.lathe(at(0, -0.05, 0), [P(0.013, 0), P(0.021, -0.004), P(0.033, -0.011), P(0.044, -0.02), P(0.051, -0.027), P(0.0545, -0.031), P(0.0545, -0.034), P(0.05, -0.036)], st.body, 28);
  b.lathe(at(0, -0.086, 0), [P(0.0535, 0), P(0.0535, -0.006), P(0.049, -0.0068)], st.trim, 28);
  // The glass: six flat panes in a brass frame.
  const top = -0.093;
  const bot = -0.184;
  const R = 0.0445;
  const hh = (top - bot) / 2;
  const cy = (top + bot) / 2;
  for (let i = 0; i < SIDES; i++) {
    const a0 = (i / SIDES) * Math.PI * 2;
    const a1 = ((i + 1) / SIDES) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    // The pane (single quad, both sides drawn by the glass material).
    const w = 2 * R * Math.sin(Math.PI / SIDES) * 0.97;
    const pane = new THREE.PlaneGeometry(w * k, hh * 2 * k);
    const apo = R * Math.cos(Math.PI / SIDES);
    glass.add(pane, new THREE.Matrix4().compose(at(Math.sin(am) * apo, cy, Math.cos(am) * apo), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), am), V(1, 1, 1)), { color: 0xffffff });
    // The corner post (bevelled).
    b.box(at(Math.sin(a0) * (R + 0.001), cy, Math.cos(a0) * (R + 0.001)), V(0.0032 * k, hh * k, 0.0032 * k), st.frame, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a0 + Math.PI / 4), 0.0012);
    if (st.cage) {
      // A guard wire bowed out over the middle of the pane.
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        const y = top - 0.004 - (top - bot - 0.008) * u;
        const r = apo + 0.0045 + 0.006 * Math.sin(Math.PI * u);
        pts.push(at(Math.sin(am) * r, y, Math.cos(am) * r));
      }
      for (let j = 0; j < 6; j++) b.rod(pts[j], pts[j + 1], 0.0014 * k, 0.0014 * k, st.frame, 6);
    }
  }
  if (st.cage) for (const y of [top - 0.026, bot + 0.026]) b.ring(at(0, y, 0), (R + 0.0085) * k, 0.0016 * k, V(0, 1, 0), st.trim);
  // The lower collar, the turned oil fount and its foot.
  b.lathe(at(0, bot, 0), [P(0.05, 0.0012), P(0.0525, -0.001), P(0.0525, -0.006), P(0.05, -0.0075)], st.trim, 28);
  b.lathe(at(0, bot - 0.0075, 0), [P(0.05, 0), P(0.0565, -0.006), P(0.0595, -0.014), P(0.0575, -0.024), P(0.051, -0.031), P(0.047, -0.033)], st.body, 28);
  b.lathe(at(0, bot - 0.04, 0), [P(0.047, 0), P(0.0515, -0.002), P(0.0515, -0.0065), P(0.046, -0.0075), P(0.0, -0.0075)], st.trim, 28);
  // The wick key on the side of the fount, and the filler cap opposite.
  b.rod(at(0.055, bot - 0.019, 0.0), at(0.067, bot - 0.019, 0.0), 0.0024 * k, 0.0024 * k, st.trim, 8);
  b.lathe(at(0.069, bot - 0.019, 0), [P(0.0, 0.0045), P(0.0065, 0.0035), P(0.0065, -0.0035), P(0.0, -0.0045)], st.trim, 12);
  b.lathe(at(-0.05, bot - 0.012, 0), [P(0.0, 0.004), P(0.0055, 0.0032), P(0.0055, -0.002)], DARK_BRONZE, 10);
  if (st.rune) {
    // The attuned lantern's rune band round the fount, and a lens of glimmer crowning the cap.
    b.ring(at(0, bot - 0.022, 0), 0.0595 * k, 0.0022 * k, V(0, 1, 0), { color: 0x8fe3ee, emit: 1.5, rough: 0.2 });
    b.add(new THREE.OctahedronGeometry(0.006 * k, 0), new THREE.Matrix4().compose(at(0, -0.0235, 0), new THREE.Quaternion(), V(1, 1.6, 1)), { color: 0x8fe3ee, emit: 1.8, rough: 0.1 });
  }
  // The burner inside the glass: a turned brass seat, the wick tube, a dark wick.
  b.lathe(at(0, bot + 0.001, 0), [P(0.0, 0.012), P(0.008, 0.0115), P(0.0115, 0.006), P(0.0175, 0.0005), P(0.0175, 0)], st.trim, 16);
  b.box(at(0, bot + 0.0145, 0), V(0.0045 * k, 0.0028 * k, 0.0016 * k), { color: 0x1c140e, rough: 0.9 }, undefined, 0.0008);
  // The flame: a teardrop standing on the wick (its strength and size follow the oil).
  const fb = new PartBuilder();
  const fg = new THREE.SphereGeometry(0.0085 * k, 14, 12);
  const fp = fg.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) / (0.0085 * k);
    const s = y > 0 ? 1 - 0.8 * y * y : 1;
    fp.setXYZ(i, fp.getX(i) * s, fp.getY(i) * (y > 0 ? 2.6 : 1.05), fp.getZ(i) * s);
  }
  fg.computeVertexNormals();
  const baseY = (bot + 0.017) * k;
  fb.add(fg, new THREE.Matrix4().makeTranslation(0, baseY + 0.0085 * k, 0), { color: st.flame, emit: 3 });
  return { solid: b.build(), glass: glass.build(), flame: fb.build(), flameAt: V(0, baseY + 0.016 * k, 0), flameBase: V(0, baseY, 0) };
}

/**
 * A gloved fist closed round a rod along local y through the origin (the pick's grip, the
 * lantern's bail): tan leather fingers wrapping the rod with a row of knuckles on the outside (+x),
 * the thumb over the top, the back of the hand toward the wrist (-x).
 */
export function buildGlove(): THREE.BufferGeometry {
  const b = new PartBuilder();
  const glove: Finish = { color: 0xa8784c, rough: 0.7 };
  const seam: Finish = { color: 0x6a4a32, rough: 0.8 };
  // The wrapped fingers: a short sleeve of leather round the rod, a little flattened.
  b.add(new THREE.CylinderGeometry(0.026, 0.026, 0.054, 14, 1, false), new THREE.Matrix4().makeScale(1.1, 1, 0.94), glove);
  // Four fingers, each a rounded ridge round the rod, with the knuckles standing out on the outside.
  for (let i = 0; i < 4; i++) {
    const y = -0.02 + i * 0.0135;
    b.box(V(0.024, y, -0.003), V(0.0085, 0.0058, 0.013), i % 2 ? seam : glove, undefined, 0.0052, i % 2 ? 1 : 1.08);
    b.box(V(0.004, y, -0.024), V(0.017, 0.0055, 0.006), glove, undefined, 0.0045, 0.94);
  }
  // The back of the hand toward the wrist and the thumb across the top of the fingers.
  b.box(V(-0.02, 0.001, 0.006), V(0.019, 0.025, 0.021), glove, undefined, 0.011, 1.04);
  b.box(V(0.006, 0.031, -0.014), V(0.017, 0.0075, 0.0085), glove, new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.35), 0.0065, 1.1);
  // A stitched seam over the back of the hand.
  b.box(V(-0.02, 0.001, 0.027), V(0.012, 0.0018, 0.0012), seam, undefined, 0.0008);
  return b.build();
}

/**
 * A forearm: a unit length along +y (scaled to fit wrist to elbow; x and z in the glove's scale),
 * from the wrist at y = 0. A long flared leather gauntlet with a stitched seam and a brass-buckled
 * strap takes most of what shows, then the turned-back cuff of a waxed canvas coat with a fold or
 * two, so the arm reads as clothing, never as a pipe.
 */
export function buildSleeve(): THREE.BufferGeometry {
  const b = new PartBuilder();
  const leather: Finish = { color: 0x6a4428, rough: 0.62 };
  const leatherDark: Finish = { color: 0x4a2e1c, rough: 0.7 };
  const brass: Finish = { color: 0xd8a860, metal: 1, rough: 0.3 };
  const coat: Finish = { color: 0x4a4436, rough: 0.9 };
  const coatLight: Finish = { color: 0x5c5444, rough: 0.88 };
  // The gauntlet: flaring from the wrist, in two tones of leather with a seam ridge along it.
  b.lathe(V(0, 0, 0), [[0.026, 0.0], [0.027, -0.03], [0.031, -0.07], [0.036, -0.11], [0.041, -0.15], [0.0435, -0.17]].map(([r, y]) => [r, -y] as const).reverse(), leather, 16);
  b.rod(V(0.0, 0.004, 0.026), V(0.0, 0.165, 0.042), 0.0028, 0.0034, leatherDark, 6);
  // The strap and its buckle round the gauntlet.
  b.rod(V(0, 0.095, 0), V(0, 0.112, 0), 0.0355, 0.0365, leatherDark, 16);
  b.box(V(0.036, 0.1035, 0), V(0.004, 0.011, 0.009), brass, undefined, 0.002);
  // The coat's turned-back cuff, then the sleeve with two soft folds.
  b.lathe(V(0, 0, 0), [[0.05, 0.2], [0.051, 0.185], [0.049, 0.165], [0.045, 0.16]].reverse().map(([r, y]) => [r, y] as const), coatLight, 16);
  b.rod(V(0, 0.2, 0), V(0, 0.34, 0), 0.047, 0.049, coat, 16);
  b.rod(V(0, 0.34, 0), V(0, 0.37, 0), 0.051, 0.051, coatLight, 16);
  b.rod(V(0, 0.37, 0), V(0, 0.6, 0), 0.05, 0.053, coat, 16);
  b.rod(V(0, 0.6, 0), V(0, 0.63, 0), 0.055, 0.055, coatLight, 16);
  b.rod(V(0, 0.63, 0), V(0, 1, 0), 0.054, 0.058, coat, 16);
  return b.build();
}

// ---------------------------------------------------------------------------------------------
// The weapons (round 2). Model space as the pickaxe's: the grip at the origin, the tool up +y,
// its edge or point toward -z (away from the eye at rest). Each returns the geometry and the length
// from the grip to its "head" (where the rest pose places it, like the pick's head at 0.44).

export type WeaponModelId = 'machete' | 'spear' | 'sling' | 'flash';

export interface WeaponGeometry {
  geo: THREE.BufferGeometry;
  /** The glowing load a ranged tool releases (the sling's shard, the flash's bulb), hidden on release. */
  load: THREE.BufferGeometry | null;
  /** Grip to the head along +y (m, model space). */
  head: number;
}

const STEEL: Finish = { color: 0xaab1ba, metal: 0.7, rough: 0.34 };
const STEEL_DARK: Finish = { color: 0x5d636c, metal: 0.75, rough: 0.45 };
const STEEL_EDGE: Finish = { color: 0xe4ebf2, metal: 1, rough: 0.12 };
const BRASS_W: Finish = { color: 0xd2a15a, metal: 1, rough: 0.3 };
const GLIMMER: Finish = { color: 0x9b7cf0, emit: 1.35, metal: 0.2, rough: 0.12 };
const GLIMMER_CORE: Finish = { color: 0xd7c8ff, emit: 2.2, rough: 0.1 };

/** The Iron Machete: a wrapped grip, a brass guard and a broad, slightly curved blade with a bright edge. */
function buildMachete(): WeaponGeometry {
  const b = new PartBuilder();
  // The grip: dark wood scales under a leather wrap, a brass pommel.
  b.rod(V(0, -0.09, 0), V(0, 0.07, 0), 0.0165, 0.0175, WOOD_DARK, 10);
  for (let i = 0; i < 6; i++) b.rod(V(0, -0.07 + i * 0.024, 0), V(0, -0.058 + i * 0.024, 0), 0.0188, 0.0188, LEATHER, 10, i % 2 ? 0.85 : 1);
  b.lathe(V(0, -0.09, 0), [[0.017, 0], [0.021, -0.006], [0.016, -0.014], [0.0, -0.016]], BRASS_W, 12);
  // The guard: a short brass crossbar with rounded ends.
  b.box(V(0, 0.078, 0), V(0.012, 0.008, 0.034), BRASS_W, undefined, 0.005);
  // The blade: thin (x), broad (z), sweeping a little toward the edge (-z) and widening to a
  // clipped point. Body steel, the last band of each section the polished edge.
  const rings: Array<{ c: THREE.Vector3; hw: number; hh: number; ch: number }> = [];
  const N = 12;
  const len = 0.42;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const y = 0.086 + len * u;
    const width = (0.017 + 0.014 * Math.sin(Math.PI * Math.min(1, u * 1.1))) * (u > 0.88 ? Math.max(0.12, 1 - (u - 0.88) / 0.12) : 1);
    const curve = -0.012 * u * u;
    rings.push({ c: V(0, y, curve - width * 0.15), hw: 0.0032 * (1 - 0.5 * u), hh: width, ch: 0.0028 });
  }
  b.loft(rings, V(1, 0, 0), (i) => (i >= N - 1 ? STEEL_EDGE : STEEL));
  // The bright edge along the cutting side, and the dark spine on the back.
  for (let i = 0; i < N - 1; i++) {
    const a = rings[i];
    const c = rings[i + 1];
    b.rod(V(0, a.c.y, a.c.z - a.hh + 0.0012), V(0, c.c.y, c.c.z - c.hh + 0.0012), 0.0016, 0.0016, STEEL_EDGE, 5);
    b.rod(V(0, a.c.y, a.c.z + a.hh - 0.001), V(0, c.c.y, c.c.z + c.hh - 0.001), 0.0022, 0.0022, STEEL_DARK, 5);
  }
  return { geo: b.build(), load: null, head: 0.36 };
}

/** The Glimmer Spear: a long dark shaft with brass bands and a faceted glimmer head that glows. */
function buildSpear(): WeaponGeometry {
  const b = new PartBuilder();
  const top = 0.62;
  b.rod(V(0, -0.13, 0), V(0, top, 0), 0.019, 0.016, WOOD_DARK, 12);
  b.lathe(V(0, -0.13, 0), [[0.019, 0], [0.022, -0.008], [0.0, -0.014]], BRASS_W, 12);
  for (const y of [0.1, 0.34]) b.rod(V(0, y, 0), V(0, y + 0.012, 0), 0.0205, 0.0205, BRASS_W, 12);
  for (let i = 0; i < 5; i++) b.rod(V(0, -0.05 + i * 0.026, 0), V(0, -0.038 + i * 0.026, 0), 0.0175, 0.0175, LEATHER, 10, i % 2 ? 0.85 : 1);
  // The socket and the binding.
  b.lathe(V(0, top + 0.056, 0), [[0.008, 0], [0.015, -0.014], [0.021, -0.046], [0.019, -0.058]], BRASS_W, 14);
  // The head: an elongated faceted crystal with a brighter core.
  const head = new THREE.OctahedronGeometry(0.042, 0);
  b.add(head, new THREE.Matrix4().compose(V(0, top + 0.152, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 4), V(0.75, 2.6, 0.42)), GLIMMER);
  b.add(new THREE.OctahedronGeometry(0.017, 0), new THREE.Matrix4().compose(V(0, top + 0.14, 0), new THREE.Quaternion(), V(0.8, 3.2, 0.8)), GLIMMER_CORE);
  // Two side shards at the socket (a barbed head).
  for (const s of [-1, 1]) b.add(new THREE.OctahedronGeometry(0.01, 0), new THREE.Matrix4().compose(V(0, top + 0.07, s * 0.022), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), s * 0.6), V(0.6, 2.2, 0.7)), GLIMMER);
  return { geo: b.build(), load: null, head: 0.66 };
}

/** The Flare Sling: a brass-capped wooden fork, a leather band and a light shard in its pouch. */
function buildSling(): WeaponGeometry {
  const b = new PartBuilder();
  b.rod(V(0, -0.08, 0), V(0, 0.06, 0), 0.0155, 0.0165, WOOD, 10);
  for (let i = 0; i < 4; i++) b.rod(V(0, -0.06 + i * 0.026, 0), V(0, -0.048 + i * 0.026, 0), 0.0178, 0.0178, LEATHER, 10, i % 2 ? 0.85 : 1);
  // The fork: two arms up and out (in the x-y plane, across the view).
  const fork = V(0, 0.07, 0);
  for (const s of [-1, 1]) {
    const tip = V(s * 0.045, 0.16, -0.004);
    const mid = V(s * 0.03, 0.115, -0.002);
    b.rod(fork, mid, 0.0128, 0.011, WOOD, 9);
    b.rod(mid, tip, 0.011, 0.0095, WOOD, 9);
    b.lathe(tip.clone().add(V(0, 0.006, 0)), [[0.0, 0.004], [0.011, 0.0], [0.011, -0.012], [0.0095, -0.014]], BRASS_W, 10);
    // The band from the tip back toward the eye, to the pouch.
    b.rod(tip.clone().add(V(0, 0.002, 0)), V(s * 0.012, 0.15, 0.05), 0.0026, 0.0026, { color: 0x6a4a2e, rough: 0.75 }, 6);
  }
  b.box(V(0, 0.15, 0.056), V(0.016, 0.009, 0.008), LEATHER, undefined, 0.004);
  const load = new PartBuilder();
  load.add(new THREE.OctahedronGeometry(0.009, 0), new THREE.Matrix4().compose(V(0, 0.152, 0.05), new THREE.Quaternion(), V(1, 1.5, 1)), { color: 0xfff1c4, emit: 2.4, rough: 0.1 });
  return { geo: b.build(), load: load.build(), head: 0.16 };
}

/** A Flash Charge in the hand: a glass bulb with a brass cap and a bright core (thrown on use). */
function buildFlash(): WeaponGeometry {
  const b = new PartBuilder();
  b.lathe(V(0, 0.07, 0), [[0.0, 0.012], [0.009, 0.01], [0.014, 0.004], [0.014, -0.006], [0.011, -0.01]], BRASS_W, 14);
  b.ring(V(0, 0.084, 0), 0.006, 0.0018, V(1, 0, 0), BRASS_W);
  const load = new PartBuilder();
  load.ball(V(0, 0.035, 0), 0.026, { color: 0xc8a878, emit: 0.18, metal: 0.3, rough: 0.05 }, V(1, 1.15, 1), 16);
  load.ball(V(0, 0.035, 0), 0.011, { color: 0xfff0c8, emit: 1.5, rough: 0.1 }, V(1, 1.2, 1), 10);
  return { geo: b.build(), load: load.build(), head: 0.06 };
}

/** The first-person model of a weapon. */
export function buildWeapon(id: WeaponModelId): WeaponGeometry {
  if (id === 'machete') return buildMachete();
  if (id === 'spear') return buildSpear();
  if (id === 'sling') return buildSling();
  return buildFlash();
}
