// Complete English text table. Every player-facing string lives in a section file under ./en/;
// each final-pass stream owns its own section. A unit test rejects a key defined twice.
import { core } from './en/core';
import { loop } from './en/loop';
import { world } from './en/world';
import { release } from './en/release';
import { brand } from './en/brand';
import { screens } from './en/screens';
import { hud } from './en/hud';
import { feel } from './en/feel';
import { play } from './en/play';
import { content } from './en/content';
import { expanse } from './en/expanse';
import { mobs } from './en/mobs';

/** The sections, in assembly order (exported for the duplicate-key test). */
export const EN_SECTIONS = { core, loop, world, release, brand, screens, hud, feel, play, content, expanse, mobs } as const;

export const en = { ...core, ...loop, ...world, ...release, ...brand, ...screens, ...hud, ...feel, ...play, ...content, ...expanse, ...mobs } as const;

export type TextKey = keyof typeof en;
