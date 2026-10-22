import type { HudState } from '../types';
import { HOTBAR_SLOTS } from './actions';

/** The round 3 HUD fields at rest (no biome yet, nothing tracked, an empty hotbar). */
export function r3HudDefaults(): Pick<
  HudState,
  | 'biomeName' | 'stratum' | 'reticle' | 'reticleProgress' | 'tracker' | 'objectiveArrow' | 'guardian' | 'hotbar' | 'hotbarSelected'
  | 'canPlace' | 'dashCooldown' | 'sonarCooldown' | 'interact' | 'sprinting' | 'tutorial' | 'hazard'
> {
  return {
    biomeName: '',
    stratum: 1,
    reticle: 'none',
    reticleProgress: 0,
    tracker: { main: null, side: null },
    objectiveArrow: null,
    guardian: null,
    hotbar: Array.from({ length: HOTBAR_SLOTS }, () => ({ item: null, name: '', count: 0, placeable: false })),
    hotbarSelected: 0,
    canPlace: false,
    dashCooldown: 0,
    sonarCooldown: 0,
    interact: null,
    sprinting: false,
    tutorial: null,
    hazard: null,
  };
}
