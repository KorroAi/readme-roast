import { t } from '../../i18n';
import type { HudState } from '../types';
import { h } from '../dom';
import { depthText } from '../format';
import { equipmentIconDataUrl, heartDataUrl, iconPx } from '../icons';
import { HEART_COUNT, healthHalves, heartFill } from './hearts';

const FUEL_STEPS = 200;
const PROGRESS_STEPS = 100;
const PERF_INTERVAL_MS = 250;

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
  private readonly fuelFill: HTMLElement;
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
  private hintTimer = 0;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Last displayed values (NaN / sentinel = never drawn).
  private halves = -1;
  private hpText = -1;
  private hpMax = -1;
  private fuelQ = -1;
  private fuelPct = -1;
  private low: boolean | null = null;
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
    this.lantern = h(
      'div',
      { class: 'dd-lantern', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('img', { class: 'dd-lantern-icon', src: equipmentIconDataUrl('lantern', 1, iconPx(18)), width: 18, height: 18, alt: '', 'aria-hidden': 'true' }),
      h('div', { class: 'dd-bar' }, this.fuelFill),
    );
    this.depth = h('span', { class: 'dd-depth-value' });
    this.compassDial = h('span', { class: 'dd-compass-dial', 'aria-hidden': 'true' });
    this.compassDial.innerHTML = ARROW_SVG;
    this.compassText = h('span', { class: 'dd-compass-text' });
    this.compass = h('div', { class: 'dd-compass' }, h('span', { class: 'dd-compass-ring' }, this.compassDial), this.compassText);
    this.pillText = h('span');
    this.pill = h('div', { class: 'dd-pill' }, h('span', { class: 'dd-pill-icon', 'aria-hidden': 'true' }), this.pillText);
    this.objective = h('div', { class: 'dd-objective', 'aria-live': 'polite' });
    this.crosshair = h('div', { class: 'dd-crosshair', 'aria-hidden': 'true' });
    this.targetName = h('span', { class: 'dd-target-name' });
    this.targetFill = h('div', { class: 'dd-bar-fill' });
    this.target = h('div', { class: 'dd-target' }, this.targetName, h('div', { class: 'dd-bar thin' }, this.targetFill));
    this.useLabel = h('span');
    this.usePrompt = h('div', { class: 'dd-use-prompt' }, h('kbd', { text: t('hud.useKey') }), this.useLabel);
    this.hintEl = h('div', { class: 'dd-hint', role: 'status' });
    this.perf = h('div', { class: 'dd-perf' });

    this.el = h(
      'div',
      { class: 'dd-hud' },
      h('div', { class: 'dd-hud-tl' }, this.hearts, this.lantern),
      h(
        'div',
        { class: 'dd-hud-tr' },
        h('div', { class: 'dd-depth' }, h('span', { class: 'dd-depth-label', text: t('hud.depth') }), this.depth),
        h('div', { class: 'dd-hud-row' }, this.compass, this.pill),
        this.objective,
      ),
      this.perf,
      this.crosshair,
      h('div', { class: 'dd-hud-bottom' }, this.hintEl, this.usePrompt, this.target),
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
    if (s.lanternLow !== this.low) {
      this.low = s.lanternLow;
      this.lantern.classList.toggle('low', s.lanternLow);
    }

    if (s.depth !== this.depthV) {
      this.depthV = s.depth;
      this.depth.textContent = depthText(s.depth);
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
      if (s.campDistance !== this.campDist) {
        this.campDist = s.campDistance;
        this.compassText.textContent = t('hud.campDistance', { distance: s.campDistance });
      }
    }

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
