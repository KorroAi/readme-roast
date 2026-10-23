// UI probe (gate 03:32, r3-travel "open floor in reach for the kit"): can an outpost kit go down at
// WORLD's outpost sites, and does the spec's way of aiming find the spot?
//   node tools/run-ts.mjs tools/ui-outpost-probe.ts [seeds e.g. 1,2,3 | count e.g. 40] [strata e.g. 1 or 1-6]
// For each site: the explorer stands where DebugApi.standableNear puts it; the kit takes a floor cell
// in reach the eye sees (air, air above, rock below: ActionLayer.placeCells's floor rule, hit on the
// top face of the rock below). "site": the site's own floor cell takes a kit. "player": some floor
// cell 1-3.5 m from the stand point does. "spec": the r3-travel aim (8 ways at 1.8 / 2.2 m from a
// point offset by the double +0.5 of standableNear + teleport) finds one.
import { SOLID, B } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { raycastVoxels } from '../src/world/raycast';
import { standable } from '../src/world/analysis/reachability';
import { EYE_HEIGHT } from '../src/game/fp/constants';
import type { VoxelWorld } from '../src/world/VoxelWorld';

type V3 = [number, number, number];

function standableNear(w: VoxelWorld, x: number, y: number, z: number): V3 | null {
  for (let r = 0; r <= 4; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -3; dy <= 3; dy++) {
          const xx = Math.floor(x) + dx;
          const yy = Math.floor(y) + dy;
          const zz = Math.floor(z) + dz;
          if (standable(w, xx, yy, zz)) return [xx + 0.5, yy, zz + 0.5];
        }
  return null;
}

const air = (w: VoxelWorld, x: number, y: number, z: number) => w.get(x, y, z) === B.AIR;
/** placeCells' floor rule for a station or an outpost at the cell in front of the hit face. */
function kitAt(w: VoxelWorld, x: number, y: number, z: number): V3 | null {
  for (let k = 0; k <= 3; k++) {
    const fy = y - k;
    if (!air(w, x, fy, z)) return null;
    if (SOLID[w.get(x, fy - 1, z)]) return air(w, x, fy + 1, z) ? [x, fy, z] : null;
  }
  return null;
}
/** What Place would do with the centre ray from `eye` through `aim` (null: no room / out of reach). */
function placeAlong(w: VoxelWorld, eye: V3, aim: V3, stand: V3): V3 | null {
  const d = [aim[0] - eye[0], aim[1] - eye[1], aim[2] - eye[2]];
  const hit = raycastVoxels(w, eye[0], eye[1], eye[2], d[0], d[1], d[2], 4.5 + 1.5);
  if (!hit) return null;
  const c: V3 = [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz];
  if (Math.hypot(c[0] + 0.5 - eye[0], c[1] + 0.5 - eye[1], c[2] + 0.5 - eye[2]) > 5) return null;
  const k = kitAt(w, c[0], c[1], c[2]);
  // Never inside the explorer (0.6 m wide, 1.8 m tall).
  if (k && k[0] + 1 > stand[0] - 0.3 && k[0] < stand[0] + 0.3 && k[2] + 1 > stand[2] - 0.3 && k[2] < stand[2] + 0.3 && k[1] + 1 > stand[1] && k[1] < stand[1] + 1.8) return null;
  return k;
}

export default function probe(args: string[]): void {
  const a = args[0] ?? '24';
  const seeds = a.includes(',') ? a.split(',').map(Number) : Array.from({ length: Number(a) }, (_, i) => 1000 + i * 7919);
  const [s0, s1] = (args[1] ?? '1').split('-').map(Number);
  const strata = Array.from({ length: (s1 ?? s0) - s0 + 1 }, (_, i) => s0 + i);
  let sites = 0;
  let noStand = 0;
  let siteOk = 0;
  let playerOk = 0;
  let specOk = 0;
  const bad: string[] = [];
  for (const seed of seeds)
    for (const s of strata) {
      const l = generateStratum(seed, s);
      const w = l.world as unknown as VoxelWorld;
      for (const site of l.outpostSites) {
        sites++;
        const p = site.p;
        const st = standableNear(w, p[0], p[1], p[2]);
        if (kitAt(w, Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2]))) siteOk++;
        if (!st) {
          noStand++;
          bad.push(`seed ${seed} s${s} ${site.id} at ${p.map((v) => v.toFixed(1)).join(',')}: no standable cell within 4`);
          continue;
        }
        // A player: any floor cell 1-3.5 m away whose top face the eye sees.
        const eye: V3 = [st[0], st[1] + EYE_HEIGHT, st[2]];
        let player = false;
        for (let dz = -4; dz <= 4 && !player; dz++)
          for (let dx = -4; dx <= 4 && !player; dx++)
            for (let dy = -3; dy <= 1 && !player; dy++) {
              const x = Math.floor(st[0]) + dx;
              const z = Math.floor(st[2]) + dz;
              const y = st[1] + dy;
              const h = Math.hypot(x + 0.5 - st[0], z + 0.5 - st[2]);
              if (h < 1 || h > 3.5 || !SOLID[w.get(x, y - 1, z)] || !air(w, x, y, z)) continue;
              const k = placeAlong(w, eye, [x + 0.5, y + 0.02, z + 0.5], st);
              if (k && k[0] === x && k[1] === y && k[2] === z) player = true;
            }
        if (player) playerOk++;
        // The spec: teleported to the stand point + 0.5 again (a cell corner), 8 ways from yaw 0.
        const sp: V3 = [st[0] + 0.5, st[1], st[2] + 0.5];
        const seye: V3 = [sp[0], sp[1] + EYE_HEIGHT, sp[2]];
        let spec = false;
        for (let k = 0; k < 8 && !spec; k++) {
          const yaw = (k * Math.PI) / 4;
          const d = k % 2 ? 1.8 : 2.2;
          // aimAt with float coordinates aims at (x + 0.5, y + 0.5, z + 0.5) of the point given.
          const aim: V3 = [sp[0] - Math.sin(yaw) * d + 0.5, sp[1] - 0.5 + 0.5, sp[2] - Math.cos(yaw) * d + 0.5];
          if (placeAlong(w, seye, aim, sp)) spec = true;
        }
        if (spec) specOk++;
        if (!player || !spec) bad.push(`seed ${seed} s${s} ${site.id} (${site.biome}) site ${p.map((v) => v.toFixed(1)).join(',')} stand ${st.join(',')}: player ${player ? 'yes' : 'NO'}, spec ${spec ? 'yes' : 'NO'}`);
      }
    }
  console.log(`${sites} outpost sites (${seeds.length} seeds, strata ${strata.join(',')}): site cell takes a kit ${siteOk}, no stand ${noStand}, a player can set a kit down ${playerOk}, the spec's aim finds it ${specOk}`);
  for (const b of bad.slice(0, 40)) console.log(`  ${b}`);
}
