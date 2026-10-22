import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import { MARKER_COLOR, renderMapImage } from '../../hud/Minimap';
import type { MapMarker, MapView } from '../../types';
import type { ScreenHost } from '../host';
import { btn } from '../widgets';
import { empty, menuShell } from './shell';

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
};

/** A world point to the canvas (pure): the stratum fills the square, north up. */
export function mapToCanvas(v: { originX: number; originZ: number; width: number; depth: number }, x: number, z: number, size: number): [number, number] {
  const s = size / Math.max(v.width, v.depth);
  return [(x - v.originX) * s, (z - v.originZ) * s];
}

/**
 * The Map (BRIEF §0.6): the explored stratum under fog of war, tinted by biome; markers for the
 * camp, outposts, lairs, the gate, journal pages and chests seen; the explorer's arrow; the biomes
 * with how much of each is explored; fast travel between outposts; the expedition's seed.
 */
export function buildMap(host: ScreenHost): HTMLElement {
  const v: MapView | null = host.actions.getMap();
  if (!v) return menuShell(host, 'map', t('m3.map.title'), t('m3.help.map'), [empty(t('m3.map.none'))]);
  const src = v.source;
  const size = 512;
  const canvas = h('canvas', { class: 'dd-m3-map', width: size, height: size, role: 'img', 'aria-label': t('m3.map.aria', { name: v.stratumName }) });
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, size, size);
    const img = renderMapImage(src);
    if (img) {
      const tmp = document.createElement('canvas');
      tmp.width = img.width;
      tmp.height = img.height;
      tmp.getContext('2d')?.putImageData(img, 0, 0);
      const s = size / Math.max(src.width, src.depth);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, src.width * s, src.depth * s);
    }
    for (const m of src.markers) {
      const [x, y] = mapToCanvas(src, m.x, m.z, size);
      ctx.globalAlpha = m.done ? 0.45 : 1;
      ctx.fillStyle = MARKER_COLOR[m.kind] ?? '#fff';
      ctx.strokeStyle = '#05080d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const r = m.kind === 'gate' || m.kind === 'lair' || m.kind === 'camp' ? 8 : 5;
      if (m.kind === 'gate' || m.kind === 'lair') {
        ctx.moveTo(x, y - r * 1.2);
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        ctx.closePath();
      } else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // The explorer: an arrow along the view (camera forward = (-sin yaw, -cos yaw)).
    const [px, py] = mapToCanvas(src, src.playerX, src.playerZ, size);
    const fx = -Math.sin(src.yaw);
    const fz = -Math.cos(src.yaw);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(fx, -fz));
    ctx.fillStyle = '#efe7d8';
    ctx.strokeStyle = '#05080d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  const kinds = [...new Set(src.markers.map((m) => m.kind))];
  const legend = h(
    'ul',
    { class: 'dd-m3-legend' },
    ...kinds.map((k) => h('li', null, h('span', { class: 'dd-m3-dot', style: `background:${MARKER_COLOR[k]}` }), t(MARKER_LABEL[k]), h('b', { text: String(src.markers.filter((m) => m.kind === k).length) }))),
  );
  const biomes = h(
    'ul',
    { class: 'dd-m3-biomes' },
    ...v.biomes.map((b) => h('li', null, h('span', { class: 'dd-m3-dot', style: `background:#${b.color.toString(16).padStart(6, '0')}` }), b.name, h('b', { text: t('m3.map.explored', { pct: Math.round(b.explored * 100) }) }))),
  );
  const travel = h(
    'div',
    { class: 'dd-m3-travel' },
    ...(v.travel.length
      ? v.travel.map((p) =>
          h(
            'div',
            { class: `dd-m3-travelrow${p.here ? ' here' : ''}` },
            h('span', { class: 'dd-m3-travelname', text: p.name }),
            p.here
              ? h('span', { class: 'dd-m3-good', text: t('m3.map.here') })
              : btn(t('m3.map.travel'), () => host.actions.fastTravel(p.id), { disabled: !p.can, key: `travel:${p.id}`, variant: 'primary', sub: p.can ? undefined : p.reason ?? undefined }),
          ),
        )
      : [empty(t('m3.map.noOutposts'))]),
  );
  const body = [
    h('p', { class: 'dd-m3-meta' }, h('span', { text: v.stratumName }), h('span', { class: 'dd-m3-seed', text: t('m3.map.seed', { seed: v.seed }) })),
    h('div', { class: 'dd-m3-mapwrap' }, canvas),
    legend,
    h('h3', { class: 'dd-m3-section', text: t('m3.map.biomes') }),
    biomes,
    h('h3', { class: 'dd-m3-section', text: t('m3.map.fastTravel') }),
    travel,
  ];
  return menuShell(host, 'map', t('m3.map.title'), t('m3.help.map'), body);
}
