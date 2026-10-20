// WAAPI helpers that hold on the WebView 88 floor (SPEC §10.4, U5): only `transform` and `opacity` keyframes
// (no individual transform properties, no `composite: 'add'`, no CSS `linear()`); springs are sampled into
// keyframes at 60 Hz. Every call is fire-and-forget and never throws (an element detached mid-animation, an
// engine without WAAPI).

import { cssEase, type EaseName } from '../../core/ease';
import { springSamples, type SpringName } from '../../core/spring';

export type MotionLevel = 'full' | 'reduced' | 'off';

/** The current motion level for UI motion (set by the game from Settings). */
let motion: MotionLevel = 'full';
export function setUiMotion(m: MotionLevel): void {
  motion = m;
}
export function uiMotion(): MotionLevel {
  return motion;
}

/** Cached spring keyframe samples (name|from|to → values). */
const cache = new Map<string, { values: number[]; duration: number }>();

function samples(name: SpringName, from: number, to: number): { values: number[]; duration: number } {
  const key = `${name}|${from}|${to}`;
  let s = cache.get(key);
  if (!s) {
    s = springSamples(name, from, to);
    cache.set(key, s);
  }
  return s;
}

/** Run an animation; returns it or null. */
export function play(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (motion === 'off' || typeof (el as HTMLElement).animate !== 'function') return null;
  try {
    return (el as HTMLElement).animate(frames, opts);
  } catch {
    return null;
  }
}

/**
 * A spring on one scalar, written into a transform by `tf(v)` (e.g. v => `scale(${v})`). Reduced motion:
 * outCubic over the same duration with no overshoot.
 */
export function spring(el: Element, name: SpringName, from: number, to: number, tf: (v: number) => string, extra?: Partial<KeyframeAnimationOptions>): Animation | null {
  const s = samples(name, from, to);
  if (motion === 'reduced') {
    return play(el, [{ transform: tf(from) }, { transform: tf(to) }], { duration: s.duration, easing: cssEase('outCubic'), ...extra });
  }
  return play(
    el,
    s.values.map((v) => ({ transform: tf(v) })),
    { duration: s.duration, easing: 'linear', ...extra },
  );
}

/** A tween between keyframes on a named ease. */
export function tween(el: Element, frames: Keyframe[], ms: number, ease: EaseName = 'outCubic', extra?: Partial<KeyframeAnimationOptions>): Animation | null {
  return play(el, frames, { duration: motion === 'reduced' ? Math.min(ms, 150) : ms, easing: cssEase(ease), ...extra });
}
