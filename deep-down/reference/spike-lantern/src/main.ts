// DEEP DOWN look spike: "lantern-lit voxel, refined". First person, portrait, one thumb.
// Tap a block to mine it, tap the floor or the passage to glide there, drag to look around.
// ?scene=arrival|grotto|magma  ?capture=1 (manual clock for deterministic screenshots, window.__SPIKE__).

import * as THREE from 'three';
import { Blk, CELL, Grid } from './grid';
import { buildChunk, Lattice } from './mesher';
import { paintTextures } from './painter';
import { Post } from './post';
import { lanternGeometry, shaftGeometry } from './props';
import { SCENES, type SceneDef } from './scenes';
import {
  CRYSTAL_FRAG,
  CRYSTAL_VERT,
  DIST_FRAG,
  DIST_VERT,
  GLASS_FRAG,
  LANTERN_FRAG,
  LANTERN_VERT,
  SHAFT_FRAG,
  SHAFT_VERT,
  SPRITE_FRAG,
  SPRITE_VERT,
  WORLD_FRAG,
  WORLD_VERT,
  sharedUniforms,
} from './shaders';
import { Volumes } from './volumes';
import { Crumble, Motes } from './fx';
import { Hud } from './hud';
import { hashf, lin } from './util';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
if (CAPTURE) document.documentElement.classList.add('capture');

const canvas = document.getElementById('view') as HTMLCanvasElement;
const DPR = Math.min(window.devicePixelRatio || 1, Number(params.get('dpr') ?? 2));
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.info.autoReset = false;

const W = () => Math.round(window.innerWidth * DPR);
const H = () => Math.round(window.innerHeight * DPR);

const U = sharedUniforms();
const timings: Record<string, number> = {};
let t0 = performance.now();
const tex = paintTextures(renderer);
timings.paintMs = Math.round(performance.now() - t0);

// ------------------------------------------------------------------------------------------------- materials
const worldMat = new THREE.ShaderMaterial({ vertexShader: WORLD_VERT, fragmentShader: WORLD_FRAG, uniforms: { ...U, tAlb: { value: tex.albedo }, tNrm: { value: tex.normal } } });
const PAL = [0x3fdcf4, 0x9a6bff, 0xd27cff, 0xffb347, 0xb4ff7a].map((h) => new THREE.Color(...lin(h)));
const DEEP = [0x06222c, 0x170c33, 0x2a0b3a, 0x3a1c06, 0x10260c].map((h) => new THREE.Color(...lin(h)));
const crystalMat = new THREE.ShaderMaterial({
  vertexShader: CRYSTAL_VERT,
  fragmentShader: CRYSTAL_FRAG,
  uniforms: { ...U, uPal: { value: PAL }, uDeep: { value: DEEP }, uCrystalGain: { value: 1 } },
});
const distMat = new THREE.ShaderMaterial({ vertexShader: DIST_VERT, fragmentShader: DIST_FRAG, uniforms: { uLightPos: { value: new THREE.Vector3() }, uFar: { value: 24 } }, side: THREE.DoubleSide });
const lanternMat = new THREE.ShaderMaterial({
  vertexShader: LANTERN_VERT,
  fragmentShader: LANTERN_FRAG,
  uniforms: { uCamPos: U.uCamPos, uFlame: { value: new THREE.Vector3() }, uSky: U.uSky, uGlowColor: { value: new THREE.Color(...lin(0xffa04a)) }, uGlow: { value: 1.35 } },
});
const glassMat = new THREE.ShaderMaterial({
  vertexShader: LANTERN_VERT,
  fragmentShader: GLASS_FRAG,
  uniforms: lanternMat.uniforms,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
  side: THREE.DoubleSide,
});
const haloMat = new THREE.ShaderMaterial({
  vertexShader: SPRITE_VERT,
  fragmentShader: SPRITE_FRAG,
  uniforms: { uColor: { value: new THREE.Color(...lin(0xff9a40)).multiplyScalar(0.9) } },
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
});

// ------------------------------------------------------------------------------------------------- scene graph
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(84, window.innerWidth / window.innerHeight, 0.03, 90);
camera.rotation.order = 'YXZ';
camera.layers.enable(1);
const lanternScene = new THREE.Scene();
const lanternRig = new THREE.Group();
const lanternGeo = lanternGeometry();
const lanternMesh = new THREE.Mesh(lanternGeo.opaque, lanternMat);
const glassMesh = new THREE.Mesh(lanternGeo.glass, glassMat);
glassMesh.renderOrder = 2;
lanternRig.add(lanternMesh, glassMesh);
const haloGeo = new THREE.PlaneGeometry(2, 2);
haloGeo.setAttribute('aSprite', new THREE.BufferAttribute(new Float32Array([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]), 4));
const halo = new THREE.Mesh(haloGeo, haloMat);
halo.scale.setScalar(0.05);
halo.position.set(0, 0.066, 0);
halo.renderOrder = 3;
lanternRig.add(halo);
lanternScene.add(lanternRig);
// Held low and to the right, turned a little so its corner posts read in 3D.
const LANTERN_LOCAL = new THREE.Vector3(0.19, -0.4, -0.72);
const FLAME_LOCAL = new THREE.Vector3(0, 0.066, 0);

const shadowRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const cubeCam = new THREE.CubeCamera(0.04, 24, shadowRT);
U.tShadow.value = shadowRT.texture;

let post = new Post(renderer, W(), H(), 4);

/** A tiling 32^3 smooth noise (two octaves of periodic value noise) for world-space patterns such as magma veins. */
function noise3(): THREE.Data3DTexture {
  const N = 32;
  const data = new Uint8Array(N * N * N);
  const lat = (P: number, i: number, j: number, k: number, s: number) => hashf(((i % P) + P) % P, ((j % P) + P) % P, ((k % P) + P) % P, s);
  const vn = (x: number, y: number, z: number, P: number, s: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const f = (t: number) => t * t * (3 - 2 * t);
    const xf = f(x - xi), yf = f(y - yi), zf = f(z - zi);
    let r = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      r += lat(P, xi + dx, yi + dy, zi + dz, s) * (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
    }
    return r;
  };
  for (let z = 0; z < N; z++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const v = vn((x / N) * 4, (y / N) * 4, (z / N) * 4, 4, 1) * 0.65 + vn((x / N) * 8, (y / N) * 8, (z / N) * 8, 8, 2) * 0.35;
        data[x + N * (y + N * z)] = Math.round(v * 255);
      }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
U.tNoise3.value = noise3();

// ------------------------------------------------------------------------------------------------- world state
interface Chunk {
  key: string;
  mesh: THREE.Mesh | null;
  x0: number;
  z0: number;
}
const CH = 16;
let def: SceneDef;
let grid: Grid;
let lattice: Lattice;
let volumes: Volumes;
let chunks: Chunk[] = [];
let sceneObjects: THREE.Object3D[] = [];
let motes: Motes | null = null;
const crumble = new Crumble(U, { tAlb: tex.albedo, tNrm: tex.normal });
scene.add(crumble.mesh, crumble.dust);
let shadowDirty = true;
let simTime = 0;

let hud = new Hud(document.getElementById('hud') as HTMLElement, 1284);
hud.setObjective('Mine the copper vein', 2, 6);

function buildChunks(): void {
  for (const c of chunks) if (c.mesh) {
    scene.remove(c.mesh);
    c.mesh.geometry.dispose();
  }
  chunks = [];
  for (let z0 = 0; z0 < grid.nz; z0 += CH)
    for (let x0 = 0; x0 < grid.nx; x0 += CH) {
      const c: Chunk = { key: `${x0},${z0}`, mesh: null, x0, z0 };
      rebuildChunk(c);
      chunks.push(c);
    }
}
function rebuildChunk(c: Chunk): void {
  if (c.mesh) {
    scene.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.mesh = null;
  }
  const geo = buildChunk(lattice, c.x0, 0, c.z0, Math.min(grid.nx, c.x0 + CH), grid.ny, Math.min(grid.nz, c.z0 + CH));
  if (!geo) return;
  c.mesh = new THREE.Mesh(geo.geometry, worldMat);
  c.mesh.matrixAutoUpdate = false;
  scene.add(c.mesh);
}

function applyLook(): void {
  const L = def.look;
  U.uSky.value.setRGB(...L.sky);
  U.uGround.value.setRGB(...L.ground);
  U.uFogColor.value.setRGB(...L.fog);
  U.uFogDensity.value = L.fogDensity;
  U.uFogHeight.value.set(L.fogHeight[0], L.fogHeight[1], 0);
  U.uFogScatter.value = L.fogScatter;
  U.uLanternColor.value.setRGB(...L.lantern);
  U.uLanternSoft.value = L.lanternSoft;
  U.uLanternRange.value = L.lanternRange;
  U.uLanternScatter.value = L.lanternScatter;
  U.uAccentGain.value = L.accentGain;
  U.uEmissive.value.set(...L.emissive);
  U.uVein.value = L.vein ?? 0;
  crystalMat.uniforms.uCrystalGain.value = L.crystalGain;
  const g = post.grade;
  g.exposure = L.exposure;
  g.bloom = L.bloom;
  g.threshold = L.threshold;
  g.lift.setRGB(...L.lift);
  g.gain.setRGB(...L.gain);
  g.sat = L.sat;
  g.vignette = L.vignette;
}

function loadScene(name: string): void {
  const t = performance.now();
  for (const o of sceneObjects) {
    scene.remove(o);
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
  }
  sceneObjects = [];
  def = (SCENES[name] ?? SCENES.arrival)();
  grid = def.grid;
  lattice = new Lattice(grid);
  buildChunks();
  timings.meshMs = Math.round(performance.now() - t);
  const tv = performance.now();
  volumes?.ambience.dispose();
  volumes?.light.dispose();
  volumes = new Volumes(grid, def.emitters, def.suns, def.occluders);
  timings.volumeMs = Math.round(performance.now() - tv);
  U.tAmb.value = volumes.ambience;
  U.tLight.value = volumes.light;
  U.uVolOrigin.value.set(grid.ox, grid.oy, grid.oz);
  U.uVolSize.value.set(grid.nx * CELL, grid.ny * CELL, grid.nz * CELL);
  const props = new THREE.Mesh(def.props.build(), worldMat);
  const crystals = new THREE.Mesh(def.crystals.build(), crystalMat);
  sceneObjects.push(props, crystals);
  for (const s of def.shafts) {
    const m = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      uniforms: { uCamPos: U.uCamPos, uFogDensity: U.uFogDensity, uShaftColor: { value: new THREE.Color(...s.color) } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(shaftGeometry(s.top, s.dir, s.length, s.r0, s.r1), m);
    mesh.layers.set(1);
    mesh.renderOrder = 5;
    sceneObjects.push(mesh);
  }
  const mo = def.look.motes;
  motes = new Motes(U, mo.count, mo.min, mo.size, mo.rise, DPR);
  motes.points.layers.set(1);
  sceneObjects.push(motes.points);
  for (const o of sceneObjects) scene.add(o);
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const devEl = hudRoot.querySelector('.dev');
  hud = new Hud(hudRoot, 1284);
  if (def.objective) hud.setObjective(def.objective);
  else hud.setObjective('Mine the copper vein', 2, 6);
  if (devEl) hudRoot.appendChild(devEl);
  camera.position.copy(def.cam.pos);
  yaw = def.cam.yaw;
  pitch = def.cam.pitch;
  glide = null;
  applyLook();
  shadowDirty = true;
  timings.sceneMs = Math.round(performance.now() - t);
}

// ------------------------------------------------------------------------------------------------- camera
let yaw = 0;
let pitch = 0;
let glide: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number } | null = null;
const flameWorld = new THREE.Vector3();

function updateCamera(): void {
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld(true);
  lanternRig.position.copy(LANTERN_LOCAL).applyMatrix4(camera.matrixWorld);
  lanternRig.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, -0.62, 0.07)));
  lanternRig.updateMatrixWorld(true);
  flameWorld.copy(FLAME_LOCAL).applyMatrix4(lanternRig.matrixWorld);
  lanternMat.uniforms.uFlame.value.copy(flameWorld);
  halo.quaternion.copy(lanternRig.quaternion).invert().multiply(camera.quaternion);
  U.uCamPos.value.copy(camera.position);
  U.uLanternPos.value.copy(flameWorld);
}

// ------------------------------------------------------------------------------------------------- interaction
const REACH = 4.6;
const raycaster = new THREE.Raycaster();
let mining: { cell: [number, number, number]; t: number; kind: Blk; screen: { x: number; y: number }; done: boolean } | null = null;

function screenOfWorld(p: THREE.Vector3): { x: number; y: number } {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
}

function tap(x: number, y: number): string {
  if (glide || mining) return 'busy';
  const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const hit = grid.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 40);
  let best: { kind: string; t: number } | null = null;
  for (const tp of def.tappables) {
    const p = raycaster.ray.intersectBox(tp.box, new THREE.Vector3());
    if (p) {
      const t = p.distanceTo(o);
      if (!best || t < best.t) best = { kind: tp.kind, t };
    }
  }
  if (best && (!hit || best.t < hit.t + 0.3) && best.t < REACH + 0.5) {
    if (best.kind === 'gem' && def.gemCell) return startMining(def.gemCell, x, y);
    const p = o.clone().addScaledVector(d, best.t);
    const s = screenOfWorld(p);
    hud.loot(s.x, s.y, 3, best.kind === 'chest' ? 60 : 18, best.kind !== 'chest');
    return best.kind;
  }
  if (!hit) return 'none';
  if (hit.ny === 1 || hit.t > REACH) return startGlide(hit);
  return startMining([hit.x, hit.y, hit.z], x, y);
}

function startMining(cell: [number, number, number], x: number, y: number): string {
  const kind = grid.get(cell[0], cell[1], cell[2]);
  if (kind === Blk.Air || kind === Blk.Bedrock) return 'none';
  mining = { cell, t: 0, kind, screen: { x, y }, done: false };
  const [cx, cy, cz] = grid.center(cell[0], cell[1], cell[2]);
  U.uCrack.value.set(cx, cy, cz, 0.01);
  return 'mine';
}

function finishMining(): void {
  if (!mining) return;
  const [x, y, z] = mining.cell;
  const [cx, cy, cz] = grid.center(x, y, z);
  const kind = mining.kind;
  grid.set(x, y, z, Blk.Air);
  // Lattice and the chunks around the cell (vertices depend on cells up to two away).
  lattice.update(x - 2, y - 2, z - 2, x + 3, y + 3, z + 3);
  for (const c of chunks) {
    if (x + 2 >= c.x0 && x - 2 < c.x0 + CH && z + 2 >= c.z0 && z - 2 < c.z0 + CH) rebuildChunk(c);
  }
  if (def.gemCell && def.gemCell[0] === x && def.gemCell[1] === y && def.gemCell[2] === z) {
    // The gem cluster goes with its block.
    const cr = sceneObjects[1] as THREE.Mesh;
    cr.geometry.dispose();
    const keep = def.crystals;
    const pos = keep.pos, nrm = keep.nrm, cry = keep.cry;
    const out = { p: [] as number[], n: [] as number[], c: [] as number[] };
    for (let i = 0; i < pos.length / 3; i += 3) {
      const mx = (pos[i * 3] + pos[i * 3 + 3] + pos[i * 3 + 6]) / 3, my = (pos[i * 3 + 1] + pos[i * 3 + 4] + pos[i * 3 + 7]) / 3, mz = (pos[i * 3 + 2] + pos[i * 3 + 5] + pos[i * 3 + 8]) / 3;
      if (Math.abs(mx - cx) < 0.45 && Math.abs(my - cy) < 0.45 && Math.abs(mz - cz) < 0.6 && cry[i * 4 + 3] === 2) continue;
      out.p.push(...pos.slice(i * 3, i * 3 + 9));
      out.n.push(...nrm.slice(i * 3, i * 3 + 9));
      out.c.push(...cry.slice(i * 4, i * 4 + 12));
    }
    keep.pos = out.p;
    keep.nrm = out.n;
    keep.cry = out.c;
    cr.geometry = keep.build();
    def.tappables = def.tappables.filter((t) => t.kind !== 'gem');
    def.emitters = def.emitters.filter((e) => Math.hypot(e.p[0] - cx, e.p[1] - cy, e.p[2] - cz) > 0.8);
    volumes.emitters = def.emitters;
  }
  volumes.rebuild();
  // Crumble from the block, loot to the counter.
  let floorY = cy - CELL / 2;
  for (let j = y - 1; j >= 0; j--) if (grid.solid(x, j, z)) { floorY = grid.oy + (j + 1) * CELL; break; }
  const layer = kind === Blk.Ore ? 6 : kind === Blk.Gem ? 8 : kind === Blk.Soil ? 9 : kind === Blk.Grotto ? 10 : kind === Blk.Basalt ? 13 : kind === Blk.Magma ? 15 : 0;
  const dust = new THREE.Color().setRGB(0.2, 0.16, 0.12);
  crumble.start(new THREE.Vector3(cx, cy, cz), camera.position, layer, floorY, dust);
  const s = screenOfWorld(new THREE.Vector3(cx, cy, cz));
  if (kind === Blk.Ore) hud.loot(s.x, s.y, 3, 36, false);
  else if (kind === Blk.Gem) hud.loot(s.x, s.y, 2, 120, true);
  else hud.loot(s.x, s.y, 1, 4, false);
  U.uCrack.value.w = 0;
  shadowDirty = true;
  mining.done = true;
}

function startGlide(hit: { px: number; py: number; pz: number; nx: number; ny: number; nz: number; t: number }): string {
  const dir = new THREE.Vector3(hit.px, 0, hit.pz).sub(new THREE.Vector3(camera.position.x, 0, camera.position.z));
  const dist = dir.length();
  dir.normalize();
  // Stand back from walls; stop at most 10 m away; find the floor there.
  let reach = hit.ny === 1 ? dist : dist - 1.1;
  reach = Math.max(0, Math.min(8, reach));
  const tryAt = (r: number) => {
    const p = new THREE.Vector3(camera.position.x, 0, camera.position.z).addScaledVector(dir, r);
    const [cx, cy, cz] = grid.cellOf(p.x, camera.position.y + 1.0, p.z);
    let fy: number | null = null;
    for (let j = cy; j >= 0; j--) if (grid.solid(cx, j, cz)) { fy = grid.oy + (j + 1) * CELL; break; }
    if (fy === null) return null;
    // Head room and a body-wide clearance.
    for (const [ox, oz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
      const [ax, ay, az] = grid.cellOf(p.x + ox, fy + 0.25, p.z + oz);
      for (let j = ay; j < ay + 4; j++) if (grid.solid(ax, j, az)) return null;
    }
    return new THREE.Vector3(p.x, fy + 1.6, p.z);
  };
  // Never glide through a prop: stop short of the first tappable box on the way.
  const blocked = (r: number) => {
    const p = new THREE.Vector3(camera.position.x, 0, camera.position.z).addScaledVector(dir, r);
    return def.tappables.some((t) => t.box.min.y < 1.0 && p.x > t.box.min.x - 0.35 && p.x < t.box.max.x + 0.35 && p.z > t.box.min.z - 0.35 && p.z < t.box.max.z + 0.35);
  };
  for (let r = 0.25; r <= reach; r += 0.25) {
    if (blocked(r)) {
      reach = r - 0.5;
      break;
    }
  }
  let to: THREE.Vector3 | null = null;
  for (let r = reach; r > 0.3 && !to; r -= 0.25) to = tryAt(r);
  if (!to) return 'blocked';
  const len = to.distanceTo(camera.position);
  glide = { from: camera.position.clone(), to, t: 0, dur: Math.min(0.8, Math.max(0.4, 0.36 + len * 0.06)) };
  return 'glide';
}

// Pointer: tap = act, drag = look.
let down: { x: number; y: number; t: number; yaw: number; pitch: number; drag: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now(), yaw, pitch, drag: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (!down.drag && Math.hypot(dx, dy) > 12) down.drag = true;
  if (down.drag) {
    yaw = down.yaw + dx * 0.006;
    pitch = Math.max(-0.7, Math.min(0.5, down.pitch + dy * 0.004));
    shadowDirty = true;
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (down && !down.drag) tap(e.clientX, e.clientY);
  down = null;
});

// ------------------------------------------------------------------------------------------------- frame
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function step(dt: number): void {
  simTime += dt;
  U.uTime.value = simTime;
  if (glide) {
    glide.t += dt;
    const k = Math.min(1, glide.t / glide.dur);
    camera.position.lerpVectors(glide.from, glide.to, ease(k));
    shadowDirty = true;
    if (k >= 1) glide = null;
  }
  if (mining) {
    mining.t += dt;
    if (!mining.done) U.uCrack.value.w = Math.min(1, mining.t / 0.045);
    if (!mining.done && mining.t >= 0.045) finishMining();
    if (mining && mining.done && mining.t > 0.3) mining = null;
  }
  crumble.update(dt);
  hud.update(dt);
}

let frameMs = 0;
function render(): void {
  const tr = performance.now();
  renderer.info.reset();
  updateCamera();
  if (shadowDirty) {
    distMat.uniforms.uLightPos.value.copy(flameWorld);
    cubeCam.position.copy(flameWorld);
    cubeCam.updateMatrixWorld(true);
    scene.overrideMaterial = distMat;
    renderer.setClearColor(0xffffff, 1);
    cubeCam.update(renderer, scene);
    scene.overrideMaterial = null;
    shadowDirty = false;
  }
  renderer.setClearColor(new THREE.Color(...def.look.fog), 1);
  renderer.setRenderTarget(post.scene);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(lanternScene, camera);
  renderer.autoClear = true;
  post.finish();
  frameMs = performance.now() - tr;
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post = new Post(renderer, W(), H(), 4);
  applyLook();
});

// Dev buttons (hidden in captures).
const dev = document.createElement('div');
dev.className = 'dev';
for (const n of Object.keys(SCENES)) {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = () => loadScene(n);
  dev.appendChild(b);
}
document.getElementById('hud')!.appendChild(dev);

t0 = performance.now();
loadScene(params.get('scene') ?? 'arrival');
// Compile every program now (no shader compile after load).
renderer.compile(scene, camera);
renderer.compile(lanternScene, camera);
timings.loadMs = Math.round(performance.now() - t0);

/** The exposed ore cell nearest to a point on the face (for scripted taps). */
function oreTarget(): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null, bd = Infinity;
  const want = new THREE.Vector3(-0.6, 1.25, -2.8);
  for (let z = 0; z < grid.nz; z++)
    for (let y = 0; y < grid.ny; y++)
      for (let x = 0; x < grid.nx; x++) {
        if (grid.get(x, y, z) !== Blk.Ore || grid.solid(x, y, z + 1)) continue;
        const [cx, cy, cz] = grid.center(x, y, z);
        const p = new THREE.Vector3(cx, cy, cz + CELL / 2);
        const d = p.distanceTo(want);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
  return best;
}

const api = {
  ready: true,
  timings,
  scene(name: string) {
    loadScene(name);
    renderer.compile(scene, camera);
    render();
    return { ...timings };
  },
  look(patch: Record<string, unknown>) {
    if ('shadow' in patch) U.uShadowOn.value = Number(patch.shadow);
    Object.assign(def.look, patch);
    applyLook();
    render();
    return def.look;
  },
  pose(x: number, y: number, z: number, yw: number, pt: number) {
    camera.position.set(x, y, z);
    yaw = yw;
    pitch = pt;
    shadowDirty = true;
    render();
  },
  advance(ms: number) {
    const n = Math.max(1, Math.round(ms / (1000 / 120)));
    for (let i = 0; i < n; i++) step(ms / 1000 / n);
    render();
  },
  render() {
    render();
  },
  tap(x: number, y: number) {
    return tap(x, y);
  },
  oreScreen() {
    const p = oreTarget();
    return p ? screenOfWorld(p) : null;
  },
  info() {
    const i = renderer.info;
    const m = new THREE.Matrix4();
    if (crumble.mesh.count) crumble.mesh.getMatrixAt(0, m);
    const cp = new THREE.Vector3().setFromMatrixPosition(m);
    return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length ?? 0, frameMs, chunks: chunks.filter((c) => c.mesh).length, crumble: crumble.mesh.count, chunk0: [cp.x, cp.y, cp.z].map((v) => +v.toFixed(2)), ...timings };
  },
  perf(n: number) {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    const times: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = performance.now();
      step(1 / 60);
      shadowDirty = i % 2 === 0; // half the frames re-render the lantern shadow (as during a glide)
      render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - s);
    }
    times.sort((a, b) => a - b);
    return { median: times[Math.floor(n / 2)], min: times[0], max: times[n - 1] };
  },
};
(window as unknown as { __SPIKE__: typeof api }).__SPIKE__ = api;

if (CAPTURE) render();
else requestAnimationFrame(loop);
