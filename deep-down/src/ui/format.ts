import { t } from '../i18n';

// Pure formatting helpers for player-facing numbers. No DOM, unit tested in Node.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "yesterday", ... for a past timestamp. Future times read as "just now". */
export function formatRelativeTime(then: number, now: number): string {
  const ago = Math.max(0, now - then);
  if (ago < MINUTE) return t('menu.timeJustNow');
  if (ago < HOUR) {
    const n = Math.floor(ago / MINUTE);
    return n === 1 ? t('menu.timeMinute') : t('menu.timeMinutes', { n });
  }
  if (ago < DAY) {
    const n = Math.floor(ago / HOUR);
    return n === 1 ? t('menu.timeHour') : t('menu.timeHours', { n });
  }
  const n = Math.floor(ago / DAY);
  return n === 1 ? t('menu.timeYesterday') : t('menu.timeDays', { n });
}

export const percent = (v01: number): string => t('settings.percent', { value: Math.round(v01 * 100) });

export const multiplier = (v: number): string => t('settings.multiplier', { value: v.toFixed(2) });

/** Depth readout: always "-N m", the way the HUD and the e2e test expect it. */
export const depthText = (depth: number): string => t('hud.depthValue', { depth: `-${Math.max(0, Math.round(depth))}` });
