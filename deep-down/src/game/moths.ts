import { MOTHS } from '../config/balance';
import { hash32 } from '../core/math';

/**
 * Lumen moths: a little pale life in the dark that points at secrets without a word. Pure
 * simulation on typed arrays (no allocation per frame); game/effects/LumenMoths draws them.
 *
 * - Roost: each moth orbits its anchor on a slow Lissajous loop. At a secret anchor (the grotto's
 *   slit, a rune door) the first few keep tapping in place against it.
 * - Drawn: a lit lantern with fuel to spare pulls up to MOTHS.drawnMax of them into a small orbit
 *   round the flame; they drop away when it moves too far from their roost or runs low (a quiet
 *   danger cue).
 * - Scatter: a mining hit nearby throws them outward; they drift home after a few seconds.
 * - Spiral: everything near the black stone rises in a slow spiral when it is touched.
 * Moths never enter solid cells: a move into rock is refused axis by axis, and a target in rock
 * keeps the last open one.
 */
export interface MothAnchor {
  id: string;
  x: number;
  y: number;
  z: number;
  count: number;
  /** Roost radius (m). */
  radius: number;
  secret?: boolean;
}

export interface MothLantern {
  x: number;
  y: number;
  z: number;
  lit: boolean;
  /** 0..1 */
  fuelFrac: number;
}

const ROOST = 0;
const DRAWN = 1;
const SCATTER = 2;
const SPIRAL = 3;

export class MothFlock {
  /** Moths simulated (and drawn) this frame: slots 0..active-1. */
  active = 0;
  readonly positions: Float32Array;
  /** Wing beat phase 0..1 per moth. */
  readonly phases: Float32Array;
  /** Glow 0..1 per moth. */
  readonly glow: Float32Array;
  private readonly vel: Float32Array;
  private readonly target: Float32Array;
  private readonly home: Int16Array;
  /** Per-moth constants: orbit radius, angular speed, phase, vertical amplitude, wing rate, seed. */
  private readonly prm: Float32Array;
  private readonly mode: Uint8Array;
  private readonly timer: Float32Array;
  /** Index of this moth among its anchor's moths (the first ones at a secret anchor tap). */
  private readonly rank: Uint8Array;
  private anchors: MothAnchor[] = [];
  private time = 0;
  private reassign = 0;
  private limit: number;
  private readonly need: number[] = [];
  private readonly have: number[] = [];
  private readonly order: number[] = [];

  constructor(anchors: readonly MothAnchor[], private readonly seed: number, readonly cap: number) {
    this.limit = cap;
    this.positions = new Float32Array(cap * 3);
    this.phases = new Float32Array(cap);
    this.glow = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.target = new Float32Array(cap * 3);
    this.home = new Int16Array(cap).fill(-1);
    this.prm = new Float32Array(cap * 6);
    this.mode = new Uint8Array(cap);
    this.timer = new Float32Array(cap);
    this.rank = new Uint8Array(cap);
    this.setAnchors(anchors);
  }

  /** Replace the anchors (the bloom moved); every moth is reassigned on the next step. */
  setAnchors(anchors: readonly MothAnchor[]): void {
    this.anchors = anchors.map((a) => ({ ...a }));
    this.active = 0;
    this.home.fill(-1);
    this.reassign = 0;
  }

  /** Lower or raise the number of moths (quality presets), up to the constructed cap. */
  setLimit(n: number): void {
    this.limit = Math.max(0, Math.min(this.cap, Math.floor(n)));
    this.reassign = 0;
  }

  get anchorList(): readonly MothAnchor[] {
    return this.anchors;
  }

  /** A mining hit at (x, y, z): moths within MOTHS.scatterRadius are thrown outward. @returns how many. */
  startle(x: number, y: number, z: number): number {
    let n = 0;
    const p = this.positions;
    for (let i = 0; i < this.active; i++) {
      const dx = p[i * 3] - x;
      const dy = p[i * 3 + 1] - y;
      const dz = p[i * 3 + 2] - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > MOTHS.scatterRadius) continue;
      const k = MOTHS.scatterImpulse / Math.max(0.3, d);
      this.vel[i * 3] += dx * k;
      this.vel[i * 3 + 1] += Math.abs(dy) * k + 0.6;
      this.vel[i * 3 + 2] += dz * k;
      this.mode[i] = SCATTER;
      this.timer[i] = MOTHS.scatterSeconds[0] + (MOTHS.scatterSeconds[1] - MOTHS.scatterSeconds[0]) * this.prm[i * 6 + 5];
      n++;
    }
    return n;
  }

  /** Every moth within `r` of (x, y, z) rises in a spiral over its roost for `seconds`. @returns how many. */
  spiral(x: number, y: number, z: number, r: number, seconds: number): number {
    let n = 0;
    const p = this.positions;
    for (let i = 0; i < this.active; i++) {
      if (Math.hypot(p[i * 3] - x, p[i * 3 + 1] - y, p[i * 3 + 2] - z) > r) continue;
      this.mode[i] = SPIRAL;
      this.timer[i] = seconds;
      n++;
    }
    return n;
  }

  /**
   * Advance by dt. `isOpen` says whether a cell is open (not solid).
   * @returns the number of moths drawn to the lantern.
   */
  step(dt: number, lantern: MothLantern, px: number, py: number, pz: number, isOpen: (x: number, y: number, z: number) => boolean): number {
    if (dt <= 0) return 0;
    this.time += dt;
    this.reassign -= dt;
    if (this.reassign <= 0) {
      this.reassign = 0.5;
      this.allocate(px, py, pz, isOpen);
    }
    const t = this.time;
    const p = this.positions;
    const v = this.vel;
    const tg = this.target;
    const prm = this.prm;
    const pull = lantern.lit && lantern.fuelFrac >= MOTHS.drawnMinFuel;
    let drawn = 0;
    const blend = Math.min(1, MOTHS.steer * dt);
    for (let i = 0; i < this.active; i++) {
      const a = this.anchors[this.home[i]];
      const o = i * 3;
      const q = i * 6;
      const r = prm[q];
      const w = prm[q + 1];
      const ph = prm[q + 2];
      const amp = prm[q + 3];
      let mode = this.mode[i];
      // The lantern: draw roosting moths close to it, let drawn ones go when it fails or strays.
      const lx = lantern.x - p[o];
      const ly = lantern.y - p[o + 1];
      const lz = lantern.z - p[o + 2];
      const toLantern = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const hx = lantern.x - a.x;
      const hy = lantern.y - a.y;
      const hz = lantern.z - a.z;
      const lanternFromHome = Math.sqrt(hx * hx + hy * hy + hz * hz);
      // The first few at a secret anchor keep tapping at it whatever the lantern does: they are the hint.
      const tapper = a.secret === true && this.rank[i] < 3;
      if (mode === DRAWN && (!pull || lanternFromHome > MOTHS.dropOff || drawn >= MOTHS.drawnMax)) mode = ROOST;
      else if (mode === ROOST && !tapper && pull && toLantern < MOTHS.drawRadius && lanternFromHome < MOTHS.dropOff && drawn < MOTHS.drawnMax) mode = DRAWN;
      if (mode === SCATTER || mode === SPIRAL) {
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) mode = ROOST;
      }
      this.mode[i] = mode;
      let tx: number;
      let ty: number;
      let tz: number;
      let speed: number = MOTHS.speed[0] + (MOTHS.speed[1] - MOTHS.speed[0]) * prm[q + 5];
      if (mode === DRAWN) {
        drawn++;
        const th = t * 2.3 * (0.8 + 0.4 * prm[q + 5]) + ph;
        tx = lantern.x + Math.cos(th) * MOTHS.drawnOrbit;
        tz = lantern.z + Math.sin(th) * MOTHS.drawnOrbit;
        ty = lantern.y + 0.15 + Math.sin(t * 1.9 + ph) * 0.25;
        speed = MOTHS.drawnSpeed;
      } else if (mode === SPIRAL) {
        const left = Math.max(0, this.timer[i]);
        const th = t * 2.6 + ph;
        const rr = r * 0.7 + 0.5;
        tx = a.x + Math.cos(th) * rr;
        tz = a.z + Math.sin(th) * rr;
        ty = a.y + (MOTHS.spiralSeconds - left) * MOTHS.spiralRise;
        speed = MOTHS.drawnSpeed;
      } else if (tapper) {
        // Tapping at the slit or the door: a small, quick, mostly vertical flutter in place.
        tx = a.x + Math.sin(t * 1.7 + ph) * 0.07;
        ty = a.y + Math.sin(t * 3.3 + ph * 1.3) * 0.2;
        tz = a.z + Math.cos(t * 1.3 + ph) * 0.07;
      } else {
        // A loop whose radius breathes (a Lissajous wobble that never leaves the roost radius).
        const th = t * w + ph;
        const rr = r * (0.72 + 0.28 * Math.sin(th * 0.8 + ph * 0.5));
        tx = a.x + Math.cos(th) * rr;
        tz = a.z + Math.sin(th) * rr;
        ty = a.y + Math.sin(t * w * 0.7 + ph * 1.7) * amp;
      }
      // A target in rock keeps the last open one.
      if (isOpen(Math.floor(tx), Math.floor(ty), Math.floor(tz))) {
        tg[o] = tx;
        tg[o + 1] = ty;
        tg[o + 2] = tz;
      }
      // Steer toward the target with a flutter, at most `speed`.
      let dx = (tg[o] - p[o]) * MOTHS.gain;
      let dy = (tg[o + 1] - p[o + 1]) * MOTHS.gain;
      let dz = (tg[o + 2] - p[o + 2]) * MOTHS.gain;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dl > speed) {
        dx *= speed / dl;
        dy *= speed / dl;
        dz *= speed / dl;
      }
      const f = MOTHS.flutter;
      dx += Math.sin(t * 13.1 + ph * 7) * f;
      dy += Math.sin(t * 17.3 + ph * 5) * f * 1.4;
      dz += Math.cos(t * 11.7 + ph * 3) * f;
      const k = mode === SCATTER ? blend * 0.25 : blend;
      v[o] += (dx - v[o]) * k;
      v[o + 1] += (dy - v[o + 1]) * k;
      v[o + 2] += (dz - v[o + 2]) * k;
      // Move, refusing any axis that would enter rock.
      const nx = p[o] + v[o] * dt;
      const ny = p[o + 1] + v[o + 1] * dt;
      const nz = p[o + 2] + v[o + 2] * dt;
      if (isOpen(Math.floor(nx), Math.floor(p[o + 1]), Math.floor(p[o + 2]))) p[o] = nx;
      else v[o] *= -0.4;
      if (isOpen(Math.floor(p[o]), Math.floor(ny), Math.floor(p[o + 2]))) p[o + 1] = ny;
      else v[o + 1] *= -0.4;
      if (isOpen(Math.floor(p[o]), Math.floor(p[o + 1]), Math.floor(nz))) p[o + 2] = nz;
      else v[o + 2] *= -0.4;
      this.phases[i] = (t * prm[q + 4] + ph) % 1;
      this.glow[i] = 0.72 + 0.28 * Math.sin(t * 1.3 + ph * 4) * (mode === DRAWN ? 0.4 : 1);
    }
    return drawn;
  }

  /** Give the slots to the anchors nearest the explorer (within MOTHS.simRadius), keeping moths that stay. */
  private allocate(px: number, py: number, pz: number, isOpen: (x: number, y: number, z: number) => boolean): void {
    const n = this.anchors.length;
    const need = this.need;
    const have = this.have;
    const order = this.order;
    need.length = have.length = order.length = 0;
    for (let k = 0; k < n; k++) {
      need.push(0);
      have.push(0);
      const a = this.anchors[k];
      if (Math.hypot(a.x - px, a.y - py, a.z - pz) <= MOTHS.simRadius) order.push(k);
    }
    order.sort((a, b) => dist(this.anchors[a], px, py, pz) - dist(this.anchors[b], px, py, pz));
    let budget = this.limit;
    for (const k of order) {
      const take = Math.min(budget, this.anchors[k].count);
      need[k] = take;
      budget -= take;
    }
    // Keep moths whose anchor still wants them; compact the rest away.
    let w = 0;
    for (let i = 0; i < this.active; i++) {
      const h = this.home[i];
      if (h < 0 || have[h] >= need[h]) continue;
      have[h]++;
      if (w !== i) this.moveSlot(i, w);
      w++;
    }
    // New moths for anchors that want more, spawned on their roost.
    for (const k of order) {
      while (have[k] < need[k] && w < this.cap) {
        this.spawn(w, k, have[k], isOpen);
        have[k]++;
        w++;
      }
    }
    for (let i = w; i < this.active; i++) this.home[i] = -1;
    this.active = w;
  }

  private moveSlot(from: number, to: number): void {
    for (let c = 0; c < 3; c++) {
      this.positions[to * 3 + c] = this.positions[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
      this.target[to * 3 + c] = this.target[from * 3 + c];
    }
    for (let c = 0; c < 6; c++) this.prm[to * 6 + c] = this.prm[from * 6 + c];
    this.home[to] = this.home[from];
    this.mode[to] = this.mode[from];
    this.timer[to] = this.timer[from];
    this.rank[to] = this.rank[from];
    this.phases[to] = this.phases[from];
    this.glow[to] = this.glow[from];
  }

  private spawn(i: number, anchor: number, rank: number, isOpen: (x: number, y: number, z: number) => boolean): void {
    const a = this.anchors[anchor];
    const h = (s: number) => (hash32(this.seed ^ Math.imul(anchor + 1, 0x9e3779b1) ^ Math.imul(rank + 1, 0x85ebca6b) ^ Math.imul(s, 0xc2b2ae35)) >>> 0) / 4294967296;
    const q = i * 6;
    const rMin = a.secret ? 0.15 : MOTHS.roostRadius[0];
    this.prm[q] = Math.min(a.radius, rMin + (MOTHS.roostRadius[1] - rMin) * h(1)) || rMin;
    this.prm[q + 1] = (0.45 + 0.5 * h(2)) * (h(3) < 0.5 ? -1 : 1);
    this.prm[q + 2] = h(4) * Math.PI * 2;
    this.prm[q + 3] = MOTHS.roostVertical * (0.5 + 0.5 * h(5));
    this.prm[q + 4] = MOTHS.wingHz[0] + (MOTHS.wingHz[1] - MOTHS.wingHz[0]) * h(6);
    this.prm[q + 5] = h(7);
    this.home[i] = anchor;
    this.rank[i] = Math.min(255, rank);
    this.mode[i] = ROOST;
    this.timer[i] = 0;
    // Start on the roost loop where it is open (else at the anchor itself).
    const th = this.time * this.prm[q + 1] + this.prm[q + 2];
    const rr = this.prm[q] * (0.72 + 0.28 * Math.sin(th * 0.8 + this.prm[q + 2] * 0.5));
    let x = a.x + Math.cos(th) * rr;
    let y = a.y;
    let z = a.z + Math.sin(th) * rr;
    if (!isOpen(Math.floor(x), Math.floor(y), Math.floor(z))) {
      x = a.x;
      y = a.y;
      z = a.z;
    }
    const o = i * 3;
    this.positions[o] = this.target[o] = x;
    this.positions[o + 1] = this.target[o + 1] = y;
    this.positions[o + 2] = this.target[o + 2] = z;
    this.vel[o] = this.vel[o + 1] = this.vel[o + 2] = 0;
    this.phases[i] = this.prm[q + 2] / (Math.PI * 2);
    this.glow[i] = 0.8;
  }
}

function dist(a: MothAnchor, x: number, y: number, z: number): number {
  return Math.hypot(a.x - x, a.y - y, a.z - z);
}
