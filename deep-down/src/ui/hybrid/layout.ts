// The calm first-person HUD's layout (SPEC §3.4, §8.9), pure: every rect from the viewport and the safe insets, so the
// CSS, the tap region, the camera framing and the tests agree. At 390 × 844 with the SPEC's 47 / 34 insets:
//   row A  y 47–87   the depth plate, the gold plate, ≡ (40 px octagon plates)
//   row B  y 91–123  the objective line (32 px)
//   world  y 127–742 (taps act here)
//   cards  y 746–810 the Pick card and the BEST card (64 px)
// Plates cover ≤ 17 % of the screen (E21). Large text grows the rows by 4 px each.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HybridLayout {
  width: number;
  height: number;
  safeTop: number;
  safeBottom: number;
  depth: Rect;
  gold: Rect;
  menu: Rect;
  goal: Rect;
  /** The first-time card and toasts sit just under the objective line. */
  note: Rect;
  cards: [Rect, Rect];
  /** The ride's Skip plate (shown only while a ride is skippable). */
  skip: Rect;
  /** The world region (taps act here). */
  region: { top: number; bottom: number; left: number; right: number };
  /** A sheet's top edge (it covers the bottom ≤ 55 %) and its bottom (the screen's bottom inset). */
  sheetTop: number;
  sheetBottom: number;
  /** The focus pop's panel (a note's text, a chest's roll-up), above the cards. */
  focus: Rect;
}

const PAD = 8;
const GAP = 4;

export function hybridLayout(width: number, height: number, safeTop = 0, safeBottom = 0, large = false): HybridLayout {
  const top = Math.max(PAD, Math.round(safeTop));
  const bottom = Math.max(PAD + 2, Math.round(safeBottom));
  // Short screens (≤ 780 px) take 2–4 px off each band so the plates stay ≤ 17 % of the screen (E21 at 360 × 740).
  const compact = height <= 780;
  // Large text grows each band 4 px (1 px on a short screen, where 3 px in all is the room left under 17 %).
  const grow = large ? (compact ? 1 : 4) : 0;
  const rowA = (compact ? 38 : 40) + grow;
  const rowB = (compact ? 30 : 32) + grow;
  const cardH = (compact ? 60 : 64) + grow;
  const w = width - 2 * PAD;
  const menu: Rect = { x: width - PAD - rowA, y: top, w: rowA, h: rowA };
  const depthW = Math.round(Math.min(132, w * 0.34));
  const depth: Rect = { x: PAD, y: top, w: depthW, h: rowA };
  const gold: Rect = { x: depth.x + depth.w + GAP, y: top, w: menu.x - GAP - (depth.x + depth.w + GAP), h: rowA };
  const goal: Rect = { x: PAD, y: top + rowA + GAP, w, h: rowB };
  const regionTop = goal.y + goal.h + GAP;
  const cardY = height - bottom - cardH;
  const cardW = Math.floor((w - GAP) / 2);
  const cards: [Rect, Rect] = [
    { x: PAD, y: cardY, w: cardW, h: cardH },
    { x: PAD + cardW + GAP, y: cardY, w: w - cardW - GAP, h: cardH },
  ];
  const regionBottom = cardY - GAP;
  const skip: Rect = { x: width - PAD - 96, y: regionTop + 6, w: 96, h: 48 };
  const note: Rect = { x: PAD + 16, y: regionTop + 6, w: w - 32, h: 52 + grow };
  const focusH = Math.round(Math.min(210, (regionBottom - regionTop) * 0.36));
  const focus: Rect = { x: PAD + 10, y: regionBottom - focusH - 8, w: w - 20, h: focusH };
  return {
    width,
    height,
    safeTop: top,
    safeBottom: bottom,
    depth,
    gold,
    menu,
    goal,
    note,
    cards,
    skip,
    region: { top: regionTop, bottom: regionBottom, left: 0, right: width },
    sheetTop: Math.round(height * 0.45),
    sheetBottom: height - bottom,
    focus,
  };
}

/** The persistent plates' share of the screen (E21: ≤ 0.17): row A, the objective line and the two cards. */
export function plateArea(l: HybridLayout): number {
  const a = (r: Rect) => r.w * r.h;
  return (a(l.depth) + a(l.gold) + a(l.menu) + a(l.goal) + a(l.cards[0]) + a(l.cards[1])) / (l.width * l.height);
}
