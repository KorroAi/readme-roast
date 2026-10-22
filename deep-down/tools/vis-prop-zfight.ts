// VIS: list the coplanar faces of different colours (z-fighting) in prop models, as tests/unit/props.test.ts
// finds them, with their planes and extents, so they can be fixed. Usage: node tools/run-ts.mjs tools/vis-prop-zfight.ts 'kind#variant' ...
import * as THREE from 'three';
import { buildPropModel, type PropModel } from '../src/render/props/models';
interface Quad {
  n: THREE.Vector3;
  d: number;
  p: THREE.Vector3[];
  color: string;
  box: number;
}

/** Quads of a VoxBuilder geometry (index pattern b, b+1, b+2, b, b+2, b+3); triangles are skipped. */
function quadsOf(g: THREE.BufferGeometry): Quad[] {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const emi = g.getAttribute('aEmissive');
  const idx = g.getIndex()!;
  const out: Quad[] = [];
  for (let t = 0; t + 5 < idx.count; ) {
    const b = idx.getX(t);
    const isQuad = [b + 1, b + 2, b, b + 2, b + 3].every((v, k) => idx.getX(t + 1 + k) === v);
    if (!isQuad) {
      t += 3;
      continue;
    }
    const p = [0, 1, 2, 3].map((k) => new THREE.Vector3().fromBufferAttribute(pos, b + k));
    const n = new THREE.Vector3().fromBufferAttribute(nrm, b).normalize();
    out.push({ n, d: n.dot(p[0]), p, color: `${col.getX(b)},${col.getY(b)},${col.getZ(b)},${emi.getX(b)}`, box: -1 });
    t += 6;
  }
  return out;
}

/**
 * Visible area (m^2) where two faces of different color lie in the same plane, facing the same
 * way, and overlap: those z-fight. A face is hidden when another box of the model sits within
 * 5 mm in front of it (faces under a lid, inside a joint), or when it faces down onto the floor.
 */
function conflicts(g: THREE.BufferGeometry): string[] {
  const outList: string[] = [];
  const quads = quadsOf(g);
  // VoxBuilder.box emits six quads in opposite pairs (+x -x +y -y +z -z).
  const boxes: Quad[][] = [];
  for (let i = 0; i + 5 < quads.length; ) {
    const s = quads.slice(i, i + 6);
    if ([0, 2, 4].every((k) => s[k].n.dot(s[k + 1].n) < -0.999)) {
      for (const q of s) q.box = boxes.length;
      boxes.push(s);
      i += 6;
    } else i++;
  }
  const buckets = new Map<string, Quad[]>();
  for (const q of quads) {
    const key = [q.n.x, q.n.y, q.n.z, q.d].map((v) => v.toFixed(3)).join(',');
    const list = buckets.get(key) ?? [];
    list.push(q);
    buckets.set(key, list);
  }
  const extent = (q: Quad, u: THREE.Vector3, w: THREE.Vector3) => {
    const us = q.p.map((p) => p.dot(u));
    const ws = q.p.map((p) => p.dot(w));
    return [Math.min(...us), Math.max(...us), Math.min(...ws), Math.max(...ws)];
  };
  let area = 0;
  for (const list of buckets.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.color === b.color || Math.abs(a.d - b.d) > 2e-4 || (a.n.y < -0.999 && Math.abs(a.d) < 1e-3)) continue;
        const u = a.p[1].clone().sub(a.p[0]).normalize();
        const w = a.n.clone().cross(u);
        const A = extent(a, u, w);
        const B = extent(b, u, w);
        const du = Math.min(A[1], B[1]) - Math.max(A[0], B[0]);
        const dw = Math.min(A[3], B[3]) - Math.max(A[2], B[2]);
        if (du <= 1e-4 || dw <= 1e-4) continue;
        const probe = u
          .multiplyScalar((Math.max(A[0], B[0]) + Math.min(A[1], B[1])) / 2)
          .add(w.multiplyScalar((Math.max(A[2], B[2]) + Math.min(A[3], B[3])) / 2))
          .addScaledVector(a.n, a.d + 0.005);
        const covered = boxes.some((box, k) => k !== a.box && k !== b.box && box.every((q) => q.n.dot(probe) < q.d));
        if (!covered) { area += du * dw; outList.push(`n=${a.n.toArray().map((v) => v.toFixed(2))} d=${a.d.toFixed(3)} A=[${A.map((v) => v.toFixed(3))}] B=[${B.map((v) => v.toFixed(3))}] area=${(du * dw).toFixed(4)} ca=${a.color} cb=${b.color}`); }
      }
  void area;
  return outList;
}


export default function main(args: string[]): void {
  for (const spec of args) {
    const [kind, v] = spec.split('#');
    const m: PropModel = buildPropModel(kind as never, { variant: Number(v ?? 0), hangHeight: 1.8 });
    for (const [name, g] of [['body', m.body], ['glow', m.glow]] as const) {
      if (!g) continue;
      const c = conflicts(g);
      console.log(`${kind}#${v} ${name}: ${c.length}`);
      for (const line of c.slice(0, 30)) console.log('  ' + line);
    }
  }
}
