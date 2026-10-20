// "Lamplight on the Lintel": the brand tokens. ui.css declares the same values as custom
// properties on .dd-ui; tests/unit/brand.test.ts checks the two agree and that every text token
// reads at WCAG AA (4.5:1) on the surface it is used on.
//
// Two registers that never mix:
// - the kit (everything the player owns or does): slate plates, brass rims, amber light;
// - builders' script (discoveries, lore, runes, the logo's O): cyan ink carved in stone.
// Violet means the unknown (locked entries, records, relics). Red means danger only.

export const COLOR = {
  slate950: '#070a0f',
  slate900: '#0c1118',
  slate800: '#131a24',
  slate700: '#1d2632',
  slate600: '#2a3544',
  bone100: '#efe7d8',
  bone300: '#c9bfae',
  bone500: '#948b7d',
  brass300: '#e2b673',
  brass500: '#b0823f',
  brass700: '#5e4220',
  amber300: '#ffd29a',
  amber400: '#ffb35c',
  amber500: '#f39c45',
  amber700: '#8a4f1c',
  ember: '#d8722a',
  rune200: '#8fe3ee',
  rune400: '#2fb6cc',
  rune900: '#072a33',
  deep300: '#b9a2ff',
  danger400: '#ff6b5e',
  danger700: '#6a1712',
  verdigris300: '#8fc4a4',
  /** The carved outline under stone letters and the groove's shadow line. */
  carve: '#04070b',
  /** Text on amber (primary buttons, the full-pack chip). */
  onAmber: '#1c1006',
  /** Text on the danger plate. */
  onDanger: '#ffd6d0',
} as const;

export type ColorToken = keyof typeof COLOR;

/** The CSS custom property for a token: slate900 -> --slate-900, onAmber -> --on-amber. */
export const cssVar = (token: ColorToken): string => `--${token.replace(/([a-z])([A-Z0-9])/g, '$1-$2').replace(/([0-9])([a-z])/g, '$1-$2').toLowerCase()}`;

export const RARITY = { common: COLOR.bone300, uncommon: '#e58444', rare: COLOR.rune200, relic: COLOR.deep300 } as const;

/** Panel fill alpha over the world (slate-900). */
export const PANEL_ALPHA = 0.94;

/** Octagon chamfers (45 degree cut, px): panels, buttons, chips, bar caps. */
export const CUT = { panel: 9, button: 8, chip: 6, cap: 4 } as const;

/** Type scale (px) and the 12 px floor. */
export const TYPE = { displayL: 28, displayM: 22, title: 17, body: 15, label: 13, eyebrow: 12, floor: 12 } as const;

/** The text tokens and the surfaces they sit on: every pair must reach 4.5:1. */
export const TEXT_PAIRS: ReadonlyArray<[text: ColorToken | `#${string}`, surface: ColorToken | `#${string}`, use: string]> = [
  ['bone100', 'slate900', 'body text on a panel'],
  ['bone300', 'slate900', 'secondary text on a panel'],
  ['bone500', 'slate900', 'quiet text (version line, captions)'],
  ['brass300', 'slate900', 'eyebrows, section titles'],
  ['amber300', 'slate900', 'values, selected states'],
  ['amber400', 'slate900', 'gauge values'],
  ['rune200', 'slate900', 'builders’ script on stone'],
  ['deep300', 'slate900', 'relics, the unknown'],
  ['danger400', 'slate900', 'danger text'],
  ['verdigris300', 'slate900', 'have-enough counts'],
  [RARITY.uncommon as `#${string}`, 'slate900', 'uncommon item names'],
  ['bone100', 'slate800', 'secondary buttons'],
  ['bone300', 'slate800', 'unselected tabs and segments'],
  ['bone500', 'slate800', 'disabled buttons'],
  ['amber300', 'slate800', 'selected segment'],
  ['onAmber', 'amber400', 'primary button (top of its gradient)'],
  ['onAmber', 'amber500', 'primary button (bottom of its gradient)'],
  ['onDanger', 'danger700', 'danger button'],
  ['rune200', 'rune900', 'discovery band label'],
  ['bone100', 'slate700', 'pressed secondary button'],
];

const hex = (c: string): [number, number, number] => {
  const v = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
};

/** WCAG 2.x relative luminance of an sRGB hex colour. */
export function luminance(c: string): number {
  const [r, g, b] = hex(c).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A token name or a literal hex colour, as a hex colour. */
export const resolve = (c: ColorToken | `#${string}`): string => (c.startsWith('#') ? c : COLOR[c as ColorToken]);
