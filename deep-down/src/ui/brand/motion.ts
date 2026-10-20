// Motion tokens. An enter is an 8 px rise plus a fade; an exit is a fade only, shorter than the
// enter. Only transform and opacity animate, and at most one infinite loop is on screen (the
// logo flame's flicker, off under reduced motion). Reduced motion: opacity fades of <= 150 ms.
// ui.css mirrors these as --dur-* / --ease-* on .dd-ui.

export const DURATION = { micro: 90, short: 160, medium: 240, exit: 140, long: 480, ceremony: 1100 } as const;

/** Upper bound for any fade under prefers-reduced-motion. */
export const REDUCED_MAX_MS = 150;

export const EASE = {
  /** Enters: quick out of the gate, soft landing. */
  enter: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  /** Exits: fade away without drawing attention. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/** The rise of an entering element, px. */
export const ENTER_RISE_PX = 8;

export const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A duration as it plays here: reduced motion caps every fade. */
export function playDuration(ms: number, reduced = prefersReducedMotion()): number {
  return reduced ? Math.min(ms, REDUCED_MAX_MS) : ms;
}
