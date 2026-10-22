import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import { LINE_COLOR, MARKER_COLOR, MARKER_GLYPH, MapRaster } from '../../hud/Minimap';
import { iconSvg } from '../../hud/glyphs';
import type { MapMarker, MapSource, MapView } from '../../types';
import type { ScreenHost } from '../host';
import { btn } from '../widgets';
import { empty, glyphEl, menuShell } from './shell';

const MARKER_LABEL: Record<MapMarker['kind'], TextKey> = {
  camp: 'm3.map.m.camp',
  outpost: 'm3.map.m.outpost',
  lair: 'm3.map.m.lair',
  gate: 'm3.map.m.gate',
  page: 'm3.map.m.page',
  chest: 'm3.map.m.chest',
  objective: 'm3.map.m.objective',
  cache: 'm3.map.m.cache',
  shrine: 'm3.map.m.shrine',
  nest: 'm3.map.m.nest',
  vista: 'm3.map.m.vista',
  river: 'm3.map.m.river',
  works: 'm3.map.m.works',
  secret: 'm3.map.m.secret',
  place: 'm3.map.m.place',
  ravine: 'm3.map.m.ravine',
};

/** The legend's order: the ways first (camp, outposts, the objective, the gate), then lairs, places, finds. */
export const LEGEND_ORDER: ReadonlyArray<MapMarker['kind']> =['camp', 'outpost', 'objective', 'gate', 'lair', 'cache', 'vista', 'river', 'works', 'place', 'secret', 'page', 'chest', 'ravine', 'nest', 'shrine'];

/** Zoom limits (CSS px per metre) and the default view's span around the explorer (m). */
export const MAP_ZOOM_MAX = 14;
const DEFAULT_SPAN = 56;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

/** The Map's view: the world point at the centre and the zoom (CSS px per metre). */
export interface MapCamera {
  cx: number;
  cz: number;
  zoom: number;
}

/** A world point to the view (pure, unit-tested): north up, `size` CSS px square. */
export function mapToView(cam: MapCamera, x: number, z: number, size: number): [number, number] {
  return [size / 2 + (x - cam.cx) * cam.zoom, size / 2 + (z - cam.cz) * cam.zoom];
}

/** The world point under a view point (the inverse of mapToView). */
export function viewToMap(cam: MapCamera, vx: number, vy: number, size: number): [number, number] {
  return [cam.cx + (vx - size / 2) / cam.zoom, cam.cz + (vy - size / 2) / cam.zoom];
}

/** Keep a zoom in range: from the whole stratum in view to MAP_ZOOM_MAX. */
export function clampZoom(zoom: number, size: number, src: Pick<MapSource, 'width' | 'depth'>): number {
  const min = (size / Math.max(src.width, src.depth)) * 0.9;
  return Math.max(min, Math.min(MAP_ZOOM_MAX, zoom));
}

/** Zoom by `k` about a view point, keeping the world point under it still (pinch, wheel, buttons). */
export function zoomAbout(cam: MapCamera, k: number, vx: number, vy: number, size: number, src: Pick<MapSource, 'width' | 'depth'>): MapCamera {
  const [wx, wz] = viewToMap(cam, vx, vy, size);
  const zoom = clampZoom(cam.zoom * k, size, src);
  return { zoom, cx: wx - (vx - size / 2) / zoom, cz: wz - (vy - size / 2) / zoom };
}

/** The default view: centred on the explorer, about DEFAULT_SPAN metres across. */
export function homeCamera(src: Pick<MapSource, 'playerX' | 'playerZ' | 'width' | 'depth'>, size: number): MapCamera {
  return { cx: src.playerX, cz: src.playerZ, zoom: clampZoom(size / DEFAULT_SPAN, size, src) };
}

/** A round scale-bar length (m) for a zoom, about 70 CSS px long. */
export function scaleBarMetres(zoom: number): number {
  const target = 70 / Math.max(0.01, zoom);
  for (const m of [1, 2, 5, 10, 20, 25, 50, 100, 200]) if (m >= target * 0.7) return m;
  return 200;
}

/**
 * The Map (BRIEF §0.6): the explored stratum under fog of war, tinted by biome and hill-shaded,
 * its cave walls drawn; markers for the camp, outposts, lairs, the gate, journal pages and chests
 * seen (tap one for its name and distance); the explorer's arrow; drag to pan, pinch or the
 * buttons to zoom, the target button to come back; the biomes with how much of each is explored;
 * fast travel between the camp and the outposts; the expedition's seed.
 */
export function buildMap(host: ScreenHost): HTMLElement {
  const v: MapView | null = host.actions.getMap();
  if (!v) return menuShell(host, 'map', t('m3.map.title'), t('m3.help.map'), [empty(t('m3.map.none'))]);
  const st = host.state;
  const src = v.source;

  const raster = new MapRaster();
  raster.update(src);
  const fogCanvas = document.createElement('canvas');
  fogCanvas.width = raster.width;
  fogCanvas.height = raster.depth;
  const fctx = fogCanvas.getContext('2d');
  if (fctx && typeof ImageData !== 'undefined') {
    const img = new ImageData(raster.width, raster.depth);
    img.data.set(raster.rgba);
    fctx.putImageData(img, 0, 0);
  }
  // The edge of the known: a warm halo round what was explored (blurred once here, drawn smooth).
  const halo = haloCanvas(raster);

  const canvas = h('canvas', { class: 'dd-m3-map', role: 'img', 'aria-label': t('m3.map.aria', { name: v.stratumName }) });
  const layer = h('div', { class: 'dd-m3-maplayer' });
  const me = h('span', { class: 'dd-m3-mapme', 'aria-hidden': 'true' });
  me.innerHTML = iconSvg('arrow');
  const scaleBar = h('span', { class: 'dd-m3-scalebar' });
  const scaleText = h('span', { class: 'dd-m3-scaletext' });
  const caption = h('p', { class: 'dd-m3-mapcaption', role: 'status', 'aria-live': 'polite' });
  const view = h('div', { class: 'dd-m3-mapview', 'data-key': 'mapview' }, canvas, layer, me, h('span', { class: 'dd-m3-north', 'aria-hidden': 'true', text: 'N' }), h('div', { class: 'dd-m3-scale', 'aria-hidden': 'true' }, scaleBar, scaleText));

  let size = 320;
  let cam: MapCamera = st.mapCamera && !host.opening ? { ...st.mapCamera } : homeCamera(src, size);
  let homed = !(st.mapCamera && !host.opening);
  let selected: MapMarker | null = null;

  // One DOM button per marker (tappable, with its glyph), placed by draw().
  const pins = src.markers.map((m) => {
    const b = h(
      'button',
      {
        class: `dd-m3-pin k-${m.kind}${m.done ? ' done' : ''}`,
        type: 'button',
        style: `--pin:${MARKER_COLOR[m.kind] ?? '#fff'}`,
        'aria-label': markerName(m),
        'data-key': `pin:${m.kind}:${m.id ?? ''}`,
        onclick: (e: Event) => {
          e.stopPropagation();
          selected = selected === m ? null : m;
          showCaption();
          draw();
        },
      },
      glyphEl(MARKER_GLYPH[m.kind] ?? 'other', 'dd-m3-pinglyph'),
    );
    layer.append(b);
    return { m, b };
  });

  const showCaption = () => {
    if (!selected) {
      caption.textContent = t('m3.map.hint');
      caption.classList.remove('on');
      return;
    }
    const d = Math.round(Math.hypot(selected.x - src.playerX, selected.z - src.playerZ));
    caption.textContent = t('m3.map.pinInfo', { name: markerName(selected), m: d });
    caption.classList.add('on');
  };

  const ctx = canvas.getContext('2d');
  const draw = () => {
    st.mapCamera = { ...cam };
    if (ctx) {
      const dpr = canvas.width / Math.max(1, size);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // The stratum's bounds (the rock beyond it is not part of the map).
      const [bx0, by0] = mapToView(cam, src.originX, src.originZ, size);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(14, 18, 26, 0.9)';
      ctx.fillRect(bx0, by0, src.width * cam.zoom, src.depth * cam.zoom);
      // A faint 16 m grid over the whole stratum (the paper of the map).
      ctx.strokeStyle = 'rgba(176, 130, 63, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 0; gx <= src.width; gx += 16) {
        const [x] = mapToView(cam, src.originX + gx, src.originZ, size);
        ctx.moveTo(Math.round(x) + 0.5, by0);
        ctx.lineTo(Math.round(x) + 0.5, by0 + src.depth * cam.zoom);
      }
      for (let gz = 0; gz <= src.depth; gz += 16) {
        const [, y] = mapToView(cam, src.originX, src.originZ + gz, size);
        ctx.moveTo(bx0, Math.round(y) + 0.5);
        ctx.lineTo(bx0 + src.width * cam.zoom, Math.round(y) + 0.5);
      }
      ctx.stroke();
      // The halo, smooth, under the explored caves (crisp texels).
      if (halo) {
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(halo, bx0, by0, src.width * cam.zoom, src.depth * cam.zoom);
        ctx.globalAlpha = 1;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(fogCanvas, bx0, by0, src.width * cam.zoom, src.depth * cam.zoom);
      // The underground river's explored stretches: a soft glow, then the bright line.
      for (const line of src.lines ?? []) {
        for (const [w, a] of [[5, 0.22], [2, 0.95]] as const) {
          ctx.strokeStyle = LINE_COLOR[line.kind];
          ctx.globalAlpha = a;
          ctx.lineWidth = Math.max(1, w * Math.min(1.6, Math.max(0.6, cam.zoom / 3)));
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (const run of line.runs) {
            ctx.beginPath();
            for (let j = 0; j + 1 < run.length; j += 2) {
              const [x, y] = mapToView(cam, run[j], run[j + 1], size);
              if (j === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      // The explorer's view: a soft cone ahead of the arrow.
      const [ex, ey] = mapToView(cam, src.playerX, src.playerZ, size);
      const ahead = -Math.PI / 2 - src.yaw;
      const reach = 42;
      const cone = ctx.createRadialGradient(ex, ey, 4, ex, ey, reach);
      cone.addColorStop(0, 'rgba(255, 226, 170, 0.32)');
      cone.addColorStop(1, 'rgba(255, 226, 170, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.arc(ex, ey, reach, ahead - 0.55, ahead + 0.55);
      ctx.closePath();
      ctx.fill();
      // The stratum's edge.
      ctx.strokeStyle = 'rgba(176, 130, 63, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(bx0) + 0.5, Math.round(by0) + 0.5, Math.round(src.width * cam.zoom), Math.round(src.depth * cam.zoom));
    }
    for (const { m, b } of pins) {
      const [x, y] = mapToView(cam, m.x, m.z, size);
      const out = x < -12 || y < -12 || x > size + 12 || y > size + 12;
      b.hidden = out;
      if (!out) b.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      b.classList.toggle('sel', m === selected);
    }
    const [px, py] = mapToView(cam, src.playerX, src.playerZ, size);
    // The camera's forward is (-sin yaw, -cos yaw): on a north-up map that turns the arrow by -yaw.
    me.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) rotate(${(-src.yaw * 180) / Math.PI}deg)`;
    me.hidden = px < -10 || py < -10 || px > size + 10 || py > size + 10;
    const m = scaleBarMetres(cam.zoom);
    scaleBar.style.width = `${Math.round(m * cam.zoom)}px`;
    scaleText.textContent = t('hud3.dist', { m });
  };

  const fit = () => {
    const w = Math.round(view.clientWidth);
    if (!w || !view.isConnected) return false;
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    if (w !== size || canvas.width !== Math.round(w * dpr)) {
      size = w;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * dpr);
      if (homed) cam = homeCamera(src, size);
      cam.zoom = clampZoom(cam.zoom, size, src);
    }
    draw();
    return true;
  };
  // Measured once it is in the page (and again whenever its width changes).
  const tryFit = (n: number) => {
    if (fit() || n <= 0) return;
    requestAnimationFrame(() => tryFit(n - 1));
  };
  requestAnimationFrame(() => tryFit(30));
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!view.isConnected) {
        ro.disconnect();
        return;
      }
      fit();
    });
    ro.observe(view);
  }

  // Drag to pan, pinch to zoom (pointer events), the wheel on desktop.
  const pts = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; cam: MapCamera; mx: number; my: number } | null = null;
  const local = (e: PointerEvent) => {
    const r = view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  view.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.dd-m3-pin, .dd-m3-mapctl')) return;
    view.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cam: { ...cam }, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
    e.preventDefault();
  });
  view.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    homed = false;
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam = zoomAbout(pinch.cam, d / Math.max(1, pinch.d), pinch.mx, pinch.my, size, src);
    } else {
      cam = { ...cam, cx: cam.cx - (p.x - prev.x) / cam.zoom, cz: cam.cz - (p.y - prev.y) / cam.zoom };
    }
    draw();
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = view.getBoundingClientRect();
      homed = false;
      cam = zoomAbout(cam, e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top, size, src);
      draw();
    },
    { passive: false },
  );
  const zoomBtn = (k: number, glyph: string, label: string, key: string) =>
    h(
      'button',
      {
        class: 'dd-m3-mapctl',
        type: 'button',
        'aria-label': label,
        'data-key': key,
        onclick: () => {
          homed = false;
          cam = zoomAbout(cam, k, size / 2, size / 2, size, src);
          draw();
        },
      },
      h('span', { class: 'dd-m3-mapctl-g', 'aria-hidden': 'true', text: glyph }),
    );
  const centreBtn = h(
    'button',
    {
      class: 'dd-m3-mapctl',
      type: 'button',
      'aria-label': t('m3.map.centre'),
      'data-key': 'map:centre',
      onclick: () => {
        homed = true;
        cam = homeCamera(src, size);
        selected = null;
        showCaption();
        draw();
      },
    },
    glyphEl('compassMe', 'dd-m3-mapctl-icon'),
  );
  view.append(h('div', { class: 'dd-m3-mapctls' }, zoomBtn(1.5, '+', t('m3.map.zoomIn'), 'map:zoomIn'), zoomBtn(1 / 1.5, '−', t('m3.map.zoomOut'), 'map:zoomOut'), centreBtn));
  showCaption();

  // The legend: the kinds of marker on this map, with their glyphs and counts (the ways first).
  const present = new Set(src.markers.map((m) => m.kind));
  const kinds = LEGEND_ORDER.filter((k) => present.has(k));
  const legend = h(
    'ul',
    { class: 'dd-m3-legend' },
    ...kinds.map((k) =>
      h(
        'li',
        { style: `--pin:${MARKER_COLOR[k]}` },
        glyphEl(MARKER_GLYPH[k] ?? 'other', 'dd-m3-legendglyph'),
        h('span', { text: t(MARKER_LABEL[k]) }),
        h('b', { text: String(src.markers.filter((m) => m.kind === k).length) }),
      ),
    ),
  );
  const biomes = h(
    'ul',
    { class: 'dd-m3-biomes' },
    ...v.biomes.map((b) =>
      h(
        'li',
        null,
        h('span', { class: 'dd-m3-dot', style: `background:#${b.color.toString(16).padStart(6, '0')}` }),
        h('span', { class: 'dd-m3-biomename', text: b.name }),
        h('span', { class: 'dd-m3-prog small', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(b.explored * 100) }, h('span', { class: 'dd-m3-progfill', style: `transform:scaleX(${Math.max(0, Math.min(1, b.explored))})` })),
        h('b', { text: t('m3.map.explored', { pct: Math.round(b.explored * 100) }) }),
      ),
    ),
  );

  // Fast travel: the camp, then the outposts by stratum.
  const travel = h('div', { class: 'dd-m3-travel' });
  let lastStratum = -1;
  for (const p of v.travel) {
    if (p.stratum !== lastStratum && v.travel.some((x) => x.stratum !== p.stratum)) {
      lastStratum = p.stratum;
      travel.append(h('h4', { class: 'dd-m3-travelhead', text: t('m3.map.inStratum', { n: ROMAN[p.stratum] ?? String(p.stratum) }) }));
    }
    travel.append(
      h(
        'div',
        { class: `dd-m3-travelrow${p.here ? ' here' : ''}`, 'data-key': `travelrow:${p.id}` },
        glyphEl(p.id === 'camp' ? 'camp' : 'outpost', 'dd-m3-travelglyph'),
        h('span', { class: 'dd-m3-travelname', text: p.name }),
        p.here
          ? h('span', { class: 'dd-m3-good', text: t('m3.map.here') })
          : btn(t('m3.map.travel'), () => host.actions.fastTravel(p.id), { disabled: !p.can, key: `travel:${p.id}`, variant: 'primary' }),
      ),
    );
  }
  const travelNote = v.travel.some((p) => !p.here && !p.can) ? h('p', { class: 'dd-m3-meta dim', text: t('m3.map.travelNeed') }) : null;
  const noOutposts = v.travel.filter((p) => p.id !== 'camp').length === 0 ? h('p', { class: 'dd-m3-meta dim', text: t('m3.map.noOutposts') }) : null;

  const explored = v.biomes.length ? Math.round((v.biomes.reduce((a, b) => a + b.explored, 0) / v.biomes.length) * 100) : 0;
  const body = [
    h('p', { class: 'dd-m3-meta' }, h('span', { class: 'dd-m3-mapname', text: v.stratumName }), h('span', { class: 'dd-m3-seed', text: t('m3.map.seed', { seed: v.seed }) })),
    view,
    caption,
    legend,
    h('h3', { class: 'dd-m3-section', text: t('m3.map.biomes') }),
    h('p', { class: 'dd-m3-meta dim', text: t('m3.map.exploredAll', { pct: explored }) }),
    biomes,
    v.places ? h('p', { class: 'dd-m3-meta dd-m3-places' }, glyphEl('star', 'dd-m3-legendglyph'), h('span', { text: t('m3.map.places', { n: v.places.found, total: v.places.total }) })) : null,
    h('h3', { class: 'dd-m3-section', text: t('m3.map.fastTravel') }),
    travel,
    travelNote,
    noOutposts,
  ];
  return menuShell(host, 'map', t('m3.map.title'), t('m3.help.map'), body);
}

function markerName(m: MapMarker): string {
  return m.label ? `${t(MARKER_LABEL[m.kind])} · ${m.label}` : t(MARKER_LABEL[m.kind]);
}

/**
 * The halo of the known (one texel per column, like the raster): every explored column glows amber,
 * blurred by a couple of columns where the canvas filter exists (else the smooth upscale still
 * softens it). Null without a 2D context (tests).
 */
function haloCanvas(r: MapRaster): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || typeof ImageData === 'undefined') return null;
  const mask = document.createElement('canvas');
  mask.width = r.width;
  mask.height = r.depth;
  const mctx = mask.getContext('2d');
  if (!mctx) return null;
  const img = new ImageData(r.width, r.depth);
  const px = img.data;
  const src = r.rgba;
  for (let i = 0; i < r.width * r.depth; i++) {
    if (src[i * 4 + 3] === 0) continue;
    px[i * 4] = 255;
    px[i * 4 + 1] = 186;
    px[i * 4 + 2] = 104;
    px[i * 4 + 3] = 255;
  }
  mctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = r.width;
  out.height = r.depth;
  const octx = out.getContext('2d');
  if (!octx) return mask;
  if ('filter' in octx) octx.filter = 'blur(2.5px)';
  octx.drawImage(mask, 0, 0);
  return out;
}
