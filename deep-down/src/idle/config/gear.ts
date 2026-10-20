// Gear (SPEC §5.4): four one-shot gold cards per biome start (from biome 1 on, and every Echo stratum),
// priced in rows of gold at the biome's start. And the named tool forms (CRITIQUE MUST 10): the visible
// tool is split from the pick's ×2.5 damage tiers; the 15 named forms unlock on lifetime milestones (one
// per new biome or stratum ever reached), so the Void Cleaver arrives with Echo I, not on day 1.

import { biomeStart } from './biomes';
import { rowsOfGoldLog10 } from './curves';

export type GearKind = 'tools' | 'rigging' | 'edge' | 'lantern';

export interface GearDef {
  /** `<biome>.<kind>`, e.g. '1.tools'. */
  id: string;
  biome: number;
  kind: GearKind;
  /** log10 of the price (gold). */
  costLog10: number;
  /** What it multiplies: a crew line (index), the pick, or everything. */
  target: { line: number } | { pick: true } | { all: true };
  mult: number;
}

/** Rows of gold at the biome start, per card (SPEC §5.4; the calibration's ×0.1247 of 20/30/25/60). */
export const GEAR_ROWS: Readonly<Record<GearKind, number>> = { tools: 2.49375, rigging: 3.740625, edge: 3.1171875, lantern: 7.48125 };
export const GEAR_KINDS: readonly GearKind[] = ['tools', 'rigging', 'edge', 'lantern'];

/**
 * The four cards of biome k (k ≥ 1). As calibrated (m5.mjs), Tools multiply line k (the line the
 * previous biome brought, the one you are levelling) and Rigging line k − 1; Edge the pick; Lantern all.
 */
export function gearOf(k: number): GearDef[] {
  if (k < 1) return [];
  const u = biomeStart(k);
  return GEAR_KINDS.map((kind) => ({
    id: `${k}.${kind}`,
    biome: k,
    kind,
    costLog10: rowsOfGoldLog10(u, GEAR_ROWS[kind]),
    target: kind === 'tools' ? { line: k } : kind === 'rigging' ? { line: Math.max(0, k - 1) } : kind === 'edge' ? { pick: true as const } : { all: true as const },
    mult: kind === 'lantern' ? 2 : 3,
  }));
}

/** Parse a gear id. */
export function gearById(id: string): GearDef | undefined {
  const dot = id.indexOf('.');
  if (dot <= 0) return undefined;
  const k = Number(id.slice(0, dot));
  if (!Number.isInteger(k) || k < 1) return undefined;
  return gearOf(k).find((g) => g.id === id);
}

// ----- named tool forms ---------------------------------------------------------------------------

/** The 15 named forms (i18n `idle.tool.<id>`), then Lantern Edge I, II, III… (`idle.tool.edge` with n). */
export const TOOL_FORMS: ReadonlyArray<{ id: string; head: number }> = [
  { id: 'rusty', head: 0.6 },
  { id: 'copper', head: 0.7 },
  { id: 'iron', head: 0.8 },
  { id: 'steel', head: 1.0 },
  { id: 'gilded', head: 1.2 },
  { id: 'crystal', head: 1.4 },
  { id: 'obsidian', head: 1.7 },
  { id: 'mythril', head: 2.0 },
  { id: 'sunsteel', head: 2.4 },
  { id: 'thunderMaul', head: 2.9 },
  { id: 'plasma', head: 3.5 },
  { id: 'comet', head: 4.2 },
  { id: 'starBreaker', head: 5.0 },
  { id: 'planetCracker', head: 6.0 },
  { id: 'voidCleaver', head: 7.0 },
];

/** The tool form unlocked by having reached biome index k (lifetime): form k, Lantern Edges past 14. */
export function toolFormForBiome(k: number): number {
  return Math.max(0, k);
}

/** Lantern Edge number of form f (0 for the named 15). */
export function lanternEdge(form: number): number {
  return form < TOOL_FORMS.length ? 0 : form - TOOL_FORMS.length + 1;
}

/** Ghost head length (m) of form f (7 m cap). */
export function toolHead(form: number): number {
  return form < TOOL_FORMS.length ? TOOL_FORMS[Math.max(0, form)].head : 7;
}

/**
 * The Lantern Edge aura radius (m): logarithmic, capped at 1.2 × the 7 m shaft (CRITIQUE MUST 10;
 * SPEC's +0.3 m per tier reached about 18 m by day 7).
 */
export function toolAura(form: number): number {
  const n = lanternEdge(form);
  if (n <= 0) return 0;
  return Math.min(8.4, 1.2 * Math.log2(1 + n));
}
