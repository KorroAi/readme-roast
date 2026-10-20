// The skill row (SPEC §9.1; W1: the combo counter and Dynamite): the combo counter on the left (its colour climbs
// bone → amber → cyan at 10, 25 and 50) inside the Surge ring (the meter, from 1:25), and the skill buttons with
// their cooldown sweeps. The row sits over the world, semi-transparent; only its buttons take taps.

import { t } from '../../i18n';
import { h } from '../dom';
import { spring } from '../fx/waapi';
import { iconEl, type IconId } from './icons';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 24;
const RING_C = 2 * Math.PI * RING_R;

export interface SkillView {
  id: string;
  /** 0..1 of the cooldown left (0: ready). */
  cooldown: number;
  ready: boolean;
  /** Free charges (the tutorial's first Dynamite). */
  charges: number;
  label: string;
}

export class SkillRow {
  readonly el: HTMLElement;
  readonly comboEl: HTMLElement;
  private readonly comboV: HTMLElement;
  private readonly comboX: HTMLElement;
  private readonly surgeArc: SVGCircleElement;
  private readonly skills = new Map<string, { el: HTMLButtonElement; sweep: SVGCircleElement; ready: boolean; label: string }>();
  private readonly holder: HTMLElement;
  /** The Guide chip (CRITIQUE MUST 7): 48 px "?", the way to read first-time cards again. */
  readonly guideEl: HTMLButtonElement;
  private shownGuide = false;
  onGuide: (() => void) | null = null;
  /** The armed Surge (CRITIQUE critic 1 SHOULD 1): the ring waits up to 8 s for a tap. */
  onSurge: (() => void) | null = null;
  private armed = false;
  /** The facet chip ("Facet ×2"): waiting hands (SPEC §5.10). */
  readonly facetEl: HTMLButtonElement;
  private readonly facetN: HTMLElement;
  private facetS = -1;
  onFacet: (() => void) | null = null;
  private comboS = '';
  private comboTier = -1;
  private surgeS = -1;
  private surgeOn = false;
  private shownCombo = false;
  private shownSurge = false;
  onSkill: ((id: string) => void) | null = null;

  constructor() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 56 56');
    svg.setAttribute('class', 'dd-surge-ring');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('class', 'dd-surge-track');
    this.surgeArc = document.createElementNS(SVG_NS, 'circle');
    this.surgeArc.setAttribute('class', 'dd-surge-arc');
    for (const c of [track, this.surgeArc]) {
      c.setAttribute('cx', '28');
      c.setAttribute('cy', '28');
      c.setAttribute('r', String(RING_R));
      svg.appendChild(c);
    }
    this.surgeArc.style.strokeDasharray = `${RING_C}`;
    this.surgeArc.style.strokeDashoffset = `${RING_C}`;
    this.comboV = h('span', { class: 'dd-combo-v' });
    this.comboX = h('span', { class: 'dd-combo-x' });
    this.comboEl = h('div', { class: 'dd-combo hide', 'aria-hidden': 'true', 'data-hud': 'combo' }, svg, h('span', { class: 'dd-combo-text' }, this.comboV, this.comboX));
    // The armed Surge takes a tap on its ring (pointerdown: the timing is the player's).
    this.comboEl.addEventListener('pointerdown', (e) => {
      if (!this.armed) return;
      e.preventDefault();
      this.onSurge?.();
    });
    this.facetN = h('span', { class: 'dd-facet-n' });
    this.facetEl = h('button', { class: 'dd-facet-chip hide', type: 'button', 'data-hud': 'facetChip', onclick: () => this.onFacet?.() }, iconEl('facet', 'dd-facet-ico'), this.facetN);
    this.holder = h('div', { class: 'dd-skills' });
    this.guideEl = h('button', { class: 'dd-guide-chip hide', type: 'button', 'data-hud': 'guide', 'aria-label': t('ui.guide.open'), onclick: () => this.onGuide?.() }, h('span', { class: 'dd-guide-q', 'aria-hidden': 'true', text: '?' }));
    this.el = h('div', { class: 'dd-skillrow', 'data-hud': 'skillrow' }, this.comboEl, this.holder, this.facetEl, this.guideEl);
  }

  /** Reveal the combo counter (the first 15-combo) or the Surge ring (1:25). */
  reveal(which: 'combo' | 'surge'): void {
    if (which === 'combo' && !this.shownCombo) {
      this.shownCombo = true;
      this.comboEl.classList.remove('hide');
      spring(this.comboEl, 'snap', 0, 1, (v) => `scale(${v})`);
    }
    if (which === 'surge' && !this.shownSurge) {
      this.shownSurge = true;
      this.comboEl.classList.add('surge');
    }
  }

  /** Show the Guide chip (the first first-time card). */
  revealGuide(instant = false): void {
    if (this.shownGuide) return;
    this.shownGuide = true;
    this.guideEl.classList.remove('hide');
    if (!instant) spring(this.guideEl, 'bounce', 0, 1, (v) => `scale(${v})`);
  }

  /** The Guide has something new: a dot on the chip until it is opened. */
  guideDot(on: boolean): void {
    this.guideEl.classList.toggle('dot', on);
  }

  /** Every skill's button, built once at load (hidden): an unlock only reveals it (F10: no element per event). */
  private readonly built = new Map<string, { el: HTMLButtonElement; sweep: SVGCircleElement; ready: boolean; label: string }>();

  /** Build a skill's button (hidden), in the row's order. */
  prebuild(id: string, label: string, icon: IconId): void {
    if (this.built.has(id)) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 52 52');
    svg.setAttribute('class', 'dd-skill-sweep');
    svg.setAttribute('aria-hidden', 'true');
    const sweep = document.createElementNS(SVG_NS, 'circle');
    sweep.setAttribute('cx', '26');
    sweep.setAttribute('cy', '26');
    sweep.setAttribute('r', '22');
    svg.appendChild(sweep);
    const el = h('button', { class: 'dd-skill hide', type: 'button', 'data-skill': id, 'aria-label': label, onclick: () => this.onSkill?.(id) }, iconEl(icon, 'dd-skill-ico'), svg);
    this.holder.appendChild(el);
    this.built.set(id, { el, sweep, ready: false, label });
  }

  /** Show a skill's button (once, when it unlocks). */
  addSkill(id: string, label: string, icon: IconId): void {
    if (this.skills.has(id)) return;
    this.prebuild(id, label, icon);
    const sk = this.built.get(id)!;
    sk.el.classList.remove('hide');
    this.skills.set(id, sk);
    spring(sk.el, 'bounce', 0, 1, (v) => `scale(${v})`);
  }

  /** The Surge meter is full and waits for a tap on the ring ("TAP THE LANTERN"); false when it fired. */
  setArmed(on: boolean): void {
    if (on === this.armed) return;
    this.armed = on;
    this.comboEl.classList.toggle('armed', on);
    this.comboEl.style.pointerEvents = on ? 'auto' : '';
    if (on) spring(this.comboEl, 'jelly', 1.25, 1, (v) => `scale(${v})`);
  }

  /** Waiting facet hands (0 hides the chip). */
  setFacets(n: number, label: string): void {
    if (n === this.facetS) return;
    this.facetS = n;
    this.facetEl.classList.toggle('hide', n <= 0);
    this.facetN.textContent = n > 1 ? `×${n}` : '';
    this.facetEl.setAttribute('aria-label', label);
    if (n > 0) spring(this.facetEl, 'bounce', 0.4, 1, (v) => `scale(${v})`);
  }

  /** A new run: every skill button goes (they come back as the depth unlocks them). */
  clearSkills(): void {
    for (const sk of this.skills.values()) sk.el.classList.add('hide');
    this.skills.clear();
  }

  skillEl(id: string): HTMLElement | null {
    return this.skills.get(id)?.el ?? null;
  }

  update(combo: number, comboMult: number, surgeFill: number, surgeOn: boolean, skills: readonly SkillView[]): void {
    if (this.shownCombo) {
      const c = String(Math.floor(combo));
      if (c !== this.comboS) {
        this.comboS = c;
        this.comboV.textContent = combo >= 1 ? c : '';
        this.comboX.textContent = combo >= 1 ? `×${comboMult.toFixed(2)}` : '';
      }
      const tier = combo >= 50 ? 3 : combo >= 25 ? 2 : combo >= 10 ? 1 : 0;
      if (tier !== this.comboTier) {
        this.comboTier = tier;
        this.comboEl.dataset.tier = String(tier);
      }
    }
    if (this.shownSurge) {
      const f = Math.round(Math.max(0, Math.min(1, surgeFill)) * 200) / 200;
      if (f !== this.surgeS) {
        this.surgeS = f;
        this.surgeArc.style.strokeDashoffset = `${RING_C * (1 - f)}`;
      }
      if (surgeOn !== this.surgeOn) {
        this.surgeOn = surgeOn;
        this.comboEl.classList.toggle('blaze', surgeOn);
      }
    }
    for (const v of skills) {
      const s = this.skills.get(v.id);
      if (!s) continue;
      const ready = v.ready || v.charges > 0;
      if (ready !== s.ready) {
        s.ready = ready;
        s.el.classList.toggle('ready', ready);
        if (ready) spring(s.el, 'snap', 1.15, 1, (x) => `scale(${x})`);
      }
      const off = ready ? 0 : v.cooldown;
      const dash = `${(2 * Math.PI * 22 * off).toFixed(1)} 200`;
      if (s.sweep.style.strokeDasharray !== dash) s.sweep.style.strokeDasharray = dash;
      if (v.label !== s.label) {
        s.label = v.label;
        s.el.setAttribute('aria-label', v.label);
      }
    }
  }

  /** The combo counter's centre (the combo-tier ring). */
  comboPoint(): { x: number; y: number } | null {
    if (!this.shownCombo) return null;
    const r = this.comboEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  static label(id: string): string {
    return id === 'dynamite' ? t('ui.skill.dynamite') : id;
  }
}
