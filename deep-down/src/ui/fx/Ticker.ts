// Rolling counters (SPEC §10.6): the displayed value approaches its target in log space,
// logD += (logT − logD)·(1 − e^(−dt/τ)), τ 90 ms for gains and 60 ms for spending, clamped to ×1.5 per frame
// (L8: counters roll, never jump). A jump of more than ×10 plays a scripted count over
// clamp(500 + 220·log10(T/D), 500, 2000) ms on outQuart in log space. Digits are 0–9 strips in a 1 em mask
// that translate on change; the DOM is touched only when the string changes. Every element is made up front
// (F10: no DOM churn while playing).

import { EASE } from '../../core/ease';
import { h } from '../dom';

/** log10 of the per-frame ratio cap (×1.5). */
const MAX_STEP = Math.log10(1.5);
const TAU_GAIN = 0.09;
const TAU_SPEND = 0.06;
/** A gain this big (log10 of ×10) plays a scripted count. */
const SCRIPT_JUMP = 1;
const SLOTS = 14;
const DIGITS = '0123456789';

/** Pure: the next displayed log value toward `target` after `dt` seconds (no scripted count). */
export function rollStep(shown: number, target: number, dt: number): number {
  if (shown === target) return target;
  // From zero (−Infinity) a counter starts one step below the target.
  if (!Number.isFinite(shown)) return Number.isFinite(target) ? target - MAX_STEP : target;
  // Down to zero: roll down a step a frame, then land on zero below 1.
  if (!Number.isFinite(target)) return shown - MAX_STEP < 0 ? target : shown - MAX_STEP;
  const tau = target > shown ? TAU_GAIN : TAU_SPEND;
  let next = shown + (target - shown) * (1 - Math.exp(-dt / tau));
  const d = next - shown;
  if (d > MAX_STEP) next = shown + MAX_STEP;
  else if (d < -MAX_STEP) next = shown - MAX_STEP;
  // Close enough: land exactly (within 0.05 % of the value).
  if (Math.abs(target - next) < 2e-4) next = target;
  return next;
}

/** Pure: the scripted count's length (ms) for a jump from 10^from to 10^to. */
export function scriptedMs(from: number, to: number): number {
  const decades = Number.isFinite(from) ? to - from : to;
  return Math.max(500, Math.min(2000, 500 + 220 * Math.max(0, decades)));
}

/** The DOM roller: a row of character slots; digit slots are vertical 0–9 strips. */
export class RollText {
  readonly el: HTMLElement;
  private readonly slots: Array<{ el: HTMLElement; strip: HTMLElement; glyph: HTMLElement; ch: string; digit: number }> = [];
  private text = '';
  /** DOM writes so far (F10 reads it through the debug surface). */
  writes = 0;

  constructor(className: string, label = '') {
    this.el = h('span', { class: `dd-roll ${className}`, role: 'text', 'aria-label': label });
    for (let i = 0; i < SLOTS; i++) {
      const strip = h('span', { class: 'dd-roll-strip', 'aria-hidden': 'true' }, ...DIGITS.split('').map((d) => h('span', { text: d })));
      const glyph = h('span', { class: 'dd-roll-glyph', 'aria-hidden': 'true' });
      const el = h('span', { class: 'dd-roll-slot', style: 'display:none' }, strip, glyph);
      this.el.appendChild(el);
      this.slots.push({ el, strip, glyph, ch: '', digit: -1 });
    }
  }

  get value(): string {
    return this.text;
  }

  /** Show `s` (≤ 14 characters). @returns true when the DOM changed. */
  set(s: string): boolean {
    if (s === this.text) return false;
    this.text = s;
    this.writes++;
    const n = Math.min(SLOTS, s.length);
    for (let i = 0; i < SLOTS; i++) {
      const slot = this.slots[i];
      const ch = i < n ? s[i] : '';
      if (ch === slot.ch) continue;
      const wasHidden = slot.ch === '';
      slot.ch = ch;
      if (ch === '') {
        slot.el.style.display = 'none';
        continue;
      }
      if (wasHidden) slot.el.style.display = '';
      const d = DIGITS.indexOf(ch);
      if (d >= 0) {
        if (slot.digit < 0) {
          slot.el.classList.add('digit');
          slot.glyph.textContent = '';
        }
        slot.digit = d;
        slot.strip.style.transform = `translateY(${-d}em)`;
      } else {
        if (slot.digit >= 0) slot.el.classList.remove('digit');
        slot.digit = -1;
        slot.glyph.textContent = ch;
      }
    }
    this.el.setAttribute('aria-label', s);
    return true;
  }
}

/**
 * A counter that rolls toward a target in log space. `format(log10)` turns a log value into the display string.
 */
export class Ticker {
  readonly roll: RollText;
  /** The displayed value (log10; −Infinity is zero). */
  shown = -Infinity;
  private target = -Infinity;
  private script: { from: number; to: number; t0: number; ms: number } | null = null;
  /** Time (ms) a scripted count is running, for the tick sound. */
  onScriptTick: ((progress: number) => void) | null = null;
  reduced = false;

  constructor(private readonly format: (log10: number) => string, className: string, label = '') {
    this.roll = new RollText(className, label);
  }

  get el(): HTMLElement {
    return this.roll.el;
  }

  /** A scripted count runs now. */
  get counting(): boolean {
    return this.script !== null;
  }

  /** Jump to a value with no roll (load, reset). */
  snap(log10: number): void {
    this.target = log10;
    this.shown = log10;
    this.script = null;
    this.roll.set(this.format(log10));
  }

  /** Set the target. A gain of more than ×10 starts a scripted count (unless `quiet`). */
  setTarget(log10: number, now: number, quiet = false): void {
    if (log10 === this.target) return;
    const jump = log10 - (Number.isFinite(this.shown) ? this.shown : log10 - 0.5);
    this.target = log10;
    if (!quiet && !this.reduced && jump > SCRIPT_JUMP && Number.isFinite(this.shown)) {
      this.script = { from: this.shown, to: log10, t0: now, ms: scriptedMs(this.shown, log10) };
    } else if (this.script && log10 < this.script.to) {
      this.script = null;
    } else if (this.script) {
      this.script.to = log10;
    }
  }

  /** Advance (dt seconds, now ms). @returns true when the displayed string changed. */
  update(dt: number, now: number): boolean {
    if (this.script) {
      const s = this.script;
      const u = Math.min(1, (now - s.t0) / s.ms);
      this.shown = s.from + (s.to - s.from) * EASE.outQuart(u);
      this.onScriptTick?.(u);
      if (u >= 1) {
        this.shown = s.to;
        this.script = null;
      }
    } else this.shown = rollStep(this.shown, this.target, dt);
    return this.roll.set(this.format(this.shown));
  }
}
