import * as THREE from 'three';
import type { PropSpec } from '../props/types';
import { CUT_Z, SHAFT_CX } from './DescentCamera';

/**
 * The surface (SPEC §6.8): open sky above y = 0 (a dusk gradient with stars and a sun glow), a hills card
 * far behind, the Halden camp around the shaft mouth, and a cool daylight cone falling down the shaft that
 * fades over 30 m. Drawn only where nothing else is (the sky sits behind every surface).
 */
export class SurfaceSky {
  readonly group = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly hills: THREE.Mesh;
  private readonly cone: THREE.Mesh;
  private readonly coneMat: THREE.ShaderMaterial;

  constructor() {
    this.group.name = 'surfaceSky';
    // The dusk sky (LOOK.md key frame 0, store screenshot 1; CRITIQUE B SHOULD 15): an ember horizon through
    // rose and violet to a deep blue zenith, the sun just under the hills on the right, a thin moon high on the
    // left, stars by magnitude (denser and brighter toward the zenith, a faint river of them), and two far ridge
    // layers in aerial perspective, the further one rimmed by the afterglow. One draw.
    const skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        out vec3 vP;
        void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec3 vP;
        uniform float uTime;
        layout(location = 0) out highp vec4 fragColor;
        float h(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float n1(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(vec2(i, 1.7)), h(vec2(i + 1.0, 1.7)), f); }
        float ridge(float x, float s) { return n1(x * 0.012 + s) * 0.6 + n1(x * 0.031 + s * 3.0) * 0.28 + n1(x * 0.09 + s * 7.0) * 0.12; }
        void main() {
          float t = clamp(vP.y / 150.0, 0.0, 1.0);
          vec3 ember = vec3(1.0, 0.36, 0.12);
          vec3 rose = vec3(0.62, 0.2, 0.26);
          vec3 violet = vec3(0.16, 0.08, 0.22);
          vec3 zen = vec3(0.012, 0.022, 0.07);
          vec3 c = mix(ember, rose, smoothstep(0.0, 0.1, t));
          c = mix(c, violet, smoothstep(0.06, 0.3, t));
          c = mix(c, zen, smoothstep(0.22, 0.8, t));
          // The afterglow: the sun is just below the hills on the right.
          vec2 sp = vec2(170.0, -6.0);
          float d = length((vP.xy - sp) * vec2(0.6, 1.0)) / 120.0;
          c += vec3(1.0, 0.5, 0.2) * exp(-d * d * 7.0) * 1.3 + vec3(1.0, 0.75, 0.45) * exp(-d * d * 60.0) * 1.2;
          // A thin moon high on the left, with a halo.
          vec2 mp = vec2(-90.0, 205.0);
          float md = length(vP.xy - mp);
          float disc = smoothstep(7.2, 6.6, md) * (1.0 - smoothstep(5.6, 6.4, length(vP.xy - mp - vec2(2.6, 1.4))));
          c += vec3(1.0, 0.95, 0.85) * disc * 2.2 + vec3(0.5, 0.6, 0.9) * exp(-md * 0.05) * 0.08;
          // Stars by magnitude, with a slow twinkle, densest toward the zenith; a faint river of them.
          vec2 cell = floor(vP.xy * 0.42);
          float r = h(cell);
          float band = exp(-pow((vP.y - 150.0 - (vP.x + 40.0) * 0.45) / 38.0, 2.0));
          float dens = smoothstep(0.12, 0.7, t) * (0.012 + 0.03 * band);
          float star = step(1.0 - dens, r);
          vec2 sub = fract(vP.xy * 0.42) - vec2(h(cell + 3.1), h(cell + 7.3)) * 0.6 - 0.2;
          float mag = pow(h(cell + 11.0), 3.0);
          float core = smoothstep(0.16 + 0.12 * mag, 0.0, length(sub));
          float tw = 0.65 + 0.35 * sin(uTime * (1.3 + 2.0 * h(cell + 5.0)) + r * 40.0);
          c += mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), h(cell + 9.0)) * star * core * (0.5 + 2.2 * mag) * tw;
          c += vec3(0.08, 0.08, 0.14) * band * smoothstep(0.3, 0.8, t) * 0.5;
          // Two far ridges in aerial perspective: the further one is paler, the nearer darker; both rimmed.
          float r1 = 26.0 + 40.0 * ridge(vP.x, 2.0);
          float r2 = 8.0 + 26.0 * ridge(vP.x + 300.0, 5.0);
          vec3 haze = mix(rose, violet, 0.55) * 0.55;
          if (vP.y < r1) {
            float rim = smoothstep(r1 - 1.2, r1, vP.y) * exp(-pow((vP.x - 170.0) / 260.0, 2.0));
            c = mix(c, haze, 0.85) + vec3(1.0, 0.45, 0.2) * rim * 0.5;
          }
          if (vP.y < r2) {
            float rim = smoothstep(r2 - 0.9, r2, vP.y) * exp(-pow((vP.x - 170.0) / 200.0, 2.0));
            c = mix(c, vec3(0.06, 0.035, 0.07), 0.9) + vec3(1.0, 0.4, 0.18) * rim * 0.35;
            // A far Halden town: a scatter of warm windows on the near ridge.
            vec2 wc = floor(vec2(vP.x * 0.5, vP.y * 0.7));
            float town = step(0.985, h(wc + 41.0)) * step(r2 - 9.0, vP.y) * exp(-pow((vP.x + 120.0) / 80.0, 2.0));
            c += vec3(1.0, 0.62, 0.25) * town * 1.6;
          }
          fragColor = vec4(c * 0.9, 1.0);
        }`,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), skyMat);
    this.sky.position.set(SHAFT_CX, 260, -320);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    // The near hills: a dark silhouette card at z = 200 m behind the cut, its crest catching the afterglow.
    const shape = new THREE.Shape();
    shape.moveTo(-500, -60);
    for (let x = -500; x <= 500; x += 6) {
      const y = 10 + 9 * Math.sin(x * 0.011 + 1.3) + 6 * Math.sin(x * 0.029 + 0.4) + 3 * Math.sin(x * 0.071) + 1.2 * Math.sin(x * 0.23);
      shape.lineTo(x, y);
    }
    shape.lineTo(500, -60);
    const hillMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `
        out vec3 vP;
        void main() { vP = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec3 vP;
        layout(location = 0) out highp vec4 fragColor;
        void main() {
          float crest = 10.0 + 9.0 * sin(vP.x * 0.011 + 1.3) + 6.0 * sin(vP.x * 0.029 + 0.4) + 3.0 * sin(vP.x * 0.071) + 1.2 * sin(vP.x * 0.23);
          float below = crest - vP.y;
          vec3 c = mix(vec3(0.03, 0.02, 0.035), vec3(0.012, 0.01, 0.018), smoothstep(0.0, 30.0, below));
          c += vec3(0.9, 0.38, 0.16) * (1.0 - smoothstep(0.0, 0.8, below)) * 0.28 * smoothstep(-150.0, 300.0, vP.x);
          fragColor = vec4(c, 1.0);
        }`,
    });
    this.hills = new THREE.Mesh(new THREE.ShapeGeometry(shape), hillMat);
    this.hills.position.set(SHAFT_CX, 0, CUT_Z - 200);
    // The daylight cone down the shaft: additive, fading with depth (gone by 30 m).
    this.coneMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { uFade: { value: 1 } },
      vertexShader: /* glsl */ `
        out vec3 vP;
        void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec3 vP;
        uniform float uFade;
        layout(location = 0) out highp vec4 fragColor;
        void main() {
          float depth = clamp(-vP.y / 30.0, 0.0, 1.0);
          float edge = 1.0 - smoothstep(2.2, 3.6, abs(vP.x - ${SHAFT_CX.toFixed(1)}));
          float a = (1.0 - depth) * (1.0 - depth) * edge * 0.16 * uFade;
          fragColor = vec4(vec3(0.62, 0.76, 0.9) * a, 0.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.cone = new THREE.Mesh(new THREE.PlaneGeometry(8, 34), this.coneMat);
    this.cone.position.set(SHAFT_CX, -15, CUT_Z - 2.6);
    this.cone.renderOrder = 15;
    this.group.add(this.sky, this.hills, this.cone);
  }

  /** The camp's props (the menu's first frame and the first beats of the tutorial). */
  static campProps(): PropSpec[] {
    const p = (id: string, kind: PropSpec['kind'], x: number, z: number, rotY = 0, scale = 1, emitters: Array<[number, number, number]> = []): PropSpec => ({ id: `camp:${id}`, kind, x, y: 0, z, rotY, scale, anchor: null, emitters, seed: id.length * 977 + Math.round(x * 13) });
    return [
      p('winch', 'hoistWinch', SHAFT_CX, CUT_Z - 5.2, 0, 1.6),
      p('fire', 'campfire', SHAFT_CX - 6.5, CUT_Z - 7.5, 0, 1.2),
      p('bed', 'bedroll', SHAFT_CX - 9, CUT_Z - 10, 0.6),
      p('crate', 'crate', SHAFT_CX + 5.5, CUT_Z - 6, 0.3),
      p('barrel', 'barrel', SHAFT_CX + 6.6, CUT_Z - 7.2),
      p('post', 'lanternPost', SHAFT_CX + 4.6, CUT_Z - 3.2, 0, 1),
      p('post2', 'lanternPost', SHAFT_CX - 4.8, CUT_Z - 3.4, 0, 1),
      p('cart', 'brokenCart', SHAFT_CX + 10, CUT_Z - 13, -0.4),
      p('rope', 'ropeCoil', SHAFT_CX - 3.4, CUT_Z - 8.5),
      p('rack', 'pickaxeRack', SHAFT_CX + 3.4, CUT_Z - 8.8, -0.2),
      p('bench', 'workbench', SHAFT_CX + 8.2, CUT_Z - 9.6, -0.5),
      p('table', 'surveyTable', SHAFT_CX - 8.6, CUT_Z - 6.2, 0.4),
      p('satchel', 'satchel', SHAFT_CX - 5.6, CUT_Z - 9.2, 1.1),
      p('stake', 'plotStake', SHAFT_CX + 2.6, CUT_Z - 2.6),
    ];
  }

  update(time: number, floor: number): void {
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    this.coneMat.uniforms.uFade.value = Math.max(0, 1 - floor / 34);
    this.group.visible = floor < 60;
  }
}
