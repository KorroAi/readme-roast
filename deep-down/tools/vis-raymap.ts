// VIS (round 3): what the real camera sees, without a browser: generates a stratum and prints, for a
// 10 x 20 grid of screen points (portrait 390 x 844: a 72 degree vertical lens), the first solid
// block (id and name) and its distance, plus the props within 1.2 m of each ray.
// Usage: node tools/run-ts.mjs tools/vis-raymap.ts <seed> <stratum> <x> <y> <z> <yaw> [pitch=-0.08]
import { B, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';

export default function raymap(args: string[]): void {
  const [seed, stratum, x, y, z, yaw, pitch = -0.08] = args.map(Number);
  const l = generateStratum(seed, stratum);
  const w = l.world;
  const names = new Map<number, string>();
  for (const [k, v] of Object.entries(B)) if (!names.has(v as number)) names.set(v as number, k);
  const eye = [x, y + 1.62, z];
  const vf = (72 * Math.PI) / 180;
  const aspect = 390 / 844;
  const th = Math.tan(vf / 2);
  const tw = th * aspect;
  const fwd = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
  // Make up point upward.
  if (up[1] < 0) for (let i = 0; i < 3; i++) up[i] = -up[i];
  const seen = new Map<number, number>();
  const propsSeen = new Map<string, number>();
  for (let j = 0; j < 20; j++) {
    const row: string[] = [];
    for (let i = 0; i < 10; i++) {
      const u = ((i + 0.5) / 5 - 1) * tw;
      const v = (1 - (j + 0.5) / 10) * th;
      const d = [fwd[0] + right[0] * u + up[0] * v, fwd[1] + right[1] * u + up[1] * v, fwd[2] + right[2] * u + up[2] * v];
      const n = Math.hypot(d[0], d[1], d[2]);
      for (let k = 0; k < 3; k++) d[k] /= n;
      let hit = '   .   ';
      for (let t = 0.1; t < 70; t += 0.05) {
        const px = eye[0] + d[0] * t, py = eye[1] + d[1] * t, pz = eye[2] + d[2] * t;
        for (const p of l.props) {
          if (Math.hypot(p.x - px, p.y + 0.6 - py, p.z - pz) < 0.9) propsSeen.set(`${p.kind}@${Math.round(t)}m`, (propsSeen.get(`${p.kind}@${Math.round(t)}m`) ?? 0) + 1);
        }
        const id = w.get(Math.floor(px), Math.floor(py), Math.floor(pz));
        if (SOLID[id]) {
          hit = `${String(id).padStart(3)}@${String(Math.round(t)).padStart(2)}m`;
          seen.set(id, (seen.get(id) ?? 0) + 1);
          break;
        }
      }
      row.push(hit);
    }
    console.log(row.join(' '));
  }
  console.log('blocks:', [...seen].sort((a, b) => b[1] - a[1]).map(([id, c]) => `${id}=${names.get(id)}x${c}`).join(' '));
  console.log('props on rays:', [...propsSeen.keys()].slice(0, 30).join(' '));
  console.log('biome here:', l.biomeAt(x, y, z), 'lakes:', l.features.lakes.length);
}
