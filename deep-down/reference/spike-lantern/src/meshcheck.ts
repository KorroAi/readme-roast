// Dev check: mesh a scene and verify winding and watertightness (every edge shared by exactly 2 triangles).
// Usage: node tools/run-ts.mjs src/spike/meshcheck.ts [scene]
import { SCENES } from './scenes';
import { Lattice, buildChunk } from './mesher';

export default function main(args: string[]): void {
  const def = (SCENES[args[0] ?? 'arrival'] ?? SCENES.arrival)();
  const g = def.grid;
  let solid = 0;
  for (const v of g.data) if (v) solid++;
  console.log('grid', g.nx, g.ny, g.nz, 'solid', solid, 'of', g.data.length);
  const lat = new Lattice(g);
  const geo = buildChunk(lat, 0, 0, 0, g.nx, g.ny, g.nz)!;
  const pos = geo.geometry.getAttribute('position');
  const nrm = geo.geometry.getAttribute('normal');
  const idx = geo.geometry.getIndex()!;
  console.log('faces', geo.faces, 'verts', pos.count, 'tris', idx.count / 3);
  let agree = 0, disagree = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const e1 = [pos.getX(b) - ax, pos.getY(b) - ay, pos.getZ(b) - az];
    const e2 = [pos.getX(c) - ax, pos.getY(c) - ay, pos.getZ(c) - az];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const d = n[0] * nrm.getX(a) + n[1] * nrm.getY(a) + n[2] * nrm.getZ(a);
    if (d >= 0) agree++;
    else disagree++;
  }
  console.log('winding agree', agree, 'disagree', disagree);
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < idx.count; t += 3) {
    const k = [key(idx.getX(t)), key(idx.getX(t + 1)), key(idx.getX(t + 2))];
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3];
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(ek, (edges.get(ek) ?? 0) + 1);
    }
  }
  const hist = new Map<number, number>();
  for (const v of edges.values()) hist.set(v, (hist.get(v) ?? 0) + 1);
  console.log('edge use histogram', [...hist.entries()].sort((a, b) => a[0] - b[0]));
  const open = [...edges.entries()].filter(([, v]) => v === 1).map(([k]) => k.split('|')[0].split(',').map((q) => Number(q) / 1e4));
  const ys = open.map((p) => p[1]);
  console.log('open edges y range', Math.min(...ys), Math.max(...ys), 'sample', JSON.stringify(open.slice(0, 6)));
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  console.log('y range', minY, maxY);
  const c = def.cam.pos;
  const [cx, cy, cz] = g.cellOf(c.x, c.y, c.z);
  console.log('camera cell', cx, cy, cz, 'solid?', g.solid(cx, cy, cz), 'floor', g.solid(cx, g.cellOf(c.x, -0.25, c.z)[1], cz));
}
