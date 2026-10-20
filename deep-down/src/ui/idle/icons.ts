// Vector icons for the idle HUD (cards, plates, tabs): small SVG drawings on a 24-unit grid in the brand's
// registers (brass and amber for the kit, rune cyan for gems). Every drawing is a <symbol> in one hidden sprite
// sheet made at the first icon; an icon element is an <svg><use> made when its card or plate is built, and a swap
// (a card changing slot, the goal bar's next goal) only rewrites the use's href: no element is made during play (F10).

const svg = (body: string, label = ''): string =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const BRASS = '#e2b673';
const AMBER = '#ffb35c';
const DARK = '#5e4220';
const BONE = '#efe7d8';
const RUNE = '#8fe3ee';

export type IconId =
  | 'pick' | 'shovel' | 'crew' | 'cart' | 'drill' | 'blast' | 'borer' | 'lucky' | 'steady' | 'shock' | 'bellows'
  | 'gear' | 'edge' | 'lantern' | 'rigging' | 'dynamite' | 'coin' | 'gem' | 'depth' | 'menu' | 'lock' | 'dig' | 'goal'
  | 'seal' | 'chest' | 'star' | 'crown' | 'flag' | 'skill';

const ICONS: Record<IconId, string> = {
  pick: `<path d="M5 19 L15 9" stroke="${DARK}" stroke-width="3.2"/><path d="M5 19 L15 9" stroke="${BRASS}" stroke-width="1.6"/><path d="M8 6 C12 3.5 17 3.5 20.5 7 L18.6 8.4 C16 6.3 12.7 6 10 7.6 Z" fill="${BONE}" stroke="${DARK}" stroke-width="1"/>`,
  shovel: `<path d="M6 18 L14 10" stroke="${DARK}" stroke-width="3"/><path d="M6 18 L14 10" stroke="${BRASS}" stroke-width="1.5"/><path d="M13 7 L17 3 L21 7 L17 11 Z" fill="${BONE}" stroke="${DARK}" stroke-width="1"/><circle cx="5" cy="19" r="1.6" fill="${AMBER}"/>`,
  crew: `<path d="M5 13 C5 8 8.5 5 12 5 C15.5 5 19 8 19 13 Z" fill="${AMBER}" stroke="${DARK}" stroke-width="1.2"/><rect x="3.5" y="12.5" width="17" height="2.5" rx="1" fill="${BRASS}"/><circle cx="12" cy="9.5" r="1.8" fill="#fff6d8"/><path d="M8 17 C8.5 19.5 15.5 19.5 16 17" stroke="${BONE}" stroke-width="1.4"/>`,
  cart: `<path d="M4 9 H20 L18 16 H6 Z" fill="${DARK}" stroke="${BRASS}" stroke-width="1.3"/><circle cx="8" cy="18.5" r="1.8" fill="${BONE}"/><circle cx="16" cy="18.5" r="1.8" fill="${BONE}"/><path d="M7 8 L9.5 5 L12 7.5 L14.5 4.5 L17 8" fill="${AMBER}" stroke="${DARK}" stroke-width="1"/>`,
  drill: `<rect x="8" y="3" width="8" height="7" fill="${DARK}" stroke="${BRASS}" stroke-width="1.2"/><path d="M9 10 L15 10 L12 21 Z" fill="${BONE}" stroke="${DARK}" stroke-width="1"/><path d="M10 13 L14 12.4 M10.6 15.6 L13.4 15" stroke="${DARK}" stroke-width="1"/>`,
  blast: `<path d="M12 3 L14 9 L20 8 L15.5 12 L19 18 L12.5 15 L8 20 L8.5 14 L3 12 L9 9.5 Z" fill="${AMBER}" stroke="${DARK}" stroke-width="1.1"/>`,
  borer: `<circle cx="12" cy="12" r="7" fill="${DARK}" stroke="${BRASS}" stroke-width="1.3"/><path d="M12 5 V19 M5 12 H19 M7 7 L17 17 M17 7 L7 17" stroke="${BONE}" stroke-width="1"/>`,
  lucky: `<path d="M12 3 L20 12 L12 21 L4 12 Z" fill="${AMBER}" stroke="${DARK}" stroke-width="1.2"/><path d="M12 7 L16 12 L12 17 L8 12 Z" fill="#fff6d8"/>`,
  steady: `<path d="M7 20 V11 C7 9.5 9 9.5 9 11 V8 C9 6.5 11 6.5 11 8 V7 C11 5.5 13 5.5 13 7 V8 C13 6.5 15 6.5 15 8 V14 L17 12 C18 11 19.4 12.2 18.6 13.4 L15 20 Z" fill="${BONE}" stroke="${DARK}" stroke-width="1"/>`,
  shock: `<path d="M3 12 H6 L8 7 L11 17 L13 9 L15 14 L17 12 H21" stroke="${AMBER}" stroke-width="2"/>`,
  bellows: `<path d="M5 8 L15 5 L15 19 L5 16 Z" fill="${DARK}" stroke="${BRASS}" stroke-width="1.2"/><path d="M15 10 L20 12 L15 14" fill="${AMBER}"/>`,
  gear: `<circle cx="12" cy="12" r="4" stroke="${BRASS}" stroke-width="2"/><path d="M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21 M5.6 5.6 L7.8 7.8 M16.2 16.2 L18.4 18.4 M5.6 18.4 L7.8 16.2 M16.2 7.8 L18.4 5.6" stroke="${BRASS}" stroke-width="2.2"/>`,
  edge: `<path d="M4 20 L16 8 L19 5 L20 4 L19.5 7.5 L8 19 Z" fill="${BONE}" stroke="${DARK}" stroke-width="1"/><path d="M4 20 L7 17" stroke="${AMBER}" stroke-width="2"/>`,
  lantern: `<path d="M9 4 H15 M10 4 V6 M14 4 V6" stroke="${BRASS}" stroke-width="1.4"/><path d="M8 7 H16 L15 18 H9 Z" fill="${DARK}" stroke="${BRASS}" stroke-width="1.2"/><path d="M12 9 C14 11.5 14 14 12 16 C10 14 10 11.5 12 9 Z" fill="${AMBER}"/><path d="M8 19 H16" stroke="${BRASS}" stroke-width="1.6"/>`,
  rigging: `<path d="M5 4 V20 M19 4 V20 M5 8 L19 12 M19 8 L5 12 M5 16 H19" stroke="${BRASS}" stroke-width="1.5"/>`,
  dynamite: `<rect x="6" y="9" width="12" height="9" rx="1" fill="#c9452e" stroke="${DARK}" stroke-width="1"/><path d="M10 9 V18 M14 9 V18" stroke="${DARK}" stroke-width="0.8"/><path d="M12 9 C12 6 14 5 16 4" stroke="${BONE}" stroke-width="1.2"/><circle cx="16.5" cy="3.8" r="1.5" fill="${AMBER}"/>`,
  coin: `<circle cx="12" cy="12" r="8.5" fill="#ffcf5a" stroke="${DARK}" stroke-width="1.6"/><path d="M12 7 L16 12 L12 17 L8 12 Z" stroke="${DARK}" stroke-width="1.2"/>`,
  gem: `<path d="M12 3 L19 10 L12 21 L5 10 Z" fill="${RUNE}" stroke="#04070b" stroke-width="1.2"/><path d="M5 10 H19 M12 3 L9.5 10 L12 21 L14.5 10 Z" stroke="#2fb6cc" stroke-width="0.9"/>`,
  depth: `<path d="M12 4 V18 M7 13 L12 18 L17 13" stroke="${AMBER}" stroke-width="2"/><path d="M5 21 H19" stroke="${BRASS}" stroke-width="1.6"/>`,
  menu: `<path d="M5 7 H19 M5 12 H19 M5 17 H19" stroke="${BONE}" stroke-width="2"/>`,
  lock: `<rect x="6" y="11" width="12" height="9" rx="1" fill="${DARK}" stroke="#b9a2ff" stroke-width="1.3"/><path d="M8.5 11 V8 C8.5 4.5 15.5 4.5 15.5 8 V11" stroke="#b9a2ff" stroke-width="1.5"/>`,
  dig: `<path d="M4 20 L14 10" stroke="${BRASS}" stroke-width="2.2"/><path d="M8 6 C12 3.5 17 3.5 20.5 7 L18.6 8.4 C16 6.3 12.7 6 10 7.6 Z" fill="${BONE}"/>`,
  goal: `<path d="M12 3 L20 12 L12 21 L4 12 Z" fill="${AMBER}" stroke="${DARK}" stroke-width="1.2"/>`,
  seal: `<rect x="4" y="6" width="16" height="12" fill="${DARK}" stroke="${BRASS}" stroke-width="1.3"/><path d="M4 12 H20 M12 6 V18" stroke="${BRASS}" stroke-width="1"/><circle cx="12" cy="12" r="2.4" fill="${AMBER}"/>`,
  chest: `<path d="M4 10 C4 6 20 6 20 10 V19 H4 Z" fill="${DARK}" stroke="${BRASS}" stroke-width="1.3"/><path d="M4 11 H20" stroke="${BRASS}" stroke-width="1.3"/><rect x="10.5" y="10" width="3" height="4" fill="${AMBER}"/>`,
  star: `<path d="M12 3 L14.6 9 L21 9.4 L16 13.5 L17.6 20 L12 16.4 L6.4 20 L8 13.5 L3 9.4 L9.4 9 Z" fill="${AMBER}" stroke="${DARK}" stroke-width="1"/>`,
  crown: `<path d="M4 17 L5 8 L9 12 L12 5 L15 12 L19 8 L20 17 Z" fill="${AMBER}" stroke="${DARK}" stroke-width="1.1"/><path d="M4 19 H20" stroke="${BRASS}" stroke-width="1.6"/>`,
  flag: `<path d="M6 21 V4" stroke="${BRASS}" stroke-width="1.6"/><path d="M6 5 H17 L14.5 8.5 L17 12 H6" fill="${AMBER}" stroke="${DARK}" stroke-width="1"/>`,
  skill: `<circle cx="12" cy="12" r="7" stroke="${AMBER}" stroke-width="2"/><path d="M12 8 V12 L15 14" stroke="${BONE}" stroke-width="1.6"/>`,
};

/** The SVG markup of an icon. */
export function iconSvg(id: IconId, label = ''): string {
  return svg(ICONS[id], label);
}

const SHEET_ID = 'dd-icon-sheet';
const ref = (id: IconId): string => `#ddi-${id}`;

/** The hidden sprite sheet of every icon (made once). */
function ensureSheet(): void {
  if (typeof document === 'undefined' || document.getElementById(SHEET_ID)) return;
  const host = document.createElement('div');
  host.innerHTML = `<svg id="${SHEET_ID}" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${(Object.keys(ICONS) as IconId[])
    .map((k) => `<symbol id="ddi-${k}" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</symbol>`)
    .join('')}</svg>`;
  const sheet = host.firstElementChild;
  if (sheet) (document.body ?? document.documentElement).appendChild(sheet);
}

/** A span holding an icon (decorative unless `label`). */
export function iconEl(id: IconId, className = 'dd-ico', label = ''): HTMLElement {
  ensureSheet();
  const el = document.createElement('span');
  el.className = className;
  el.dataset.icon = id;
  // trusted: generated from the table above
  el.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><use href="${ref(id)}"/></svg>`;
  return el;
}

/** Swap an icon element's drawing (when a card's id changes slot): one attribute write. */
export function setIcon(el: HTMLElement, id: IconId): void {
  if (el.dataset.icon === id) return;
  el.dataset.icon = id;
  const use = el.querySelector('use');
  if (use) use.setAttribute('href', ref(id));
  else el.innerHTML = iconSvg(id);
}

/** The icon for a card id ('pick', 'up:<id>', 'crew:<n>', 'gear:<biome>.<kind>', 'skill:<id>'). */
export function cardIcon(id: string): IconId {
  if (id === 'pick') return 'pick';
  if (id.startsWith('up:')) {
    const u = id.slice(3);
    return u === 'lucky' ? 'lucky' : u === 'steady' ? 'steady' : u === 'shock' ? 'shock' : u === 'bellows' ? 'bellows' : u === 'rally' ? 'crew' : 'gear';
  }
  if (id.startsWith('crew:')) {
    const n = Number(id.slice(5));
    return (['shovel', 'crew', 'cart', 'drill', 'blast', 'borer'] as IconId[])[n] ?? 'crew';
  }
  if (id.startsWith('gear:')) {
    const k = id.split('.').pop() ?? '';
    return k === 'tools' ? 'gear' : k === 'rigging' ? 'rigging' : k === 'edge' ? 'edge' : k === 'lantern' ? 'lantern' : 'gear';
  }
  if (id.startsWith('skill:')) return id === 'skill:dynamite' ? 'dynamite' : 'skill';
  return 'goal';
}
