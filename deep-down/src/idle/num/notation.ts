// Number and depth text (SPEC §5.1): integers below 10,000 with a thin space ("1 234"), then three
// significant digits with a suffix (12.3K, 4.56M … NoDc, Vg), then the 676 letter pairs aa … zz
// (1e66 … 1e2091), then scientific ("1.23e2094"), and past 1e1,000,000 the exponent itself in
// short form ("e1.20M"). Settings offer Letters (default), Scientific and Engineering.
// Pure: no DOM. Values are truncated (never rounded up), so a shown price is never below the real one
// and a shown balance never above it.

import { Big, type BigLike } from '../../core/big';

export type Notation = 'letters' | 'scientific' | 'engineering';

/** The thin space used as the thousands separator (narrow no-break: the number never wraps). */
export const THIN = ' ';

/** Named suffixes, index i = exponent 3·(i + 1). */
export const SUFFIXES: readonly string[] = [
  'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg',
];

/** The first letter-pair exponent (aa = 1e66). */
export const LETTERS_FROM = 66;
/** The last letter-pair exponent (zz = 1e2091). */
export const LETTERS_TO = LETTERS_FROM + 3 * (26 * 26 - 1);
/** Past this exponent the exponent itself is shortened ("e1.20M"). */
export const HUGE_EXP = 1e6;

let defaultNotation: Notation = 'letters';

/** The player's setting (Settings.notation); every `format` without an explicit mode uses it. */
export function setNotation(n: Notation): void {
  defaultNotation = n === 'scientific' || n === 'engineering' ? n : 'letters';
}

export function getNotation(): Notation {
  return defaultNotation;
}

/** The suffix of exponent group k ≥ 1 (k = floor(e / 3)): 'K' … 'Vg', 'aa' … 'zz', '' past zz. */
export function suffixForGroup(k: number): string {
  if (k <= 0) return '';
  if (k <= SUFFIXES.length) return SUFFIXES[k - 1];
  const i = k - LETTERS_FROM / 3;
  if (i < 0 || i >= 26 * 26) return '';
  return String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
}

/**
 * The suffix a value shows in Letters notation ('' below 10,000 or past zz). The counter's tier colour
 * and the number-milestone events key off it (SPEC §5.1).
 */
export function suffixOf(x: BigLike): string {
  const b = x instanceof Big ? x : Big.from(x);
  if (b.isZero()) return '';
  const l = b.log10();
  if (l < 4) return '';
  const e = Math.floor(l + 1e-12);
  if (e > LETTERS_TO + 2) return '';
  return suffixForGroup(Math.floor(e / 3));
}

/**
 * The tier rank of a value's suffix: 0 below K, 1 K, 2 M … 21 Vg, then 22 + i for letter pair i, and
 * 698 for scientific. Monotonic in the value (used for the counter tier colours).
 */
export function suffixRank(x: BigLike): number {
  const b = x instanceof Big ? x : Big.from(x);
  if (b.isZero()) return 0;
  const l = b.log10();
  if (l < 4) return 0;
  const e = Math.floor(l + 1e-12);
  if (e > LETTERS_TO + 2) return 22 + 26 * 26;
  return Math.floor(e / 3);
}

/**
 * Player-facing text for a number. `digits`: significant digits for the suffixed forms (3).
 * Negative values get a leading minus; NaN and Infinity never reach here (Big saturates).
 */
export function format(x: BigLike, mode: Notation = defaultNotation, digits = 3): string {
  const b = x instanceof Big ? x : Big.from(x);
  if (b.isZero()) return '0';
  if (b.m < 0) return `−${format(b.abs(), mode, digits)}`;
  const l = b.log10();
  if (l < 4) return small(b.toNumber());
  // Exponent and mantissa, exact for the integer exponent (Big keeps e as the integer part).
  const e = b.e;
  const m = b.m;
  if (e >= HUGE_EXP) return `e${format(e, mode === 'letters' ? 'letters' : mode, digits)}`;
  if (mode === 'scientific') return `${trunc(m, digits - 1)}e${e}`;
  if (mode === 'engineering') {
    const k = Math.floor(e / 3) * 3;
    return `${sig(m * Math.pow(10, e - k), digits)}e${k}`;
  }
  // Letters.
  if (e > LETTERS_TO + 2) return `${trunc(m, digits - 1)}e${e}`;
  const k = Math.floor(e / 3);
  const lead = m * Math.pow(10, e - 3 * k);
  return `${sig(lead, digits)}${suffixForGroup(k)}`;
}

/** Signed gain text: "+12.3K". */
export function formatGain(x: BigLike, mode: Notation = defaultNotation): string {
  const b = x instanceof Big ? x : Big.from(x);
  return b.m < 0 ? format(b, mode) : `+${format(b, mode)}`;
}

/** A rate next to a counter: "+4.5K/s" (SPEC §5.1). */
export function formatRate(x: BigLike, mode: Notation = defaultNotation): string {
  return `${formatGain(x, mode)}/s`;
}

/** A multiplier: "×2", "×1.5", "×12.3K". */
export function formatMult(x: BigLike, mode: Notation = defaultNotation): string {
  const b = x instanceof Big ? x : Big.from(x);
  const n = b.toNumber();
  if (n < 10) return `×${trimZeros(n.toFixed(n < 1.995 && n % 1 !== 0 ? 2 : 1))}`;
  return `×${format(b, mode)}`;
}

/** A percentage delta: "+12 %", "+0.8 %", "+1.2K %" for huge gains. */
export function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return '+∞ %';
  const p = fraction * 100;
  const sign = p < 0 ? '−' : '+';
  const a = Math.abs(p);
  const body = a < 1 ? trimZeros(a.toFixed(1)) : a < 10000 ? small(Math.floor(a)) : format(a);
  return `${sign}${body}${THIN}%`;
}

/**
 * Depth text (SPEC §5.1, CRITIQUE MUST 11): metres up to 9,999 m ("128 m", "9 999 m"), then
 * kilometres ("12.48 km", "128.4 km", "1 234 km", "12.3K km"). `scale` is the display-only metres
 * per row (×10 per Weave or Echo cycle); the economy always works in rows.
 */
export function formatDepth(rows: number, scale = 1, mode: Notation = defaultNotation): string {
  const m = Math.max(0, Math.floor(rows)) * scale;
  if (m < 10000) return `${small(Math.floor(m))}${THIN}m`;
  const km = m / 1000;
  if (km < 100) return `${trunc(km, 2)}${THIN}km`;
  if (km < 1000) return `${trunc(km, 1)}${THIN}km`;
  if (km < 10000) return `${small(Math.floor(km))}${THIN}km`;
  return `${format(km, mode)}${THIN}km`;
}

/** A signed depth delta: "+42 m", "−8 m". */
export function formatDepthDelta(rows: number, scale = 1): string {
  const s = rows < 0 ? '−' : '+';
  return `${s}${formatDepth(Math.abs(rows), scale)}`;
}

/** Seconds as "0:28", "12:04", "1:57:30", "2 d 4 h". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 172800) return `${Math.floor(s / 86400)}${THIN}d ${Math.floor((s % 86400) / 3600)}${THIN}h`;
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

/** A short duration for ETAs and timers: "14 s", "3 min", "2 h". */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 90) return `${s}${THIN}s`;
  if (s < 5400) return `${Math.round(s / 60)}${THIN}min`;
  if (s < 172800) return `${Math.round(s / 3600)}${THIN}h`;
  return `${Math.round(s / 86400)}${THIN}d`;
}

/** An away time: "5 h 12 m", "42 m", "38 s". */
export function formatAway(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}${THIN}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}${THIN}h ${m}${THIN}m` : `${m}${THIN}m`;
}

// ----- helpers ----------------------------------------------------------------------------------------

/** Below 10,000: integers with a thin-space group, one decimal under 10 when fractional. */
function small(n: number): string {
  if (n < 10 && n % 1 !== 0) {
    const t = Math.floor(n * 10) / 10;
    return t % 1 === 0 ? String(t) : t.toFixed(1);
  }
  const i = Math.floor(n);
  if (i < 1000) return String(i);
  const s = String(i);
  return `${s.slice(0, s.length - 3)}${THIN}${s.slice(s.length - 3)}`;
}

/** Three significant digits, truncated: 1.23, 12.3, 123. */
function sig(lead: number, digits: number): string {
  // lead in [1, 1000).
  const intDigits = lead >= 100 ? 3 : lead >= 10 ? 2 : 1;
  const dec = Math.max(0, digits - intDigits);
  return trunc(lead, dec);
}

/** Truncate to `dec` decimals (with a float guard so 4.56 stays 4.56). */
function trunc(x: number, dec: number): string {
  const f = Math.pow(10, dec);
  const v = Math.floor(x * f + 1e-9) / f;
  return v.toFixed(dec);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
