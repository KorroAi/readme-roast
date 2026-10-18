// Polyphony control. Pure bookkeeping (no Web Audio), so the policies are unit tested.

interface Slot<T> {
  voice: T;
  start: number;
  end: number;
  priority: number;
}

/**
 * Caps simultaneous voices. When full, a new voice steals the oldest voice of the lowest
 * priority that is not above its own; if every active voice matters more, it is dropped.
 */
export class VoiceLimiter<T> {
  private readonly slots: Slot<T>[] = [];

  constructor(
    readonly cap: number,
    private readonly onSteal: (voice: T) => void = () => {},
  ) {}

  get size(): number {
    return this.slots.length;
  }

  /** Forget voices that finished by `now` (in-place, allocation-free). */
  prune(now: number): void {
    let w = 0;
    for (let r = 0; r < this.slots.length; r++) {
      const s = this.slots[r];
      if (s.end > now) this.slots[w++] = s;
    }
    this.slots.length = w;
  }

  /** May a voice of `priority` start at `now`? Steals (and reports) a victim when full. */
  admit(now: number, priority: number): boolean {
    this.prune(now);
    if (this.slots.length < this.cap) return true;
    let victim = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.priority > priority) continue;
      const v = victim < 0 ? null : this.slots[victim];
      if (!v || s.priority < v.priority || (s.priority === v.priority && s.start < v.start)) victim = i;
    }
    if (victim < 0) return false;
    const stolen = this.slots[victim];
    this.slots[victim] = this.slots[this.slots.length - 1];
    this.slots.length--;
    this.onSteal(stolen.voice);
    return true;
  }

  add(voice: T, start: number, end: number, priority: number): void {
    this.slots.push({ voice, start, end, priority });
  }

  /** Remove every voice, handing each to `fn` (e.g. to fade it out). */
  clear(fn?: (voice: T) => void): void {
    if (fn) for (const s of this.slots) fn(s.voice);
    this.slots.length = 0;
  }
}

/** Minimum spacing per sound name, so bursts of identical events never stack into one loud click. */
export class RateGate {
  private readonly last = new Map<string, number>();

  allow(key: string, now: number, minGap: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < minGap && now >= prev) return false;
    this.last.set(key, now);
    return true;
  }
}
