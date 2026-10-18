import { hash32 } from './math';

/**
 * Deterministic seeded PRNG (mulberry32). Every generator that must produce the
 * same world for the same seed takes one of these instead of Math.random().
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = hash32(seed) || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Derive an independent child stream so adding draws in one system never shifts another. */
  fork(salt: number): Rng {
    return new Rng(hash32(this.state ^ hash32(salt)));
  }
}
