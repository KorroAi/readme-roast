// Geometry helpers of the light lab (owner 1E): a chamfered cube (26 flat patches: 6 faces, 12 edge chamfers, 8
// corners) and hexagonal crystal prisms. The lab only; the game's surfaces are 1C's.

import * as THREE from 'three';

/** A cube of edge `size` with chamfer `bevel`, flat-shaded per patch, centred at the origin. */
export function chamferCube(size: number, bevel: number): THREE.BufferGeometry {
  const h = size / 2;
  const i = h - bevel;
  const pos: number[] = [];
  const nor: number[] = [];
  const tmpN = new THREE.Vector3();
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const d = [dx, dy, dz];
        const pts: THREE.Vector3[] = [];
        // Inner corners q (signs fixed on the patch's axes, free elsewhere), pushed out by the bevel on each patch axis.
        const free = d.map((v) => (v === 0 ? [-1, 1] : [v]));
        for (const sx of free[0])
          for (const sy of free[1])
            for (const sz of free[2]) {
              const q = [sx * i, sy * i, sz * i];
              for (let a = 0; a < 3; a++) {
                if (d[a] === 0) continue;
                const p = q.slice();
                p[a] = d[a] * h;
                pts.push(new THREE.Vector3(p[0], p[1], p[2]));
              }
            }
        // Dedupe.
        const uniq: THREE.Vector3[] = [];
        for (const p of pts) if (!uniq.some((u) => u.distanceToSquared(p) < 1e-10)) uniq.push(p);
        const n = tmpN.set(dx, dy, dz).normalize().clone();
        const c = new THREE.Vector3();
        for (const p of uniq) c.add(p);
        c.multiplyScalar(1 / uniq.length);
        const t = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const u = new THREE.Vector3().crossVectors(t, n).normalize();
        const v = new THREE.Vector3().crossVectors(n, u);
        uniq.sort((a, b) => Math.atan2(a.clone().sub(c).dot(v), a.clone().sub(c).dot(u)) - Math.atan2(b.clone().sub(c).dot(v), b.clone().sub(c).dot(u)));
        for (let k = 1; k + 1 < uniq.length; k++) {
          for (const p of [uniq[0], uniq[k], uniq[k + 1]]) {
            pos.push(p.x, p.y, p.z);
            nor.push(n.x, n.y, n.z);
          }
        }
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** A hexagonal crystal prism with a pointed tip (base at y = 0), flat facets. */
export function crystalPrism(radius: number, height: number, tip: number): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(radius * 0.92, radius, height, 6, 1, true);
  body.translate(0, height / 2, 0);
  const cap = new THREE.ConeGeometry(radius * 0.92, tip, 6, 1, true);
  cap.translate(0, height + tip / 2, 0);
  const merged = mergeFlat([body, cap]);
  body.dispose();
  cap.dispose();
  return merged;
}

/** Merge geometries into one non-indexed, flat-shaded geometry. */
export function mergeFlat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.getAttribute('position');
    for (let k = 0; k < a.count; k++) pos.push(a.getX(k), a.getY(k), a.getZ(k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
