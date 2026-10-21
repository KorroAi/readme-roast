// A software preview of the world for the world's own checks (no WebGL): a first-person raycast through the voxel
// ring from a pose, shaded with a lantern at the eye, the light volume's emitters and a cool fill, with the sockets,
// the exit and the stands drawn as markers. tools/fill-scan.ts writes these as PNGs so the caverns can be looked at
// (composition, the window, the wonder in the top third, tappables in frame) before and beside 1C's renderer.

import { B, SOLID } from '../../../config/blocks';
import type { DeepWorld } from '../DeepWorld';
import { RING_SX, RING_SY, VOXEL, storageRow, type V3 } from '../grid';
import type { NodePlacement } from '../placement';

export interface PreviewPose {
  pos: V3;
  yaw: number;
  pitch: number;
}

export interface PreviewOptions {
  width: number;
  height: number;
  hfovDeg?: number;
  maxDist?: number;
  /** Draw socket markers for these placements. */
  markers?: ReadonlyArray<NodePlacement>;
  /** The chamber's fill (first light) 0.6..1. */
  fill?: number;
}

export interface PreviewResult {
  rgba: Uint8Array;
  width: number;
  height: number;
  /** Sockets whose marker landed in frame, with their screen position (fraction of width / height). */
  inFrame: Array<{ id: string; kind: string; x: number; y: number; dist: number }>;
}

/** The host rock colour by block (a stand-in palette; the real look is 1C's painter). */
function albedo(id: number): [number, number, number] {
  if (id >= 176 && id < 192) return [0.45, 1.0, 0.7];
  if (id === B.MASONRY || id === B.ANCIENT_BRICK || id === B.GLYPH_STONE) return [0.55, 0.53, 0.5];
  if (id === B.DECK || id === B.BEAM || id === B.PLANK) return [0.5, 0.36, 0.24];
  if (id === B.CRACK) return [0.62, 0.6, 0.56];
  if (id === B.FACE_PLUG) return [0.5, 0.45, 0.4];
  if (id === B.HATCH) return [0.55, 0.4, 0.26];
  if (id >= 64 && id < 176) {
    const slot = (id - 64) % 8;
    const b = Math.floor((id - 64) / 8);
    const base: [number, number, number] = b === 0 ? [0.42, 0.37, 0.33] : [0.3, 0.36, 0.38];
    if (slot === 1) return [base[0] * 0.85, base[1] * 0.88, base[2] * 0.92];
    if (slot === 2) return [base[0] * 1.25, base[1] * 1.2, base[2] * 1.1];
    if (slot === 3) return [base[0] * 0.7, base[1] * 0.72, base[2] * 0.78];
    if (slot === 4) return [0.75, 0.45, 0.25];
    if (slot === 5) return [0.9, 0.65, 0.25];
    if (slot === 6) return [0.6, 0.4, 0.8];
    return base;
  }
  if (id === B.TOPSOIL) return [0.32, 0.38, 0.24];
  return [0.4, 0.4, 0.42];
}

const MARK: Record<string, [number, number, number]> = {
  vein: [1.0, 0.55, 0.2],
  gem: [0.3, 0.9, 1.0],
  stash: [0.85, 0.8, 0.6],
  lamp: [1.0, 0.9, 0.3],
  feature: [1.0, 0.3, 0.8],
  secret: [0.7, 0.5, 1.0],
  cache: [0.5, 0.3, 0.8],
  skin: [0.6, 0.6, 0.6],
  exit: [0.2, 1.0, 0.4],
  stand: [1, 1, 1],
};

/** Render a preview frame from a pose. */
export function renderPreview(world: DeepWorld, pose: PreviewPose, opts: PreviewOptions): PreviewResult {
  const W = opts.width;
  const H = opts.height;
  const rgba = new Uint8Array(W * H * 4);
  const hf = ((opts.hfovDeg ?? 52) * Math.PI) / 180;
  const tx = Math.tan(hf / 2);
  const ty = tx * (H / W);
  const maxD = opts.maxDist ?? 40;
  const cy = Math.cos(pose.yaw);
  const sy = Math.sin(pose.yaw);
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  // Camera basis (CameraPose: forward = (−sin yaw cos pitch, sin pitch, −cos yaw cos pitch)).
  const fwd = { x: -sy * cp, y: sp, z: -cy * cp };
  const right = { x: cy, y: 0, z: -sy };
  const up = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };
  const ring = world.ring;
  const light = world.light.data;
  const fill = opts.fill ?? 1;
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const sx = ((px + 0.5) / W) * 2 - 1;
      const syy = 1 - ((py + 0.5) / H) * 2;
      let dx = fwd.x + right.x * sx * tx + up.x * syy * ty;
      let dy = fwd.y + right.y * sx * tx + up.y * syy * ty;
      let dz = fwd.z + right.z * sx * tx + up.z * syy * ty;
      const L = Math.hypot(dx, dy, dz);
      dx /= L;
      dy /= L;
      dz /= L;
      const hit = march(ring, pose.pos, dx, dy, dz, maxD);
      let r = 0.02;
      let g = 0.025;
      let b = 0.035;
      if (hit) {
        const a = albedo(hit.id);
        // Light: the air voxel before the hit (the light volume), the lantern at the eye, a cool fill.
        const ax = hit.x + hit.nx;
        const aj = hit.j + hit.ny;
        const az = hit.z + hit.nz;
        let lr = 0;
        let lg = 0;
        let lb = 0;
        let open = 0;
        if (ax >= 0 && ax < RING_SX && az >= 0 && az < RING_SX) {
          const i = (ax + RING_SX * (storageRow(aj) + RING_SY * az)) * 4;
          lr = light[i] / 255;
          lg = light[i + 1] / 255;
          lb = light[i + 2] / 255;
          open = light[i + 3] / 255;
        }
        const lanternDir = { x: -dx, y: -dy, z: -dz };
        const ndl = Math.max(0, hit.nx * lanternDir.x + hit.ny * lanternDir.y + hit.nz * lanternDir.z);
        const fall = 1 / (1 + (hit.t / 4.5) ** 2);
        const lan = 1.1 * ndl * fall * fill;
        const hemi = 0.06 + 0.05 * (hit.ny > 0 ? 1 : 0) + 0.1 * open;
        r = a[0] * (lan * 1.0 + hemi * 0.7 + lr * 1.6);
        g = a[1] * (lan * 0.82 + hemi * 0.85 + lg * 1.6);
        b = a[2] * (lan * 0.6 + hemi * 1.1 + lb * 1.6);
        if (hit.id >= 176 && hit.id < 192) {
          r += 0.25;
          g += 0.6;
          b += 0.45;
        }
        // Fog toward the biome's dark.
        const fog = 1 - Math.exp(-hit.t / 22);
        r = r * (1 - fog) + 0.03 * fog;
        g = g * (1 - fog) + 0.04 * fog;
        b = b * (1 - fog) + 0.05 * fog;
        depth[px + W * py] = hit.t;
      }
      const o = (px + W * py) * 4;
      rgba[o] = toByte(r);
      rgba[o + 1] = toByte(g);
      rgba[o + 2] = toByte(b);
      rgba[o + 3] = 255;
    }
  // Markers.
  const inFrame: PreviewResult['inFrame'] = [];
  const project = (p: V3): { x: number; y: number; d: number } | null => {
    const vx = p.x - pose.pos.x;
    const vy = p.y - pose.pos.y;
    const vz = p.z - pose.pos.z;
    const zf = vx * fwd.x + vy * fwd.y + vz * fwd.z;
    if (zf <= 0.1) return null;
    const xr = (vx * right.x + vy * right.y + vz * right.z) / zf / tx;
    const yu = (vx * up.x + vy * up.y + vz * up.z) / zf / ty;
    if (Math.abs(xr) > 1 || Math.abs(yu) > 1) return null;
    return { x: (xr + 1) / 2, y: (1 - yu) / 2, d: Math.hypot(vx, vy, vz) };
  };
  const dot = (sx: number, syy: number, rad: number, c: [number, number, number], d: number) => {
    const cx = sx * W;
    const cyy = syy * H;
    for (let y = Math.floor(cyy - rad); y <= cyy + rad; y++)
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const rr = Math.hypot(x - cx, y - cyy);
        if (rr > rad) continue;
        if (depth[x + W * y] < d - 0.6) continue;
        const o = (x + W * y) * 4;
        const edge = rr > rad - 1.2;
        rgba[o] = edge ? 0 : toByte(c[0]);
        rgba[o + 1] = edge ? 0 : toByte(c[1]);
        rgba[o + 2] = edge ? 0 : toByte(c[2]);
      }
  };
  for (const p of opts.markers ?? []) {
    for (const s of p.chamber.sockets) {
      if (s.hidden || s.kind === 'skin') continue;
      const q = project(s.pos);
      if (!q) continue;
      const vis = visible(ring, pose.pos, s.pos, s.normal);
      if (!vis) continue;
      inFrame.push({ id: s.id, kind: s.kind, x: q.x, y: q.y, dist: q.d });
      dot(q.x, q.y, Math.max(2.5, 0.4 / q.d * W), MARK[s.kind] ?? [1, 1, 1], q.d);
    }
    for (const e of p.chamber.exits) {
      const q = project(e.pos);
      if (q && visible(ring, pose.pos, e.pos, { x: 0, y: 1, z: 0 })) {
        inFrame.push({ id: e.id, kind: 'exit', x: q.x, y: q.y, dist: q.d });
        dot(q.x, q.y, Math.max(3, 0.5 / q.d * W), MARK.exit, q.d);
      }
    }
  }
  return { rgba, width: W, height: H, inFrame };
}

function toByte(v: number): number {
  // A filmic-ish curve so the preview is readable (not the game's grade).
  const x = Math.max(0, v);
  const m = x / (1 + x * 0.6);
  return Math.max(0, Math.min(255, Math.round(255 * Math.pow(m, 1 / 2.2))));
}

/** Can the eye see point p (no solid voxel between, ignoring the last 0.35 m in front of the surface)? */
function visible(ring: DeepWorld['ring'], eye: V3, p: V3, n: V3): boolean {
  const q = { x: p.x + n.x * 0.3, y: p.y + n.y * 0.3, z: p.z + n.z * 0.3 };
  const dx = q.x - eye.x;
  const dy = q.y - eye.y;
  const dz = q.z - eye.z;
  const L = Math.hypot(dx, dy, dz);
  const hit = march(ring, eye, dx / L, dy / L, dz / L, L);
  return !hit || hit.t >= L - 0.4;
}

interface Hit {
  x: number;
  j: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  t: number;
  id: number;
}

/** Amanatides–Woo through the ring's voxels (metres in, voxel hit out). */
function march(ring: DeepWorld['ring'], o: V3, dx: number, dy: number, dz: number, maxT: number): Hit | null {
  let x = Math.floor(o.x / VOXEL);
  let j = Math.floor(o.y / VOXEL);
  let z = Math.floor(o.z / VOXEL);
  const sx = dx > 0 ? 1 : -1;
  const sj = dy > 0 ? 1 : -1;
  const sz = dz > 0 ? 1 : -1;
  const nextB = (c: number, s: number) => (c + (s > 0 ? 1 : 0)) * VOXEL;
  let tx = dx !== 0 ? (nextB(x, sx) - o.x) / dx : Infinity;
  let tj = dy !== 0 ? (nextB(j, sj) - o.y) / dy : Infinity;
  let tz = dz !== 0 ? (nextB(z, sz) - o.z) / dz : Infinity;
  const ddx = dx !== 0 ? VOXEL / Math.abs(dx) : Infinity;
  const ddj = dy !== 0 ? VOXEL / Math.abs(dy) : Infinity;
  const ddz = dz !== 0 ? VOXEL / Math.abs(dz) : Infinity;
  let t = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < 400 && t <= maxT; i++) {
    const id = ring.get(x, j, z);
    if (SOLID[id] && i > 0) return { x, j, z, nx, ny, nz, t, id };
    if (tx < tj && tx < tz) {
      x += sx;
      t = tx;
      tx += ddx;
      nx = -sx;
      ny = 0;
      nz = 0;
    } else if (tj < tz) {
      j += sj;
      t = tj;
      tj += ddj;
      nx = 0;
      ny = -sj;
      nz = 0;
    } else {
      z += sz;
      t = tz;
      tz += ddz;
      nx = 0;
      ny = 0;
      nz = -sz;
    }
  }
  return null;
}

/** A top-down plan of a chamber's local grid (debug): floor heights in grey, reachable cells tinted green, sockets as
 *  coloured dots, 8 px per voxel. */
export function renderPlan(geom: import('../caverns/build').ChamberGeom, scale = 6): PreviewResult {
  const g = geom.grid;
  const W = g.nu * scale;
  const H = g.nv * scale;
  const rgba = new Uint8Array(W * H * 4);
  const reach = new Set(geom.reachable.map((p) => `${g.iu(p.u)},${g.iv(p.v)}`));
  for (let k = 0; k < g.nv; k++)
    for (let i = 0; i < g.nu; i++) {
      // The top open voxel's floor in this column (highest standable cell), or solid.
      let top = -1;
      for (let j = g.ny - 2; j >= 1; j--) if (!SOLID[g.get(i, j, k)] && SOLID[g.get(i, j - 1, k)]) {
        top = j;
        break;
      }
      let c: [number, number, number] = [0.08, 0.08, 0.1];
      if (top >= 0) {
        const y = g.fy(top);
        const t = Math.max(0, Math.min(1, (y - g.y0) / (g.y1 - g.y0)));
        c = [0.2 + 0.6 * t, 0.2 + 0.6 * t, 0.25 + 0.6 * t];
        if (reach.has(`${i},${k}`)) c = [c[0] * 0.6, c[1] * 0.9 + 0.1, c[2] * 0.6];
      }
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const o = (i * scale + x + W * (k * scale + y)) * 4;
          rgba[o] = toByte(c[0]);
          rgba[o + 1] = toByte(c[1]);
          rgba[o + 2] = toByte(c[2]);
          rgba[o + 3] = 255;
        }
    }
  for (const s of geom.sockets) {
    if (s.kind === 'skin') continue;
    const cx = g.iu(s.pos.u) * scale + scale / 2;
    const cy = g.iv(s.pos.v) * scale + scale / 2;
    const col = MARK[s.kind] ?? [1, 1, 1];
    for (let y = -3; y <= 3; y++)
      for (let x = -3; x <= 3; x++) {
        const px = cx + x;
        const py = cy + y;
        if (px < 0 || py < 0 || px >= W || py >= H || x * x + y * y > 9) continue;
        const o = (px + W * py) * 4;
        rgba[o] = toByte(col[0]);
        rgba[o + 1] = toByte(col[1]);
        rgba[o + 2] = toByte(col[2]);
      }
  }
  return { rgba, width: W, height: H, inFrame: [] };
}
