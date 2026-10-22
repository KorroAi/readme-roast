/**
 * Round 3 (UI): the minimap (top right of the HUD) and the Map screen's picture, both from one
 * MapSource (ui/types: WORLD's explored stratum, the markers).
 *
 * The explored stratum is first painted into a column image (MapRaster: one RGBA texel per column,
 * rebuilt only when the source's revision moves): the floor in its biome's tint with a hill-shade
 * from the recorded heights (higher ground lit from the north-west), the cave walls drawn as a pale
 * rim where explored floor meets rock or the unknown, hazards (lava, toxic pools) in their own
 * colour, explored rock dark, and the fog of war transparent. The minimap samples that image turned
 * with the view (up is where the explorer looks, about 28 m round); the Map draws it whole, panned
 * and zoomed. The minimap redraws when the source's revision changes, the explorer moves 0.5 m or
 * turns 3 degrees, at most 10 times a second.
 */
import type { MapMarker, MapSource } from '../types';
import { iconSvg } from './glyphs';

/** Colours of the drawn cells: 0 unexplored, 1 rock, 2 floor, 3 water, 4 hazard. */
const CELL_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [40, 35, 31],
  [122, 108, 90],
  [52, 104, 150],
  [196, 98, 44],
];
/** The pale rim of the cave walls. */
const RIM: readonly [number, number, number] = [232, 214, 178];

export const MARKER_COLOR: Record<MapMarker['kind'], string> = {
  camp: '#ffd29a',
  outpost: '#ffb35c',
  lair: '#ff6a5a',
  gate: '#b98cff',
  page: '#f2e6cf',
  chest: '#ffcf5a',
  objective: '#7ef0c0',
  cache: '#ff9b4a',
  shrine: '#8fe3ee',
  nest: '#c86a5a',
  vista: '#ffe7a8',
  river: '#6cc4ff',
  works: '#e0a36a',
  secret: '#f39cff',
  place: '#fff0c8',
  ravine: '#b7c2cf',
};

/** The glyph (ui/hud/glyphs) of each marker kind on the Map. */
export const MARKER_GLYPH: Record<MapMarker['kind'], string> = {
  camp: 'camp',
  outpost: 'outpost',
  lair: 'lair',
  gate: 'gate',
  page: 'page',
  chest: 'chest',
  objective: 'quests',
  cache: 'bag',
  shrine: 'other',
  nest: 'nest',
  vista: 'vista',
  river: 'river',
  works: 'works',
  secret: 'secret',
  place: 'star',
  ravine: 'ravine',
};

/** The line colours (the river; lava in the deepest stratum). */
export const LINE_COLOR: Record<'water' | 'lava', string> = { water: '#5fb8ff', lava: '#ff7a3a' };

/** Markers the minimap pins to its rim when they are beyond its range (the ways that matter). */
const RIM_KINDS: ReadonlySet<MapMarker['kind']> = new Set(['objective', 'camp', 'gate', 'outpost', 'cache']);

/** Contour lines every this many metres of floor height (the Map's relief). */
export const CONTOUR_M = 4;

/**
 * The stratum painted column by column (see the file comment). `rgba` has one texel per column of
 * the source (x + z * width); alpha 0 is the fog of war.
 */
export class MapRaster {
  rgba: Uint8ClampedArray = new Uint8ClampedArray(4);
  width = 1;
  depth = 1;
  private src: MapSource | null = null;
  private rev = -1;
  /** Bumps whenever the picture changed (the Map screen re-uploads its canvas then). */
  version = 0;

  /** Repaint when the source or its revision changed. @returns true when it did. */
  update(src: MapSource): boolean {
    if (src === this.src && src.revision === this.rev) return false;
    this.src = src;
    this.rev = src.revision;
    this.paint(src);
    this.version++;
    return true;
  }

  private paint(src: MapSource): void {
    const w = Math.max(1, src.width | 0);
    const d = Math.max(1, src.depth | 0);
    if (this.width !== w || this.depth !== d || this.rgba.length !== w * d * 4) {
      this.width = w;
      this.depth = d;
      this.rgba = new Uint8ClampedArray(w * d * 4);
    } else this.rgba.fill(0);
    const px = this.rgba;
    // Classify every column once (the rim and the hill-shade read the neighbours).
    const cls = new Uint8Array(w * d);
    const hts = new Float32Array(w * d);
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        const c = src.cell(src.originX + x, src.originZ + z);
        cls[x + z * w] = c;
        if (c !== 0 && src.height) hts[x + z * w] = src.height(src.originX + x, src.originZ + z);
      }
    const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= d ? 0 : cls[x + z * w]);
    const ht = (x: number, z: number, fallback: number) => (x < 0 || z < 0 || x >= w || z >= d || cls[x + z * w] !== 2 ? fallback : hts[x + z * w]);
    // The relief: higher floor a little lighter, lower a little darker, over the stratum's span.
    const lo = src.heightRange?.[0] ?? 0;
    const span = Math.max(1, (src.heightRange?.[1] ?? 0) - lo);
    const band = (y: number) => Math.floor(y / CONTOUR_M);
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        const i = x + z * w;
        const c = cls[i];
        if (c === 0) continue;
        const o = i * 4;
        if (c !== 2) {
          const base = CELL_RGB[c] ?? CELL_RGB[1];
          px[o] = base[0];
          px[o + 1] = base[1];
          px[o + 2] = base[2];
          px[o + 3] = c === 1 ? 225 : 245;
          continue;
        }
        // Floor: the biome's tint over the floor tone, hill-shaded from the north-west.
        const tint = src.biomeColors[src.biome(src.originX + x, src.originZ + z)] ?? 0x807060;
        const h0 = hts[i];
        const slope = (h0 - ht(x - 1, z, h0)) + (h0 - ht(x, z - 1, h0));
        const elev = src.heightRange ? Math.max(0, Math.min(1, (h0 - lo) / span)) : 0.5;
        const shade = Math.max(0.62, Math.min(1.36, (1 + slope * 0.09) * (0.86 + elev * 0.3)));
        // A mid-dark ground (the walls' rim is the brightest thing on the map).
        let r = (CELL_RGB[2][0] * 0.42 + ((tint >> 16) & 255) * 0.3) * shade;
        let g = (CELL_RGB[2][1] * 0.42 + ((tint >> 8) & 255) * 0.3) * shade;
        let b = (CELL_RGB[2][2] * 0.42 + (tint & 255) * 0.3) * shade;
        // Contour lines: the floor crosses a CONTOUR_M step between this column and the one east or south.
        if (src.heightRange) {
          const b0 = band(h0);
          if (band(ht(x + 1, z, h0)) !== b0 || band(ht(x, z + 1, h0)) !== b0) {
            r *= 0.74;
            g *= 0.74;
            b *= 0.78;
          }
        }
        // A wall rim where the floor meets rock or the unknown.
        const edge = at(x - 1, z) !== 2 || at(x + 1, z) !== 2 || at(x, z - 1) !== 2 || at(x, z + 1) !== 2;
        if (edge) {
          r = r * 0.45 + RIM[0] * 0.55;
          g = g * 0.45 + RIM[1] * 0.55;
          b = b * 0.45 + RIM[2] * 0.55;
        }
        px[o] = r;
        px[o + 1] = g;
        px[o + 2] = b;
        px[o + 3] = 255;
      }
  }
}

/**
 * Draw a whole stratum as ImageData (the Map screen's picture; tests read it): one pixel per
 * column, fog of war transparent.
 */
export function renderMapImage(src: MapSource): ImageData | null {
  if (typeof ImageData === 'undefined') return null;
  const r = new MapRaster();
  r.update(src);
  const img = new ImageData(r.width, r.depth);
  img.data.set(r.rgba);
  return img;
}

export class Minimap {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly arrow: HTMLElement;
  private src: MapSource | null = null;
  private readonly raster = new MapRaster();
  private lastVersion = -1;
  private lastX = NaN;
  private lastZ = NaN;
  private lastYaw = NaN;
  private lastAt = 0;
  private img: ImageData | null = null;
  /** Metres shown from the centre to the edge. */
  readonly range = 28;
  private readonly size: number;

  constructor(cssSize = 92) {
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    this.size = Math.round(cssSize * dpr);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.className = 'dd-minimap-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.arrow = document.createElement('span');
    this.arrow.className = 'dd-minimap-me';
    this.arrow.innerHTML = iconSvg('arrow');
    this.el = document.createElement('div');
    this.el.className = 'dd-minimap';
    this.el.setAttribute('data-ui-target', 'minimap');
    this.el.setAttribute('role', 'img');
    this.el.append(this.canvas, this.arrow);
  }

  setSource(src: MapSource | null): void {
    if (src === this.src) return;
    this.src = src;
    this.lastVersion = -1;
    this.el.classList.toggle('empty', !src);
  }

  /** Redraw when something visible changed (cheap to call every frame). */
  update(now: number, label: string): void {
    const s = this.src;
    if (!s || !this.ctx) return;
    if (now - this.lastAt < 100) return;
    const repainted = this.raster.update(s);
    const moved = Math.hypot(s.playerX - this.lastX, s.playerZ - this.lastZ) > 0.5 || !(Math.abs(s.yaw - this.lastYaw) < 0.05);
    if (!repainted && !moved && this.raster.version === this.lastVersion) return;
    this.lastAt = now;
    this.lastVersion = this.raster.version;
    this.lastX = s.playerX;
    this.lastZ = s.playerZ;
    this.lastYaw = s.yaw;
    this.draw(s);
    if (this.el.getAttribute('aria-label') !== label) this.el.setAttribute('aria-label', label);
  }

  private draw(s: MapSource): void {
    const ctx = this.ctx!;
    const n = this.size;
    if (!this.img || this.img.width !== n) this.img = ctx.createImageData(n, n);
    const px = this.img.data;
    const half = n / 2;
    const mPerPx = this.range / half;
    // Up on the map is the view direction: the camera's forward is (-sin yaw, -cos yaw).
    const cs = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const r2 = half * half;
    const R = this.raster;
    const rw = R.width;
    const rd = R.depth;
    const col = R.rgba;
    for (let py = 0; py < n; py++) {
      const vy = py + 0.5 - half;
      for (let pxi = 0; pxi < n; pxi++) {
        const vx = pxi + 0.5 - half;
        const i = (py * n + pxi) * 4;
        const rr = vx * vx + vy * vy;
        if (rr > r2) {
          px[i + 3] = 0;
          continue;
        }
        // Screen right = camera right (cos yaw, -sin yaw); screen up = forward.
        const fwd = -vy * mPerPx;
        const right = vx * mPerPx;
        const cx = Math.floor(s.playerX - sn * fwd + cs * right) - s.originX;
        const cz = Math.floor(s.playerZ - cs * fwd - sn * right) - s.originZ;
        const a = cx >= 0 && cz >= 0 && cx < rw && cz < rd ? col[(cx + cz * rw) * 4 + 3] : 0;
        // The rim of the window darkens a little (a lens, not a cut-out).
        const vig = rr > r2 * 0.72 ? 0.78 : 1;
        if (a === 0) {
          px[i] = 7;
          px[i + 1] = 9;
          px[i + 2] = 13;
          px[i + 3] = 160;
          continue;
        }
        const o = (cx + cz * rw) * 4;
        px[i] = col[o] * vig;
        px[i + 1] = col[o + 1] * vig;
        px[i + 2] = col[o + 2] * vig;
        px[i + 3] = 240;
      }
    }
    ctx.putImageData(this.img, 0, 0);
    const k = n / 92;
    // The river's explored stretches, turned with the view and clipped to the round window.
    if (s.lines?.length) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(half, half, half - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const line of s.lines) {
        ctx.strokeStyle = LINE_COLOR[line.kind];
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2.2 * k;
        for (const run of line.runs) {
          ctx.beginPath();
          for (let j = 0; j + 1 < run.length; j += 2) {
            const dx = run[j] - s.playerX;
            const dz = run[j + 1] - s.playerZ;
            const vx = half + (dx * cs - dz * sn) / mPerPx;
            const vy = half - (-dx * sn - dz * cs) / mPerPx;
            if (j === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // Markers inside the range (dimmed when done), clamped to the rim when beyond it.
    for (const m of s.markers) {
      const dx = m.x - s.playerX;
      const dz = m.z - s.playerZ;
      const right = dx * cs - dz * sn;
      const fwd = -dx * sn - dz * cs;
      let mx = right / mPerPx;
      let my = -fwd / mPerPx;
      const l = Math.hypot(mx, my);
      const edge = half - 5 * k;
      const beyond = l > edge;
      if (beyond) {
        if (!RIM_KINDS.has(m.kind)) continue;
        mx = (mx / l) * edge;
        my = (my / l) * edge;
      }
      ctx.globalAlpha = m.done ? 0.45 : 1;
      ctx.fillStyle = MARKER_COLOR[m.kind] ?? '#fff';
      ctx.strokeStyle = 'rgba(5,8,13,0.92)';
      ctx.lineWidth = Math.max(1, 1.2 * k);
      const r = (m.kind === 'objective' ? 4 : 3.2) * k;
      ctx.beginPath();
      if (m.kind === 'lair' || m.kind === 'gate' || m.kind === 'objective') {
        ctx.moveTo(half + mx, half + my - r * 1.3);
        ctx.lineTo(half + mx + r * 1.2, half + my + r);
        ctx.lineTo(half + mx - r * 1.2, half + my + r);
        ctx.closePath();
      } else if (m.kind === 'camp' || m.kind === 'outpost') {
        ctx.rect(half + mx - r, half + my - r, r * 2, r * 2);
      } else if (m.kind === 'cache' || m.kind === 'vista' || m.kind === 'works' || m.kind === 'secret' || m.kind === 'place') {
        // The places and the pack left behind: a diamond.
        const q = r * 1.25;
        ctx.moveTo(half + mx, half + my - q);
        ctx.lineTo(half + mx + q, half + my);
        ctx.lineTo(half + mx, half + my + q);
        ctx.lineTo(half + mx - q, half + my);
        ctx.closePath();
      } else ctx.arc(half + mx, half + my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
