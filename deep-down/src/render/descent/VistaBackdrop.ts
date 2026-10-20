import * as THREE from 'three';
import { BIOME_LOOKS, type VistaLook } from '../../idle/config/biomeLooks';
import { baseBiome } from '../../idle/config/biomes';
import { LOOK_FOG_GLSL, lookShared } from '../look';
import type { QualityLevel } from '../Renderer';
import { CUT_Z } from './DescentCamera';
import { LightCones } from './LightCones';
import { setPieceWarmup } from './setPieces/kit';
import { SCENE_ENCODE } from '../lighting';

/**
 * Vista backdrops (SPEC §6.7, W2 seam 3; owner 2D). Where a Vista or a Reveal Hall opens its back wall, B's
 * caverns.ts calls `show({ id, biome, y0, y1, x0, x1 })` (depth rows y0 < y1 of the opening, storage x range)
 * and `hide(id)` when it leaves the window. Behind the opening this draws analytic silhouette layers at
 * z = 110, 190 and 320 m behind the cut (Battery 1, Balanced 2, High 3): a skyline per biome (roots, spires,
 * gears, caps, a drowned city, the forge...), the biome's mystery glow behind the far layer, lit points (windows,
 * photophores, stars), the Other Lantern far below, and 2-3 god-ray cones falling through the cavern.
 *
 * One quad per layer, drawn after the opaque pass with the depth test on, so it only fills pixels seen through
 * the opening (everything else is rock in front of it). Every layer uses one program; the preset changes the
 * layer count through visibility, never a define. Owned by DescentScene (`scene.vistas`): it adds `group`
 * to the scene and calls `update(dt)` every frame.
 */

export interface VistaSpec {
  /** Stable id (the cavern's). */
  id: string;
  /** Biome index (Echo strata: their base biome's backdrop). */
  biome: number;
  /**
   * The opening's vertical range: world y (DescentScene's VistaOpening: y0 the top, y1 the bottom, both ≤ 0,
   * y0 > y1), or depth rows (y0 the top row, y1 the bottom row, both ≥ 0, y0 < y1). Either form is accepted.
   */
  y0: number;
  y1: number;
  /** Storage x range of the opening (0..64). */
  x0: number;
  x1: number;
}

/** Layer depths behind the cut plane (m) and how much haze each takes (SPEC §6.7). */
export const VISTA_LAYERS: ReadonlyArray<{ z: number; haze: number }> = [
  { z: 320, haze: 0.55 },
  { z: 190, haze: 0.35 },
  { z: 110, haze: 0.2 },
];
export const LAYERS_FOR: Record<QualityLevel, number> = { battery: 1, balanced: 2, high: 3 };

const SHAPES: Record<VistaLook['shape'], number> = { hills: 0, roots: 1, spires: 2, gears: 3, caps: 4, city: 5, forge: 6, arcs: 7, icefall: 8, shelves: 9, columns: 10, sun: 11, islands: 12, gate: 13 };

const vertex = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
precision highp float;
${LOOK_FOG_GLSL}
uniform int uShape;
uniform int uLayer;      // 0 far, 1 mid, 2 near
uniform float uMerge;    // Battery: the far layer also draws the near silhouette
uniform float uHaze;
uniform float uOpen;
uniform float uSeed;
uniform vec3 uBase;      // x centre, y the opening's bottom, z the opening's height
uniform vec3 uFarCol;
uniform vec3 uNearCol;
uniform vec3 uGlowCol;
uniform vec3 uLightCol;
uniform float uSceneEncode;
in vec3 vWorld;
layout(location = 0) out highp vec4 fragColor;

float hh(float x) { return fract(sin(x * 127.1 + uSeed) * 43758.5453); }
float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hh(i), hh(i + 1.0), f); }
float fbm(float x) { return n1(x) * 0.55 + n1(x * 2.3 + 7.0) * 0.3 + n1(x * 5.1 + 3.0) * 0.15; }

// Inside (x) and lit points (y) of the biome's silhouette at q (metres from the base centre), for a layer k.
vec2 shape(vec2 q, float k) {
  float s = 1.0 + 0.35 * k;       // nearer layers are bigger
  float sx = q.x / s;
  float sy = q.y / s;
  float ground = 6.0 + 10.0 * fbm(sx * 0.02 + k * 3.1);
  float inside = step(sy, ground);
  float lit = 0.0;
  if (uShape == 0) {
    // Hills under a dusk-lit haze, a few camp lights on their crests.
    float hill = 22.0 + 26.0 * fbm(sx * 0.012 + k) + 7.0 * n1(sx * 0.05);
    inside = step(sy, hill);
    float c = floor(sx / 9.0);
    lit = step(0.72, hh(c + 3.0 * k)) * step(abs(sy - hill + 2.0), 1.4) * step(abs(fract(sx / 9.0) - 0.5), 0.13);
  } else if (uShape == 1) {
    // Root tangles hanging from the dark, glowing at their tips; mounds below.
    float c = floor(sx / 3.2);
    float fx = fract(sx / 3.2) - 0.5 + (n1(sy * 0.08 + c) - 0.5) * 0.5;
    float len = 30.0 + 80.0 * hh(c + 11.0 * k);
    float top = 150.0 - len;
    float w = 0.12 + 0.18 * smoothstep(top, 150.0, sy);
    float strand = step(abs(fx), w) * step(top, sy);
    inside = max(inside, strand);
    lit = strand * smoothstep(top + 6.0, top, sy);
  } else if (uShape == 2 || uShape == 8) {
    // Crystal spires (the Grotto) or ice pillars (Frost Hollow): tall facets catching the glow on one edge.
    float w = uShape == 2 ? 11.0 : 7.0;
    float c = floor(sx / w);
    float cx = (c + 0.5 + (hh(c + 5.0) - 0.5) * 0.4) * w;
    float h = 25.0 + 95.0 * hh(c + 2.0 * k + 1.0);
    float hw = w * (0.32 + 0.15 * hh(c + 9.0));
    float d = abs(sx - cx);
    float spire = step(d, hw * (1.0 - sy / h)) * step(0.0, sy);
    inside = max(inside, spire);
    lit = spire * step(hw * (1.0 - sy / h) - 0.5, d) * step(0.0, sx - cx);
    if (uShape == 8) lit = max(lit, step(abs(sx), 6.0) * step(0.5, fract(sx * 0.7 + sy * 0.02)) * step(sy, 140.0) * 0.6);
  } else if (uShape == 3) {
    // Giant gear wheels turning under the hoist tower (Halden, Iron Core).
    float c = floor(sx / 46.0);
    vec2 ctr = vec2((c + 0.5) * 46.0 + (hh(c) - 0.5) * 12.0, 30.0 + 40.0 * hh(c + 4.0 + k));
    float r = 12.0 + 12.0 * hh(c + 7.0);
    vec2 d = vec2(sx, sy) - ctr;
    float a = atan(d.y, d.x) + uLookTime * 0.05 * (mod(c, 2.0) * 2.0 - 1.0);
    float teeth = step(0.5, fract(a * 2.5));
    float rr = length(d);
    float rim = step(rr, r + teeth * 2.2) * step(r * 0.78, rr);
    float spokes = step(rr, r) * step(abs(sin(a * 3.0)), 0.12);
    float hub = step(rr, r * 0.22);
    inside = max(inside, max(rim, max(spokes, hub)));
    lit = hub * 0.8;
    float tower = step(abs(sx - 4.0), 3.0) * step(sy, 120.0);
    inside = max(inside, tower);
  } else if (uShape == 4) {
    // Mushroom caps on tall stems, their gills spotted with light.
    float c = floor(sx / 26.0);
    float cx = (c + 0.5) * 26.0 + (hh(c) - 0.5) * 10.0;
    float sh = 25.0 + 70.0 * hh(c + 3.0 + k);
    float cr = 9.0 + 12.0 * hh(c + 6.0);
    float stem = step(abs(sx - cx), 1.5 + 1.5 * hh(c + 1.0)) * step(sy, sh);
    vec2 cd = vec2((sx - cx) / cr, (sy - sh) / (cr * 0.45));
    float cap = step(length(cd), 1.0) * step(-0.25, cd.y);
    inside = max(inside, max(stem, cap));
    vec2 sp = vec2(sx, sy) * 0.6;
    lit = cap * step(0.82, hh(floor(sp.x) * 31.0 + floor(sp.y))) * step(length(fract(sp) - 0.5), 0.28);
  } else if (uShape == 5) {
    // A drowned city: stepped towers with lit windows.
    float c = floor(sx / 12.0);
    float h = 12.0 + 70.0 * hh(c + 4.0 * k) * (1.0 - 0.5 * smoothstep(60.0, 140.0, abs(sx)));
    float step2 = h - 8.0 * step(0.5, hh(c + 2.0)) * step(abs(fract(sx / 12.0) - 0.5), 0.25) * -1.0;
    float tower = step(sy, step2) * step(0.08, fract(sx / 12.0));
    inside = max(inside, tower);
    vec2 wq = vec2(sx / 2.0, sy / 3.0);
    lit = tower * step(0.72, hh(floor(wq.x) * 13.0 + floor(wq.y) * 7.0)) * step(abs(fract(wq.x) - 0.5), 0.22) * step(abs(fract(wq.y) - 0.5), 0.2) * step(sy, step2 - 2.0);
  } else if (uShape == 6) {
    // The Forge of the Bearers: a giant anvil and basalt towers over a river of lava, lava falls.
    vec2 a = vec2(sx, sy) - vec2(0.0, 22.0);
    float anvil = step(abs(a.x), 22.0 - 10.0 * step(a.y, 0.0)) * step(abs(a.y - 3.0), 8.0);
    anvil = max(anvil, step(abs(a.x), 6.0) * step(-22.0, a.y) * step(a.y, 0.0));
    float c = floor(sx / 7.0);
    float col = step(sy, 30.0 + 60.0 * hh(c + k)) * step(40.0, abs(sx)) * step(0.15, fract(sx / 7.0));
    inside = max(inside, max(anvil, col));
    float river = step(sy, 3.0 + sin(sx * 0.1 + uLookTime * 0.6) * 0.6);
    float fall = step(abs(fract(sx / 37.0) - 0.5), 0.03) * step(sy, 120.0) * step(30.0, abs(sx));
    lit = max(river, fall * (0.6 + 0.4 * sin(sy * 0.3 - uLookTime * 4.0)));
    inside = max(inside, river);
  } else if (uShape == 7) {
    // A leviathan's ribs arching over the hall.
    float best = 0.0;
    for (int i = 0; i < 4; i++) {
      float R = 40.0 + 22.0 * float(i);
      float d = abs(length(vec2(sx, sy + 10.0) - vec2(0.0, 0.0)) - R);
      best = max(best, step(d, 2.0 + float(i) * 0.4) * step(0.0, sy));
    }
    inside = max(inside, best);
    lit = best * step(0.93, hh(floor(sx * 0.5) + floor(sy * 0.5) * 9.0));
  } else if (uShape == 9) {
    // The Archive of Light: shelves of identical crystals receding to the horizon.
    float row = floor(sy / 7.0);
    float shelf = step(fract(sy / 7.0), 0.12) * step(sy, 140.0);
    float cry = step(abs(fract(sx / 2.4) - 0.5), 0.12) * step(0.15, fract(sy / 7.0)) * step(fract(sy / 7.0), 0.45) * step(sy, 140.0);
    inside = max(inside, shelf + cry * 0.0);
    lit = cry * (0.5 + 0.5 * hh(floor(sx / 2.4) + row * 17.0));
  } else if (uShape == 10) {
    // Colonnades: columns standing in water.
    float c = floor(sx / 9.0);
    float colm = step(abs(fract(sx / 9.0) - 0.5), 0.12) * step(sy, 40.0 + 30.0 * hh(c));
    inside = max(inside, colm);
    lit = colm * step(abs(sy - 30.0), 0.8);
  } else if (uShape == 11) {
    // The Buried Star: a sun among floating rocks.
    float d = length(vec2(sx, sy - 60.0));
    lit = smoothstep(26.0, 22.0, d) + exp(-max(d - 22.0, 0.0) * 0.05) * 0.6;
    float c = floor(sx / 18.0);
    vec2 rc = vec2((c + 0.5) * 18.0, 20.0 + 90.0 * hh(c + k));
    vec2 rd = (vec2(sx, sy) - rc) / vec2(6.0 + 4.0 * hh(c + 1.0), 3.0);
    float rock = step(length(rd), 1.0) * step(rd.y, 0.6);
    inside = max(inside * 0.0, rock);
  } else if (uShape == 12) {
    // Floating islands (inverted mounds) over an upward fall.
    float c = floor(sx / 24.0);
    vec2 ic = vec2((c + 0.5) * 24.0 + (hh(c) - 0.5) * 8.0, 30.0 + 90.0 * hh(c + 3.0 + k));
    float w = 7.0 + 6.0 * hh(c + 5.0);
    float dx = (sx - ic.x) / w;
    float isl = step(abs(dx), 1.0) * step(sy, ic.y) * step(ic.y - 14.0 * (1.0 - dx * dx), sy);
    inside = isl;
    lit = step(0.97, hh(floor(sx * 0.7) + floor(sy * 0.7) * 31.0)) * (1.0 - isl);
  } else {
    // The Last Gate: a vast arch with rune lights, open from the other side.
    float arch = step(abs(sx), 46.0) * step(sy, 130.0) * (1.0 - step(length(vec2(sx / 30.0, (sy - 40.0) / 70.0)), 1.0) * step(40.0, sy)) * (1.0 - step(abs(sx), 30.0) * step(sy, 40.0));
    inside = max(inside, arch);
    lit = arch * step(0.9, hh(floor(sx * 0.4) * 5.0 + floor(sy * 0.4))) * 0.8;
  }
  return vec2(clamp(inside, 0.0, 1.0), clamp(lit, 0.0, 1.0));
}

void main() {
  vec2 q = vec2(vWorld.x - uBase.x, vWorld.y - uBase.y);
  float k = float(uLayer);
  vec3 fog = mix(uLookFogLow, uLookFog, 0.6);
  vec3 col;
  float alpha;
  if (uLayer == 0) {
    // The far layer is opaque: a haze gradient lit from below by the biome's mystery glow.
    float up = clamp(q.y / 160.0, -0.5, 1.0);
    col = mix(fog * 1.2, fog * 0.4, clamp(up * 1.6, 0.0, 1.0));
    float gd = length(vec2(q.x / 50.0, (q.y - 12.0) / 30.0));
    // The mystery glow is a pool behind the hero, not a wash over the whole opening: the silhouettes read
    // against it and the haze around it stays dark.
    col += uGlowCol * (exp(-gd * gd * 3.0) * 0.6 + exp(-gd * gd * 0.6) * 0.06);
    // Dusk over the hills (Topsoil): ember at the horizon to violet above, the glow a narrow band on the crests.
    if (uShape == 0) {
      // Dusk over the hills (Topsoil): an ember band on the crests, rose, then violet and the deep blue above.
      vec3 sky = mix(vec3(0.3, 0.1, 0.05), vec3(0.18, 0.06, 0.09), smoothstep(0.12, 0.22, up));
      sky = mix(sky, vec3(0.05, 0.035, 0.11), smoothstep(0.2, 0.36, up));
      col = mix(sky, vec3(0.015, 0.015, 0.05), smoothstep(0.36, 0.7, up)) + uGlowCol * exp(-gd * gd * 6.0) * 0.12;
    }
    // The Other Lantern: a warm-violet point far below, always out of reach (SPEC §7.8).
    float ol = length(q - vec2(14.0, -30.0));
    col += vec3(1.0, 0.85, 1.0) * (exp(-ol * ol * 0.15) * (0.8 + 0.2 * sin(uLookTime * 2.1)));
    vec2 s0 = shape(q, 0.0);
    col = mix(col, mix(uFarCol, fog, uHaze), s0.x);
    col += uLightCol * s0.y * 0.7;
    if (uMerge > 0.5) {
      vec2 s2 = shape(q * 0.7 + vec2(13.0, 0.0), 2.0);
      col = mix(col, mix(uNearCol, fog, 0.2), s2.x);
      col += uLightCol * s2.y * 1.2;
    }
    alpha = 1.0;
  } else {
    vec2 s = shape(q + vec2(17.0 * k, 0.0), k);
    vec3 sil = mix(uLayer == 1 ? mix(uFarCol, uNearCol, 0.5) : uNearCol, fog, uHaze);
    // Silhouettes stay dark against the glow behind them (a 0.12 glow tint read as a flat tan or mint card
    // once exposed and encoded); only their lit points carry light.
    col = sil * 0.8 + uGlowCol * 0.015 + uLightCol * s.y * (0.9 + 0.4 * k);
    alpha = max(s.x, s.y);
  }
  col *= uOpen;
  fragColor = vec4(uSceneEncode > 0.5 ? sqrt(col / (1.0 + col)) : col, alpha * uOpen);
}
`;

interface Vista {
  spec: VistaSpec;
  layers: THREE.Mesh[];
  open: number;
  target: number;
}

export class VistaBackdrop {
  readonly group = new THREE.Group();
  readonly cones = new LightCones();
  private readonly vistas = new Map<string, Vista>();
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private layerCount = LAYERS_FOR.balanced;

  constructor(quality: QualityLevel = 'balanced') {
    this.group.name = 'vistas';
    this.group.add(this.cones.mesh);
    // Hidden warm-up objects, one per program (a layer, the cones above, a set piece), so the scene's
    // precompile() compiles them at load and the first Vista never compiles a shader (P3).
    const warm = this.makeLayer(0);
    warm.visible = false;
    warm.name = 'vista-warmup';
    const piece = setPieceWarmup();
    piece.visible = false;
    this.group.add(warm, piece);
    this.setQuality(quality);
  }

  /** Layers per preset (Battery 1, Balanced 2, High 3) and the cone cap; visibility only, no new program. */
  setQuality(level: QualityLevel): void {
    this.layerCount = LAYERS_FOR[level];
    this.cones.setQuality(level);
    for (const v of this.vistas.values()) this.applyLayers(v);
  }

  /** Open a backdrop behind an opening (idempotent per id: a second call updates its rect). */
  show(spec: VistaSpec): void {
    let v = this.vistas.get(spec.id);
    if (!v) {
      v = { spec, layers: [], open: 0, target: 1 };
      for (let i = 0; i < VISTA_LAYERS.length; i++) v.layers.push(this.makeLayer(i));
      for (const m of v.layers) this.group.add(m);
      this.vistas.set(spec.id, v);
    }
    v.spec = spec;
    v.target = 1;
    this.place(v);
    this.applyLayers(v);
  }

  /** Close a backdrop (it fades out, then frees its layers). */
  hide(id: string): void {
    const v = this.vistas.get(id);
    if (v) v.target = 0;
  }

  has(id: string): boolean {
    return this.vistas.has(id);
  }

  /** Backdrops currently open (fading ones included). */
  get count(): number {
    return this.vistas.size;
  }

  private lastTime = -1;

  /**
   * Per frame. `update(time, camera)` (DescentScene's VistaHost: the scene clock in seconds) or `update(dt)`
   * (a frame interval, for tools).
   */
  update(timeOrDt: number, camera?: THREE.Camera): void {
    let dt = timeOrDt;
    if (camera) {
      dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(0.25, timeOrDt - this.lastTime));
      this.lastTime = timeOrDt;
    }
    for (const [id, v] of this.vistas) {
      v.open += (v.target - v.open) * Math.min(1, dt / 0.35);
      if (v.target === 0 && v.open < 0.01) {
        for (const m of v.layers) {
          this.group.remove(m);
          (m.material as THREE.Material).dispose();
        }
        this.cones.set(id, []);
        this.vistas.delete(id);
        continue;
      }
      for (const m of v.layers) (m.material as THREE.ShaderMaterial).uniforms.uOpen.value = v.open;
    }
    this.cones.update();
  }

  private makeLayer(i: number): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        ...lookShared(),
        uShape: { value: 0 },
        uLayer: { value: i },
        uMerge: { value: 0 },
        uHaze: { value: VISTA_LAYERS[i].haze },
        uOpen: { value: 0 },
        uSeed: { value: 0 },
        uBase: { value: new THREE.Vector3() },
        uFarCol: { value: new THREE.Color() },
        uNearCol: { value: new THREE.Color() },
        uGlowCol: { value: new THREE.Color() },
        uLightCol: { value: new THREE.Color() },
        uSceneEncode: SCENE_ENCODE,
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: i > 0,
      depthWrite: false,
      depthTest: true,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.renderOrder = 5 - i;
    m.frustumCulled = false;
    m.name = `vista-layer-${i}`;
    return m;
  }

  private place(v: Vista): void {
    const s = v.spec;
    const look = BIOME_LOOKS[Math.min(BIOME_LOOKS.length - 1, baseBiome(s.biome))].vista;
    const cx = (s.x0 + s.x1) / 2;
    const world = s.y0 <= 0 && s.y1 <= 0;
    const topY = world ? Math.max(s.y0, s.y1) : -Math.min(s.y0, s.y1);
    const bottomY = world ? Math.min(s.y0, s.y1) : -Math.max(s.y0, s.y1) - 1;
    const height = Math.max(4, topY - bottomY);
    for (let i = 0; i < v.layers.length; i++) {
      const m = v.layers[i];
      const z = CUT_Z - VISTA_LAYERS[i].z;
      // Wide enough to fill any opening's view at that distance; tall from far below to far above.
      m.scale.set(900, 520, 1);
      m.position.set(cx, bottomY + 120, z);
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uShape.value = SHAPES[look.shape];
      u.uSeed.value = (s.biome * 7.13 + i * 1.7) % 10;
      u.uBase.value.set(cx, bottomY, height);
      u.uFarCol.value.set(look.far);
      u.uNearCol.value.set(look.near);
      u.uGlowCol.value.set(look.glow);
      u.uLightCol.value.set(look.lights);
    }
    // God rays: 2-3 cones from the opening's ceiling slanting through the cavern.
    const n = 2 + (s.biome % 2);
    const cones = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      cones.push({ x: s.x0 + (s.x1 - s.x0) * (0.25 + 0.5 * t), y: topY + 1, z: CUT_Z - 22 - 9 * i, dx: 0.35 - 0.7 * t, dy: -1, dz: 0.2, length: height * 1.25, radius: 3 + height * 0.3, color: look.rays, intensity: 0.12 });
    }
    this.cones.set(s.id, cones);
  }

  private applyLayers(v: Vista): void {
    const n = this.layerCount;
    // Battery: the far layer alone (it merges the near silhouette). Balanced: far + near. High: all three.
    const on = n === 1 ? [true, false, false] : n === 2 ? [true, false, true] : [true, true, true];
    v.layers.forEach((m, i) => {
      m.visible = on[i];
      (m.material as THREE.ShaderMaterial).uniforms.uMerge.value = n === 1 && i === 0 ? 1 : 0;
    });
  }

  dispose(): void {
    for (const id of [...this.vistas.keys()]) {
      const v = this.vistas.get(id)!;
      for (const m of v.layers) (m.material as THREE.Material).dispose();
    }
    this.vistas.clear();
    this.geo.dispose();
    this.cones.dispose();
  }
}
