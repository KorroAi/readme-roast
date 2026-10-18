import * as THREE from 'three';
import { generateWorld } from './world/gen/generateWorld';
import { LightField, LanternField } from './world/light';
import { LightingRig } from './render/lighting';
import { generateTiles } from './render/textures';
import { createTerrainMaterial, createTileTexture } from './render/terrainMaterial';
import { ChunkRenderer } from './render/ChunkRenderer';
import { Renderer } from './render/Renderer';

// Temporary viewer entry used to validate the rendering foundation. Replaced by the game boot.
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
  const material = createTerrainMaterial(rig.uniforms, tiles);
  const chunks = new ChunkRenderer(layout.world, material);
  await chunks.buildAll();
  const scene = new THREE.Scene();
  scene.add(chunks.group);
  const ortho = params.get('ortho');
  rig.uniforms.uDebug.value.set(Number(params.get('bright') ?? 0), Number(params.get('clip') ?? 9999), 0);
  if (params.get('fog') !== null) rig.uniforms.uFogDensity.value = Number(params.get('fog'));
  const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = ortho
    ? new THREE.OrthographicCamera(-90 * renderer.aspect, 90 * renderer.aspect, 90, -90, 0.1, 400)
    : new THREE.PerspectiveCamera(62, renderer.aspect, 0.1, 400);
  const cam = (params.get('cam') ?? '92,90,76,-2.3,-0.25').split(',').map(Number);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(cam[4], cam[3], 0);
  const lanternPos = new THREE.Vector3(cam[0], cam[1] - 0.4, cam[2]);
  lantern.compute(lanternPos.x, lanternPos.y, lanternPos.z, 11);
  rig.markLanternDirty({ x: lantern.originX, y: lantern.originY, z: lantern.originZ });
  rig.uniforms.uLanternPos.value.copy(lanternPos);
  const start = performance.now();
  let frames = 0;
  const loop = () => {
    const t = (performance.now() - start) / 1000;
    rig.uniforms.uTime.value = t;
    if (camera instanceof THREE.PerspectiveCamera) camera.aspect = renderer.aspect;
    camera.updateProjectionMatrix();
    chunks.update(camera.position);
    renderer.render(scene, camera, t);
    frames++;
    (window as unknown as { __DD__: unknown }).__DD__ = { ready: frames > 3, frames, info: renderer.gl.info.render, chunks: chunks.stats };
    requestAnimationFrame(loop);
  };
  window.addEventListener('resize', () => renderer.resize());
  loop();
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:0">${String(e?.stack ?? e)}</pre>`);
});
