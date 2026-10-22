// VIS glitch probe for the strata (round 3): every prop WORLD places in a stratum, and every light
// pocket's decor VIS hangs from the roof, checked against the voxels: ground props that float (no
// rock under their footprint), hanging ones with no roof over them, and any sunk into rock (rock well
// inside their bounds). Prints per stratum and per kind, and the worst cases.
// Usage: node tools/run-ts.mjs tools/vis-strata-props.ts [seed] [strata e.g. 1,2,3,4,5,6] [--list]
import * as THREE from 'three';
import { SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { buildPropModel, variantOf, type PropModel } from '../src/render/props/models';
import { HANGING_KINDS } from '../src/render/props/biomeModels';
import { findPockets, pocketProps } from '../src/render/props/pocketModels';
import type { PropKind, PropSpec } from '../src/world/gen/types';

/** Kinds that stand in the air by design (a lantern on its chain, the Heart's things). */
const AIRBORNE = new Set(['hangingLantern', 'rope', 'banner', 'chain', 'hoistWinch', 'waterfall']);
/** Wall-mounted kinds (their back is the wall: only sinking is checked, and a floor under them). */
const WALL = new Set(['lever', 'guardianTrophy']);

export default function probe(args: string[]): void {
  const seed = Number(args[0] ?? 7);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  const list = args.includes('--list');
  const cache = new Map<string, PropModel>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let totalBad = 0;
  for (const n of strata) {
    const t0 = performance.now();
    const layout = generateStratum(seed, n);
    const w = layout.world;
    const solid = (x: number, y: number, z: number) => SOLID[w.get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
    const owned = new Set<number>();
    for (const p of layout.props) for (const [x, y, z] of p.emitters) owned.add(w.index(x, y, z));
    const pockets = pocketProps(findPockets(w, layout.biomeAt.bind(layout), owned), layout.seed);
    const all: Array<PropSpec & { vis?: boolean }> = [...layout.props, ...pockets.map((p) => ({ ...p, vis: true }))];
    const floating: string[] = [];
    const roofless: string[] = [];
    const sunk: string[] = [];
    const byKind = new Map<string, { n: number; float: number; roof: number; sunk: number }>();
    for (const p of all) {
      const variant = variantOf(p);
      const key = `${p.kind}:${variant}`;
      let model = cache.get(key);
      if (!model) {
        model = buildPropModel(p.kind as PropKind, { variant, hangHeight: 1.6 });
        cache.set(key, model);
      }
      const k = byKind.get(p.kind) ?? { n: 0, float: 0, roof: 0, sunk: 0 };
      k.n++;
      byKind.set(p.kind, k);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rotY), new THREE.Vector3(p.scale, p.scale, p.scale));
      const where = `${p.id} (${p.kind}${p.vis ? ', VIS pocket' : ''}) at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} [${layout.biomeAt(p.x, p.y, p.z)}]`;
      const hanging = HANGING_KINDS.has(p.kind);
      // The model's own vertices (up to ~400 of its body and glow), in the world.
      const pts: THREE.Vector3[] = [];
      for (const g of [model.body, model.glow]) {
        if (!g) continue;
        const pos = g.getAttribute('position');
        const step = Math.max(1, Math.floor(pos.count / 200));
        for (let i = 0; i < pos.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m));
      }
      if (!pts.length) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of pts) {
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
      }
      // Buried: a vertex inside rock deeper than 0.2 m from every face of its voxel that meets air
      // (the drawn rock is sculpted round the voxels: shallower is fine).
      const buried = (v: THREE.Vector3): boolean => {
        const ix = Math.floor(v.x);
        const iy = Math.floor(v.y);
        const iz = Math.floor(v.z);
        if (!SOLID[w.get(ix, iy, iz)]) return false;
        const fx = v.x - ix;
        const fy = v.y - iy;
        const fz = v.z - iz;
        let d = 9;
        if (!SOLID[w.get(ix - 1, iy, iz)]) d = Math.min(d, fx);
        if (!SOLID[w.get(ix + 1, iy, iz)]) d = Math.min(d, 1 - fx);
        if (!SOLID[w.get(ix, iy - 1, iz)]) d = Math.min(d, fy);
        if (!SOLID[w.get(ix, iy + 1, iz)]) d = Math.min(d, 1 - fy);
        if (!SOLID[w.get(ix, iy, iz - 1)]) d = Math.min(d, fz);
        if (!SOLID[w.get(ix, iy, iz + 1)]) d = Math.min(d, 1 - fz);
        return d >= 0.2;
      };
      let deep = 0;
      for (const v of pts) if (buried(v)) deep++;
      if (deep / pts.length > 0.25 && !AIRBORNE.has(p.kind)) {
        sunk.push(`${where}: ${deep}/${pts.length} vertices buried`);
        k.sunk++;
      }
      if (!AIRBORNE.has(p.kind) && !model.sway) {
        if (WALL.has(p.kind)) {
          // A wall kind's back is its wall: rock half a metre behind its spot, a metre up.
          const bx = p.x - Math.sin(p.rotY) * 0.8;
          const bz = p.z - Math.cos(p.rotY) * 0.8;
          if (!solid(bx, p.y + 1, bz)) {
            floating.push(`${where}: no wall behind`);
            k.float++;
          }
        } else {
          // Support: the vertices of its lowest (or, hanging, highest) 12 % over rock within 0.25 m.
          const band = Math.min(0.15, Math.max(0.04, (hi - lo) * 0.12));
          let n0 = 0;
          let ok = 0;
          for (const v of pts) {
            if (hanging ? v.y < hi - band : v.y > lo + band) continue;
            n0++;
            if (hanging ? solid(v.x, v.y + 0.25, v.z) || solid(v.x, v.y + 0.05, v.z) : solid(v.x, v.y - 0.25, v.z) || solid(v.x, v.y - 0.05, v.z)) ok++;
          }
          if (n0 > 0 && ok / n0 < 0.3) {
            (hanging ? roofless : floating).push(`${where}: ${ok}/${n0} ${hanging ? 'top vertices under rock' : 'base vertices on rock'}`);
            if (hanging) k.roof++;
            else k.float++;
          }
        }
      }
    }
    const bad = floating.length + roofless.length + sunk.length;
    totalBad += bad;
    console.log(`stratum ${n} (${layout.biomes.join(', ')}): ${all.length} props (${pockets.length} VIS pockets) in ${((performance.now() - t0) / 1000).toFixed(1)} s: floating ${floating.length}, roofless ${roofless.length}, sunk ${sunk.length}`);
    const kinds = [...byKind.entries()].filter(([, v]) => v.float + v.roof + v.sunk > 0).sort((a, b) => b[1].float + b[1].roof + b[1].sunk - (a[1].float + a[1].roof + a[1].sunk));
    for (const [kind, v] of kinds) console.log(`   ${kind.padEnd(18)} ${String(v.n).padStart(4)} placed: float ${v.float}, roofless ${v.roof}, sunk ${v.sunk}`);
    const show = list ? 40 : 4;
    for (const s of floating.slice(0, show)) console.log('   FLOAT ', s);
    for (const s of roofless.slice(0, show)) console.log('   NOROOF', s);
    for (const s of sunk.slice(0, show)) console.log('   SUNK  ', s);
  }
  console.log(`total flagged ${totalBad}`);
}
