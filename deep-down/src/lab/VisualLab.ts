import { rowKinds } from '../idle/model/shaft';
import { CELL } from '../idle/model/state';
import { crewLine } from '../idle/config/crew';
import { Renderer } from '../render/Renderer';
import { DescentScene, type DescentSource } from '../render/descent/DescentScene';
import { defaultLayout } from '../render/descent/DescentCamera';
import { createIdleBus, type IdleBus } from '../idle/bus';
import { biomeAt, nextBiomeStart } from '../idle/config/biomes';

/**
 * The Biome Lab (SPEC §11.3, W1 minimal): the descent scene driven by a tiny stand-in shaft (A's pure row
 * table, cells broken by scripted taps), so looks 0-3, the section, cell FX, the foreman, the crew and the
 * dressing can be judged and captured without the game shell. URL: `?depth=60&crew=10,5,1,1&auto=2&taps=4&fx=1`.
 */
export class LabShaft implements DescentSource {
  seed = 7;
  floor = 0;
  readonly broken = new Map<number, number>();
  readonly left = new Map<number, number>();
  crewLv: number[] = [0, 0, 0, 0];
  pick = 1;
  t = 0;
  private readonly rows = new Map<number, Uint8Array>();
  /** Cells broken since the last frame (for the scene). */
  readonly breaks: Array<{ row: number; col: number; kind: number }> = [];

  runSeed(): number {
    return this.seed;
  }
  depth(): number {
    return this.floor;
  }
  kinds(row: number): Uint8Array {
    let k = this.rows.get(row);
    if (!k) {
      k = rowKinds(this.seed, row);
      this.rows.set(row, k);
      if (this.rows.size > 600) this.rows.delete(this.rows.keys().next().value!);
    }
    return k;
  }
  cellKind(row: number, col: number): number {
    return this.kinds(row)[col];
  }
  cellLeft(row: number, col: number): number {
    if (row < this.floor) return 0;
    if (this.kinds(row)[col] === CELL.AIR) return 0;
    return this.left.get(row * 7 + col) ?? 1;
  }
  crew(): ArrayLike<number> {
    return this.crewLv;
  }
  pickLevel(): number {
    return this.pick;
  }
  time(): number {
    return this.t;
  }
  crewPhase(line: number): number {
    return this.t % crewLine(line).rig.period;
  }

  /** The topmost solid cell of a column within 2 rows of the floor. */
  top(col: number): number {
    for (let r = this.floor; r <= this.floor + 2; r++) if (this.cellLeft(r, col) > 0) return r;
    return -1;
  }

  /** Damage a column's top cell by `amount` (1 = a cell). Returns the row hit (-1: none). */
  hit(col: number, amount: number): { row: number; broke: boolean; crack: number } {
    const r = this.top(col);
    if (r < 0) return { row: -1, broke: false, crack: 0 };
    const key = r * 7 + col;
    const v = (this.left.get(key) ?? 1) - amount;
    if (v <= 0) {
      this.left.set(key, 0);
      this.breaks.push({ row: r, col, kind: this.kinds(r)[col] });
      this.advance();
      return { row: r, broke: true, crack: 1 };
    }
    this.left.set(key, v);
    return { row: r, broke: false, crack: 1 - v };
  }

  /** Clear the floor row at once (the crew-only descent of `advance()`). */
  clearRow(): void {
    const r = this.floor;
    for (let c = 0; c < 7; c++)
      if (this.cellLeft(r, c) > 0) {
        this.left.set(r * 7 + c, 0);
        this.breaks.push({ row: r, col: c, kind: this.kinds(r)[c] });
      }
    this.advance();
  }

  private advance(): void {
    for (;;) {
      let solid = false;
      for (let c = 0; c < 7; c++) if (this.cellLeft(this.floor, c) > 0) solid = true;
      if (solid) return;
      this.floor++;
    }
  }

  /** Jump (setDepth): everything above is dug, nothing below is touched. */
  jump(depth: number): void {
    this.floor = depth;
    this.left.clear();
    this.advance();
  }
}

export interface LabApi {
  ready: boolean;
  frames: number;
  scene: DescentScene;
  shaft: LabShaft;
  setDepth(m: number): Promise<void>;
  /** Tap column c now (a strike, cell FX and maybe a break). */
  tap(col: number, crit?: boolean): void;
  /** Dig `rows` rows at `rowsPerSecond` (the crew-only descent). */
  descend(rows: number, rowsPerSecond: number): Promise<void>;
  /** Crack up to 8 floor-row cells to a stage (the cell FX capture). */
  crackAll(stage: number): void;
  /** Rows per second the crew-only descent runs at (0 = stopped). */
  autoRows: number;
  /** Every cell broken since boot (row, col), and taps seen. */
  history: Array<{ row: number; col: number }>;
  taps: number;
  /** Per-frame samples while `sampling` (missing chunks in view). */
  sampling: boolean;
  samples: number[];
  /** Per-frame FX samples while `sampling`: live particles and shards, and the preset caps. */
  fxSamples: Array<{ p: number; s: number }>;
  /** The lab's own bus (DescentScene.bindBus): drive world events as the model would. */
  bus: IdleBus;
  /** Spawn `n` event targets of `kind` crossing the shaft (an `event:target` per target). */
  event(kind: string, n: number): void;
  /** Show the next seal's Warden fighting, its weak point `lit` (0..2, -1 none). */
  seal(lit?: number): void;
  /** Pop a chest of `tier` from the floor's centre cell, and open it after `openMs` (0: stay closed). */
  chest(tier: string, openMs?: number): void;
  /** The camera part of a biome reveal / the Vista dolly. */
  reveal(): void;
  dolly(): void;
  /** FX clock scale (1 real time; 0.05 to hold a break's shards for a capture). */
  fxScale: number;
}

export async function bootLab(canvas: HTMLCanvasElement): Promise<LabApi> {
  const params = new URLSearchParams(location.search);
  const renderer = new Renderer(canvas, (params.get('quality') as 'battery' | 'balanced' | 'high') ?? 'balanced');
  renderer.resize();
  const scene = new DescentScene(renderer);
  scene.setLayout(defaultLayout(window.innerWidth, window.innerHeight));
  const shaft = new LabShaft();
  if (params.has('seed')) shaft.seed = Number(params.get('seed')) | 0;
  const crew = (params.get('crew') ?? '').split(',').filter(Boolean).map(Number);
  if (crew.length) shaft.crewLv = crew;
  if (params.has('pick')) shaft.pick = Number(params.get('pick'));
  const depth = Number(params.get('depth') ?? 0);
  shaft.jump(depth);
  if (params.has('look')) scene.look(Number(params.get('look')));
  if (params.get('menu') === '1') scene.setMenu(true, true);
  if (params.get('motion') === 'reduced') scene.setMotion({ motion: 'reduced', shake: 1 });
  await scene.attach(shaft);
  if (params.has('planted')) for (const [i, d] of (params.get('planted') ?? '').split(',').filter(Boolean).entries()) scene.plant(Number(d), i + 1);
  if (params.has('ghost')) scene.ghost(Number(params.get('ghost')));
  const bus = createIdleBus();
  scene.bindBus(bus);
  let ids = 0;
  const api: LabApi = {
    bus,
    fxScale: Number(params.get('fxslow') ?? 1),
    fxSamples: [],
    event(kind: string, n: number) {
      const t = shaft.t;
      for (let i = 0; i < n; i++) {
        const id = `event:lab:${ids++}`;
        const ltr = i % 2 === 0;
        bus.emit('event:target', { event: 'lab', id, kind, t0: t + i * 0.25, t1: t + i * 0.25 + 3.5, taps: 1, path: { x0: ltr ? -0.6 : 6.6, y0: -2.2 + (i % 3) * 0.5, cx: 3, cy: -3.4, x1: ltr ? 6.8 : -0.8, y1: -1.4 } });
      }
    },
    seal(lit = 0) {
      const s = nextBiomeStart(shaft.floor - 1);
      scene.seal(biomeAt(s), 'fighting', 0.7, shaft.floor);
      if (lit >= 0) scene.weakPoint(lit, true);
    },
    chest(tier: string, openMs = 0) {
      const id = `chest:${ids++}`;
      bus.emit('chest:exposed', { id, col: 3, depth: shaft.floor - 1, floor: tier as 'wood' });
      if (openMs > 0) setTimeout(() => bus.emit('chest:open', { id, floor: tier as 'wood', tier: tier as 'wood', steps: 0, gold: undefined as never, gems: 0, source: 'lab' }), openMs);
    },
    reveal() {
      scene.reveal(biomeAt(shaft.floor));
    },
    dolly() {
      scene.dolly(true);
    },
    ready: false,
    frames: 0,
    scene,
    shaft,
    async setDepth(m: number) {
      shaft.jump(m);
      await scene.jump(shaft.floor);
    },
    tap(col: number, crit = false) {
      const r = shaft.hit(col, crit ? 0.7 : 0.36);
      if (r.row < 0) return;
      scene.strike(r.row, col, crit, Math.floor(shaft.pick / 25) + 1);
      scene.cellFx(r.row, col, 0.6, crit ? 1.75 : 1, r.crack);
      const p = scene.screenOf(r.row, col);
      scene.kick(0, 1, crit);
      void p;
    },
    async descend(rows: number, rps: number) {
      const end = shaft.floor + rows;
      while (shaft.floor < end) {
        shaft.clearRow();
        await new Promise((res) => setTimeout(res, 1000 / rps));
      }
    },
    autoRows: 0,
    history: [],
    taps: 0,
    sampling: false,
    samples: [],
    crackAll(stage: number) {
      const r = shaft.floor;
      for (let c = 0; c < 7; c++) scene.cellFx(r, c, 0.35, 0, stage);
      scene.cellFx(r + 1, 3, 0, 0, stage * 0.6);
    },
  };
  api.autoRows = Number(params.get('auto') ?? 0);
  // Real taps: pointerdown on the canvas taps the column under the finger (vertical position ignored).
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const s = scene.columns();
    const w = (s.right - s.left) / 7;
    const col = Math.max(0, Math.min(6, Math.floor((e.clientX - s.left) / w)));
    api.taps++;
    api.tap(col);
  });
  const taps = Number(params.get('taps') ?? 0);
  let last = performance.now();
  let tapAcc = 0;
  let rowAcc = 0;
  let tapCol = 3;
  const loop = (now: number) => {
    const real = (now - last) / 1000;
    const dt = Math.min(0.1, real);
    last = now;
    shaft.t += dt;
    if (taps > 0) {
      tapAcc += dt * taps;
      while (tapAcc >= 1) {
        tapAcc -= 1;
        tapCol = (tapCol + 2) % 7;
        api.tap(tapCol, Math.random() < 0.1);
      }
    }
    if (api.autoRows > 0) {
      // The descent envelope is in wall-clock rows per second: on a slow software renderer several rows land in
      // one frame (a harsher streaming test, never a slower one).
      rowAcc += Math.min(0.5, real) * api.autoRows;
      while (rowAcc >= 1) {
        rowAcc -= 1;
        shaft.clearRow();
      }
    }
    if (shaft.breaks.length) {
      scene.applyBreaks(shaft.breaks);
      for (const b of shaft.breaks) api.history.push({ row: b.row, col: b.col });
      shaft.breaks.length = 0;
    }
    if (params.get('fx') === '1') api.crackAll(0.55 + 0.35 * Math.sin(shaft.t * 2));
    // The scene gets the real interval (up to 0.5 s): its camera steps slow frames in pieces and keeps up with
    // rows cleared by wall-clock time.
    const frameDt = Math.min(0.5, real);
    scene.frame(frameDt, frameDt * api.fxScale);
    if (api.sampling) {
      api.samples.push(scene.debug.missingChunks());
      api.fxSamples.push({ p: scene.debug.particles().live, s: scene.debug.shards().live });
    }
    api.frames++;
    if (api.frames > 3) api.ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener('resize', () => {
    renderer.resize();
    scene.setLayout(defaultLayout(window.innerWidth, window.innerHeight));
  });
  return api;
}
