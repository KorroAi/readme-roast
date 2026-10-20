// Two low-resolution 3D textures per scene, sampled per fragment with trilinear filtering:
//   ambience (RGBA8): openness of the air around each cell at three radii (0.5 m, 1.5 m, 3 m) = soft AO + enclosure;
//   light (RGBA16F): baked light of the scene's emitters (crystals, lava, glowroots, a daylight shaft), with voxel
//   ray-cast shadows and one blur pass, so pools are soft, coloured and never leak through rock.
// Both are recomputed on an edit (mining) in a few milliseconds.

import * as THREE from 'three';
import { CELL, Grid } from './grid';

export interface Emitter {
  p: [number, number, number];
  /** Linear colour times intensity. */
  c: [number, number, number];
  /** Range in metres (light is zero beyond). */
  r: number;
  /** Distance at which the light has fallen to half (metres). */
  near?: number;
}
export interface SunShaft {
  /** Direction the light travels (normalised). */
  dir: [number, number, number];
  c: [number, number, number];
  /** Only cells within this horizontal disc (x, z, radius) are tested. */
  region: [number, number, number];
}
export interface Occluder {
  min: [number, number, number];
  max: [number, number, number];
  /** 0..1 how much of the covered cells' openness it removes. */
  amount: number;
}

export class Volumes {
  readonly ambience: THREE.Data3DTexture;
  readonly light: THREE.Data3DTexture;
  private amb: Uint8Array;
  private lit: Uint16Array;
  private open: Float32Array;
  private sums: Float32Array;
  constructor(
    readonly grid: Grid,
    public emitters: Emitter[],
    public suns: SunShaft[],
    public occluders: Occluder[],
  ) {
    const { nx, ny, nz } = grid;
    const n = nx * ny * nz;
    this.amb = new Uint8Array(n * 4);
    this.lit = new Uint16Array(n * 4);
    this.open = new Float32Array(n);
    this.sums = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
    this.ambience = new THREE.Data3DTexture(this.amb, nx, ny, nz);
    this.light = new THREE.Data3DTexture(this.lit, nx, ny, nz);
    for (const t of [this.ambience, this.light]) {
      t.format = THREE.RGBAFormat;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
      t.unpackAlignment = 1;
      t.generateMipmaps = false;
    }
    this.ambience.type = THREE.UnsignedByteType;
    this.light.type = THREE.HalfFloatType;
    this.rebuild();
  }

  rebuild(): void {
    this.computeAmbience();
    this.computeLight();
    this.ambience.needsUpdate = true;
    this.light.needsUpdate = true;
  }

  private computeAmbience(): void {
    const g = this.grid, { nx, ny, nz } = g;
    const open = this.open;
    for (let i = 0; i < open.length; i++) open[i] = g.data[i] === 0 ? 1 : 0;
    // Props (chest...) shade the floor around them a little.
    for (const o of this.occluders) {
      const [x0, y0, z0] = g.cellOf(o.min[0], o.min[1], o.min[2]);
      const [x1, y1, z1] = g.cellOf(o.max[0], o.max[1], o.max[2]);
      for (let z = z0; z <= z1; z++)
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            if (!g.inside(x, y, z)) continue;
            const cx = g.ox + x * CELL, cy = g.oy + y * CELL, cz = g.oz + z * CELL;
            const ov = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / CELL;
            const cover = ov(cx, cx + CELL, o.min[0], o.max[0]) * ov(cy, cy + CELL, o.min[1], o.max[1]) * ov(cz, cz + CELL, o.min[2], o.max[2]);
            const i = g.idx(x, y, z);
            open[i] = Math.max(0, open[i] - cover * o.amount);
          }
    }
    // 3D prefix sums.
    const sx = nx + 1, sy = ny + 1;
    const S = this.sums;
    S.fill(0);
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++) {
        let row = 0;
        for (let x = 0; x < nx; x++) {
          row += open[g.idx(x, y, z)];
          const i = x + 1 + sx * (y + 1 + sy * (z + 1));
          S[i] = row + S[i - sx] + S[i - sx * sy] - S[i - sx - sx * sy];
        }
      }
    const box = (x: number, y: number, z: number, r: number) => {
      const xa = Math.max(0, x - r), ya = Math.max(0, y - r), za = Math.max(0, z - r);
      const xb = Math.min(nx, x + r + 1), yb = Math.min(ny, y + r + 1), zb = Math.min(nz, z + r + 1);
      const at = (a: number, b: number, c: number) => S[a + sx * (b + sy * c)];
      const s = at(xb, yb, zb) - at(xa, yb, zb) - at(xb, ya, zb) - at(xb, yb, za) + at(xa, ya, zb) + at(xa, yb, za) + at(xb, ya, za) - at(xa, ya, za);
      const full = (2 * r + 1) ** 3; // out-of-grid counts as rock
      return s / full;
    };
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const i = g.idx(x, y, z) * 4;
          this.amb[i] = Math.round(box(x, y, z, 1) * 255);
          this.amb[i + 1] = Math.round(box(x, y, z, 3) * 255);
          this.amb[i + 2] = Math.round(box(x, y, z, 6) * 255);
          this.amb[i + 3] = open[g.idx(x, y, z)] > 0.5 ? 255 : 0;
        }
  }

  /** True when the straight segment from a to b crosses no solid cell (the end cells excluded). */
  private clear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const g = this.grid;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    const steps = Math.ceil(len / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const [x, y, z] = g.cellOf(ax + dx * t, ay + dy * t, az + dz * t);
      if (g.solid(x, y, z)) return false;
    }
    return true;
  }

  private computeLight(): void {
    const g = this.grid, { nx, ny, nz } = g;
    const n = nx * ny * nz;
    const acc = new Float32Array(n * 3);
    for (const e of this.emitters) {
      const R = e.r, near = e.near ?? 0.9;
      const [x0, y0, z0] = g.cellOf(e.p[0] - R, e.p[1] - R, e.p[2] - R);
      const [x1, y1, z1] = g.cellOf(e.p[0] + R, e.p[1] + R, e.p[2] + R);
      for (let z = Math.max(0, z0); z <= Math.min(nz - 1, z1); z++)
        for (let y = Math.max(0, y0); y <= Math.min(ny - 1, y1); y++)
          for (let x = Math.max(0, x0); x <= Math.min(nx - 1, x1); x++) {
            const i = g.idx(x, y, z);
            if (g.data[i] !== 0) continue;
            const [cx, cy, cz] = g.center(x, y, z);
            const d = Math.hypot(cx - e.p[0], cy - e.p[1], cz - e.p[2]);
            if (d >= R) continue;
            const w = 1 - (d / R) ** 2;
            const f = (w * w) / (1 + (d / near) ** 2);
            if (f < 0.002) continue;
            if (!this.clear(e.p[0], e.p[1], e.p[2], cx, cy, cz)) continue;
            acc[i * 3] += e.c[0] * f;
            acc[i * 3 + 1] += e.c[1] * f;
            acc[i * 3 + 2] += e.c[2] * f;
          }
    }
    for (const s of this.suns) {
      const [rx, rz, rr] = s.region;
      const top = g.oy + g.ny * CELL + 0.01;
      for (let z = 0; z < nz; z++)
        for (let x = 0; x < nx; x++) {
          const [cx, , cz] = g.center(x, 0, z);
          if (Math.hypot(cx - rx, cz - rz) > rr) continue;
          for (let y = 0; y < ny; y++) {
            const i = g.idx(x, y, z);
            if (g.data[i] !== 0) continue;
            const [, cy] = g.center(x, y, z);
            // March back towards the light until the grid top.
            const t = (top - cy) / -s.dir[1];
            if (!this.clear(cx, cy, cz, cx - s.dir[0] * t, top - 0.02, cz - s.dir[2] * t)) continue;
            // The opening itself: the last cell before the top must be air.
            const [ex, , ez] = g.cellOf(cx - s.dir[0] * t, top - 0.2, cz - s.dir[2] * t);
            if (g.solid(ex, ny - 1, ez)) continue;
            acc[i * 3] += s.c[0];
            acc[i * 3 + 1] += s.c[1];
            acc[i * 3 + 2] += s.c[2];
          }
        }
    }
    // One blur pass over open cells (soft shadow edges, no blocky pools).
    const out = this.lit;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const i = g.idx(x, y, z);
          let r = 0, gg = 0, b = 0, w = 0;
          if (g.data[i] === 0) {
            for (let dz = -1; dz <= 1; dz++)
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                  const X = x + dx, Y = y + dy, Z = z + dz;
                  if (!g.inside(X, Y, Z)) continue;
                  const j = g.idx(X, Y, Z);
                  if (g.data[j] !== 0) continue;
                  const k = dx === 0 && dy === 0 && dz === 0 ? 4 : 1;
                  r += acc[j * 3] * k;
                  gg += acc[j * 3 + 1] * k;
                  b += acc[j * 3 + 2] * k;
                  w += k;
                }
          }
          const o = i * 4;
          out[o] = THREE.DataUtils.toHalfFloat(w ? r / w : 0);
          out[o + 1] = THREE.DataUtils.toHalfFloat(w ? gg / w : 0);
          out[o + 2] = THREE.DataUtils.toHalfFloat(w ? b / w : 0);
          out[o + 3] = THREE.DataUtils.toHalfFloat(1);
        }
  }
}
