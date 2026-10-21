// The reach and size rules every template obeys (SPEC §2.3, §4.6; BUILD §3.2 MUST 5; U-W4), shared by the builder and
// the tests.

/** Metres from the eye at a socket's approach to the socket: strike types and lamps, focus types. */
export const REACH = {
  strike: 3.5,
  /** Lamps are relit from ≤ 2.5 m. */
  lamp: 2.5,
  focus: 4.5,
  /** Valuables (features on crates, plinths, shelves, niches) sit 0.5–1.4 m above their floor. */
  valuableLo: 0.5,
  valuableHi: 1.4,
  /** A lamp is at least this wide across (head, hood and bracket). */
  lampAcross: 0.55,
} as const;

/** Pixels per metre at 1 m on the 360 × 740 portrait (hFOV 52°): 180 / tan(26°). */
export const PX_PER_M_360 = 180 / Math.tan((26 * Math.PI) / 180);
