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
// The lantern. Model space: hangs from its bail ring at the origin; the body below (y < 0).

interface LanternStyle {
  frame: Finish;
  trim: Finish;
  size: number;
  rune: boolean;
}

function lanternStyle(tier: number): LanternStyle {
  if (tier <= 1) return { frame: { color: 0x45454b, metal: 0.8, rough: 0.55 }, trim: { color: 0x6c6c72, metal: 0.9, rough: 0.4 }, size: 0.9, rune: false };
  if (tier === 2) return { frame: { color: 0xc77a45, metal: 1, rough: 0.35 }, trim: BRASS, size: 1, rune: false };
  return { frame: { color: 0xc89a55, metal: 1, rough: 0.3 }, trim: { color: 0xe8c27e, metal: 1, rough: 0.22 }, size: 1.06, rune: true };
}

export interface LanternGeometry {
  solid: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  /** The flame's centre in model space. */
  flame: THREE.Vector3;
}

/** The lantern of `tier` (1 oil, 2 copper, 3 attuned). */
export function buildLantern(tier: number): LanternGeometry {
  const st = lanternStyle(tier);
  const k = st.size;
  const b = new PartBuilder();
  const glass = new PartBuilder();
  const sides = 6;
  const rot = new THREE.Matrix4().makeRotationY(Math.PI / sides);
  const cyl = (rt: number, rb: number, h: number, y: number, f: Finish, into: PartBuilder = b, open = false) => {
    const g = new THREE.CylinderGeometry(rt * k, rb * k, h * k, sides, 1, open);
    into.add(g, new THREE.Matrix4().makeTranslation(0, y * k, 0).multiply(rot), f);
  };
  // The bail (a half ring) and the top: cap, chimney, vent.
  b.ring(V(0, -0.012 * k, 0), 0.03 * k, 0.003 * k, V(0, 0, 1), st.frame);
  cyl(0.012, 0.014, 0.014, -0.045, st.frame);
  cyl(0.018, 0.018, 0.005, -0.053, st.trim);
  cyl(0.016, 0.05, 0.032, -0.072, st.frame);
  cyl(0.05, 0.05, 0.007, -0.09, st.trim);
  // The glass, lit from inside.
  cyl(0.04, 0.04, 0.09, -0.139, { color: 0xffffff }, glass, true);
  // Corner posts on every other corner.
  for (let i = 0; i < sides; i += 2) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    b.box(V(Math.cos(a) * 0.043 * k, -0.139 * k, Math.sin(a) * 0.043 * k), V(0.004 * k, 0.047 * k, 0.004 * k), st.frame, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -a), 0.0015);
  }
  // A cage on the copper and attuned lanterns: two hoops round the glass.
  if (tier >= 2) for (const y of [-0.118, -0.16]) b.ring(V(0, y * k, 0), 0.044 * k, 0.0022 * k, V(0, 1, 0), st.trim);
  // The base, the fount and its burner.
  cyl(0.05, 0.05, 0.007, -0.187, st.trim);
  cyl(0.048, 0.056, 0.022, -0.202, st.frame);
  cyl(0.056, 0.05, 0.006, -0.216, st.trim);
  cyl(0.012, 0.016, 0.012, -0.176, st.trim);
  if (st.rune) b.ring(V(0, -0.202 * k, 0), 0.057 * k, 0.0025 * k, V(0, 1, 0), { color: 0x8fe3ee, emit: 1.4, rough: 0.2 });
  // The flame: a teardrop (emission follows the fuel).
  const fg = new THREE.SphereGeometry(0.0095 * k, 12, 10);
  const fp = fg.getAttribute('position');
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) / (0.0095 * k);
    const s = y > 0 ? 1 - 0.75 * y * y : 1;
    fp.setXYZ(i, fp.getX(i) * s, fp.getY(i) * (y > 0 ? 2.4 : 1.1), fp.getZ(i) * s);
  }
  fg.computeVertexNormals();
  const flameY = -0.152 * k;
  b.add(fg, new THREE.Matrix4().makeTranslation(0, flameY, 0), { color: tier >= 3 ? 0xfff0d0 : 0xffc070, emit: 2 + 1 });
  return { solid: b.build(), glass: glass.build(), flame: V(0, flameY + 0.008 * k, 0) };
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
 * from the wrist at y = 0. A flared leather gauntlet cuff with a brass band, then the coat sleeve
 * in cool dark wool with a turned-back cuff, so the arm reads as glove, cuff and sleeve.
 */
export function buildSleeve(): THREE.BufferGeometry {
  const b = new PartBuilder();
  const gauntlet: Finish = { color: 0x3e2a1e, rough: 0.8 };
  const band: Finish = { color: 0xd8a860, metal: 1, rough: 0.32 };
  const coat: Finish = { color: 0x34404f, rough: 0.92 };
  const turn: Finish = { color: 0x4a5869, rough: 0.9 };
  b.rod(V(0, -0.01, 0), V(0, 0.085, 0), 0.025, 0.037, gauntlet, 14);
  b.rod(V(0, 0.07, 0), V(0, 0.09, 0), 0.0385, 0.0385, band, 14);
  b.rod(V(0, 0.09, 0), V(0, 0.14, 0), 0.046, 0.047, turn, 14);
  b.rod(V(0, 0.135, 0), V(0, 1, 0), 0.043, 0.056, coat, 14);
  return b.build();
}
