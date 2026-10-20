// The Dig sheet (SPEC §9.4): the gear cards of the current depth, the Pick and its cards (Lucky Strike, Steady
// Hand, Shockwave, Bellows), the skills, and locked teasers.

import { CardSheet, type CardSource } from './CardSheet';

export function createDigSheet(src: CardSource): CardSheet {
  return new CardSheet('dig', 'ui.sheet.dig.title', src);
}
