/**
 * Round 3 (UI): the line glyphs of the action layout (pad buttons, the Interact chip's target
 * icons, the top bar's menu buttons, the reticle's marks). 24 x 24 view box, drawn with
 * currentColor so a button's state colours them; no raster, no fetch.
 */

const P: Record<string, string> = {
  // Pad
  pick: '<path d="M4 9c4-5 12-5 16 0M12 6.5 6.5 20" stroke-width="2.4"/><path d="M15.5 4.5c2 .6 3.5 2 4.5 4" stroke-width="1.6"/>',
  jump: '<path d="M12 19V7M6.5 12 12 6.5 17.5 12" stroke-width="2.4"/><path d="M6 21h12" stroke-width="1.6"/>',
  dash: '<path d="M4 12h10M10 7l5 5-5 5" stroke-width="2.4"/><path d="M3 7h4M3 17h4M17 7h4M17 17h4" stroke-width="1.4" opacity=".6"/>',
  sonar: '<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" stroke-width="2"/><path d="M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15" stroke-width="1.5" opacity=".7"/>',
  place: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" stroke-width="1.8"/><path d="M12 8.5v7M8.5 12h7" stroke-width="2.4"/>',
  // Interact targets
  chest: '<path d="M4 10h16v9H4zM4 10a8 5 0 0 1 16 0" stroke-width="1.9"/><path d="M11 13h2v3h-2z" fill="currentColor"/>',
  station: '<path d="M3 11h18M5 11v8M19 11v8M9 7h6l1 4H8z" stroke-width="1.9"/>',
  being: '<path d="M6 15c0-4 2.7-7 6-7s6 3 6 7-2.7 4-6 4-6 0-6-4z" stroke-width="1.9"/><circle cx="9.8" cy="13" r="1.1" fill="currentColor"/><circle cx="14.2" cy="13" r="1.1" fill="currentColor"/><path d="M9 8 7.5 4.5M15 8l1.5-3.5" stroke-width="1.6"/>',
  door: '<path d="M6 21V5a6 6 0 0 1 12 0v16M4 21h16" stroke-width="1.9"/><circle cx="14.6" cy="13" r="1.1" fill="currentColor"/>',
  rope: '<path d="M12 2v20" stroke-width="2"/><path d="M9.5 6l5 2.5M9.5 11l5 2.5M9.5 16l5 2.5" stroke-width="1.5"/>',
  page: '<path d="M6 3h9l4 4v14H6z" stroke-width="1.9"/><path d="M9 11h7M9 14.5h7M9 18h4" stroke-width="1.4"/>',
  gate: '<path d="M4 21V9l8-6 8 6v12" stroke-width="1.9"/><path d="M9 21v-7h6v7" stroke-width="1.6"/><circle cx="12" cy="9.5" r="1.6" fill="currentColor"/>',
  outpost: '<path d="M4 20 12 5l8 15z" stroke-width="1.9"/><path d="M12 12.5v4" stroke-width="2.2"/><circle cx="12" cy="9.5" r="1" fill="currentColor"/>',
  bed: '<path d="M3 18v-7M3 14h18v4M7 11h7a3 3 0 0 1 3 3" stroke-width="1.9"/>',
  other: '<path d="M12 4 20 12 12 20 4 12z" stroke-width="1.9"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  // Top bar
  bag: '<path d="M6 9h12l1 11H5z" stroke-width="1.9"/><path d="M9 9V7a3 3 0 0 1 6 0v2" stroke-width="1.7"/>',
  craft: '<path d="M14.5 4.5l5 5-3 3-5-5zM11.5 7.5 4 15l5 5 7.5-7.5" stroke-width="1.8"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" stroke-width="1.8"/><path d="M9 4v14M15 6v14" stroke-width="1.3" opacity=".7"/>',
  quests: '<path d="M6 3v18" stroke-width="2"/><path d="M6 4h11l-2.5 4L17 12H6" stroke-width="1.8"/>',
  bestiary: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" stroke-width="1.8"/><path d="M9 9c1.5-1.5 4.5-1.5 6 0M10 13h.01M14 13h.01" stroke-width="2"/>',
  menu: '<path d="M5 7h14M5 12h14M5 17h14" stroke-width="2.2"/>',
  help: '<circle cx="12" cy="12" r="9" stroke-width="1.8"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8" stroke-width="1.9"/><circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke-width="2.2"/>',
  lampling: '<path d="M12 4c3.6 0 6 2.9 6 6.6 0 3.8-2.4 6.9-6 6.9s-6-3.1-6-6.9C6 6.9 8.4 4 12 4z" stroke-width="1.8"/><circle cx="9.8" cy="10.4" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.2" cy="10.4" r="1.2" fill="currentColor" stroke="none"/><path d="M10.2 13.6c1.1.8 2.5.8 3.6 0M12 2v2M8.5 19.5 7.6 21.5M15.5 19.5l.9 2" stroke-width="1.6"/>',
  medal: '<path d="M8 3l4 6 4-6" stroke-width="1.8"/><circle cx="12" cy="15" r="5.5" stroke-width="1.9"/><path d="M12 12.2l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="currentColor" stroke="none"/>',
  compassMe: '<circle cx="12" cy="12" r="6.5" stroke-width="1.9"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5" stroke-width="1.9"/>',
  // Markers and states
  camp: '<path d="M4 20 12 6l8 14z" stroke-width="1.9"/><path d="M10 20l2-4 2 4" stroke-width="1.6"/>',
  lair: '<path d="M4 18c2-6 4-9 8-9s6 3 8 9" stroke-width="1.9"/><path d="M8 14l1.5 2M16 14l-1.5 2" stroke-width="1.8"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" stroke-width="1.9"/>',
  flame: '<path d="M12 21c-3.5 0-6-2.4-6-5.6 0-3.6 3.2-5.2 4-9.4 2.6 1.8 3.4 4 3.2 6 1.2-.6 2-1.6 2.3-2.8 1.5 1.6 2.5 3.6 2.5 6.2 0 3.2-2.5 5.6-6 5.6z" stroke-width="1.8"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" stroke-width="1.9"/><path d="M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" stroke-width="1.5"/>',
  gas: '<path d="M4 15c2-2 4 2 6 0s4 2 6 0 4 2 4 2M4 10c2-2 4 2 6 0s4 2 6 0 4 2 4 2" stroke-width="1.9"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  arrow: '<path d="M12 3 19 20 12 16 5 20z" fill="currentColor" stroke="#05080d" stroke-width="1.4" stroke-linejoin="round"/>',
};

export type GlyphName = keyof typeof P;

/** An inline SVG for a glyph (unknown names fall back to the diamond). */
export function iconSvg(name: string): string {
  const body = P[name] ?? P.other;
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export const GLYPH_NAMES: readonly string[] = Object.keys(P);
