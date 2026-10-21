import * as THREE from 'three';
import { Renderer } from '../../../render/Renderer';
import { Viewmodel } from '../Viewmodel';

/**
 * Dev only (never shipped): the first-person tools alone in front of a lantern-lit wall, for fast
 * iteration on the viewmodel's models and motion without booting the world.
 * Query: pick, lantern (tiers), hand ('pick' | a weapon id), fuel 0..1, swing / raise / attack
 * (phase 0..1), walk (m/s), mirror (0/1).
 */
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new Renderer(canvas, 'high');
renderer.setBrightness(1.05);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(78, renderer.aspect, 0.05, 100);
cam.position.set(0, 1.62, 0);
cam.rotation.order = 'YXZ';
cam.rotation.set(num('pitch', -0.12), 0, 0);
cam.updateMatrixWorld();

// A rough warm wall and floor (lit as if by the lantern), so the tools read against stone.
const wallMat = new THREE.ShaderMaterial({
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      float d = length(vW - vec3(-0.3, 1.2, 0.0));
      float l = 1.0 / (1.0 + 0.09 * d * d);
      float t = 0.6 + 0.4 * n(vW.xy * 3.0 + vW.z) * n(vW.zy * 1.3);
      vec3 c = vec3(0.30, 0.22, 0.16) * t * l * 1.4 + vec3(0.02, 0.03, 0.05);
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat);
wall.position.set(0, 2, -3.2);
scene.add(wall);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), wallMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const vm = new Viewmodel();
vm.set({ pickTier: num('pick', 1), lanternTier: num('lantern', 1), mirror: num('mirror', 0) === 1 });
scene.add(vm.group);
const hand = q.get('hand');
if (hand) vm.setRightHand(hand, true);
vm.flame = num('fuel', 1);

const amb = new THREE.Color(0.05, 0.045, 0.045);
const flame = new THREE.Color(1.0, 0.62, 0.32).multiplyScalar(1.5);
const dt = 1 / 60;
let t = num('t', 2);
const walk = num('walk', 0);
// Settle, then pose at the requested phase.
for (let i = 0; i < 60; i++) vm.update(dt, cam, renderer.aspect, walk, 0, amb, flame);
if (q.has('swing')) {
  vm.swing(0.5, 0.55, new THREE.Vector3(0.2, 1.3, -2), cam);
  for (let u = 0; u < num('swing', 0.5); u += dt / 0.5) vm.update(dt, cam, renderer.aspect, walk, 0, amb, flame);
}
if (q.has('attack')) {
  vm.attack(hand ?? 'machete', new THREE.Vector3(0.1, 1.2, -1.8), cam);
  const dur = vm.attackDuration;
  for (let u = 0; u < num('attack', 0.5); u += dt / dur) vm.update(dt, cam, renderer.aspect, walk, 0, amb, flame);
}
if (q.has('raise')) {
  vm.raise();
  for (let s = 0; s < num('raise', 0.4); s += dt) vm.update(dt, cam, renderer.aspect, walk, 0, amb, flame);
}
vm.update(0, cam, renderer.aspect, walk, 0, amb, flame);
const frame = () => {
  renderer.resize();
  cam.aspect = renderer.aspect;
  cam.updateProjectionMatrix();
  t += dt;
  vm.update(0, cam, renderer.aspect, walk, 0, amb, flame);
  renderer.render(scene, cam, t);
};
frame();
frame();
(window as unknown as { __ready: boolean }).__ready = true;
