import { ITEMS, type ItemId } from '../config/items';
import { discoveryDef } from '../gameplay/discoveries';
import { t } from '../i18n';
import type { DiscoveryNotice, PickupNotice } from './types';
import { h, icon } from './dom';
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

export class Toasts {
  readonly el = h('div', { class: 'dd-toasts', 'aria-live': 'polite' });
  private readonly live = new Map<string, { el: HTMLElement; timer: number }>();

  show(text: string, tone: ToastTone = 'info'): void {
    // The same message again (e.g. "Backpack full") refreshes instead of stacking.
    const existing = this.live.get(text);
    if (existing) {
      window.clearTimeout(existing.timer);
      existing.timer = window.setTimeout(() => this.dismiss(text), TOAST_MS);
      return;
    }
    const el = h('div', { class: `dd-toast ${tone}`, role: tone === 'warn' ? 'alert' : 'status' }, h('span', { class: 'dd-toast-dot', 'aria-hidden': 'true' }), text);
    this.el.appendChild(el);
    this.live.set(text, { el, timer: window.setTimeout(() => this.dismiss(text), TOAST_MS) });
    while (this.live.size > TOAST_MAX) this.dismiss(this.live.keys().next().value!);
  }

  private dismiss(text: string): void {
    const entry = this.live.get(text);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    this.live.delete(text);
    leave(entry.el);
  }

  dispose(): void {
    for (const e of this.live.values()) window.clearTimeout(e.timer);
    this.live.clear();
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
  private showing = false;
  private timer = 0;

  constructor() {
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

  private next(): void {
    const n = this.queue.shift();
    if (!n) {
      this.showing = false;
      return;
    }
    this.showing = true;
    this.title.textContent = n.title;
    this.body.textContent = n.body;
    const log = discoveryDef(n.id)?.log === true;
    this.label.textContent = t(log ? 'ui.banner.haldenLog' : 'discovery.label');
    this.el.classList.toggle('log', log);
    const counted = Number.isFinite(n.index) && Number.isFinite(n.total) && n.total > 0;
    this.count.textContent = counted ? t('brand.discoveryCount', { index: n.index, total: n.total }) : '';
    this.count.hidden = !counted;
    this.el.classList.toggle('major', n.major === true);
    this.el.classList.remove('out');
    this.el.classList.add('on');
    const hold = this.queue.length > 0 ? DISCOVERY_QUEUED_MS : DISCOVERY_MS;
    this.timer = window.setTimeout(() => {
      this.el.classList.add('out');
      this.timer = window.setTimeout(() => {
        this.el.classList.remove('on', 'out');
        this.next();
      }, 700);
    }, hold);
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.queue.length = 0;
  }
}
