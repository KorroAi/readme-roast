// The display ledger (SPEC §10.6, L8 "gains travel"): the counter shows `actual − inFlight`. Purchases check
// `actual`; a card turns affordable when `shown` passes its cost, so the ready ping fires the moment a coin
// lands. Pure and generic over the number type (plain numbers in tests, Big in the game).

/** The arithmetic the ledger needs from a number type. */
export interface LedgerOps<T> {
  zero(): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  /** −1, 0, 1. */
  cmp(a: T, b: T): number;
}

export const NUMBER_OPS: LedgerOps<number> = {
  zero: () => 0,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  cmp: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
};

/** A token in flight: its share of the gain, credited on landing. */
interface Flight<T> {
  id: number;
  amount: T;
  live: boolean;
}

/**
 * One currency's ledger. `launch` reserves a token's share (it leaves `shown` until it lands); `land`
 * credits it. Tokens that never land (a reset, a pool overflow) are flushed with `settle`.
 */
export class DisplayLedger<T> {
  private inFlight: T;
  private readonly flights: Flight<T>[] = [];
  private nextId = 1;
  private live = 0;
  /** Credits that went straight to the counter (no flight): Motion Off, a cap overflow. */
  directCredits = 0;
  /** Credits that went through a flight (F7: 100 % of gains go through the ledger). */
  flightCredits = 0;

  constructor(private readonly ops: LedgerOps<T>, private readonly capacity = 64) {
    this.inFlight = ops.zero();
  }

  /** Amount reserved by tokens still in the air. */
  get pending(): T {
    return this.inFlight;
  }

  /** Tokens in the air. */
  get count(): number {
    return this.live;
  }

  /**
   * Reserve `amount` for a token. @returns its id (credit it with `land(id)`), or 0 when the ledger is full
   * (then the amount is not reserved: it shows at once).
   */
  launch(amount: T): number {
    if (this.live >= this.capacity) {
      this.directCredits++;
      return 0;
    }
    let f: Flight<T> | undefined;
    for (const x of this.flights) {
      if (!x.live) {
        f = x;
        break;
      }
    }
    if (!f) {
      f = { id: 0, amount, live: false };
      this.flights.push(f);
    }
    f.id = this.nextId++;
    f.amount = amount;
    f.live = true;
    this.live++;
    this.inFlight = this.ops.add(this.inFlight, amount);
    return f.id;
  }

  /** The token landed: its amount shows now. @returns false for an unknown or already-landed id. */
  land(id: number): boolean {
    if (id === 0) return false;
    for (const f of this.flights) {
      if (f.live && f.id === id) {
        f.live = false;
        this.live--;
        this.flightCredits++;
        this.inFlight = this.live === 0 ? this.ops.zero() : this.ops.sub(this.inFlight, f.amount);
        return true;
      }
    }
    return false;
  }

  /** Credit every token at once (a reset, a scene change, Motion Off). */
  settle(): void {
    for (const f of this.flights) f.live = false;
    this.live = 0;
    this.inFlight = this.ops.zero();
  }

  /** What the counter shows for an actual balance: actual − in flight, never below zero. */
  shown(actual: T): T {
    if (this.live === 0) return actual;
    const s = this.ops.sub(actual, this.inFlight);
    return this.ops.cmp(s, this.ops.zero()) < 0 ? this.ops.zero() : s;
  }

  /** A cost is affordable on screen: the shown balance has reached it. */
  affordable(actual: T, cost: T): boolean {
    return this.ops.cmp(this.shown(actual), cost) >= 0;
  }
}
