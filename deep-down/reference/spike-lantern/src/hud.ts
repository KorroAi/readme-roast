// A calm HUD mock: gold counter and objective at the top, one upgrade button at the bottom, loot that flies to the
// counter. Animated from the app clock (not CSS timers) so captures are deterministic.

const PICK_SVG = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
<path d="M5 9.5 C9 4.5 17 4 22 7.5 C18 6.8 14.5 7.6 12.3 9.2 Z" fill="#e9d4b0" stroke="#3a2410" stroke-width="1.1" stroke-linejoin="round"/>
<path d="M11.4 9.6 L19.6 21.6" stroke="#3a2410" stroke-width="4.2" stroke-linecap="round"/>
<path d="M11.4 9.6 L19.6 21.6" stroke="#c48a4e" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

interface Flight {
  el: HTMLElement;
  x0: number;
  y0: number;
  t: number;
  delay: number;
  value: number;
  bend: number;
}

export class Hud {
  private goldEl: HTMLElement;
  private goldBox: HTMLElement;
  private objEl: HTMLElement;
  private flights: Flight[] = [];
  private shown = 0;
  private goal = 0;
  private bumpT = 0;
  constructor(
    private root: HTMLElement,
    gold: number,
  ) {
    this.shown = this.goal = gold;
    root.innerHTML = `
      <div class="hud-top">
        <div class="gold"><span class="coin"></span><span class="gold-n"></span></div>
        <div class="objective"><span class="dot"></span><span class="obj-t"></span></div>
      </div>
      <div class="hud-bottom">
        <button class="upgrade" type="button">
          <span class="ico">${PICK_SVG}</span>
          <span class="txt"><span class="name">Sharper Pick</span><span class="sub">Lv 3 &rarr; 4 &middot; +25% ore</span></span>
          <span class="cost"><span class="coin"></span>250</span>
        </button>
      </div>`;
    this.goldBox = root.querySelector('.gold') as HTMLElement;
    this.goldEl = root.querySelector('.gold-n') as HTMLElement;
    this.objEl = root.querySelector('.obj-t') as HTMLElement;
    this.render();
  }
  setObjective(text: string, done?: number, of?: number): void {
    this.objEl.innerHTML = done === undefined ? text : `${text} <b>${done}/${of}</b>`;
  }
  /** Rect of the counter in CSS px (the loot target). */
  counterPos(): { x: number; y: number } {
    const r = this.goldBox.getBoundingClientRect();
    return { x: r.left + 22, y: r.top + r.height / 2 };
  }
  /** Loot: `count` nuggets from a screen point to the counter, adding `value` gold in total. */
  loot(x: number, y: number, count: number, value: number, gem: boolean): void {
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = gem ? 'nugget gem' : 'nugget';
      el.style.transform = `translate(${x}px, ${y}px) scale(0)`;
      this.root.appendChild(el);
      this.flights.push({ el, x0: x + (i - (count - 1) / 2) * 10, y0: y + (i % 2) * 6, t: 0, delay: 0.06 + i * 0.055, value: value / count, bend: (i - 1) * 40 });
    }
  }
  get busy(): boolean {
    return this.flights.length > 0;
  }
  update(dt: number): void {
    const tgt = this.counterPos();
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt;
      const k = (f.t - f.delay) / 0.62;
      if (k < 0) {
        // Pop out of the block first.
        const p = Math.min(1, f.t / f.delay);
        f.el.style.transform = `translate(${f.x0}px, ${f.y0 - 14 * p}px) scale(${0.4 + 0.6 * p})`;
        continue;
      }
      if (k >= 1) {
        f.el.remove();
        this.flights.splice(i, 1);
        this.goal += f.value;
        this.bumpT = 0.16;
        continue;
      }
      // Ease-in along a gentle curve to the counter.
      const e = k * k * (1.6 - 0.6 * k);
      const sx = f.x0, sy = f.y0 - 14;
      const cx = (sx + tgt.x) / 2 + f.bend, cy = Math.min(sy, tgt.y) + (sy - tgt.y) * 0.25;
      const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * tgt.x;
      const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * tgt.y;
      f.el.style.transform = `translate(${x}px, ${y}px) scale(${1 - 0.35 * e})`;
    }
    if (this.shown < this.goal) this.shown = Math.min(this.goal, this.shown + Math.max(1, (this.goal - this.shown) * Math.min(1, dt * 14)));
    if (this.bumpT > 0) this.bumpT -= dt;
    this.goldBox.classList.toggle('bump', this.bumpT > 0);
    this.render();
  }
  private render(): void {
    this.goldEl.textContent = Math.round(this.shown).toLocaleString('en-US');
  }
}
