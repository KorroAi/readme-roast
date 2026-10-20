// The portrait HUD layout (SPEC §9.1–§9.2), pure: every rect from the viewport and the safe insets, so the CSS,
// the camera framing (the world region) and the tests agree. Stack from the bottom: tab bar 56, quick-buy 76 (68
// below 380 px tall-ish phones), skill row 56 (48), 4 px gaps; from the top: top bar A 48 (44), row B 22 (20), the
// goal bar 44 (40). Large text grows the dock by 12 px. On a tablet or desktop the 9:19.5 column is centred.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudLayout {
  width: number;
  height: number;
  /** The play column (centred on wide screens). */
  column: Rect;
  safeTop: number;
  safeBottom: number;
  gold: Rect;
  depth: Rect;
  menu: Rect;
  gems: Rect;
  goal: Rect;
  /** First-time cards and toasts slide down from under the goal bar. */
  toast: Rect;
  ruler: Rect;
  /** The world region: taps dig here (goal bar bottom + 4 to the skill row's top). */
  region: { top: number; bottom: number; left: number; right: number };
  skill: Rect;
  quick: Rect[];
  tabs: Rect;
  /** A sheet's top edge (42 % of the height) and its bottom (the tab bar's top). */
  sheetTop: number;
  sheetBottom: number;
  compact: boolean;
}

const GAP = 4;

export function hudLayout(width: number, height: number, safeTop = 0, safeBottom = 0, large = false): HudLayout {
  // The play column: at most 9:19.5 wide... but never narrower than 360 (phones are always full width).
  const colW = width <= 480 ? width : Math.max(360, Math.min(width, Math.round((height * 9) / 19.5)));
  const colX = Math.round((width - colW) / 2);
  const compact = height < 780 || colW < 375;
  const barA = compact ? 44 : 48;
  const barB = compact ? 20 : 22;
  // 48 px: the goal bar is a touch target (U1), 4 px taller than SPEC §9.1's 44 px band; the world region gives way.
  const goalH = 48;
  const grow = large ? 12 : 0;
  const tabH = 56;
  // 74 px on compact screens: the card's name, socket and price need it (68 clipped the name at 360 × 740).
  const quickH = (compact ? 74 : 76) + grow;
  const skillH = compact ? 48 : 56;

  const topA = safeTop;
  const topB = topA + barA + GAP;
  const goalY = topB + barB + GAP;
  const tabsY = height - safeBottom - tabH;
  const quickY = tabsY - GAP - quickH;
  const skillY = quickY - GAP - skillH;
  const regionTop = goalY + goalH + GAP;
  const regionBottom = skillY - GAP;

  const pad = 12;
  // ≡ is a 48 px target (U1), centred on the top bar's line.
  const menuW = 48;
  const menu: Rect = { x: colX + colW - pad - menuW + 8, y: topA + Math.round((barA - 48) / 2), w: menuW, h: 48 };
  // Wide enough for the longest W1 biome name under the depth ("Topsoil Roots", "Crystal Grotto") at 12 px.
  const depthW = compact ? 112 : 120;
  const depth: Rect = { x: menu.x - GAP - depthW - 2, y: topA, w: depthW, h: barA };
  const gold: Rect = { x: colX + pad, y: topA, w: depth.x - GAP - (colX + pad) - 2, h: barA };
  const gems: Rect = { x: depth.x, y: topB, w: depthW, h: barB };
  const goal: Rect = { x: colX + 16, y: goalY, w: colW - 32, h: goalH };
  const toast: Rect = { x: colX + 24, y: regionTop, w: colW - 48, h: 52 };
  const ruler: Rect = { x: colX + colW - 24, y: regionTop + 8, w: 20, h: regionBottom - regionTop - 12 };

  const cards = 3;
  const cardGap = 6;
  const cardW = Math.floor((colW - 2 * 10 - (cards - 1) * cardGap) / cards);
  const quickX0 = colX + Math.round((colW - (cards * cardW + (cards - 1) * cardGap)) / 2);
  const quick: Rect[] = [];
  for (let i = 0; i < cards; i++) quick.push({ x: quickX0 + i * (cardW + cardGap), y: quickY, w: cardW, h: quickH });

  return {
    width,
    height,
    column: { x: colX, y: 0, w: colW, h: height },
    safeTop,
    safeBottom,
    gold,
    depth,
    menu,
    gems,
    goal,
    toast,
    ruler,
    region: { top: regionTop, bottom: regionBottom, left: colX, right: colX + colW },
    skill: { x: colX, y: skillY, w: colW, h: skillH },
    quick,
    tabs: { x: colX, y: tabsY, w: colW, h: tabH },
    sheetTop: Math.round(0.42 * height),
    sheetBottom: tabsY,
    compact,
  };
}
