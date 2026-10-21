// The shell's reading of the model's text keys (SPEC §8.8: no raw key ever reaches the screen).
import { hasText, t, type TextKey } from '../../i18n';

/**
 * A model text key with its parameters, as the player reads it: a parameter that is itself a text key (a mechanism's,
 * a biome's or a relic's name) is resolved first, so the screen never shows "idle.mech.haldenHatch". An unknown key
 * reads as '' (the caller falls back to its own line).
 */
export function tx(key: string, params?: Record<string, string | number>): string {
  if (!key || !hasText(key)) return '';
  if (!params) return t(key as TextKey);
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) p[k] = typeof v === 'string' && hasText(v) ? t(v as TextKey) : v;
  return t(key as TextKey, p);
}
