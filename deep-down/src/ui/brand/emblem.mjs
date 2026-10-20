// The DEEP DOWN emblem: a lintel segment with the builders' lantern rune hanging from it (a
// diamond on a stem, cyan ink, an amber flame inside). One geometry for every use:
// - the lantern-rune O of the wordmark (src/ui/brand/wordmark.ts),
// - the boot mark inlined in index.html and the SVG favicon (vite.config.ts),
// - the launcher icon, Play icon and splash (android/make-icon.mjs rasterizes these polygons).
//
// Plain ES module (no TypeScript) so Node tools can import it; types in emblem.d.mts.
// Units: the stroke unit of the Lintel face. Origin: the hanging point (centre of the lintel's
// underside); y grows downwards.

export const PALETTE = {
  carve: '#04070b',
  stoneHi: '#e9e3d6',
  stoneLo: '#7e8794',
  lintelTop: '#2a3544',
  lintelLit: '#b0823f',
  inkHi: '#8fe3ee',
  inkLo: '#2fb6cc',
  flameCore: '#fff4dc',
  flameMid: '#ffc785',
  flameTip: '#d8722a',
  bgCenter: '#1d2632',
  bgEdge: '#070a0f',
  glow: '#d8722a',
  brass500: '#b0823f',
};

/** Lantern rune dimensions, units. */
export const LANTERN = {
  /** Stem: hangs from y = 0 to the top of the ring. */
  stemWidth: 0.62,
  stemLength: 1.45,
  /** Ring centreline half-diagonal and stroke width (the face's 1.0 unit). */
  diag: 2.3,
  stroke: 0.82,
  /** Flat cut at each vertex of the ring (keeps the 45 degree, chamfered register). */
  flat: 0.3,
  /** The rune's foot: a short bar under the ring (as on the in-game Lantern rune). */
  footGap: 0.5,
  footHeight: 0.62,
};

const R2 = Math.SQRT1_2;
/** Outer and inner half-diagonals of the ring. */
export const ringOuter = () => LANTERN.diag + LANTERN.stroke * R2;
export const ringInner = () => LANTERN.diag - LANTERN.stroke * R2;
/** Centre of the ring, units below the hanging point. */
export const ringCenterY = () => LANTERN.stemLength + ringOuter();
/** Lowest point of the rune: the outer ring vertex, or the foot when it is drawn. */
export const lanternBottom = (foot = false) => ringCenterY() + ringOuter() - LANTERN.flat + (foot ? LANTERN.footGap + LANTERN.footHeight : 0);
/** Half-width of the rune (outer ring vertex). */
export const lanternHalfWidth = () => ringOuter();

/** Signed area (positive = clockwise on a y-down screen). */
export function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

const cw = (poly) => (area(poly) < 0 ? poly.slice().reverse() : poly);

/**
 * Offset a simple polygon outwards by `d` (inwards when negative) with mitred corners. Every
 * angle in the emblem is 45 or 90 degrees, so mitres stay short.
 */
export function offset(poly, d) {
  if (!d) return poly;
  const p = cw(poly);
  const n = p.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    // Outward normal of a clockwise (y-down) edge.
    const nx = (y1 - y0) / len;
    const ny = -(x1 - x0) / len;
    lines.push([x0 + nx * d, y0 + ny * d, x1 + nx * d, y1 + ny * d]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n];
    const b = lines[i];
    const [ax, ay, bx, by] = a;
    const [cx, cy, dx, dy] = b;
    const den = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);
    if (Math.abs(den) < 1e-9) {
      out.push([cx, cy]);
      continue;
    }
    const t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / den;
    out.push([ax + t * (bx - ax), ay + t * (by - ay)]);
  }
  return out;
}

/** The ring as one contour (outer, `half` half-diagonal) with flats at the four vertices. */
function diamond(cy, half, flat) {
  const f = Math.min(flat, half * 0.4);
  return cw([
    [-f, cy - half + f],
    [f, cy - half + f],
    [half - f, cy - f],
    [half - f, cy + f],
    [f, cy + half - f],
    [-f, cy + half - f],
    [-half + f, cy + f],
    [-half + f, cy - f],
  ]);
}

/** Flame silhouette: a round bulb drawn up to a point, `h` tall, `w` wide, base at (0, by). */
export function flame(by, h, w, sway = 0, steps = 18) {
  const right = [];
  const left = [];
  const norm = 0.5573; // max of s^0.9 * sqrt(1 - s^2.5), so the widest point is w
  for (let i = 0; i <= steps; i++) {
    const s = i / steps; // 0 = tip, 1 = base
    const y = by - h + s * h;
    const half = ((w / 2) * Math.pow(s, 0.9) * Math.sqrt(Math.max(0, 1 - Math.pow(s, 2.5)))) / norm;
    const lean = sway * Math.pow(1 - s, 2) * h;
    right.push([lean + half, y]);
    if (i > 0 && i < steps) left.push([lean - half, y]);
  }
  return cw([...right, ...left.reverse()]);
}

/**
 * The lantern rune as layers, bottom to top. Each layer: contours, fill rule and a paint
 * ({ solid } or { linear: [x0, y0, x1, y1, stops] } in units). `outline` widens the dark carve.
 */
export function lanternLayers(ox = 0, oy = 0, outline = 0.3, opts = {}) {
  const { foot = true, steps = 18 } = opts;
  const cy = ringCenterY();
  const Ro = ringOuter();
  const Ri = ringInner();
  const sw = LANTERN.stemWidth / 2;
  const stemBottom = cy - Ro + LANTERN.flat + 0.2;
  const stem = cw([
    [-sw, -0.05],
    [sw, -0.05],
    [sw, stemBottom],
    [-sw, stemBottom],
  ]);
  const outer = diamond(cy, Ro, LANTERN.flat);
  const inner = diamond(cy, Ri, LANTERN.flat * 0.6);
  const fy = cy + Ri * 0.6;
  const flameOuter = flame(fy, Ri * 1.5, Ri * 0.86, 0.035, steps);
  const flameCore = flame(fy - Ri * 0.06, Ri * 0.62, Ri * 0.34, 0.02, Math.max(5, Math.round(steps / 2)));
  const footTop = cy + Ro - LANTERN.flat + LANTERN.footGap;
  const fw = Ro * 0.55;
  const fc = Math.min(0.22, LANTERN.footHeight / 2);
  const footBar = cw([
    [-fw + fc, footTop],
    [fw - fc, footTop],
    [fw, footTop + fc],
    [fw, footTop + LANTERN.footHeight - fc],
    [fw - fc, footTop + LANTERN.footHeight],
    [-fw + fc, footTop + LANTERN.footHeight],
    [-fw, footTop + LANTERN.footHeight - fc],
    [-fw, footTop + fc],
  ]);
  const move = (poly) => poly.map(([x, y]) => [x + ox, y + oy]);
  const ink = { linear: [ox, oy + cy - Ro, ox, oy + cy + Ro, [[0, PALETTE.inkHi], [1, PALETTE.inkLo]]] };
  const fire = { linear: [ox, oy + fy, ox, oy + fy - Ri * 1.55, [[0, PALETTE.flameCore], [0.42, PALETTE.flameMid], [1, PALETTE.flameTip]]] };
  const inkShapes = foot ? [stem, footBar] : [stem];
  return [
    { role: 'carve', rule: 'evenodd', contours: [offset(outer, outline), offset(inner, -outline)].map(move), paint: { solid: PALETTE.carve } },
    { role: 'carve', rule: 'nonzero', contours: inkShapes.map((p) => offset(p, outline)).map(move), paint: { solid: PALETTE.carve } },
    { role: 'ink', rule: 'nonzero', contours: inkShapes.map(move), paint: ink },
    { role: 'ink', rule: 'evenodd', contours: [outer, inner].map(move), paint: ink },
    { role: 'flame', rule: 'nonzero', contours: [flameOuter].map(move), paint: fire },
    { role: 'core', rule: 'nonzero', contours: [flameCore].map(move), paint: { solid: PALETTE.flameCore } },
  ];
}

/** Lintel segment dimensions, units. */
export const LINTEL = { halfLength: 4.9, thickness: 1.35, chamfer: 0.45, tickWidth: 0.55, tickLength: 1.25, groove: 0.22 };

/** The lintel: a beam with a pendant tick hanging at each end (the identity's device). */
export function lintelPolygon(half = LINTEL.halfLength) {
  const { thickness: T, chamfer: c, tickWidth: tw, tickLength: tl } = LINTEL;
  const c2 = Math.min(c, tw * 0.5);
  return cw([
    [-half + c, -T],
    [half - c, -T],
    [half, -T + c],
    [half, tl - c2],
    [half - c2, tl],
    [half - tw, tl],
    [half - tw, 0],
    [-half + tw, 0],
    [-half + tw, tl],
    [-half + c2, tl],
    [-half, tl - c2],
    [-half, -T + c],
  ]);
}

/** The emblem (lintel + hanging lantern) as layers in units, origin at the hanging point. */
export function emblemLayers(outline = 0.3, opts = {}) {
  const { groove = true } = opts;
  const lintel = lintelPolygon();
  const lit = { linear: [0, -LINTEL.thickness, 0, 0, [[0, PALETTE.lintelTop], [1, PALETTE.lintelLit]]] };
  // The carved groove along the beam (the UI's lintel line, cut into the stone).
  const g = LINTEL.groove;
  const gy = -LINTEL.thickness * 0.5;
  const gx = LINTEL.halfLength - LINTEL.chamfer - 0.35;
  const grooveLine = cw([
    [-gx, gy - g / 2],
    [gx, gy - g / 2],
    [gx, gy + g / 2],
    [-gx, gy + g / 2],
  ]);
  return [
    { role: 'carve', rule: 'nonzero', contours: [offset(lintel, outline)], paint: { solid: PALETTE.carve } },
    { role: 'lintel', rule: 'nonzero', contours: [lintel], paint: lit },
    ...(groove ? [{ role: 'carve', rule: 'nonzero', contours: [grooveLine], paint: { solid: PALETTE.carve } }] : []),
    ...lanternLayers(0, 0, outline, opts),
  ];
}

/** Bounds of the emblem including its outline, units. */
export function emblemBounds(outline = 0.3) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of emblemLayers(outline, { steps: 6 })) for (const c of l.contours) for (const [x, y] of c) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Where the flame sits (its bulb), units: the light source for glows and the warm falloff. */
export function flameCenter() {
  return [0, ringCenterY() + ringInner() * 0.15];
}

const num = (v, dp) => {
  let s = (Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

/** SVG path data for contours (absolute coordinates, `dp` decimals, scale `k`, offset). */
export function pathData(contours, k = 1, ox = 0, oy = 0, dp = 2) {
  return contours.map((c) => `M${c.map(([x, y]) => `${num(ox + x * k, dp)} ${num(oy + y * k, dp)}`).join('L')}Z`).join('');
}

/** viewBox (k = 10 user units per unit) around the emblem with `pad` units of margin. */
function emblemBox(pad, k) {
  const b = emblemBounds();
  const w = b.x1 - b.x0 + pad * 2;
  const h = b.y1 - b.y0 + pad * 2;
  return { vx: (b.x0 - pad) * k, vy: (b.y0 - pad) * k, w: w * k, h: h * k, aspect: h / w };
}

const linearDef = (id, [x0, y0, x1, y1, stops], k) =>
  `<linearGradient id="${id}" x1="${num(x0 * k, 0)}" y1="${num(y0 * k, 0)}" x2="${num(x1 * k, 0)}" y2="${num(y1 * k, 0)}" gradientUnits="userSpaceOnUse">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

/** The emblem as SVG, every layer as drawn by the launcher (favicon, emblem lockup). */
export function emblemSvg({ size = 96, glow = true, attrs = '', idPrefix = 'dde' } = {}) {
  const k = 10;
  const box = emblemBox(0.6, k);
  const defs = [];
  const parts = [];
  const [fx, fy] = flameCenter();
  if (glow) {
    const r = num(ringOuter() * 2 * k, 0);
    defs.push(`<radialGradient id="${idPrefix}g" cx="${num(fx * k, 0)}" cy="${num(fy * k, 0)}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${PALETTE.glow}" stop-opacity=".5"/><stop offset="1" stop-color="${PALETTE.glow}" stop-opacity="0"/></radialGradient>`);
    parts.push(`<circle cx="${num(fx * k, 0)}" cy="${num(fy * k, 0)}" r="${r}" fill="url(#${idPrefix}g)"/>`);
  }
  let gi = 0;
  const seen = new Map();
  for (const l of emblemLayers()) {
    let fill = l.paint.solid;
    if (!fill) {
      const key = JSON.stringify(l.paint.linear);
      if (!seen.has(key)) {
        const id = `${idPrefix}${gi++}`;
        defs.push(linearDef(id, l.paint.linear, k));
        seen.set(key, `url(#${id})`);
      }
      fill = seen.get(key);
    }
    const rule = l.rule === 'evenodd' ? ' fill-rule="evenodd"' : '';
    parts.push(`<path${rule} fill="${fill}" d="${pathData(l.contours, k, 0, 0, 0)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(box.vx, 0)} ${num(box.vy, 0)} ${num(box.w, 0)} ${num(box.h, 0)}" width="${size}" height="${num(size * box.aspect, 0)}"${attrs}><defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
}

/**
 * The boot mark inlined in index.html (visible before the bundle parses): the same emblem in as
 * few bytes as it takes. Outlines are strokes painted under the fill, the ring is one path, the
 * flame has fewer points; the core carries the class index.html breathes (2.4 s), and the
 * glow is a CSS gradient behind it.
 */
export function bootMarkSvg({ size = 96 } = {}) {
  const k = 10;
  const box = emblemBox(0.7, k);
  const layers = emblemLayers(0.3, { steps: 6 });
  const by = (role) => layers.filter((l) => l.role === role);
  const lintel = by('lintel')[0];
  const ink = by('ink');
  // One ink path: stem + foot (nonzero), ring outer + reversed inner (a hole under nonzero).
  const ring = ink[1].contours;
  const inkContours = [...ink[0].contours, ring[0], ring[1].slice().reverse()];
  const flameL = by('flame')[0];
  const core = by('core')[0];
  // Implicit linetos (pairs after M), integer coordinates: the shortest valid path data.
  const d = (contours) => contours.map((c) => `M${c.map(([x, y]) => `${num(x * k, 0)} ${num(y * k, 0)}`).join(' ')}Z`).join('');
  const stroke = `stroke="${PALETTE.carve}" stroke-width="6" stroke-linejoin="round" paint-order="stroke"`;
  // Inline in HTML: no xmlns needed; the wrapper in index.html is aria-hidden.
  return (
    `<svg viewBox="${num(box.vx, 0)} ${num(box.vy, 0)} ${num(box.w, 0)} ${num(box.h, 0)}" width="${size}" height="${num(size * box.aspect, 0)}">` +
    `<defs>${linearDef('ddbi', ink[0].paint.linear, k)}</defs>` +
    `<path fill="${PALETTE.brass500}" ${stroke} d="${d(lintel.contours)}"/>` +
    `<path fill="url(#ddbi)" ${stroke} d="${d(inkContours)}"/>` +
    `<path fill="${PALETTE.flameMid}" d="${d(flameL.contours)}"/>` +
    `<path class="dd-boot-core" fill="${PALETTE.flameCore}" d="${d(core.contours)}"/></svg>`
  );
}
