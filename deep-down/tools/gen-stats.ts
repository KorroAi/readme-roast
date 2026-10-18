import { generateWorld } from '../src/world/gen/generateWorld';
import { LightField } from '../src/world/light';
import { B, BLOCKS } from '../src/config/blocks';
import { meshChunk } from '../src/render/mesher';

export default function genStats(): void {
  const t0 = performance.now();
  const layout = generateWorld();
  const t1 = performance.now();
  const light = new LightField(layout.world);
  light.computeAll();
  const t2 = performance.now();
  const w = layout.world;
  let faces = 0, meshed = 0, maxChunkMs = 0;
  for (let cz = 0; cz < w.cz; cz++) for (let cy = 0; cy < w.cy; cy++) for (let cx = 0; cx < w.cx; cx++) {
    const a = performance.now();
    const m = meshChunk(w, cx, cy, cz);
    maxChunkMs = Math.max(maxChunkMs, performance.now() - a);
    faces += m.faceCount; if (m.faceCount) meshed++;
  }
  const t3 = performance.now();
  const counts: Record<string, number> = {};
  for (const id of w.blocks) counts[BLOCKS[id].name + '#' + id] = (counts[BLOCKS[id].name + '#' + id] ?? 0) + 1;
  console.log(JSON.stringify({ genMs: Math.round(t1 - t0), phases: layout.timings.phases, lightMs: Math.round(t2 - t1), meshMs: Math.round(t3 - t2), maxChunkMs: maxChunkMs.toFixed(2), faces, meshedChunks: meshed, props: layout.props.length }, null, 1));
  console.log(counts);
  console.log('copper', counts['block.copperOre#' + B.COPPER_ORE], 'iron', counts['block.ironOre#' + B.IRON_ORE], 'crystal', counts['block.crystal#' + B.CRYSTAL]);
}
