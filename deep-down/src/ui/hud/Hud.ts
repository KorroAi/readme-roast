import './fp.css';
import './r3.css';
import { t, type TextKey } from '../../i18n';
import type { ArrivalCard, GuardianBarView, HudState, HudSlot, MapSource, ObjectiveArrowView, ReticleKind, TrackerLine } from '../types';
import { h } from '../dom';
import { depthText } from '../format';
import { itemIconDataUrl, iconPx } from '../icons';
import type { ItemId } from '../../config/items';
import { HOTBAR_SLOTS, type MenuScreen } from './actions';
import { iconSvg } from './glyphs';
import { Minimap } from './Minimap';
import { TutorialOverlay } from './Tutorial';

const BAR_STEPS = 200;
const PROGRESS_STEPS = 60;
const PERF_INTERVAL_MS = 250;
/** Circumference of the reticle's ring (r = 11 in a 30 x 30 box). */
const RING_C = 2 * Math.PI * 11;
/** A hotbar slot held this long is a long-press (assign). */
export const HOTBAR_LONG_PRESS_MS = 450;
/** At most this many damage numbers at once (calm-but-nervous: few moving things). */
const DMG_MAX = 3;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const HAZARD_GLYPH: Record<'cold' | 'gas' | 'heat' | 'dark', string> = { cold: 'snow', gas: 'gas', heat: 'flame', dark: 'eye' };

/** What the HUD's own buttons do. */
export interface HudActions {
  bag(): void;
  menu(): void;
  open(screen: MenuScreen): void;
  hotbar(i: number): void;
  /** A long-press on a slot: choose what goes in it (opens the bag on that slot). */
  assign(i: number): void;
  skipTutorial(): void;
}

const NOOP: HudActions = { bag() {}, menu() {}, open() {}, hotbar() {}, assign() {}, skipTutorial() {} };

/**
 * The round 3 HUD (BRIEF §0.6), out of the centre of the view:
 * - top: health and the flame (oil) with the turn-back tick; the depth, biome and stratum; the
 *   menu (≡); the Bag, Craft, Map and Quests buttons; the quest tracker (the main step with the
 *   objective arrow, and one side task); the minimap on the right;
 * - centre: the reticle only (it changes with the target: mine, attack, use, place; its ring is the
 *   mining progress), and the vein combo beside it;
 * - the guardian's health bar under the top rows during a fight;
 * - bottom: the 6-slot hotbar (tap selects, long-press assigns) and the hint line above the pads.
 * Biome arrival cards, small damage numbers and the tutorial overlay live here too.
 * update() runs every frame but only writes to the DOM when a displayed value changes.
 */
export class Hud {
  readonly el: HTMLElement;
  readonly tutorial: TutorialOverlay;
  readonly minimap = new Minimap(92);
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly hpEl: HTMLElement;
  private readonly oilEl: HTMLElement;
  private readonly oilFill: HTMLElement;
  private readonly oilTick: HTMLElement;
  private readonly hazardEl: HTMLElement;
  private readonly hazardFill: HTMLElement;
  private readonly hazardText: HTMLElement;
  private hazardV = '';
  private hazardQ = -1;
  private readonly depthEl: HTMLElement;
  private readonly biomeEl: HTMLElement;
  private readonly stratumEl: HTMLElement;
  private readonly bagCount: HTMLElement;
  private readonly bagBtn: HTMLButtonElement;
  private readonly mainLine: HTMLElement;
  private readonly mainText: HTMLElement;
  private readonly mainCount: HTMLElement;
  private readonly sideLine: HTMLElement;
  private readonly sideText: HTMLElement;
  private readonly sideCount: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly arrowDial: HTMLElement;
  private readonly arrowText: HTMLElement;
  private readonly guardian: HTMLElement;
  private readonly guardianName: HTMLElement;
  private readonly guardianFill: HTMLElement;
  private readonly guardianPhase: HTMLElement;
  private readonly reticle: HTMLElement;
  private readonly ringArc: SVGCircleElement;
  private readonly comboEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly perf: HTMLElement;
  private readonly hotbarEl: HTMLElement;
  private readonly slots: Array<{ btn: HTMLButtonElement; icon: HTMLElement; count: HTMLElement; item: string | null; n: number }> = [];
  private readonly arrivalEl: HTMLElement;
  private readonly dmgLayer: HTMLElement;
  private hintTimer = 0;
  private arrivalTimer = 0;
  private comboTimer = 0;
  private readonly reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Last displayed values.
  private hpQ = -1;
  private hpN = -1;
  private oilQ = -1;
  private oilState = '';
  private tickQ = NaN;
  private depthV = NaN;
  private biomeV: string | null = null;
  private stratumV = -1;
  private bagV = '';
  private mainV = '';
  private sideV = '';
  private arrowOn: boolean | null = null;
  private arrowQ = NaN;
  private arrowDist = NaN;
  private arrowVert = 9;
  private guardianV = '';
  private guardianQ = -1;
  private reticleV: ReticleKind | null = null;
  private reticleQ = -1;
  private selV = -1;
  private perfOn: boolean | null = null;
  private perfAt = 0;
  private perfText = '';
  private lowV: boolean | null = null;

  constructor(private readonly actions: HudActions = NOOP) {
    // Vitals: health and the flame.
    this.hpFill = h('div', { class: 'dd-vbar-fill' });
    this.hpText = h('span', { class: 'dd-vnum' });
    this.hpEl = h('div', { class: 'dd-vital hp', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'data-ui-target': 'health' }, glyph('heart'), h('div', { class: 'dd-vbar' }, this.hpFill), this.hpText);
    this.oilFill = h('div', { class: 'dd-vbar-fill' });
    this.oilTick = h('span', { class: 'dd-vbar-tick', 'aria-hidden': 'true' });
    this.oilEl = h('div', { class: 'dd-vital oil', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'data-ui-target': 'flame' }, glyph('flame'), h('div', { class: 'dd-vbar' }, this.oilFill, this.oilTick));
    // The hazard building up here (cold, gas, heat, dark): its own thin bar under the flame.
    this.hazardFill = h('div', { class: 'dd-vbar-fill' });
    this.hazardText = h('span', { class: 'dd-vnum dd-hz-text' });
    this.hazardEl = h('div', { class: 'dd-vital hz', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100 }, glyph('heart'), h('div', { class: 'dd-vbar' }, this.hazardFill), this.hazardText);
    this.hazardEl.hidden = true;
    // Where: depth, biome, stratum.
    this.depthEl = h('span', { class: 'dd-where-depth' });
    this.stratumEl = h('span', { class: 'dd-where-stratum' });
    this.biomeEl = h('span', { class: 'dd-where-biome' });
    const where = h('div', { class: 'dd-where', 'data-ui-target': 'depth' }, h('div', { class: 'dd-where-top' }, this.depthEl, this.stratumEl), this.biomeEl);
    const menu = this.hudButton('menu', t('hud.pause'), () => this.actions.menu());
    // Menu buttons.
    this.bagCount = h('span', { class: 'dd-hbtn-badge' });
    this.bagBtn = this.hudButton('bag', t('hud3.bag'), () => this.actions.bag(), t('hud3.bag'));
    this.bagBtn.append(this.bagCount);
    const craft = this.hudButton('craft', t('hud3.craft'), () => this.actions.open('crafting'), t('hud3.craft'));
    const map = this.hudButton('map', t('hud3.map'), () => this.actions.open('map'), t('hud3.map'));
    const quests = this.hudButton('quests', t('hud3.quests'), () => this.actions.open('quests'), t('hud3.quests'));
    // The tracker.
    this.arrowDial = h('span', { class: 'dd-arrow-dial', 'aria-hidden': 'true' });
    this.arrowDial.innerHTML = iconSvg('arrow');
    this.arrowText = h('span', { class: 'dd-arrow-text' });
    this.arrow = h('span', { class: 'dd-arrow', 'data-ui-target': 'compass' }, this.arrowDial, this.arrowText);
    this.mainText = h('span', { class: 'dd-track-text' });
    this.mainCount = h('span', { class: 'dd-track-count' });
    this.mainLine = h('div', { class: 'dd-track main' }, h('span', { class: 'dd-track-mark', 'aria-hidden': 'true' }), this.mainText, this.mainCount);
    this.sideText = h('span', { class: 'dd-track-text' });
    this.sideCount = h('span', { class: 'dd-track-count' });
    this.sideLine = h('div', { class: 'dd-track side' }, h('span', { class: 'dd-track-mark', 'aria-hidden': 'true' }), this.sideText, this.sideCount);
    const tracker = h('button', { class: 'dd-tracker', type: 'button', 'data-ui-target': 'tracker', 'aria-label': t('hud3.quests') }, this.arrow, h('div', { class: 'dd-track-lines' }, this.mainLine, this.sideLine));
    tracker.addEventListener('click', () => this.actions.open('quests'));
    tracker.addEventListener('mousedown', (e) => e.preventDefault());
    this.minimap.el.addEventListener('click', () => this.actions.open('map'));
    // The guardian bar.
    this.guardianName = h('span', { class: 'dd-guardian-name' });
    this.guardianPhase = h('span', { class: 'dd-guardian-phase' });
    this.guardianFill = h('div', { class: 'dd-guardian-fill' });
    this.guardian = h('div', { class: 'dd-guardian', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { class: 'dd-guardian-head' }, this.guardianName, this.guardianPhase), h('div', { class: 'dd-guardian-bar' }, this.guardianFill));
    // The reticle.
    this.reticle = h('div', { class: 'dd-reticle k-none', 'aria-hidden': 'true', 'data-ui-target': 'reticle' });
    this.reticle.innerHTML = `<svg viewBox="0 0 30 30" width="30" height="30"><circle class="dd-rt-track" cx="15" cy="15" r="11"/><circle class="dd-rt-ring" cx="15" cy="15" r="11" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}" transform="rotate(-90 15 15)"/><path class="dd-rt-ticks" d="M15 2v5M15 23v5M2 15h5M23 15h5"/><path class="dd-rt-x" d="M9 9l4 4M21 9l-4 4M9 21l4-4M21 21l-4-4"/><path class="dd-rt-use" d="M15 9l6 6-6 6-6-6z"/><path class="dd-rt-place" d="M15 10v10M10 15h10"/></svg><span class="dd-rt-dot"></span>`;
    this.ringArc = this.reticle.querySelector('.dd-rt-ring') as SVGCircleElement;
    this.comboEl = h('div', { class: 'dd-combo', 'aria-hidden': 'true' });
    this.hintEl = h('div', { class: 'dd-hint3', role: 'status' });
    this.perf = h('div', { class: 'dd-perf' });
    // The hotbar.
    this.hotbarEl = h('div', { class: 'dd-hotbar', role: 'toolbar', 'aria-label': t('hud3.hotbar'), 'data-ui-target': 'hotbar' });
    for (let i = 0; i < HOTBAR_SLOTS; i++) this.hotbarEl.append(this.slotButton(i));
    this.arrivalEl = h('div', { class: 'dd-arrival', role: 'status', 'aria-live': 'polite' });
    this.arrivalEl.addEventListener('click', () => this.arrivalEl.classList.remove('on'));
    this.dmgLayer = h('div', { class: 'dd-dmg-layer', 'aria-hidden': 'true' });

    this.el = h(
      'div',
      { class: 'dd-hud dd-fp dd-r3' },
      h(
        'div',
        { class: 'dd-top' },
        h('div', { class: 'dd-row1' }, h('div', { class: 'dd-vitals' }, this.hpEl, this.oilEl, this.hazardEl), where, menu),
        h('div', { class: 'dd-row2' }, h('div', { class: 'dd-hbtns' }, this.bagBtn, craft, map, quests)),
        h('div', { class: 'dd-row3' }, tracker),
        this.guardian,
      ),
      this.minimap.el,
      this.perf,
      this.reticle,
      this.comboEl,
      this.hintEl,
      this.hotbarEl,
      this.arrivalEl,
      this.dmgLayer,
    );
    this.tutorial = new TutorialOverlay(document.body, () => this.actions.skipTutorial());
  }

  /** The tutorial layer is mounted by the UI over everything (it rings the touch pads too). */
  get tutorialEl(): HTMLElement {
    return this.tutorial.el;
  }

  setVisible(b: boolean): void {
    this.el.classList.toggle('on', b);
    this.tutorial.el.classList.toggle('hud-off', !b);
  }

  setMap(src: MapSource | null): void {
    this.minimap.setSource(src);
  }

  update(s: HudState, showPerf: boolean, now: number): void {
    this.updateVitals(s);
    this.updateWhere(s);
    const bag = `${s.backpackUsed}/${s.backpackMax}`;
    if (bag !== this.bagV) {
      this.bagV = bag;
      this.bagCount.textContent = bag;
      this.bagBtn.classList.toggle('full', s.packFull || s.backpackUsed >= s.backpackMax);
      this.bagBtn.setAttribute('aria-label', t('hud.backpackLabel', { used: s.backpackUsed, max: s.backpackMax }));
    }
    this.updateHazard(s.hazard);
    this.updateTracker(s);
    this.updateGuardian(s.guardian);
    this.updateReticle(s.reticle, s.reticleProgress);
    this.updateHotbar(s.hotbar, s.hotbarSelected);
    this.minimap.update(now, t('hud3.minimap'));
    this.tutorial.show(s.tutorial);

    if (showPerf !== this.perfOn) {
      this.perfOn = showPerf;
      this.perf.classList.toggle('on', showPerf);
      this.perfAt = 0;
    }
    if (showPerf && now - this.perfAt >= PERF_INTERVAL_MS) {
      this.perfAt = now;
      const text = t('hud.fps', { fps: Math.round(s.fps), ms: s.frameMs.toFixed(1), calls: s.drawCalls, tris: s.triangles });
      if (text !== this.perfText) {
        this.perfText = text;
        this.perf.textContent = text;
      }
    }
  }

  /** One contextual hint line; a newer hint replaces the old one. */
  hint(text: string, ms: number): void {
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('on'), ms);
  }

  /** A biome arrival card (name, line, hazard and its gear, the guardian's rumour), for ~7 s. */
  arrival(c: ArrivalCard): void {
    const rows: HTMLElement[] = [
      h('div', { class: 'dd-arrival-kicker', text: t('hud3.arrival.kicker', { stratum: ROMAN[c.stratum] ?? String(c.stratum) }) }),
      h('h2', { class: 'dd-arrival-name', text: c.name }),
      h('p', { class: 'dd-arrival-desc', text: c.line }),
    ];
    if (c.hazard) rows.push(h('p', { class: 'dd-arrival-hazard' }, h('b', { text: t('hud3.arrival.hazard') }), document.createTextNode(` ${c.hazard}`), ...(c.counter ? [document.createTextNode(` · ${t('hud3.arrival.gear', { gear: c.counter })}`)] : [])));
    if (c.rumour) rows.push(h('p', { class: 'dd-arrival-rumour', text: c.rumour }));
    this.arrivalEl.replaceChildren(...rows);
    this.arrivalEl.dataset.biome = c.biome;
    this.arrivalEl.classList.remove('on');
    void this.arrivalEl.offsetWidth;
    this.arrivalEl.classList.add('on');
    window.clearTimeout(this.arrivalTimer);
    // A first visit gets the full card for 7 s; a return, a short banner.
    this.arrivalEl.classList.toggle('brief', !c.first);
    this.arrivalTimer = window.setTimeout(() => this.arrivalEl.classList.remove('on'), c.first ? 7000 : 2600);
  }

  /** A small damage number at a screen point (0..1 from the top left); at most DMG_MAX at once. */
  damageNumber(sx: number, sy: number, amount: number, kind: 'hit' | 'weak' | 'hurt' = 'hit'): void {
    if (!(amount > 0) || this.reduceMotion) return;
    while (this.dmgLayer.childElementCount >= DMG_MAX) this.dmgLayer.firstElementChild?.remove();
    const el = h('span', { class: `dd-dmg ${kind}`, text: String(Math.max(1, Math.round(amount))) });
    el.style.left = `${Math.max(4, Math.min(96, sx * 100))}%`;
    el.style.top = `${Math.max(8, Math.min(90, sy * 100))}%`;
    this.dmgLayer.append(el);
    window.setTimeout(() => el.remove(), 700);
  }

  /** The vein combo beside the reticle (×2 .. ×6), fading after a moment. */
  combo(count: number): void {
    if (count <= 0) return;
    this.comboEl.textContent = t('hud3.combo', { n: count + 1 });
    this.comboEl.classList.remove('on');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('on');
    window.clearTimeout(this.comboTimer);
    this.comboTimer = window.setTimeout(() => this.comboEl.classList.remove('on'), 1400);
  }

  dispose(): void {
    window.clearTimeout(this.hintTimer);
    window.clearTimeout(this.arrivalTimer);
    window.clearTimeout(this.comboTimer);
    this.tutorial.dispose();
  }

  // ------------------------------------------------------------------------------------

  private hudButton(id: string, aria: string, press: () => void, label?: string): HTMLButtonElement {
    const b = h('button', { class: `dd-hbtn dd-hbtn-${id}`, type: 'button', 'aria-label': aria, 'data-ui-target': id }, glyph(id));
    if (label) b.append(h('span', { class: 'dd-hbtn-label', 'aria-hidden': 'true', text: label }));
    b.addEventListener('click', () => press());
    // A click must not leave focus on the button (Space would press it instead of jumping).
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  }

  private slotButton(i: number): HTMLButtonElement {
    const icon = h('span', { class: 'dd-slot-icon', 'aria-hidden': 'true' });
    const count = h('span', { class: 'dd-slot-count' });
    const btn = h('button', { class: 'dd-hslot', type: 'button', 'data-ui-target': `hotbar:${i}`, 'data-slot': String(i) }, icon, count, h('span', { class: 'dd-slot-key', 'aria-hidden': 'true', text: String(i + 1) }));
    let timer = 0;
    let long = false;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      long = false;
      btn.setPointerCapture?.(e.pointerId);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        long = true;
        this.actions.assign(i);
      }, HOTBAR_LONG_PRESS_MS);
    });
    const up = (e: PointerEvent) => {
      window.clearTimeout(timer);
      if (!long && e.type === 'pointerup') this.actions.hotbar(i);
      long = false;
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    // Keyboard activation (no pointer): select.
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) this.actions.hotbar(i);
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    this.slots.push({ btn, icon, count, item: '\u0000', n: -1 });
    return btn;
  }

  private updateVitals(s: HudState): void {
    const hpF = s.maxHealth > 0 ? Math.max(0, Math.min(1, s.health / s.maxHealth)) : 0;
    const hpQ = Math.round(hpF * BAR_STEPS);
    if (hpQ !== this.hpQ) {
      const hurt = hpQ < this.hpQ && this.hpQ >= 0;
      this.hpQ = hpQ;
      this.hpFill.style.transform = `scaleX(${hpQ / BAR_STEPS})`;
      this.hpEl.classList.toggle('low', hpF < 0.3);
      if (hurt && !this.reduceMotion) this.hpEl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 220, easing: 'ease-out' });
    }
    const hpN = Math.ceil(Math.max(0, s.health));
    if (hpN !== this.hpN) {
      this.hpN = hpN;
      this.hpText.textContent = String(hpN);
      this.hpEl.setAttribute('aria-valuenow', String(Math.round(hpF * 100)));
      this.hpEl.setAttribute('aria-label', t('hud.healthValue', { value: hpN, max: Math.round(s.maxHealth) }));
    }
    const oilQ = Math.round(Math.max(0, Math.min(1, s.lantern)) * BAR_STEPS);
    if (oilQ !== this.oilQ) {
      this.oilQ = oilQ;
      this.oilFill.style.transform = `scaleX(${oilQ / BAR_STEPS})`;
      const pct = Math.round((oilQ / BAR_STEPS) * 100);
      this.oilEl.setAttribute('aria-valuenow', String(pct));
      this.oilEl.setAttribute('aria-label', t('hud.lanternValue', { value: pct }));
    }
    const low = s.lanternLow || s.fuelState === 'critical' || s.fuelState === 'empty';
    if (low !== this.lowV) {
      this.lowV = low;
      this.oilEl.classList.toggle('low', low);
    }
    const st = `${s.fuelState}|${s.cold > 0}`;
    if (st !== this.oilState) {
      this.oilState = st;
      this.oilEl.classList.toggle('is-tight', s.fuelState === 'tight');
      this.oilEl.classList.toggle('is-empty', s.fuelState === 'empty');
      this.oilEl.classList.toggle('is-cold', s.cold > 0);
    }
    const tickQ = s.turnBackFraction === null ? -1 : Math.round(Math.max(0, Math.min(1, s.turnBackFraction)) * BAR_STEPS);
    if (tickQ !== this.tickQ) {
      this.tickQ = tickQ;
      this.oilTick.style.display = tickQ < 0 ? 'none' : '';
      if (tickQ >= 0) this.oilTick.style.left = `${(tickQ / BAR_STEPS) * 100}%`;
    }
  }

  private updateHazard(z: HudState['hazard']): void {
    const v = z ? `${z.kind}|${z.warded > 0}` : '';
    if (v !== this.hazardV) {
      this.hazardV = v;
      this.hazardEl.hidden = !z;
      this.hazardQ = -1;
      if (z) {
        this.hazardEl.dataset.kind = z.kind;
        const g = this.hazardEl.querySelector('.dd-glyph');
        if (g) g.innerHTML = iconSvg(HAZARD_GLYPH[z.kind]);
        this.hazardText.textContent = z.warded > 0 ? t('hud3.warded') : t(`hazard.${z.kind}` as TextKey);
      }
    }
    if (!z) return;
    const q = Math.round(Math.max(0, Math.min(1, z.level)) * 40);
    if (q !== this.hazardQ) {
      this.hazardQ = q;
      this.hazardFill.style.transform = `scaleX(${q / 40})`;
      this.hazardEl.classList.toggle('low', q >= 30);
      this.hazardEl.setAttribute('aria-valuenow', String(Math.round((q / 40) * 100)));
      this.hazardEl.setAttribute('aria-label', `${t(`hazard.${z.kind}` as TextKey)} ${Math.round((q / 40) * 100)}%`);
    }
  }

  private updateWhere(s: HudState): void {
    const depth = Math.max(0, Math.round(s.depth));
    if (depth !== this.depthV) {
      this.depthV = depth;
      this.depthEl.textContent = depthText(depth);
    }
    const biome = s.atCamp && !s.biomeName ? t('hud.camp') : s.biomeName;
    if (biome !== this.biomeV) {
      this.biomeV = biome;
      this.biomeEl.textContent = biome;
    }
    if (s.stratum !== this.stratumV) {
      this.stratumV = s.stratum;
      this.stratumEl.textContent = ROMAN[s.stratum] ?? String(s.stratum);
      this.stratumEl.setAttribute('aria-label', t('hud3.stratum', { n: s.stratum }));
    }
  }

  private updateTracker(s: HudState): void {
    const line = (l: TrackerLine | null) => (l ? `${l.text}|${l.have ?? ''}|${l.need ?? ''}` : '');
    // The main step: the quest's, else the first version's objective line.
    const main: TrackerLine | null = s.tracker.main ?? (s.objectiveText ? { id: 'objective', text: s.objectiveText } : null);
    const mv = line(main);
    if (mv !== this.mainV) {
      this.mainV = mv;
      this.mainLine.hidden = !main;
      this.mainText.textContent = main?.text ?? '';
      this.mainCount.textContent = main && main.need ? t('hud3.count', { have: Math.min(main.have ?? 0, main.need), need: main.need }) : '';
    }
    const sv = line(s.tracker.side);
    if (sv !== this.sideV) {
      this.sideV = sv;
      const side = s.tracker.side;
      this.sideLine.hidden = !side;
      this.sideText.textContent = side?.text ?? '';
      this.sideCount.textContent = side && side.need ? t('hud3.count', { have: Math.min(side.have ?? 0, side.need), need: side.need }) : '';
    }
    // The arrow: the objective once known; else the way home while out of camp.
    const a: ObjectiveArrowView | null = s.objectiveArrow ?? (!s.atCamp && s.compass ? { bearing: s.compass.bearing, distance: s.compass.distance, vertical: 0 } : null);
    const on = a !== null;
    if (on !== this.arrowOn) {
      this.arrowOn = on;
      this.arrow.hidden = !on;
      this.arrow.classList.toggle('home', !s.objectiveArrow);
    }
    if (!a) return;
    this.arrow.classList.toggle('home', !s.objectiveArrow);
    const q = Math.round((a.bearing * 90) / Math.PI);
    if (q !== this.arrowQ) {
      this.arrowQ = q;
      this.arrowDial.style.transform = `rotate(${q * 2}deg)`;
    }
    const d = Math.max(0, Math.round(a.distance));
    if (d !== this.arrowDist || a.vertical !== this.arrowVert) {
      this.arrowDist = d;
      this.arrowVert = a.vertical;
      this.arrowText.textContent = t(a.vertical > 0 ? 'hud3.distUp' : a.vertical < 0 ? 'hud3.distDown' : 'hud3.dist', { m: d });
    }
  }

  private updateGuardian(g: GuardianBarView | null): void {
    const v = g ? `${g.name}|${g.phase}|${g.phases}` : '';
    if (v !== this.guardianV) {
      this.guardianV = v;
      this.guardian.classList.toggle('on', !!g);
      if (g) {
        this.guardianName.textContent = g.name;
        this.guardianPhase.textContent = g.phases > 1 ? t('hud3.phase', { n: g.phase, total: g.phases }) : '';
      }
      this.guardianQ = -1;
    }
    if (!g) return;
    const q = Math.round((g.max > 0 ? Math.max(0, Math.min(1, g.hp / g.max)) : 0) * BAR_STEPS);
    if (q !== this.guardianQ) {
      this.guardianQ = q;
      this.guardianFill.style.transform = `scaleX(${q / BAR_STEPS})`;
      this.guardian.setAttribute('aria-valuenow', String(Math.round((q / BAR_STEPS) * 100)));
      this.guardian.setAttribute('aria-label', `${g.name} ${Math.round((q / BAR_STEPS) * 100)}%`);
    }
  }

  private updateReticle(kind: ReticleKind, progress: number): void {
    if (kind !== this.reticleV) {
      this.reticleV = kind;
      this.reticle.className = `dd-reticle k-${kind}`;
    }
    const q = kind === 'mine' ? Math.round(Math.max(0, Math.min(1, progress)) * PROGRESS_STEPS) : 0;
    if (q !== this.reticleQ) {
      this.reticleQ = q;
      this.ringArc.setAttribute('stroke-dashoffset', (RING_C * (1 - q / PROGRESS_STEPS)).toFixed(2));
      this.reticle.classList.toggle('cracking', q > 0);
    }
  }

  private updateHotbar(slots: readonly HudSlot[], sel: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const v = slots[i];
      const s = this.slots[i];
      const item = v?.item ?? null;
      if (item !== s.item) {
        s.item = item;
        s.icon.style.backgroundImage = item ? `url("${itemIconDataUrl(item as ItemId, iconPx(30))}")` : '';
        s.btn.classList.toggle('empty', !item);
        s.btn.setAttribute('aria-label', item ? t('hud3.slot', { n: i + 1, item: v!.name }) : t('hud3.slotEmpty', { n: i + 1 }));
        s.btn.title = item ? v!.name : '';
      }
      const n = item ? v!.count : 0;
      if (n !== s.n) {
        s.n = n;
        s.count.textContent = n > 1 ? String(n) : '';
      }
    }
    if (sel !== this.selV) {
      this.slots[this.selV]?.btn.classList.remove('sel');
      this.selV = sel;
      this.slots[sel]?.btn.classList.add('sel');
      this.slots[sel]?.btn.setAttribute('aria-pressed', 'true');
      for (let i = 0; i < this.slots.length; i++) if (i !== sel) this.slots[i].btn.setAttribute('aria-pressed', 'false');
    }
  }
}

function glyph(name: string): HTMLElement {
  const g = h('span', { class: 'dd-glyph', 'aria-hidden': 'true' });
  g.innerHTML = iconSvg(name);
  return g;
}
