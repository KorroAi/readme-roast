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
