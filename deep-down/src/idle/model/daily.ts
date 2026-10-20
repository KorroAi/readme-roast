// The Daily Lantern Chest and the 7-day Lantern Calendar (SPEC §7.4). A Crystal-floor chest on the first launch of
// each local day; the first is free at 75 m in session 1 so the player learns the loop. The calendar advances one day
// per day claimed: Copper chest · 30 gems · Crystal chest · 2 facet rerolls · Lantern Oil · 60 gems · Reliquary chest.
// A missed day pauses it; it never resets. Clock safety: a clock that moved back holds daily items until it catches up;
// nothing is ever taken away. No network, no server time.

import type { IdleBus } from '../bus';
import { CALENDAR, DAILY } from '../config/contracts';
import { openChest } from './chests';
import { addStoredRerolls } from './facets';
import { creditGems } from './gain';
import type { IdleState } from './state';

/** Lantern Oil: everything ×2 for 30 min (stacking duration to 4 h). */
export const OIL = { minutes: 30, maxHours: 4, gems: 25 } as const;

/** The local day number of an epoch ms (offset in minutes as Date#getTimezoneOffset gives it). */
export function localDay(nowMs: number, tzOffsetMin = new Date(nowMs).getTimezoneOffset()): number {
  return Math.floor((nowMs - tzOffsetMin * 60000) / 86400000);
}

/** Check for a new day (called with the wall clock). The clock guard holds while the clock is behind the guard. */
export function tickDaily(s: IdleState, nowMs: number, bus?: IdleBus, tzOffsetMin?: number): void {
  if (!Number.isFinite(nowMs) || nowMs < s.monotonicMs - 1000) return; // the clock moved back: hold
  const d = s.meta.daily;
  const day = localDay(nowMs, tzOffsetMin);
  if (s.meta.dailyReady) return;
  if (d.lastDay === 0) {
    // The first daily chest: free at 75 m in session 1.
    if (s.meta.record >= DAILY.firstAt) {
      s.meta.dailyReady = true;
      bus?.emit('daily:ready', { day });
      bus?.emit('firsttime', { id: 'daily' });
    }
    return;
  }
  if (day > d.lastDay) {
    s.meta.dailyReady = true;
    d.claimedToday = false;
    bus?.emit('daily:ready', { day });
  }
}

/** Claim the daily chest and the calendar's day. @returns the calendar reward code ('' when nothing waited). */
export function claimDaily(s: IdleState, nowMs: number, bus?: IdleBus, tzOffsetMin?: number): string {
  if (!s.meta.dailyReady) return '';
  const d = s.meta.daily;
  const day = localDay(nowMs, tzOffsetMin);
  s.meta.dailyReady = false;
  d.lastDay = Math.max(d.lastDay, day);
  d.claimedToday = true;
  openChest(s, `daily:${day}`, DAILY.floor, 'daily', bus);
  const code = CALENDAR[d.calendarDay % CALENDAR.length];
  d.calendarDay++;
  applyCalendar(s, code, bus);
  bus?.emit('daily:claim', { day, calendarDay: d.calendarDay, reward: code });
  return code;
}

function applyCalendar(s: IdleState, code: string, bus?: IdleBus): void {
  const [k, v] = code.split(':');
  if (k === 'chest') openChest(s, `calendar:${s.meta.daily.calendarDay}`, Number(v), 'calendar', bus);
  else if (k === 'gems') creditGems(s, Number(v), 'daily', bus);
  else if (k === 'rerolls') addStoredRerolls(s, Number(v));
  else if (k === 'oil') addOil(s, bus);
}

/** Lantern Oil (the calendar's, or 25 gems): everything ×2 for 30 min, the duration stacking to 4 h. */
export function addOil(s: IdleState, bus?: IdleBus): void {
  const now = s.now;
  const start = Math.max(now, s.meta.boostEnd);
  s.meta.boostEnd = Math.min(now + OIL.maxHours * 3600_000, start + OIL.minutes * 60_000);
  bus?.emit('boost:start', { id: 'oil', until: s.meta.boostEnd, mult: 2 });
}

/** The calendar as the Board shows it: 7 days, the next to claim, and today's state. */
export function calendarView(s: IdleState): { days: readonly string[]; next: number; ready: boolean } {
  return { days: CALENDAR, next: s.meta.daily.calendarDay % CALENDAR.length, ready: s.meta.dailyReady };
}
