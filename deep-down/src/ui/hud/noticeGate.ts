/**
 * Round 3 (UI, QA 22:10): one notice card at a time. The biome arrival card, the discovery band
 * ("What glows can be taken", a named place) and the milestone card (a feat, a Heart Shard, a
 * bestiary page) share the space under the top HUD, so they take turns: the next one waits for the
 * last to fade or be tapped. Toasts wait while a card is up (the fresh ones step aside and come
 * back after), and stand in one column under the HUD, the guardian's bar and a tutorial bubble
 * that sits up there. Cards wait out a guardian fight (its bar is where they would stand) and a
 * tutorial bubble under the HUD (the step comes first). Pure: UI feeds it what is on screen.
 */
export interface NoticeScene {
  /** Play is on screen (no menu, no ceremony). */
  live: boolean;
  /** A card screen is up (a trip's card, the black-out, the end card): toasts wait for it too. */
  cardScreen?: boolean;
  /**
   * A menu is open in play (the Bag, Craft, the Map...): toasts wait for it to close, never over its
   * buttons (QA 02:26: "Banked 2 items" on the Map's Travel row); a craft result stays in its card.
   */
  menuUp?: boolean;
  /** A guardian's bar is up. */
  fight: boolean;
  /** The tutorial's bubble stands in the top part of the view. */
  bubbleUp: boolean;
  arrivalUp: boolean;
  /** An arrival card waits for its turn. */
  arrivalWaiting: boolean;
  discoveryUp: boolean;
  discoveryWaiting: boolean;
  milestoneUp: boolean;
}

export interface NoticeTurns {
  /** The waiting arrival card shows now (it goes before a milestone card, which comes back after). */
  arrival: boolean;
  /** A waiting discovery may start. */
  discovery: boolean;
  /** Milestone cards may show (false while one is up puts it back at the head of its queue). */
  milestones: boolean;
  /** New toasts wait; the ones just shown step aside. */
  holdToasts: boolean;
}

export function noticeTurns(s: NoticeScene): NoticeTurns {
  // An arrival is the moment's own card: it waits only for a discovery already showing.
  const arrival = s.arrivalWaiting && s.live && !s.discoveryUp;
  const arrivalSlot = s.arrivalUp || (s.arrivalWaiting && s.live);
  const discovery = s.live && !arrivalSlot && !s.milestoneUp && !s.fight && !s.bubbleUp;
  // A discovery about to start goes first (it is rarer); a milestone card already up keeps its turn
  // against one (the discovery then waits for it).
  const milestones = s.live && !arrivalSlot && !s.discoveryUp && !(s.discoveryWaiting && discovery && !s.milestoneUp) && !s.fight && !s.bubbleUp;
  const holdToasts = (s.live && (s.arrivalUp || arrival || s.discoveryUp || s.milestoneUp)) || s.cardScreen === true || s.menuUp === true;
  return { arrival, discovery, milestones, holdToasts };
}

/** A guide hint (a first-time find, a hazard, a stuck explorer): where it shows, once (QA 00:03). */
export interface HintScene {
  /** A first-time item tip ('item:<id>'). */
  item: boolean;
  /** It names a control to point at. */
  target: boolean;
  fight: boolean;
  /** A notice card is up (an arrival, a discovery, a milestone). */
  cardUp: boolean;
}

/**
 * 'hold': a new find waits while a guardian is awake (its bar is where the Bag's tip would stand);
 * 'tip': by its control (the tip bubble), when nothing is up there; 'line': the hint line otherwise
 * (or when the tip cannot show). Never both.
 */
export function hintPlace(h: HintScene): 'hold' | 'tip' | 'line' {
  if (h.item && h.fight) return 'hold';
  if (h.target && !h.fight && !h.cardUp) return 'tip';
  return 'line';
}

/** A text made from a template with {placeholders} ("New depth record: -{depth} m"). */
export function fromTemplate(text: string, template: string): boolean {
  const body = template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[a-z]+\}/gi, '.+?');
  return new RegExp(`^${body}$`, 'u').test(text);
}

/** The stratum (1-6) a loading label names (a descent's or a climb's), or null (the boot's "Loading…"). */
export function descentStratum(label: string, names: readonly string[]): number | null {
  const i = names.indexOf(label);
  return i >= 0 ? i + 1 : null;
}

/** Where the toast column starts: under the top HUD block, the guardian's bar or a bubble up there. */
export function toastTop(hudBottom: number, bubbleBottom: number, gap = 10): number {
  return Math.round(Math.max(hudBottom, bubbleBottom) + gap);
}
