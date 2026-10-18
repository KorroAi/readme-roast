// Procedural 5x7 pixel font for the title logo, drawn to a canvas with an icy gradient,
// a dark extruded bevel and a soft glow. Glyph data and layout are pure (unit tested).

export const GLYPH_H = 7;

/** '#' = filled cell. Rows top to bottom; glyph width = row length. */
const GLYPHS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '•': ['...', '...', '.#.', '###', '.#.', '...', '...'],
};

/** The title's O is a cut crystal: the ancient builders' cyan, set into the logo. */
const CRYSTAL_O: readonly string[] = ['..#..', '.###.', '##.##', '#...#', '##.##', '.###.', '..#..'];

export const hasGlyph = (ch: string): boolean => ch.toUpperCase() in GLYPHS;

export interface PixelCell {
  x: number;
  y: number;
  crystal: boolean;
}

export interface PixelLayout {
  /** Size in cells. */
  width: number;
  height: number;
  cells: PixelCell[];
  /** Characters without a glyph (skipped), so gaps are visible in tests. */
  missing: string[];
}

/** Lay out text (uppercased) on the cell grid with one empty column between glyphs. */
export function layoutPixelText(text: string, opts: { crystalO?: boolean } = {}): PixelLayout {
  const cells: PixelCell[] = [];
  const missing: string[] = [];
  let x = 0;
  let first = true;
  for (const raw of text.toUpperCase()) {
    const crystal = !!opts.crystalO && raw === 'O';
    const g = crystal ? CRYSTAL_O : GLYPHS[raw];
    if (!g) {
      missing.push(raw);
      continue;
    }
    if (!first) x += 1;
    first = false;
    for (let gy = 0; gy < GLYPH_H; gy++) {
      const row = g[gy];
      for (let gx = 0; gx < row.length; gx++) if (row[gx] === '#') cells.push({ x: x + gx, y: gy, crystal });
    }
    x += g[0].length;
  }
  return { width: x, height: GLYPH_H, cells, missing };
}

// ---------------------------------------------------------------------------------------
// Canvas rendering

const FACE_STOPS: Array<[number, string]> = [
  [0, '#ffffff'],
  [0.38, '#e4f6ff'],
  [0.72, '#a5d6f2'],
  [1, '#5f9fd6'],
];
const CRYSTAL_STOPS: Array<[number, string]> = [
  [0, '#e2ffff'],
  [0.4, '#7eeefc'],
  [0.75, '#30bfd8'],
  [1, '#1a90ab'],
];

/**
 * Render `text` into `canvas` so it is `cssWidth` CSS px wide (or narrower to keep whole
 * device pixels per cell). Sets the canvas CSS size; returns the cell size in device px.
 */
export function renderPixelTitle(canvas: HTMLCanvasElement, text: string, cssWidth: number, dpr: number, opts: { crystalO?: boolean } = {}): number {
  const layout = layoutPixelText(text, opts);
  const pad = 2; // cells of margin for outline, extrusion and glow
  const depth = 0.5; // extrusion depth in cells
  const cols = layout.width + pad * 2;
  const rows = layout.height + pad * 2 + depth;
  const c = Math.max(2, Math.floor((cssWidth * dpr) / cols));
  canvas.width = cols * c;
  canvas.height = Math.ceil(rows * c);
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return c;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const filled = new Set<number>();
  const key = (x: number, y: number) => x * 64 + y;
  for (const cell of layout.cells) filled.add(key(cell.x, cell.y));
  const has = (x: number, y: number) => filled.has(key(x, y));
  const ox = pad * c;
  const oy = pad * c;
  const ext = Math.round(c * depth);
  const outline = Math.max(1, Math.round(c * 0.2));
  const bevel = Math.max(1, Math.round(c * 0.18));
  const px = (cell: PixelCell) => ox + cell.x * c;
  const py = (cell: PixelCell) => oy + cell.y * c;

  // Soft glow behind everything: cool white for stone, cyan for the crystal.
  ctx.save();
  ctx.shadowBlur = c * 2.4;
  for (const crystal of [false, true]) {
    ctx.shadowColor = crystal ? 'rgba(72, 214, 234, 0.9)' : 'rgba(140, 200, 255, 0.55)';
    ctx.fillStyle = crystal ? 'rgba(72, 214, 234, 0.6)' : 'rgba(150, 205, 255, 0.35)';
    for (const cell of layout.cells) if (cell.crystal === crystal) ctx.fillRect(px(cell), py(cell), c, c + ext);
  }
  ctx.restore();

  // Dark outline around the extruded silhouette.
  ctx.fillStyle = '#07101c';
  for (const cell of layout.cells) ctx.fillRect(px(cell) - outline, py(cell) - outline, c + outline * 2, c + ext + outline * 2);

  // Extrusion: the block letters' darker underside.
  const extGrad = ctx.createLinearGradient(0, oy, 0, oy + layout.height * c + ext);
  extGrad.addColorStop(0, '#2a4f78');
  extGrad.addColorStop(1, '#13263f');
  for (const crystal of [false, true]) {
    ctx.fillStyle = crystal ? '#0a3a4c' : extGrad;
    for (const cell of layout.cells) if (cell.crystal === crystal) ctx.fillRect(px(cell), py(cell) + ext, c, c);
  }

  // Faces with a vertical icy gradient spanning the glyph height.
  for (const crystal of [false, true]) {
    const g = ctx.createLinearGradient(0, oy, 0, oy + layout.height * c);
    for (const [at, col] of crystal ? CRYSTAL_STOPS : FACE_STOPS) g.addColorStop(at, col);
    ctx.fillStyle = g;
    for (const cell of layout.cells) if (cell.crystal === crystal) ctx.fillRect(px(cell), py(cell), c, c);
  }

  // Bevel: light top/left edges, shaded bottom/right edges where a cell meets empty space.
  for (const cell of layout.cells) {
    const x = px(cell);
    const y = py(cell);
    if (!has(cell.x, cell.y - 1)) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(x, y, c, bevel);
    }
    if (!has(cell.x - 1, cell.y)) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(x, y, bevel, c);
    }
    if (!has(cell.x, cell.y + 1)) {
      ctx.fillStyle = cell.crystal ? 'rgba(6, 50, 70, 0.45)' : 'rgba(25, 60, 105, 0.42)';
      ctx.fillRect(x, y + c - bevel, c, bevel);
    }
    if (!has(cell.x + 1, cell.y)) {
      ctx.fillStyle = cell.crystal ? 'rgba(6, 50, 70, 0.3)' : 'rgba(25, 60, 105, 0.28)';
      ctx.fillRect(x + c - bevel, y, bevel, c);
    }
  }

  // A glint on the crystal's upper facet.
  const glint = layout.cells.find((cell) => cell.crystal && cell.y === 1);
  if (glint) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(px(glint) + Math.round(c * 0.2), py(glint) + Math.round(c * 0.2), Math.max(1, Math.round(c * 0.3)), Math.max(1, Math.round(c * 0.3)));
  }
  return c;
}
