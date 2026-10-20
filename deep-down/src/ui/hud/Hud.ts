import './wake.css';
import { t } from '../../i18n';
import type { HudState } from '../types';
import { h } from '../dom';
import { depthText } from '../format';
import { equipmentIconDataUrl, heartDataUrl, iconPx } from '../icons';
import { HEART_COUNT, healthHalves, heartFill } from './hearts';

const FUEL_STEPS = 200;
const PROGRESS_STEPS = 100;
const PERF_INTERVAL_MS = 250;
/** The wake ring hides this long after the last 'world:runeWake' (they come 4 times a second). */
const WAKE_HOLD_MS = 700;
/** Circumference of the wake ring (r = 9 in a 24 x 24 box). */
const WAKE_C = 2 * Math.PI * 9;

const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2 L19 19 L12 15 L5 19 Z" fill="currentColor" stroke="#05080d" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/**
 * The in-game HUD. update() runs every frame but only writes to the DOM when a displayed
 * value changes (cached primitives, quantized bars), so a steady frame costs no style or
 * layout work at all.
 */
export class Hud {
  readonly el: HTMLElement;
  private readonly hearts: HTMLElement;
  private readonly heartEls: HTMLElement[] = [];
  private readonly lantern: HTMLElement;
  private readonly fuelBar: HTMLElement;
  private readonly fuelFill: HTMLElement;
  /** The turn-back mark: a 2 px tick on the fuel bar (W4-B redesigns the gauge). */
  private readonly fuelTick: HTMLElement;
  private readonly cacheChip: HTMLElement;
  private readonly cacheDial: HTMLElement;
  private readonly cacheText: HTMLElement;
  private readonly depth: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly compassDial: HTMLElement;
  private readonly compassText: HTMLElement;
  private readonly pill: HTMLElement;
  private readonly pillText: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly target: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetFill: HTMLElement;
  private readonly usePrompt: HTMLElement;
  private readonly useLabel: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly perf: HTMLElement;
  /** The interact chip's rune-door ring: shown while a door wakes under the lantern. */
  private readonly wake: HTMLElement;
  private readonly wakeArc: SVGCircleElement;
  private wakeQ = -1;
  private wakeAt = -Infinity;
  private wakeOn = false;
  private hintTimer = 0;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Last displayed values (NaN / sentinel = never drawn).
  private halves = -1;
  private hpText = -1;
  private hpMax = -1;
  private fuelQ = -1;
  private fuelPct = -1;
  private low: boolean | null = null;
  private tickQ = NaN;
  private fuelState: string | null = null;
  private coldOn: boolean | null = null;
  private cacheOn: boolean | null = null;
  private cacheBearingQ = NaN;
  private cacheDist = NaN;
  private depthV = NaN;
  private atCamp: boolean | null = null;
  private bearingQ = NaN;
  private campDist = NaN;
  private used = -1;
  private max = -1;
  private objectiveText: string | null = null;
  private interact: string | null | undefined = undefined;
  private targetVisible: boolean | null = null;
  private targetText: string | null = null;
  private targetBlocked: boolean | null = null;
  private progressQ = -1;
  private crosshairOn: boolean | null = null;
  private perfOn: boolean | null = null;
  private perfAt = 0;
  private perfText = '';

  constructor() {
    for (let i = 0; i < HEART_COUNT; i++) this.heartEls.push(h('span', { class: 'dd-heart f2' }));
    this.hearts = h('div', { class: 'dd-hearts', role: 'img' }, ...this.heartEls);
    this.fuelFill = h('div', { class: 'dd-bar-fill' });
    this.fuelTick = h('span', {
      class: 'dd-bar-tick',
      'aria-hidden': 'true',
      style: 'position:absolute;top:0;bottom:0;left:0;width:2px;margin-left:-1px;background:#fff4dc;box-shadow:0 0 3px rgba(255,214,160,0.9);display:none;pointer-events:none',
    });
    this.fuelBar = h('div', { class: 'dd-bar', style: 'position:relative' }, this.fuelFill, this.fuelTick);
    this.lantern = h(
      'div',
      { class: 'dd-lantern', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('img', { class: 'dd-lantern-icon', src: equipmentIconDataUrl('lantern', 1, iconPx(18)), width: 18, height: 18, alt: '', 'aria-hidden': 'true' }),
      this.fuelBar,
    );
    this.depth = h('span', { class: 'dd-depth-value' });
    this.compassDial = h('span', { class: 'dd-compass-dial', 'aria-hidden': 'true' });
    this.compassDial.innerHTML = ARROW_SVG;
    this.compassText = h('span', { class: 'dd-compass-text' });
    this.compass = h('div', { class: 'dd-compass' }, h('span', { class: 'dd-compass-ring' }, this.compassDial), this.compassText);
    // The pack left behind: a second chip beside the camp compass (W4-B redesigns it).
    this.cacheDial = h('span', { class: 'dd-compass-dial', 'aria-hidden': 'true' });
    this.cacheDial.innerHTML = ARROW_SVG;
    this.cacheText = h('span', { class: 'dd-compass-text' });
    this.cacheChip = h(
      'div',
      {
        class: 'dd-cache-chip',
        role: 'status',
        style:
          'display:none;align-items:center;gap:7px;height:32px;box-sizing:border-box;padding:0 11px 0 3px;border-radius:999px;background:var(--chip, rgba(9,14,22,0.82));border:1px solid rgba(255,179,92,0.55);font-size:calc(13px * var(--s, 1));font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;color:#ffd9a8',
      },
      h('span', { class: 'dd-compass-ring' }, this.cacheDial),
      this.cacheText,
    );
    this.pillText = h('span');
    this.pill = h('div', { class: 'dd-pill' }, h('span', { class: 'dd-pill-icon', 'aria-hidden': 'true', style: `background-image: url("${equipmentIconDataUrl('pack', 1, iconPx(20))}")` }), this.pillText);
    this.objective = h('div', { class: 'dd-objective', 'aria-live': 'polite' });
    this.crosshair = h('div', { class: 'dd-crosshair', 'aria-hidden': 'true' });
    this.targetName = h('span', { class: 'dd-target-name' });
    this.targetFill = h('div', { class: 'dd-bar-fill' });
    this.target = h('div', { class: 'dd-target' }, this.targetName, h('div', { class: 'dd-bar thin' }, this.targetFill));
    this.useLabel = h('span');
    this.usePrompt = h('div', { class: 'dd-use-prompt' }, h('kbd', { text: t('hud.useKey') }), this.useLabel);
    this.hintEl = h('div', { class: 'dd-hint', role: 'status' });
    this.perf = h('div', { class: 'dd-perf' });
    const ring = h('span', { class: 'dd-wake-ring', 'aria-hidden': 'true' });
    ring.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><circle class="dd-wake-track" cx="12" cy="12" r="9"/><circle class="dd-wake-arc" cx="12" cy="12" r="9" stroke-dasharray="${WAKE_C.toFixed(2)}" stroke-dashoffset="${WAKE_C.toFixed(2)}" transform="rotate(-90 12 12)"/><path class="dd-wake-rune" d="M12 6.5 L15 11 L12 15.5 L9 11 Z M12 15.5 V18"/></svg>`;
    this.wakeArc = ring.querySelector('.dd-wake-arc') as SVGCircleElement;
    this.wake = h('div', { class: 'dd-wake', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, ring, h('span', { class: 'dd-wake-text', text: t('ui.wake.label') }));

    this.el = h(
      'div',
      { class: 'dd-hud' },
      h('div', { class: 'dd-hud-tl' }, this.hearts, this.lantern),
      h(
        'div',
        { class: 'dd-hud-tr' },
        h('div', { class: 'dd-depth' }, h('span', { class: 'dd-depth-label', text: t('hud.depth') }), this.depth),
        h('div', { class: 'dd-hud-row' }, this.cacheChip, this.compass, this.pill),
        this.objective,
      ),
      this.perf,
      this.crosshair,
      h('div', { class: 'dd-hud-bottom' }, this.hintEl, this.wake, this.usePrompt, this.target),
    );
    this.el.style.setProperty('--heart-0', `url("${heartDataUrl(0)}")`);
    this.el.style.setProperty('--heart-1', `url("${heartDataUrl(1)}")`);
    this.el.style.setProperty('--heart-2', `url("${heartDataUrl(2)}")`);
  }

  setVisible(b: boolean): void {
    this.el.classList.toggle('on', b);
  }

  update(s: HudState, showPerf: boolean, now: number): void {
    this.updateHealth(s.health, s.maxHealth);

    const fuelQ = Math.round(Math.max(0, Math.min(1, s.lantern)) * FUEL_STEPS);
    if (fuelQ !== this.fuelQ) {
      this.fuelQ = fuelQ;
      this.fuelFill.style.transform = `scaleX(${fuelQ / FUEL_STEPS})`;
      const pct = Math.round((fuelQ / FUEL_STEPS) * 100);
      if (pct !== this.fuelPct) {
        this.fuelPct = pct;
        this.lantern.setAttribute('aria-valuenow', String(pct));
        this.lantern.setAttribute('aria-label', t('hud.lanternValue', { value: pct }));
      }
    }
    // Low fuel, or no more than the walk home left: the bar pulses red.
    const low = s.lanternLow || s.fuelState === 'critical';
    if (low !== this.low) {
      this.low = low;
      this.lantern.classList.toggle('low', low);
    }
    if (s.fuelState !== this.fuelState) {
      this.fuelState = s.fuelState;
      this.lantern.classList.toggle('is-tight', s.fuelState === 'tight');
      this.lantern.classList.toggle('is-critical', s.fuelState === 'critical');
      this.lantern.classList.toggle('is-empty', s.fuelState === 'empty');
      this.fuelBar.style.borderColor = s.fuelState === 'tight' ? 'rgba(255,179,92,0.9)' : '';
    }
    const cold = s.cold > 0;
    if (cold !== this.coldOn) {
      this.coldOn = cold;
      this.lantern.classList.toggle('is-cold', cold);
      this.hearts.style.filter = cold ? 'drop-shadow(0 0 4px rgba(143,227,238,0.85))' : '';
    }
    // The turn-back mark: where the fuel must turn for home (none at camp).
    const tickQ = s.turnBackFraction === null ? -1 : Math.round(Math.max(0, Math.min(1, s.turnBackFraction)) * FUEL_STEPS);
    if (tickQ !== this.tickQ) {
      this.tickQ = tickQ;
      this.fuelTick.style.display = tickQ < 0 ? 'none' : '';
      if (tickQ >= 0) this.fuelTick.style.left = `${(tickQ / FUEL_STEPS) * 100}%`;
    }

    // Compare what is displayed (whole meters), so a fractional input never rewrites the DOM.
    const depth = Math.max(0, Math.round(s.depth));
    if (depth !== this.depthV) {
      this.depthV = depth;
      this.depth.textContent = depthText(depth);
    }

    if (s.atCamp !== this.atCamp) {
      this.atCamp = s.atCamp;
      this.compass.classList.toggle('at-camp', s.atCamp);
      this.campDist = NaN;
    }
    if (s.atCamp) {
      if (this.campDist !== -1) {
        this.campDist = -1;
        this.compassText.textContent = t('hud.camp');
      }
    } else {
      // Two-degree steps: smooth to the eye, but a still camera writes nothing.
      const q = Math.round((s.campBearing * 90) / Math.PI);
      if (q !== this.bearingQ) {
        this.bearingQ = q;
        this.compassDial.style.transform = `rotate(${q * 2}deg)`;
      }
      const dist = Math.max(0, Math.round(s.campDistance));
      if (dist !== this.campDist) {
        this.campDist = dist;
        this.compassText.textContent = t('hud.campDistance', { distance: dist });
      }
    }

    this.updateCache(s.cache);

    if (s.backpackUsed !== this.used || s.backpackMax !== this.max) {
      this.used = s.backpackUsed;
      this.max = s.backpackMax;
      this.pillText.textContent = t('hud.backpackValue', { used: s.backpackUsed, max: s.backpackMax });
      this.pill.setAttribute('aria-label', t('hud.backpackLabel', { used: s.backpackUsed, max: s.backpackMax }));
      this.pill.classList.toggle('full', s.backpackUsed >= s.backpackMax);
    }

    if (s.objectiveText !== this.objectiveText) {
      this.objectiveText = s.objectiveText;
      this.objective.textContent = s.objectiveText;
      this.objective.classList.toggle('on', s.objectiveText.length > 0);
    }

    if (s.interactLabel !== this.interact) {
      this.interact = s.interactLabel;
      if (s.interactLabel !== null) this.useLabel.textContent = s.interactLabel;
      this.usePrompt.classList.toggle('on', s.interactLabel !== null);
    }

    this.updateTarget(s.target);
    if (this.wakeOn && now - this.wakeAt > WAKE_HOLD_MS) this.setWakeOn(false);

    if (s.showCrosshair !== this.crosshairOn) {
      this.crosshairOn = s.showCrosshair;
      this.crosshair.classList.toggle('on', s.showCrosshair);
    }

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

  /** One contextual hint line above the target info; a newer hint replaces the old one. */
  hint(text: string, ms: number): void {
    if (this.hintEl.textContent !== text) this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('on'), ms);
  }

  /**
   * A rune door is waking ('world:runeWake', progress 0..1; it opens at 1): the ring on the
   * interact chip fills. It hides by itself once the events stop (the door opened, or the
   * explorer stepped away and the waking faded).
   */
  wakeProgress(progress: number, now: number): void {
    this.wakeAt = now;
    if (!this.wakeOn) this.setWakeOn(true);
    const q = Math.round(Math.max(0, Math.min(1, progress)) * PROGRESS_STEPS);
    if (q === this.wakeQ) return;
    this.wakeQ = q;
    this.wakeArc.setAttribute('stroke-dashoffset', (WAKE_C * (1 - q / PROGRESS_STEPS)).toFixed(2));
    this.wake.setAttribute('aria-valuenow', String(q));
    this.wake.setAttribute('aria-label', t('ui.wake.aria', { value: q }));
  }

  private setWakeOn(on: boolean): void {
    this.wakeOn = on;
    this.wake.classList.toggle('on', on);
    if (!on) this.wakeQ = -1;
  }

  dispose(): void {
    window.clearTimeout(this.hintTimer);
  }

  private updateHealth(health: number, max: number): void {
    const halves = healthHalves(health, max);
    if (halves !== this.halves) {
      const hurt = this.halves > halves && this.halves >= 0;
      this.halves = halves;
      for (let i = 0; i < HEART_COUNT; i++) this.heartEls[i].className = `dd-heart f${heartFill(halves, i)}`;
      this.hearts.classList.toggle('low', halves <= 2);
      if (hurt && !this.reduceMotion) {
        this.hearts.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
          { duration: 260, easing: 'ease-out' },
        );
      }
    }
    const hp = Math.ceil(Math.max(0, health));
    if (hp !== this.hpText || max !== this.hpMax) {
      this.hpText = hp;
      this.hpMax = max;
      this.hearts.setAttribute('aria-label', t('hud.healthValue', { value: hp, max: Math.round(max) }));
    }
  }

  private updateCache(c: HudState['cache']): void {
    const on = c !== null;
    if (on !== this.cacheOn) {
      this.cacheOn = on;
      this.cacheChip.style.display = on ? 'flex' : 'none';
      this.cacheDist = NaN;
    }
    if (!c) return;
    const q = Math.round((c.bearing * 90) / Math.PI);
    if (q !== this.cacheBearingQ) {
      this.cacheBearingQ = q;
      this.cacheDial.style.transform = `rotate(${q * 2}deg)`;
    }
    const dist = Math.max(0, Math.round(c.distance));
    if (dist !== this.cacheDist) {
      this.cacheDist = dist;
      this.cacheText.textContent = t('hud.cacheDistance', { distance: dist });
    }
  }

  private updateTarget(target: HudState['target']): void {
    const visible = target !== null;
    if (visible !== this.targetVisible) {
      this.targetVisible = visible;
      this.target.classList.toggle('on', visible);
    }
    if (!target) return;
    if (target.name !== this.targetText) {
      this.targetText = target.name;
      this.targetName.textContent = target.name;
    }
    if (target.blocked !== this.targetBlocked) {
      this.targetBlocked = target.blocked;
      this.target.classList.toggle('blocked', target.blocked);
    }
    const q = Math.round(Math.max(0, Math.min(1, target.progress)) * PROGRESS_STEPS);
    if (q !== this.progressQ) {
      this.progressQ = q;
      this.targetFill.style.transform = `scaleX(${q / PROGRESS_STEPS})`;
    }
  }
}
