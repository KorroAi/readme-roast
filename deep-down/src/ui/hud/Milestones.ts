/**
 * Round 3 (UI, BRIEF §6 "toasts for feats"): the milestone banner. A feat earned, a Heart Shard won
 * or a bestiary page completed rises under the top HUD as one calm card (a medal, a kicker, the
 * name, its line and what it paid), one at a time from a short queue, for a few seconds; a tap opens
 * the page it belongs to (Quests for feats and shards, the Bestiary for a page). It never covers
 * the centre of the view, and stays quiet behind menus (the card waits for play).
 */
import { t } from '../../i18n';
import { h } from '../dom';
import { iconSvg } from './glyphs';
import type { MenuScreen } from './actions';

export type MilestoneKind = 'feat' | 'shard' | 'bestiary' | 'companion';

export interface Milestone {
  kind: MilestoneKind;
  /** The feat's (or creature's, or biome's) name. */
  name: string;
  /** One line under it (the feat's text, the shard count, the page's bonus). */
  line: string;
  /** What it paid, already written out ("+3 Copper Bar"), or ''. */
  reward: string;
  /** The same milestone written again in the language now set (a language switch, QA 00:32). */
  remake?: () => Milestone;
}

/** A queue written again in the language now set (each by its own remake; one without keeps its words). */
export function remakeAll(queue: readonly Milestone[]): Milestone[] {
  return queue.map((m) => m.remake?.() ?? m);
}

/** How long a card stays up (ms) and how many may wait. */
export const MILESTONE_MS = 3800;
const QUEUE_MAX = 4;

const GLYPH: Record<MilestoneKind, string> = { feat: 'medal', shard: 'heart', bestiary: 'bestiary', companion: 'lampling' };
const OPENS: Record<MilestoneKind, MenuScreen> = { feat: 'quests', shard: 'quests', bestiary: 'bestiary', companion: 'bestiary' };

/** The queue's rule (pure, unit-tested): no duplicates of the waiting ones, at most QUEUE_MAX. */
export function enqueue(queue: Milestone[], m: Milestone): Milestone[] {
  if (queue.some((q) => q.kind === m.kind && q.name === m.name)) return queue;
  const next = [...queue, m];
  return next.length > QUEUE_MAX ? next.slice(next.length - QUEUE_MAX) : next;
}

export class MilestoneBanner {
  readonly el: HTMLElement;
  private readonly glyph: HTMLElement;
  private readonly kicker: HTMLElement;
  private readonly name: HTMLElement;
  private readonly line: HTMLElement;
  private readonly reward: HTMLElement;
  private queue: Milestone[] = [];
  private current: Milestone | null = null;
  private timer = 0;
  private live = false;

  constructor(private readonly open: (screen: MenuScreen) => void) {
    this.glyph = h('span', { class: 'dd-ms-glyph', 'aria-hidden': 'true' });
    this.kicker = h('span', { class: 'dd-ms-kicker' });
    this.name = h('span', { class: 'dd-ms-name' });
    this.line = h('span', { class: 'dd-ms-line' });
    this.reward = h('span', { class: 'dd-ms-reward' });
    this.el = h(
      'button',
      { class: 'dd-milestone', type: 'button', 'aria-live': 'polite' },
      this.glyph,
      h('span', { class: 'dd-ms-text' }, this.kicker, this.name, this.line, this.reward),
    );
    this.el.addEventListener('click', () => {
      const c = this.current;
      this.hide();
      if (c) this.open(OPENS[c.kind]);
    });
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
  }

  /** Queue a milestone (it shows when play is on screen and the one before has gone). */
  push(m: Milestone): void {
    this.queue = enqueue(this.queue, m);
    this.next();
  }

  /** A card is on screen. */
  get up(): boolean {
    return this.current !== null;
  }

  /** Play is on screen (no menu) and no other notice has the turn: cards may show. */
  setLive(b: boolean): void {
    if (b === this.live) return;
    this.live = b;
    if (!b && this.current) {
      // A menu opened over a card: it comes back after.
      this.queue.unshift(this.current);
      this.hide(false);
    }
    this.next();
  }

  private next(): void {
    if (!this.live || this.current || !this.queue.length) return;
    const m = this.queue.shift()!;
    this.current = m;
    this.render(m);
    this.el.classList.remove('on');
    void this.el.offsetWidth;
    this.el.classList.add('on');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), MILESTONE_MS);
  }

  /** The language changed: the card up and the waiting ones are written again (kept where they stand). */
  relanguage(): void {
    this.queue = remakeAll(this.queue);
    if (!this.current) return;
    this.current = this.current.remake?.() ?? this.current;
    this.render(this.current);
  }

  private render(m: Milestone): void {
    this.el.dataset.kind = m.kind;
    this.glyph.innerHTML = iconSvg(GLYPH[m.kind]);
    this.kicker.textContent = t(`ms3.${m.kind}` as 'ms3.feat');
    this.name.textContent = m.name;
    this.line.textContent = m.line;
    this.line.hidden = !m.line;
    this.reward.textContent = m.reward ? t('ms3.reward', { reward: m.reward }) : '';
    this.reward.hidden = !m.reward;
    this.el.setAttribute('aria-label', `${this.kicker.textContent}: ${m.name}`);
  }

  private hide(advance = true): void {
    window.clearTimeout(this.timer);
    this.current = null;
    this.el.classList.remove('on');
    if (advance) this.timer = window.setTimeout(() => this.next(), 380);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
  }
}
