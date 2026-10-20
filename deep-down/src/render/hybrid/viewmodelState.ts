// The viewmodel's public state (BUILD §2: `viewmodel {swing, form, temper, heat, mirror, lanternLevel}`). Pure data so
// the shell can set it without Three.js; Viewmodel.ts draws it.

/** The tool forms of SPEC §3.7 in ladder order (W1 builds Rusty and Copper; Iron is a SHOULD). */
export const TOOL_FORMS = ['rusty', 'copper', 'iron', 'steel', 'gilded', 'crystal', 'obsidian', 'mythril', 'sunsteel', 'thunder', 'plasma', 'comet', 'star', 'planet', 'void', 'lantern'] as const;
export type ToolForm = (typeof TOOL_FORMS)[number];

export interface ViewmodelState {
  /** Tool form index into TOOL_FORMS (follows the deepest biome reached: gear.ts toolFormForBiome). */
  form: number;
  /** Temper steps (pick tier = floor(level / 25)): a brass band, an edge glint per step (capped in the model). */
  temper: number;
  /** Combo heat 0..1 (bone → amber at 10 → cyan at 25 → violet at 50; SPEC §3.7). */
  heat: number;
  /** Left-handed mirror: lantern lower right, tool lower left. */
  mirror: boolean;
  /** Lantern tier (1 Tin Lamp, 2 Brass Lantern …). */
  lanternLevel: number;
}

export const DEFAULT_VIEWMODEL: ViewmodelState = { form: 0, temper: 0, heat: 0, mirror: false, lanternLevel: 1 };

/** Combo → heat (0..1 over 0..50). */
export const heatOfCombo = (combo: number): number => Math.max(0, Math.min(1, combo / 50));

/** Recovery after a strike (s) and the lunge cap (m): SPEC §3.7. */
export const STRIKE_RECOVER_S = 0.22;
export const LUNGE_MAX_M = 0.1;
/** Lantern Raise: lift 0.2 s, hold, ease back after 1.4 s. */
export const RAISE_UP_S = 0.2;
export const RAISE_HOLD_S = 1.4;
