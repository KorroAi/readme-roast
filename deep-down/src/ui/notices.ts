import { ITEMS, type ItemId } from '../config/items';
import { discoveryDef } from '../gameplay/discoveries';
import { hasText, t, type TextKey } from '../i18n';
import type { DiscoveryNotice, PickupNotice } from './types';
import { h, icon } from './dom';
import { rarityLegend } from './rarityLegend';
import { iconPx, itemIconDataUrl } from './icons';

// Transient notifications. Each lives in its own layer, never takes pointer input, and
// cleans up its own timers.

const TOAST_MS = 3200;
const TOAST_MAX = 3;
const PICKUP_MS = 2800;
const PICKUP_MAX = 4;
const DISCOVERY_MS = 5200;
const DISCOVERY_QUEUED_MS = 4200;
const LEAVE_MS = 400;

export type ToastTone = 'info' | 'warn' | 'good';

/** Remove after the CSS leave transition (shorter when motion is reduced). */
function leave(el: HTMLElement): void {
  el.classList.add('leaving');
  window.setTimeout(() => el.remove(), LEAVE_MS);
}

interface LiveToast {
  el: HTMLElement;
  timer: number;
  /** performance.now() when its time started. */
  at: number;
  /** ms it still has while it stands aside for a notice card (0: not held). */
  held: number;
}

export class Toasts {
  readonly el = h('div', { class: 'dd-toasts', 'aria-live': 'polite' });
  private readonly live = new Map<string, LiveToast>();
  /** Toasts waiting for a notice card to go (one notice at a time: ui/hud/noticeGate). */
  private waiting: Array<{ text: string; tone: ToastTone }> = [];
  private holding = false;

  /**
   * A notice card is up: new toasts wait, and the ones shown a moment ago step aside (hidden in
   * place, their time paused) to come back after; an older one simply goes. Off again: the held
   * ones come back with the time they had left, then the waiting ones show, in order.
   */
  hold(on: boolean): void {
    if (on === this.holding) return;
    this.holding = on;
    const now = performance.now();
    if (on) {
      for (const [text, e] of [...this.live]) {
        const left = TOAST_MS - (now - e.at);
        if (left > TOAST_MS / 2) {
          window.clearTimeout(e.timer);
          e.held = left;
          e.el.classList.add('held');
        } else this.dismiss(text);
      }
      return;
    }
    for (const [text, e] of this.live) {
      if (!e.held) continue;
      e.el.classList.remove('held');
      e.at = now - (TOAST_MS - e.held);
      e.timer = window.setTimeout(() => this.dismiss(text), e.held);
      e.held = 0;
    }
    const waiting = this.waiting;
    this.waiting = [];
    for (const w of waiting) this.show(w.text, w.tone);
  }

  private wait(text: string, tone: ToastTone): void {
    if (this.waiting.some((w) => w.text === text)) return;
    this.waiting.push({ text, tone });
    if (this.waiting.length > TOAST_MAX) this.waiting.shift();
  }

  show(text: string, tone: ToastTone = 'info'): void {
    // The same message again (e.g. "Backpack full") refreshes instead of stacking.
    const existing = this.live.get(text);
    if (existing) {
      if (existing.held) {
        existing.held = TOAST_MS;
        return;
      }
      window.clearTimeout(existing.timer);
      existing.at = performance.now();
      existing.timer = window.setTimeout(() => this.dismiss(text), TOAST_MS);
      return;
    }
    if (this.holding) {
      this.wait(text, tone);
      return;
    }
    const el = h('div', { class: `dd-toast ${tone}`, role: tone === 'warn' ? 'alert' : 'status' }, h('span', { class: 'dd-toast-dot', 'aria-hidden': 'true' }), text);
    this.el.appendChild(el);
    this.live.set(text, { el, timer: window.setTimeout(() => this.dismiss(text), TOAST_MS), at: performance.now(), held: 0 });
    while (this.live.size > TOAST_MAX) this.dismiss(this.live.keys().next().value!);
  }

  private dismiss(text: string): void {
    const entry = this.live.get(text);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    this.live.delete(text);
    leave(entry.el);
  }

  /** The language changed: toasts are a few seconds' words already said in the old one; they go. */
  relanguage(): void {
    for (const text of [...this.live.keys()]) this.dismiss(text);
    this.waiting = [];
  }

  dispose(): void {
    for (const e of this.live.values()) window.clearTimeout(e.timer);
    this.live.clear();
    this.waiting = [];
  }
}

interface PickupEntry {
  el: HTMLElement;
  label: HTMLElement;
  count: number;
  timer: number;
}

/** Left-side feed: "+2 Copper Ore" with the item icon; repeated pickups merge into one line. */
export class PickupFeed {
  readonly el = h('div', { class: 'dd-pickups', 'aria-live': 'polite' });
  private readonly live = new Map<ItemId, PickupEntry>();
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  show(n: PickupNotice): void {
    const entry = this.live.get(n.item);
    if (entry) {
      entry.count += n.count;
      entry.label.textContent = this.text(n.item, entry.count);
      window.clearTimeout(entry.timer);
      entry.timer = window.setTimeout(() => this.dismiss(n.item), PICKUP_MS);
      // A short bump says "more of the same"; WAAPI restarts it without class juggling or reflow.
      if (!this.reduceMotion) entry.el.animate([{ scale: 1 }, { scale: 1.07 }, { scale: 1 }], { duration: 250, easing: 'ease-out' });
      return;
    }
    const label = h('span', { text: this.text(n.item, n.count) });
    const el = h('div', { class: `dd-pickup ${ITEMS[n.item].rarity}` }, icon(itemIconDataUrl(n.item, iconPx(28)), 28), label);
    this.el.appendChild(el);
    this.live.set(n.item, { el, label, count: n.count, timer: window.setTimeout(() => this.dismiss(n.item), PICKUP_MS) });
    while (this.live.size > PICKUP_MAX) this.dismiss(this.live.keys().next().value!);
  }

  private text(item: ItemId, count: number): string {
    return t('toast.picked', { count, item: t(ITEMS[item].name) });
  }

  /** The language changed: each line up is written again ("+2 Minerai de cuivre"). */
  relanguage(): void {
    for (const [item, e] of this.live) e.label.textContent = this.text(item, e.count);
  }

  private dismiss(item: ItemId): void {
    const entry = this.live.get(item);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    this.live.delete(item);
    leave(entry.el);
  }

  dispose(): void {
    for (const e of this.live.values()) window.clearTimeout(e.timer);
    this.live.clear();
  }
}

/**
 * A discovery's title and body in the language now set (QA 00:32): from the keys it carries, else
 * from the keys its id names (the rarity legend, a journal page, a rune, a discovery), else the words
 * it came with.
 */
export function discoveryText(n: DiscoveryNotice): { title: string; body: string } {
  const keys = (title: string, body: string) => (hasText(title) ? { title: t(title as TextKey), body: hasText(body) ? t(body as TextKey) : n.body } : null);
  const page = /^note\.page_(\d+)$/.exec(n.id);
  const rune = /^rune\.(.+)$/.exec(n.id);
  return (
    (n.titleKey ? keys(n.titleKey, n.bodyKey ?? '') : null) ??
    (n.id === 'rarityLegend' ? keys('rarity.legend.title', 'rarity.legend.body') : null) ??
    (page ? keys(`page.${page[1]}.title`, `page.${page[1]}.body`) : null) ??
    (rune ? keys(`item.${rune[1]}`, `item.${rune[1]}.line`) : null) ??
    keys(`discovery.${n.id}.title`, `discovery.${n.id}.body`) ?? { title: n.title, body: n.body }
  );
}

/**
 * Cinematic discovery banner in the builders' register: "DISCOVERY · 3/9", the title carved in
 * the Lintel face under a lintel, the body. Major discoveries get the larger band. Several
 * discoveries play in turn.
 */
export class DiscoveryBanner {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly count: HTMLElement;
  /** "DISCOVERY", or "HALDEN LOG" for a found text (a table entry with `log`). */
  private readonly label: HTMLElement;
  private readonly queue: DiscoveryNotice[] = [];
  private legendEl: HTMLElement | null = null;
  private showing = false;
  private timer = 0;

  /** The notice on screen (written again on a language switch). */
  private shown: DiscoveryNotice | null = null;

  /**
   * `waits`: another notice card has the turn (ui/hud/noticeGate); the next discovery waits for it.
   * `text`: its title and body in the language now set (discoveryText).
   */
  constructor(
    private readonly waits: () => boolean = () => false,
    private readonly text: (n: DiscoveryNotice) => { title: string; body: string } = (n) => n,
  ) {
    this.title = h('h2', { class: 'dd-discovery-title' });
    this.body = h('p', { class: 'dd-discovery-body' });
    this.count = h('span', { class: 'dd-discovery-count' });
    this.label = h('span', { class: 'dd-discovery-kind', text: t('discovery.label') });
    this.el = h(
      'div',
      { class: 'dd-discovery', role: 'status', 'aria-live': 'assertive' },
      h(
        'div',
        { class: 'dd-discovery-label' },
        h('span', { class: 'dd-rule' }),
        h('span', { class: 'dd-discovery-mark', 'aria-hidden': 'true' }),
        this.label,
        this.count,
        h('span', { class: 'dd-discovery-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'dd-rule' }),
      ),
      this.title,
      this.body,
    );
  }

  show(n: DiscoveryNotice): void {
    this.queue.push(n);
    if (!this.showing) this.next();
  }

  /** A discovery is on screen. */
  get up(): boolean {
    return this.showing;
  }

  /** One waits for its turn. */
  get waiting(): boolean {
    return !this.showing && this.queue.length > 0;
  }

  /** Start a waiting discovery once its turn has come (UI calls this as the scene changes). */
  pump(): void {
    if (!this.showing && this.queue.length) this.next();
  }

  private next(): void {
    if (!this.queue.length || this.waits()) {
      this.showing = false;
      return;
    }
    const n = this.queue.shift()!;
    this.showing = true;
    this.shown = n;
    this.render(n);
    this.el.classList.remove('out');
    this.el.classList.add('on');
    const hold = this.queue.length > 0 ? DISCOVERY_QUEUED_MS : DISCOVERY_MS;
    this.timer = window.setTimeout(() => {
      this.el.classList.add('out');
      this.timer = window.setTimeout(() => {
        this.el.classList.remove('on', 'out');
        this.shown = null;
        this.next();
      }, 700);
    }, hold);
  }

  /** The language changed: the band up is written again where it stands (the waiting ones are at show). */
  relanguage(): void {
    if (this.showing && this.shown) this.render(this.shown);
  }

  private render(n: DiscoveryNotice): void {
    const words = this.text(n);
    this.title.textContent = words.title;
    this.body.textContent = words.body;
    // The rarity legend's first-time card carries the five colours under its line.
    this.legendEl?.remove();
    this.legendEl = n.legend ? rarityLegend(true) : null;
    if (this.legendEl) this.el.appendChild(this.legendEl);
    const log = discoveryDef(n.id)?.log === true;
    this.label.textContent = t(log ? 'ui.banner.haldenLog' : 'discovery.label');
    this.el.classList.toggle('legend', n.legend === true);
    this.el.classList.toggle('log', log);
    const counted = Number.isFinite(n.index) && Number.isFinite(n.total) && n.total > 0;
    this.count.textContent = counted ? t('brand.discoveryCount', { index: n.index, total: n.total }) : '';
    this.count.hidden = !counted;
    this.el.classList.toggle('major', n.major === true);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.queue.length = 0;
  }
}
