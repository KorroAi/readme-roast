import * as THREE from 'three';
import { generateWorld } from '../world/gen/generateWorld';
import { LightField, LanternField } from '../world/light';
import { LightingRig } from '../render/lighting';
import { generateTiles } from '../render/textures';
import { createTerrainMaterial, createTileTexture } from '../render/terrainMaterial';
import { TerrainRig } from '../render/terrainRig';
import { ChunkRenderer } from '../render/ChunkRenderer';
import { MESH_OPTIONS } from '../render/mesher';
import { Renderer } from '../render/Renderer';
import { Waterfall } from '../game/effects/Waterfall';
import { HaloSystem, collectWorldLights } from '../game/effects/Halos';

/**
 * Developer world viewer (not shipped in the game UI): renders the generated zone from a
 * camera given in the URL, for composition work and screenshots.
 *   ?cam=x,y,z,yaw,pitch  &ortho=1  &bright=0.6  &clip=47  &fog=0.02  &props=1
 * Terrain isolation flags: no_disp (no sculpt offset in the shader), no_deriv (flat face
 * normals), no_macro, blend=0, lantern=0; mesher: sculpt=0 (plain cubes), wide=0..1 (share of
 * the 4x4x4 occupancy gradient in the smooth rock normal), relax=0..1 (Laplacian relaxation of the
 * bevel points on natural rock), ao=voxel (per-face voxel AO on natural rock too).
 */
async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new Renderer(canvas, (params.get('q') as 'high' | 'balanced' | 'battery') ?? 'high');
  const layout = generateWorld();
  const field = new LightField(layout.world);
  field.computeAll();
  const lantern = new LanternField(layout.world);
  const rig = new LightingRig(field, lantern, layout.world.sx, layout.world.sy, layout.world.sz);
  const tiles = createTileTexture(generateTiles());
  const terrain = new TerrainRig();
  if (params.get('sculpt') === '0') MESH_OPTIONS.sculpt = false;
  if (params.has('wide')) MESH_OPTIONS.wide = Number(params.get('wide'));
  if (params.has('relax')) MESH_OPTIONS.relax = Number(params.get('relax'));
  if (params.get('ao') === 'voxel') MESH_OPTIONS.smoothAo = false;
  const chunks = new ChunkRenderer(layout.world, createTerrainMaterial(rig.uniforms, tiles, terrain.uniforms, params.has('clip'), params.get('blend') !== '0', Object.fromEntries(['NO_DISP', 'NO_MACRO', 'NO_DERIV'].filter((d) => params.has(d.toLowerCase())).map((d) => [d, '']))));
  await chunks.buildAll();
  const scene = new THREE.Scene();
  scene.add(chunks.group);
  const ft = layout.landmarks.fallTop;
  const fb = layout.landmarks.fallBottom;
  if (ft && fb) scene.add(new Waterfall(rig.uniforms, new THREE.Vector3(...ft), new THREE.Vector3(...fb)).group);
  const halos = new HaloSystem(rig.uniforms, collectWorldLights(layout.world));
  if (params.get('halos') !== '0') scene.add(halos.mesh);
  let props: { update(dt: number, t: number, p: THREE.Vector3): void } | null = null;
  if (params.get('props') === '1') {
    // Resolved at runtime so the viewer still loads while the props module is being built.
    const path = '../render/props/PropRenderer.ts';
    const { PropRenderer } = (await import(/* @vite-ignore */ path)) as typeof import('../render/props/PropRenderer');
    const pr = new PropRenderer(rig.uniforms);
    for (const p of layout.props) pr.add(p);
    scene.add(pr.group);
    props = pr;
  }
  const ortho = params.get('ortho');
  rig.uniforms.uDebug.value.set(Number(params.get('bright') ?? 0), Number(params.get('clip') ?? 9999), 0);
  if (params.get('fog') !== null) rig.uniforms.uFogDensity.value = Number(params.get('fog'));
  const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = ortho
    ? new THREE.OrthographicCamera(-90 * renderer.aspect, 90 * renderer.aspect, 90, -90, 0.1, 400)
    : new THREE.PerspectiveCamera(Number(params.get('fov') ?? 62), renderer.aspect, 0.1, 400);
  const cam = (params.get('cam') ?? '97,90.5,82,-2.43,-0.34').split(',').map(Number);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(cam[4], cam[3], 0);
  const lp = new THREE.Vector3(cam[0] + 0.4, cam[1] - 0.5, cam[2]);
  lantern.compute(lp.x, lp.y, lp.z, 11);
  rig.markLanternDirty({ x: lantern.originX, y: lantern.originY, z: lantern.originZ });
  rig.uniforms.uLanternPos.value.copy(lp);
  // The zone atmosphere the explorer would see standing below this camera.
  if (params.get('fog') === null) rig.updateAtmosphere(0, cam[0], cam[1] - 1.5, cam[2], layout.camp);
  if (params.get('lantern') === '0') rig.uniforms.uLanternIntensity.value = 0;
  const start = performance.now();
  let frames = 0;
  const loop = () => {
    const time = (performance.now() - start) / 1000;
    rig.uniforms.uTime.value = time;
    if (camera instanceof THREE.PerspectiveCamera) camera.aspect = renderer.aspect;
    camera.updateProjectionMatrix();
    chunks.update(camera.position);
    props?.update(1 / 60, time, camera.position);
    if (camera instanceof THREE.PerspectiveCamera) halos.setPixelScale(renderer.canvas.height, camera.fov);
    renderer.render(scene, camera, time);
    frames++;
    requestAnimationFrame(loop);
  };
  (window as unknown as { __DD__: unknown }).__DD__ = {
    get ready() {
      return frames > 3;
    },
    report: () => ({ info: { ...renderer.gl.info.render }, chunks: chunks.stats, frames }),
  };
  window.addEventListener('resize', () => renderer.resize());
  loop();
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:0">${String(e?.stack ?? e)}</pre>`);
});
