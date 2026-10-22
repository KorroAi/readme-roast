/**
 * Round 3 (WORLD): the explored map of one stratum, for the minimap, the Map screen's fog of war and
 * the save. One bit per column (x, z) and the height (y) the explorer saw it at, so the map can shade
 * levels. Stored compact: a base64 bitmap plus the heights of the explored columns only.
 */
export interface ExploredMapData {
  sx: number;
  sz: number;
  /** Base64 of the column bitmap (sx * sz bits). */
  bits: string;
  /** Base64 of the heights of the set columns, in bitmap order (one byte each). */
  heights: string;
}

const b64 = {
  enc(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  dec(str: string): Uint8Array {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

export class ExploredMap {
  readonly sx: number;
  readonly sz: number;
  /** One bit per column. */
  readonly bits: Uint8Array;
  /** The height the column was seen at (y of the feet, 0..255), valid where the bit is set. */
  readonly heights: Uint8Array;
  /** Bumps on every new column (the minimap redraws on change). */
  revision = 0;
  count = 0;

  constructor(sx: number, sz: number) {
    this.sx = sx;
    this.sz = sz;
    this.bits = new Uint8Array(Math.ceil((sx * sz) / 8));
    this.heights = new Uint8Array(sx * sz);
  }

  has(x: number, z: number): boolean {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= this.sx || zi >= this.sz) return false;
    const i = xi + zi * this.sx;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  heightAt(x: number, z: number): number {
    return this.heights[Math.floor(x) + Math.floor(z) * this.sx] ?? 0;
  }

  /** Mark one column explored (seen at height y). Returns true when it was new. */
  markExplored(x: number, z: number, y = 0): boolean {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= this.sx || zi >= this.sz) return false;
    const i = xi + zi * this.sx;
    const m = 1 << (i & 7);
    if (this.bits[i >> 3] & m) return false;
    this.bits[i >> 3] |= m;
    this.heights[i] = Math.max(0, Math.min(255, Math.round(y)));
    this.count++;
    this.revision++;
    return true;
  }

  /** Mark a disc of columns around the explorer (the lantern's reach). Returns how many were new. */
  markAround(x: number, z: number, radius: number, y = 0): number {
    let n = 0;
    const r2 = radius * radius;
    for (let dz = -Math.ceil(radius); dz <= Math.ceil(radius); dz++)
      for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++)
        if (dx * dx + dz * dz <= r2 && this.markExplored(x + dx, z + dz, y)) n++;
    return n;
  }

  /**
   * Mark what the explorer sees from (x, y, z) (feet): a small disc round the feet, then a fan of
   * rays at eye height across the open cave (a cavern is mapped as far as `radius`, a tunnel to its
   * walls), each column marked at the floor the ray finds under it (so the map keeps the relief).
   * `solid(x, y, z)` reads the world. Returns how many columns were new.
   */
  markSight(solid: (x: number, y: number, z: number) => boolean, x: number, y: number, z: number, radius = 14, rays = 56): number {
    let n = this.markAround(x, z, 3, y);
    const eye = Math.floor(y + 1.6);
    const floorUnder = (cx: number, cz: number): number => {
      for (let yy = eye; yy >= eye - 9; yy--) if (solid(cx, yy - 1, cz) && !solid(cx, yy, cz)) return yy;
      return -1;
    };
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let lastX = -1;
      let lastZ = -1;
      for (let d = 1; d <= radius; d += 0.5) {
        const cx = Math.floor(x + dx * d);
        const cz = Math.floor(z + dz * d);
        if (cx === lastX && cz === lastZ) continue;
        lastX = cx;
        lastZ = cz;
        // A wall at eye height and below it stops the view (the wall's own column shows).
        const wall = solid(cx, eye, cz) && solid(cx, eye - 1, cz);
        const f = wall ? y : floorUnder(cx, cz);
        if (this.markExplored(cx, cz, f >= 0 ? f : y)) n++;
        if (wall) break;
      }
    }
    return n;
  }

  /** Share of the stratum's columns explored (0..1). */
  fraction(): number {
    return this.count / (this.sx * this.sz);
  }

  serialise(): ExploredMapData {
    const hs: number[] = [];
    for (let i = 0; i < this.sx * this.sz; i++) if (this.bits[i >> 3] & (1 << (i & 7))) hs.push(this.heights[i]);
    return { sx: this.sx, sz: this.sz, bits: b64.enc(this.bits), heights: b64.enc(Uint8Array.from(hs)) };
  }

  /** Restore (sizes must match; anything malformed gives an empty map). */
  static deserialise(d: unknown, sx: number, sz: number): ExploredMap {
    const m = new ExploredMap(sx, sz);
    const v = d as Partial<ExploredMapData> | null;
    if (!v || v.sx !== sx || v.sz !== sz || typeof v.bits !== 'string' || typeof v.heights !== 'string') return m;
    try {
      const bits = b64.dec(v.bits);
      const hs = b64.dec(v.heights);
      if (bits.length !== m.bits.length) return m;
      m.bits.set(bits);
      let k = 0;
      for (let i = 0; i < sx * sz; i++) {
        if (m.bits[i >> 3] & (1 << (i & 7))) {
          m.heights[i] = hs[k++] ?? 0;
          m.count++;
        }
      }
      m.revision++;
    } catch {
      return new ExploredMap(sx, sz);
    }
    return m;
  }
}
