// Complete English text table. Every player-facing string lives in a section file under ./en/;
// each workstream owns its own section (docs/idle/BUILD.md §0.9). A unit test rejects a key defined twice.
import { core } from './en/core';
import { release } from './en/release';
import { brand } from './en/brand';
import { screens } from './en/screens';
import { idleCore } from './en/idleCore';
import { idleWorld } from './en/idleWorld';
import { idleUi } from './en/idleUi';
import { idleLore } from './en/idleLore';

/** The sections, in assembly order (exported for the duplicate-key test). */
export const EN_SECTIONS = { core, release, brand, screens, idleCore, idleWorld, idleUi, idleLore } as const;

export const en = {
  ...core, ...release, ...brand, ...screens,
  ...idleCore, ...idleWorld, ...idleUi, ...idleLore,
} as const;

export type TextKey = keyof typeof en;
