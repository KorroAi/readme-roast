// The Crew sheet (SPEC §9.4): the crew's total DPS, every unlocked line (rows: icon, name, level, ★ pips,
// "1.2M → 1.5M DPS", the buy button) and the next line's teaser ("Unlocks at 240 m").

import { CardSheet, type CardSource } from './CardSheet';

export function createCrewSheet(src: CardSource): CardSheet {
  return new CardSheet('crew', 'ui.sheet.crew.title', src);
}
