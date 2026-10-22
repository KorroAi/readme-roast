/**
 * Round 3 (UI): the minimap (top right of the HUD) and the Map screen's drawing, both from one
 * MapSource (ui/types: WORLD's explored stratum, the markers). The minimap turns with the view (up
 * is where the explorer looks) and shows about 40 m around; it redraws only when the source's
 * revision changes, the explorer moves 0.5 m or turns 3 degrees, at most 10 times a second.
 */
import type { MapMarker, MapSource } from '../types';
import { iconSvg } from './glyphs';

/** Colours of the drawn cells: 0 unexplored, 1 rock, 2 floor, 3 water, 4 hazard. */
const CELL_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [38, 34, 31],
  [128, 112, 92],
  [52, 104, 150],
  [176, 92, 44],
];

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
};

/** The tint of a floor cell by biome: the biome colour over the floor tone. */
function floorRgb(src: MapSource, x: number, z: number, out: number[]): void {
  const c = src.cell(x, z);
  const base = CELL_RGB[c] ?? CELL_RGB[0];
  if (c !== 2) {
    out[0] = base[0];
    out[1] = base[1];
    out[2] = base[2];
    return;
  }
  const tint = src.biomeColors[src.biome(x, z)] ?? 0x807060;
  out[0] = Math.round(base[0] * 0.55 + ((tint >> 16) & 255) * 0.45);
  out[1] = Math.round(base[1] * 0.55 + ((tint >> 8) & 255) * 0.45);
  out[2] = Math.round(base[2] * 0.55 + (tint & 255) * 0.45);
}

/**
 * Draw a whole stratum (the Map screen): one pixel per column at `scale`, fog of war black, the
 * floor tinted by biome. Returns the ImageData written (for tests).
 */
export function renderMapImage(src: MapSource): ImageData | null {
  if (typeof ImageData === 'undefined') return null;
  const w = Math.max(1, src.width | 0);
  const d = Math.max(1, src.depth | 0);
  const img = new ImageData(w, d);
  const px = img.data;
  const rgb = [0, 0, 0];
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const wx = src.originX + x;
      const wz = src.originZ + z;
      const i = (z * w + x) * 4;
      if (src.cell(wx, wz) === 0) {
        px[i + 3] = 0;
        continue;
      }
      floorRgb(src, wx, wz, rgb);
      px[i] = rgb[0];
      px[i + 1] = rgb[1];
      px[i + 2] = rgb[2];
      px[i + 3] = 255;
    }
  }
  return img;
}

export class Minimap {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly arrow: HTMLElement;
  private src: MapSource | null = null;
  private lastRev = -1;
  private lastX = NaN;
  private lastZ = NaN;
  private lastYaw = NaN;
  private lastAt = 0;
  private img: ImageData | null = null;
  /** Metres shown from the centre to the edge. */
  readonly range = 40;
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
    this.lastRev = -1;
    this.el.classList.toggle('empty', !src);
  }

  /** Redraw when something visible changed (cheap to call every frame). */
  update(now: number, label: string): void {
    const s = this.src;
    if (!s || !this.ctx) return;
    const moved = Math.hypot(s.playerX - this.lastX, s.playerZ - this.lastZ) > 0.5 || !(Math.abs(s.yaw - this.lastYaw) < 0.05);
    if (s.revision === this.lastRev && !moved) return;
    if (now - this.lastAt < 100) return;
    this.lastAt = now;
    this.lastRev = s.revision;
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
    const rgb = [0, 0, 0];
    const r2 = half * half;
    for (let py = 0; py < n; py++) {
      const vy = py + 0.5 - half;
      for (let pxi = 0; pxi < n; pxi++) {
        const vx = pxi + 0.5 - half;
        const i = (py * n + pxi) * 4;
        if (vx * vx + vy * vy > r2) {
          px[i + 3] = 0;
          continue;
        }
        // Screen right = camera right (cos yaw, -sin yaw); screen up = forward.
        const fwd = -vy * mPerPx;
        const right = vx * mPerPx;
        const wx = Math.floor(s.playerX - sn * fwd + cs * right);
        const wz = Math.floor(s.playerZ - cs * fwd - sn * right);
        const c = s.cell(wx, wz);
        if (c === 0) {
          px[i] = 6;
          px[i + 1] = 8;
          px[i + 2] = 12;
          px[i + 3] = 150;
          continue;
        }
        floorRgb(s, wx, wz, rgb);
        px[i] = rgb[0];
        px[i + 1] = rgb[1];
        px[i + 2] = rgb[2];
        px[i + 3] = 235;
      }
    }
    ctx.putImageData(this.img, 0, 0);
    // Markers inside the range (dimmed when done), clamped to the rim when beyond it.
    for (const m of s.markers) {
      const dx = m.x - s.playerX;
      const dz = m.z - s.playerZ;
      const right = dx * cs - dz * sn;
      const fwd = -dx * sn - dz * cs;
      let mx = right / mPerPx;
      let my = -fwd / mPerPx;
      const l = Math.hypot(mx, my);
      const edge = half - 5;
      const beyond = l > edge;
      if (beyond) {
        if (m.kind !== 'objective' && m.kind !== 'camp' && m.kind !== 'gate') continue;
        mx = (mx / l) * edge;
        my = (my / l) * edge;
      }
      ctx.globalAlpha = m.done ? 0.45 : 1;
      ctx.fillStyle = MARKER_COLOR[m.kind] ?? '#fff';
      ctx.strokeStyle = 'rgba(5,8,13,0.9)';
      ctx.lineWidth = Math.max(1, n / 92);
      const r = (m.kind === 'objective' ? 4 : 3) * (n / 92);
      ctx.beginPath();
      if (m.kind === 'lair' || m.kind === 'gate' || m.kind === 'objective') {
        ctx.moveTo(half + mx, half + my - r * 1.3);
        ctx.lineTo(half + mx + r * 1.2, half + my + r);
        ctx.lineTo(half + mx - r * 1.2, half + my + r);
        ctx.closePath();
      } else ctx.arc(half + mx, half + my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
