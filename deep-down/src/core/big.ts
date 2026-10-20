// Big numbers for the idle economy (SPEC §5.1): a float64 mantissa in [1, 10) and an integer exponent
// up to ±9e15, so gold, HP and DPS never overflow (1e2091 letters, 1e1,000,000 and beyond). Zero is
// { m: 0, e: 0 }; negative values carry the sign in the mantissa. Values serialise as [m, e].
//
// Two styles: the immutable methods (`a.add(b)`) return a new Big; the `*In` methods mutate the
// receiver and return it, for the hot path (0 allocations per tap). Pure: no DOM, no Three.js.

/** Exponents are clamped to this magnitude (an integer still exact in float64). */
export const BIG_MAX_EXP = 9e15;

/** Past this exponent gap an addition cannot change the larger operand. */
const ADD_GAP = 17;

const LOG10 = Math.log10;

export type BigLike = Big | number;

export class Big {
  /** Mantissa: 0, or |m| in [1, 10). */
  m: number;
  /** Integer exponent. */
  e: number;

  constructor(m = 0, e = 0) {
    this.m = m;
    this.e = e;
    this.norm();
  }

  // ----- construction -------------------------------------------------------------------------------

  static zero(): Big {
    return new Big(0, 0);
  }

  static one(): Big {
    return new Big(1, 0);
  }

  /** From a plain number (NaN becomes 0; ±Infinity becomes the largest representable value). */
  static from(x: BigLike): Big {
    return x instanceof Big ? x.clone() : new Big().setNum(x);
  }

  /** 10^l (l may be fractional or huge). */
  static fromLog10(l: number): Big {
    return new Big().setLog10(l);
  }

  /** From a save value: [m, e], a number, a numeric string, or a Big-like object. Never throws. */
  static fromJSON(j: unknown): Big {
    if (j instanceof Big) return j.clone();
    if (Array.isArray(j) && j.length === 2 && typeof j[0] === 'number' && typeof j[1] === 'number') {
      return new Big(finiteOr0(j[0]), Number.isFinite(j[1]) ? Math.round(j[1]) : 0);
    }
    if (typeof j === 'number') return Big.from(j);
    if (typeof j === 'string') return Big.parse(j);
    if (j && typeof j === 'object' && typeof (j as Big).m === 'number' && typeof (j as Big).e === 'number') {
      return new Big(finiteOr0((j as Big).m), Math.round(finiteOr0((j as Big).e)));
    }
    return Big.zero();
  }

  /** Parse "1.23e45", "1234", "-5e3". Invalid text gives 0. */
  static parse(s: string): Big {
    const m = /^\s*(-?\d+(?:\.\d*)?|-?\.\d+)(?:e([+-]?\d+))?\s*$/i.exec(s);
    if (!m) return Big.zero();
    const mant = Number(m[1]);
    const exp = m[2] ? Number(m[2]) : 0;
    if (!Number.isFinite(mant)) return Big.zero();
    const b = new Big().setNum(mant);
    if (!b.isZero()) b.e = clampExp(b.e + exp);
    return b;
  }

  static max(a: Big, b: Big): Big {
    return a.cmp(b) >= 0 ? a : b;
  }

  static min(a: Big, b: Big): Big {
    return a.cmp(b) <= 0 ? a : b;
  }

  clone(): Big {
    const b = new Big();
    b.m = this.m;
    b.e = this.e;
    return b;
  }

  /** Copy another value into this one. */
  set(b: BigLike): this {
    if (b instanceof Big) {
      this.m = b.m;
      this.e = b.e;
      return this;
    }
    return this.setNum(b);
  }

  setNum(x: number): this {
    if (Number.isNaN(x) || x === 0) {
      this.m = 0;
      this.e = 0;
      return this;
    }
    if (!Number.isFinite(x)) {
      this.m = x > 0 ? 9.999999999999999 : -9.999999999999999;
      this.e = BIG_MAX_EXP;
      return this;
    }
    this.m = x;
    this.e = 0;
    return this.norm();
  }

  /** this = 10^l. */
  setLog10(l: number): this {
    if (Number.isNaN(l) || l === -Infinity) {
      this.m = 0;
      this.e = 0;
      return this;
    }
    if (l === Infinity || l >= BIG_MAX_EXP) {
      this.m = 9.999999999999999;
      this.e = BIG_MAX_EXP;
      return this;
    }
    if (l <= -BIG_MAX_EXP) {
      this.m = 0;
      this.e = 0;
      return this;
    }
    const e = Math.floor(l);
    let m = Math.pow(10, l - e);
    let ee = e;
    if (m >= 10) {
      m /= 10;
      ee += 1;
    }
    this.m = m;
    this.e = ee;
    return this;
  }

  // ----- predicates ---------------------------------------------------------------------------------

  isZero(): boolean {
    return this.m === 0;
  }

  sign(): number {
    return this.m > 0 ? 1 : this.m < 0 ? -1 : 0;
  }

  /** −1, 0 or 1. */
  cmp(b: BigLike): number {
    const o = b instanceof Big ? b : TMP_A.setNum(b);
    const sa = this.sign();
    const sb = o.sign();
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (sa === 0) return 0;
    if (this.e !== o.e) return (this.e > o.e ? 1 : -1) * sa;
    if (this.m === o.m) return 0;
    return this.m > o.m ? 1 : -1;
  }

  lt(b: BigLike): boolean {
    return this.cmp(b) < 0;
  }

  lte(b: BigLike): boolean {
    return this.cmp(b) <= 0;
  }

  gt(b: BigLike): boolean {
    return this.cmp(b) > 0;
  }

  gte(b: BigLike): boolean {
    return this.cmp(b) >= 0;
  }

  eq(b: BigLike): boolean {
    return this.cmp(b) === 0;
  }

  // ----- conversions --------------------------------------------------------------------------------

  /** log10 of |this| (−Infinity for 0). */
  log10(): number {
    if (this.m === 0) return -Infinity;
    return this.e + LOG10(Math.abs(this.m));
  }

  /** As a plain number (±Infinity past 1.8e308, 0 below 1e-323). */
  toNumber(): number {
    if (this.m === 0) return 0;
    if (this.e > 308) return this.m > 0 ? Infinity : -Infinity;
    if (this.e < -323) return 0;
    if (this.e >= 0 && this.e <= 22) return this.m * POW10[this.e];
    return this.m * Math.pow(10, this.e);
  }

  /** Save form: [m, e]. */
  toJSON(): [number, number] {
    return [this.m, this.e];
  }

  /** Plain debug text ("1.234e56"); the player sees `format()` from idle/num/notation. */
  toString(): string {
    if (this.m === 0) return '0';
    if (this.e >= -6 && this.e < 21) return String(this.toNumber());
    return `${this.m}e${this.e}`;
  }

  // ----- immutable arithmetic -----------------------------------------------------------------------

  add(b: BigLike): Big {
    return this.clone().addIn(b);
  }

  sub(b: BigLike): Big {
    return this.clone().subIn(b);
  }

  mul(b: BigLike): Big {
    return this.clone().mulIn(b);
  }

  div(b: BigLike): Big {
    return this.clone().divIn(b);
  }

  /** this^p for a plain exponent p (|this| ^ p, sign kept for odd integer p). */
  pow(p: number): Big {
    return this.clone().powIn(p);
  }

  neg(): Big {
    const b = this.clone();
    b.m = -b.m;
    return b;
  }

  abs(): Big {
    const b = this.clone();
    b.m = Math.abs(b.m);
    return b;
  }

  // ----- in-place arithmetic (hot path) -------------------------------------------------------------

  addIn(b: BigLike): this {
    const o = b instanceof Big ? b : TMP_A.setNum(b);
    if (o.m === 0) return this;
    if (this.m === 0) {
      this.m = o.m;
      this.e = o.e;
      return this;
    }
    const d = this.e - o.e;
    if (d > ADD_GAP) return this;
    if (d < -ADD_GAP) {
      this.m = o.m;
      this.e = o.e;
      return this;
    }
    if (d >= 0) {
      this.m = this.m + o.m * pow10(-d);
    } else {
      this.m = o.m + this.m * pow10(d);
      this.e = o.e;
    }
    return this.norm();
  }

  subIn(b: BigLike): this {
    const o = b instanceof Big ? b : TMP_A.setNum(b);
    if (o.m === 0) return this;
    TMP_B.m = -o.m;
    TMP_B.e = o.e;
    return this.addIn(TMP_B);
  }

  mulIn(b: BigLike): this {
    const o = b instanceof Big ? b : TMP_A.setNum(b);
    if (this.m === 0 || o.m === 0) {
      this.m = 0;
      this.e = 0;
      return this;
    }
    this.m *= o.m;
    this.e = clampExp(this.e + o.e);
    return this.norm();
  }

  divIn(b: BigLike): this {
    const o = b instanceof Big ? b : TMP_A.setNum(b);
    if (o.m === 0) {
      // Division by zero saturates (never NaN in the economy).
      if (this.m === 0) return this;
      this.m = this.m > 0 ? 9.999999999999999 : -9.999999999999999;
      this.e = BIG_MAX_EXP;
      return this;
    }
    if (this.m === 0) return this;
    this.m /= o.m;
    this.e = clampExp(this.e - o.e);
    return this.norm();
  }

  powIn(p: number): this {
    if (this.m === 0) {
      if (p === 0) {
        this.m = 1;
        this.e = 0;
      }
      return this;
    }
    const neg = this.m < 0 && Number.isInteger(p) && Math.abs(p % 2) === 1;
    const l = this.log10() * p;
    this.setLog10(l);
    if (neg) this.m = -this.m;
    return this;
  }

  /** Multiply by 10^l in place (a log-space multiplier). */
  mulLog10In(l: number): this {
    if (this.m === 0 || l === 0) return this;
    if (!Number.isFinite(l)) {
      if (l < 0) {
        this.m = 0;
        this.e = 0;
      } else this.setLog10(Infinity);
      return this;
    }
    const s = this.m < 0 ? -1 : 1;
    this.setLog10(this.log10() + l);
    this.m *= s;
    return this;
  }

  /** Keep the larger of the two in place. */
  maxIn(b: BigLike): this {
    if (this.cmp(b) < 0) this.set(b);
    return this;
  }

  /** Clamp negatives to zero in place (gold never goes below 0). */
  floorZeroIn(): this {
    if (this.m < 0) {
      this.m = 0;
      this.e = 0;
    }
    return this;
  }

  private norm(): this {
    let m = this.m;
    if (m === 0 || Number.isNaN(m)) {
      this.m = 0;
      this.e = 0;
      return this;
    }
    if (!Number.isFinite(m)) {
      this.m = m > 0 ? 9.999999999999999 : -9.999999999999999;
      this.e = BIG_MAX_EXP;
      return this;
    }
    let e = this.e;
    const a = Math.abs(m);
    if (a >= 10 || a < 1) {
      const k = Math.floor(LOG10(a));
      m = m * pow10(-k);
      e += k;
      // Guard the float edge (9.9999… rounding to 10, or 0.9999…).
      const b = Math.abs(m);
      if (b >= 10) {
        m /= 10;
        e += 1;
      } else if (b < 1) {
        m *= 10;
        e -= 1;
      }
    }
    if (e > BIG_MAX_EXP) {
      this.m = m > 0 ? 9.999999999999999 : -9.999999999999999;
      this.e = BIG_MAX_EXP;
      return this;
    }
    if (e < -BIG_MAX_EXP) {
      this.m = 0;
      this.e = 0;
      return this;
    }
    this.m = m;
    this.e = e;
    return this;
  }
}

const POW10: number[] = [];
for (let i = 0; i <= 22; i++) POW10.push(Math.pow(10, i));

function pow10(k: number): number {
  return k >= 0 && k <= 22 ? POW10[k] : Math.pow(10, k);
}

function clampExp(e: number): number {
  return e > BIG_MAX_EXP ? BIG_MAX_EXP + 1 : e < -BIG_MAX_EXP ? -BIG_MAX_EXP - 1 : e;
}

function finiteOr0(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

// Scratch values for number operands (never escape a call).
const TMP_A = new Big();
const TMP_B = new Big();

/** A Big from anything (shorthand for tests and config). */
export function big(x: BigLike | string): Big {
  return typeof x === 'string' ? Big.parse(x) : Big.from(x);
}
