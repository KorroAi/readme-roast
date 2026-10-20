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
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          // Dusk: a warm ember at the horizon through rose to a deep blue zenith (linear, HDR-ish).
          float t = clamp(vP.y / 120.0, 0.0, 1.0);
          vec3 hor = vec3(0.95, 0.42, 0.2);
          vec3 mid = vec3(0.32, 0.16, 0.28);
          vec3 zen = vec3(0.02, 0.035, 0.09);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, t));
          c = mix(c, zen, smoothstep(0.12, 0.7, t));
          // The sun glow low on the right.
          vec2 sp = vec2(150.0, 14.0);
          float d = length(vP.xy - sp) / 120.0;
          c += vec3(1.0, 0.55, 0.25) * exp(-d * d * 18.0) * 1.6;
          // Stars above the glow.
          vec2 cell = floor(vP.xy * 0.35);
          float s = step(0.992, h(cell)) * smoothstep(0.25, 0.6, t);
          c += vec3(0.9, 0.95, 1.0) * s * (0.6 + 0.4 * sin(uTime * 2.0 + h(cell + 3.0) * 6.28));
          fragColor = vec4(c * 0.9, 1.0);
        }`,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(1400, 600), skyMat);
    this.sky.position.set(SHAFT_CX, 260, -320);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    // Hills: a dark silhouette card at z = 200 m behind the cut, its skyline from a few sines.
    const shape = new THREE.Shape();
    shape.moveTo(-500, -60);
    for (let x = -500; x <= 500; x += 10) {
      const y = 10 + 9 * Math.sin(x * 0.011 + 1.3) + 6 * Math.sin(x * 0.029 + 0.4) + 3 * Math.sin(x * 0.071);
      shape.lineTo(x, y);
    }
    shape.lineTo(500, -60);
    const hillMat = new THREE.MeshBasicMaterial({ color: 0x120c12 });
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
    ];
  }

  update(time: number, floor: number): void {
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    this.coneMat.uniforms.uFade.value = Math.max(0, 1 - floor / 34);
    this.group.visible = floor < 60;
  }
}
