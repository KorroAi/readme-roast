/**
 * First-person feel events (round 2, FP), added to the game's bus types by declaration merging so
 * core/events.ts stays untouched. Audio (MOBS owns src/audio) and haptics (ui/haptics) answer them.
 */
export {};

declare module '../../core/events' {
  interface GameEvents {
    /**
     * A strike on ordinary rock (never minable): a soft "tunk" and a tiny chip, no damage, no crack.
     * x, y, z: the block; px, py, pz: where the pick landed.
     */
    'block:tunk': { x: number; y: number; z: number; block: number; px: number; py: number; pz: number };
    /** A weapon (or the pick on a monster) starts its attack; `ranged` for the sling. */
    'weapon:swing': { weapon: string; ranged: boolean };
    /** A strike landed on a mob (`killed`: it died, or a being was caught or harvested by it). */
    'weapon:hit': { weapon: string; mob: number; kind: string; killed: boolean; x: number; y: number; z: number };
    /** A Flash Charge burst at the explorer (radius m; `count`: monsters caught in it). */
    'weapon:flash': { x: number; y: number; z: number; radius: number; count: number };
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /**
     * Round 3 (UI): a control was used (ui/hud/actions UiControl), for the taught-by-doing tutorial
     * and first-time tooltips. 'look' and 'move' come at most 4 times a second; `screen` for 'open',
     * `slot` for 'hotbar'.
     */
    'ui:used': { control: import('../../ui/hud/actions').UiControl; screen?: string; slot?: number };
    /** A menu screen opened (inventory, crafting, map, quests, bestiary, settings, pause...). */
    'ui:opened': { screen: string };
    /** The explorer dashed (a short dodge, invulnerable for `iframes` seconds). */
    'player:dash': { x: number; y: number; z: number; iframes: number };
    /** The sonar pulse went out from the lantern (radius m, reveal seconds). */
    'player:sonar': { x: number; y: number; z: number; radius: number; seconds: number };
    /** A block, torch, ladder or rope was placed from the hotbar. */
    'player:placed': { item: string; block: number; x: number; y: number; z: number };
    /** A block of the same vein was chained (count 1..5): the next swing is quicker. */
    'mine:combo': { count: number; x: number; y: number; z: number };
    /** A hotbar slot was selected (0-based) and what it holds (null: empty). */
    'hotbar:selected': { slot: number; item: string | null };
  }
}
