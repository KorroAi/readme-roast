// The light lab (owner 1E): the lighting stack on a test chamber, through the game's own Renderer, for development,
// the before/after captures and tests/e2e/hybrid-light.spec.ts. Not shipped (dev server only).
//
//   ?shot=arrival|grazing|pillar|shaft|crystal   the camera pose
//   ?q=battery|balanced|high                     the preset (default balanced)
//   ?light=off  ?flame=0  ?ladder=N  ?rscale=0.65  (Renderer flags)
//   ?capture=1  no animation loop: window.__LAB__.frames(n) renders n frames on a fixed 1/60 s clock

import * as THREE from 'three';
import { Renderer, type QualityLevel } from '../../Renderer';
import { buildLab } from './scene';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
if (CAPTURE) document.documentElement.classList.add('capture');
const quality = (params.get('q') ?? 'balanced') as QualityLevel;
const canvas = document.getElementById('lab') as HTMLCanvasElement;
const info = document.getElementById('info') as HTMLDivElement;
const renderer = new Renderer(canvas, quality);
const lab = buildLab();
const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 120);
camera.rotation.order = 'YXZ';

/** Camera poses: eye position and a look-at point. hFOV 52° locked (SPEC §3.1). */
const SHOTS: Record<string, { eye: [number, number, number]; at: [number, number, number] }> = {
  arrival: { eye: [6.2, 2.1, 2.6], at: [6.0, 2.0, 12] },
  grazing: { eye: [2.0, 2.1, 5.0], at: [1.2, 1.7, 9.5] },
  pillar: { eye: [5.6, 2.1, 4.4], at: [4.5, 1.0, 9.5] },
  shaft: { eye: [7.0, 2.1, 6.5], at: [7.0, 3.6, 13] },
  crystal: { eye: [4.4, 2.3, 10.8], at: [2.1, 1.6, 13.4] },
};
let shot = params.get('shot') ?? 'arrival';

function lockedVfov(aspect: number, hfovDeg: number): number {
  const h = THREE.MathUtils.degToRad(hfovDeg);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}

function applyShot(): void {
  const s = SHOTS[shot] ?? SHOTS.arrival;
  camera.position.set(...s.eye);
  camera.lookAt(new THREE.Vector3(...s.at));
  camera.updateMatrixWorld();
}

function resize(): void {
  renderer.resize();
  camera.aspect = renderer.aspect;
  camera.fov = lockedVfov(camera.aspect, 52);
  camera.updateProjectionMatrix();
}

const rig = renderer.light;
rig.setIrradiance({ texture: lab.irradiance, origin: { x: 0, y: 0, z: 0 }, size: { x: 12, y: 8, z: 20 } });
rig.setAmbient({
  sky: 0x9fc3e6,
  ground: 0x4a3c30,
  gain: 0.1,
  openWeight: 0.6,
  rim: { dir: { x: 0, y: 0.15, z: 1 }, color: 0x8fe3ee, gain: 0.05 },
  specGain: 1,
});
// The sky shaft through the roof opening (a ShaftInput: lit surfaces in its cylinder, light in the air along it).
rig.setShafts([{ top: { x: 7.0, y: 8.0, z: 12.5 }, dir: { x: -0.12, y: -1, z: -0.08 }, radius: 1.05, length: 8.6, color: 0xd6e6ff, intensity: 2.4, softness: 0.5 }]);
rig.setFog({ color: 0x1b2229, density: 0.028, heightBase: 0.5, heightFalloff: 0.9, heightDensity: 0.05, scatter: 1, anisotropy: 0.3 });
const post = renderer.post.params;
post.zoneExposure = 1.0;
post.threshold = 1.0;
post.bloomStrength = 0.2;
post.vignette = 0.14;

const flame = new THREE.Vector3();
let time = 0;
let probeDone = false;

function frame(dt: number): void {
  time += dt;
  // The viewmodel lantern: low and left, 0.35 m ahead (Viewmodel.flameWorld).
  flame.set(-0.3, -0.45, -0.35).applyMatrix4(camera.matrixWorld);
  rig.update(camera, { pos: flame, range: 9 }, lab.lamps, time);
  if (!probeDone) {
    rig.captureProbe(lab.probeCentre, lab.probeBox);
    probeDone = true;
  }
  renderer.render(lab.scene, camera, time);
}

resize();
applyShot();
window.addEventListener('resize', resize);
if (params.has('view')) renderer.debug.setLight({ view: Number(params.get('view')) });
if (params.has('post')) renderer.debug.setLight({ post: Number(params.get('post')) });

const api = {
  ready: true,
  shots: Object.keys(SHOTS),
  /** Render n frames on the fixed clock (captures). */
  frames(n = 1): void {
    for (let i = 0; i < n; i++) frame(1 / 60);
  },
  setShot(name: string): void {
    shot = name;
    applyShot();
    renderer.post.light.resetHistory();
    rig.invalidateShadows();
  },
  /** Move the eye by (dx, dy, dz) metres (the lantern follows). */
  nudge(dx: number, dy: number, dz: number): void {
    camera.position.add(new THREE.Vector3(dx, dy, dz));
    camera.updateMatrixWorld();
  },
  setLamp(i: number, intensity: number): void {
    lab.lamps[i].intensity = intensity;
  },
  /**
   * Render one frame and read the canvas back (before the browser composites it): luminance 0..1 per pixel, rows top
   * to bottom, at device resolution, and the screen rect (device px) of a named object's bounding box, if asked.
   */
  readLuma(objectName?: string): { w: number; h: number; luma: number[]; rect: [number, number, number, number] | null } {
    frame(1 / 60);
    const gl = renderer.gl.getContext() as WebGL2RenderingContext;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const luma: number[] = new Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((h - 1 - y) * w + x) * 4;
        luma[y * w + x] = (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) / 255;
      }
    let rect: [number, number, number, number] | null = null;
    const obj = objectName ? lab.scene.getObjectByName(objectName) : null;
    if (obj) {
      const box = new THREE.Box3().setFromObject(obj);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let k = 0; k < 8; k++) {
        const v = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(camera);
        if (v.z > 1) continue;
        x0 = Math.min(x0, ((v.x + 1) / 2) * w);
        x1 = Math.max(x1, ((v.x + 1) / 2) * w);
        y0 = Math.min(y0, ((1 - v.y) / 2) * h);
        y1 = Math.max(y1, ((1 - v.y) / 2) * h);
      }
      rect = [Math.max(0, x0), Math.max(0, y0), Math.min(w, x1), Math.min(h, y1)];
    }
    return { w, h, luma, rect };
  },
  /** A screen mask of one named object (1 where it is drawn and visible), rows top to bottom, device resolution. */
  readMask(objectName: string): { w: number; h: number; mask: number[] } {
    const target = lab.scene.getObjectByName(objectName);
    const hidden: THREE.Object3D[] = [];
    lab.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== target && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const prevOff = renderer.light.stackOff;
    const prevView = renderer.post.light ? undefined : undefined;
    void prevView;
    renderer.debug.setLight({ off: true, view: 5 });
    const r = api.readLuma();
    renderer.debug.setLight({ off: prevOff, view: Number(params.get('view') ?? 0) });
    for (const o of hidden) o.visible = true;
    // The object is drawn with its albedo (≥ 0.25 display); the background is the dark fog clear.
    return { w: r.w, h: r.h, mask: r.luma.map((v) => (v > 0.25 ? 1 : 0)) };
  },
  stats: () => ({ ...renderer.debug.light(), tris: lab.tris, passes: renderer.debug.passes(), memory: renderer.debug.memoryBytes(), scale: renderer.debug.scale() }),
  renderer: renderer.debug,
};
(window as unknown as { __LAB__: typeof api }).__LAB__ = api;

if (!CAPTURE) {
  let last = performance.now();
  let acc = 0;
  let n = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame(dt);
    acc += dt;
    n++;
    if (acc > 1) {
      const st = renderer.debug.light();
      info.textContent = `${quality} · ${(n / acc).toFixed(1)} fps · step ${st.step}${st.stackOff ? ' · stack off' : ''}\ncalls ${st.frame.calls} · shadows ${st.stats.shadowRenders} · probe ${st.stats.probeFaces}/6`;
      acc = 0;
      n = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else {
  api.frames(2);
}
