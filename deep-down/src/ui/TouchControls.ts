import { t } from '../i18n';
import type { InputState } from '../input/types';
import { SPRINT_DEFLECTION } from '../game/fp/constants';
import { h } from './dom';
import type { PlayerActions } from './hud/actions';
import type { InteractView } from './types';
import { iconSvg } from './hud/glyphs';
import {
  advanceLookPhase,
  clampBase,
  followBase,
  HOLD_TO_MINE_MS,
  isTap,
  joystick,
  joystickRadiusFor,
  releaseLook,
  toNdc,
  touchSide,
  type LookPhase,
  type StickOutput,
} from './touchMath';

interface StickTouch {
  id: number;
  baseX: number;
  baseY: number;
  /** Where and when it landed, and how far it has moved: a quick still press is a world tap. */
  startX: number;
  startY: number;
  startT: number;
  maxOff: number;
}

interface LookTouch {
  id: number;
  phase: LookPhase;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startT: number;
}

/** Elements that handle their own pointers; touches starting on them never look or mine. */
const OWN_POINTER_TARGETS = 'button, input, select, a, .dd-screen, .dd-modal, [data-touch-ignore]';

/** Cooldown rings are drawn in this many steps (a still cooldown writes nothing). */
const CD_STEPS = 40;

/** The control layout's user preferences (Settings: button size and opacity). */
export interface ControlPrefs {
  /** Button size multiplier (0.8 .. 1.3). */
  scale: number;
  /** Button opacity at rest (0.35 .. 1). */
  opacity: number;
}

/**
 * The round 3 mobile action layout (BRIEF §0.6), upright first:
 * - lower left: a floating movement joystick, always available (its ghost shows where to put the
 *   thumb); pushed to its edge it sprints;
 * - anywhere else: drag to look; a quick tap acts on what it lands on (game/TapController: mine,
 *   attack, use, or walk there), a still hold mines at the finger;
 * - right thumb: the big Action button (mine or attack what the reticle is on; hold to go on; a drag
 *   that starts on it also looks), Jump, Dash and Sonar (with their cooldown rings), Place (only
 *   with a placeable item in hand) and the contextual Interact chip (the target's icon and verb);
 * - left-handed: the whole layout mirrors.
 * Every control carries `data-ui-target` (ui/hud/actions UiTargetId) for the tutorial's ring.
 * Writes only through PlayerActions (and the tap fields of InputState).
 *
 * Touches are tracked by pointerId from window-level pointer events, so the layer itself
 * stays transparent to the mouse (desktop play goes to DesktopInput through the canvas).
 * Mouse and pen also drive it when <html data-touch-ui="1"> is set, for testing.
 */
export class TouchControls {
  readonly el: HTMLElement;
  private enabled = false;
  private leftHanded = false;
  private touchUi = false;
  private stick: StickTouch | null = null;
  private look: LookTouch | null = null;
  /** A drag that started on the Action button looks while the button stays held. */
  private actionLook: { id: number; x: number; y: number } | null = null;
  private ownsMining = false;
  private holdTimer = 0;
  private aimResetTimer = 0;
  private radius = 60;
  private readonly stickOut: StickOutput = { x: 0, y: 0, knobX: 0, knobY: 0 };
  private readonly ndc = { x: 0, y: 0 };
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly actionBtn: HTMLButtonElement;
  private readonly jumpBtn: HTMLButtonElement;
  private readonly dashBtn: HTMLButtonElement;
  private readonly sonarBtn: HTMLButtonElement;
  private readonly placeBtn: HTMLButtonElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly useIcon: HTMLElement;
  private readonly useVerb: HTMLElement;
  private readonly useLabel: HTMLElement;
  private useKey: string | null = null;
  /** The Flash Charge chip: shown only while charges are carried and a monster is near. */
  private readonly flashBtn: HTMLButtonElement;
  private readonly flashCount: HTMLElement;
  private flashShown = -1;
  private placeShown: boolean | null = null;
  private dashQ = -1;
  private sonarQ = -1;
  private sprinting = false;
  private readonly disposers: Array<() => void> = [];

  constructor(private readonly root: HTMLElement, private readonly input: InputState, private readonly actions: PlayerActions) {
    this.knob = h('div', { class: 'dd-stick-knob' });
    this.base = h('div', { class: 'dd-stick idle', 'aria-hidden': 'true', 'data-ui-target': 'joystick' }, this.knob);

    this.actionBtn = this.padButton('action', t('ctl.action.aria'), 'pick', t('ctl.action'));
    this.jumpBtn = this.padButton('jump', t('ctl.jump'), 'jump', null);
    this.dashBtn = this.padButton('dash', t('ctl.dash.aria'), 'dash', null);
    this.sonarBtn = this.padButton('sonar', t('ctl.sonar.aria'), 'sonar', null);
    this.placeBtn = this.padButton('place', t('ctl.place.aria'), 'place', null);
    this.placeBtn.hidden = true;
    this.wireHold(this.actionBtn, () => actions.action(true), () => actions.action(false));
    this.wireHold(this.jumpBtn, () => actions.jump(true), () => actions.jump(false));
    this.wireHold(this.dashBtn, () => actions.dash());
    this.wireHold(this.sonarBtn, () => actions.sonar());
    this.wireHold(this.placeBtn, () => actions.place());
    // A drag that starts on Action also turns the view (one thumb can hold and aim).
    this.actionBtn.addEventListener('pointermove', (e) => {
      const a = this.actionLook;
      if (!a || a.id !== e.pointerId || !this.enabled) return;
      actions.look(e.clientX - a.x, e.clientY - a.y);
      a.x = e.clientX;
      a.y = e.clientY;
    });
    this.actionBtn.addEventListener('pointerdown', (e) => {
      if (this.enabled) this.actionLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    const endActionLook = (e: PointerEvent) => {
      if (this.actionLook?.id === e.pointerId) this.actionLook = null;
    };
    this.actionBtn.addEventListener('pointerup', endActionLook);
    this.actionBtn.addEventListener('pointercancel', endActionLook);

    this.useIcon = h('span', { class: 'dd-use-icon', 'aria-hidden': 'true' });
    this.useVerb = h('span', { class: 'dd-use-verb' });
    this.useLabel = h('span', { class: 'dd-use-label' });
    this.useBtn = h('button', { class: 'dd-tbtn dd-use', type: 'button', 'data-ui-target': 'interact' }, this.useIcon, h('span', { class: 'dd-use-text' }, this.useVerb, this.useLabel));
    this.wireHold(this.useBtn, () => actions.interact());
    this.useBtn.hidden = true;
    this.flashCount = h('span', { class: 'dd-flash-count' });
    this.flashBtn = h('button', { class: 'dd-tbtn dd-flash', type: 'button' }, h('span', { class: 'dd-flash-glyph', 'aria-hidden': 'true' }), h('span', { class: 'dd-flash-label', text: t('weapon.flash') }), this.flashCount);
    this.wireHold(this.flashBtn, () => {
      input.flashPressed = true;
    });
    this.flashBtn.hidden = true;
    this.el = h(
      'div',
      { class: 'dd-touch dd-fp dd-r3' },
      this.base,
      h('div', { class: 'dd-pad' }, this.sonarBtn, this.dashBtn, this.placeBtn, this.jumpBtn, this.actionBtn),
      this.useBtn,
      this.flashBtn,
    );
    root.appendChild(this.el);
    this.sizeStick(window.innerWidth, window.innerHeight);
    this.wire(root);
  }

  private padButton(id: string, aria: string, glyph: Parameters<typeof iconSvg>[0], label: string | null): HTMLButtonElement {
    const b = h('button', { class: `dd-pad-btn dd-pad-${id}`, type: 'button', 'aria-label': aria, 'data-ui-target': id });
    const g = h('span', { class: 'dd-pad-glyph', 'aria-hidden': 'true' });
    g.innerHTML = iconSvg(glyph);
    b.append(g);
    if (label) b.append(h('span', { class: 'dd-pad-label', 'aria-hidden': 'true', text: label }));
    b.append(h('span', { class: 'dd-pad-cd', 'aria-hidden': 'true' }));
    return b;
  }

  private wire(root: HTMLElement): void {
    const onResize = () => this.sizeStick(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    this.disposers.push(() => window.removeEventListener('resize', onResize));

    const forced = document.documentElement.dataset.touchUi === '1';
    this.touchUi = forced || navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
    root.classList.toggle('dd-touch-ui', this.touchUi);

    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, opts);
      this.disposers.push(() => window.removeEventListener(type, fn, opts));
    };
    on('pointerdown', (e) => this.onDown(e), { passive: false });
    on('pointermove', (e) => this.onMove(e), { passive: true });
    on('pointerup', (e) => this.onUp(e));
    on('pointercancel', (e) => this.onUp(e));
    on('blur', () => this.releaseAll());
    on('contextmenu', (e) => {
      // Android long-press would open a context menu over the game.
      if (this.enabled && !(e.target as Element | null)?.closest?.('input')) e.preventDefault();
    });
    const onVis = () => {
      if (document.visibilityState === 'hidden') this.releaseAll();
    };
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));
  }

  /** Accept input (gameplay running, no screen open). Disabling releases every touch. */
  setEnabled(b: boolean): void {
    if (this.enabled === b) return;
    this.enabled = b;
    this.el.classList.toggle('dd-on', b);
    if (!b) this.releaseAll();
  }

  /** Swap sides: joystick on the right, look and the action buttons on the left. */
  setLeftHanded(b: boolean): void {
    if (this.leftHanded === b) return;
    this.leftHanded = b;
    this.el.classList.toggle('dd-lefty', b);
    this.releaseAll();
  }

  /** Button size and opacity (Settings). */
  setPrefs(p: ControlPrefs): void {
    const scale = Math.max(0.8, Math.min(1.3, p.scale || 1));
    const opacity = Math.max(0.35, Math.min(1, p.opacity || 0.85));
    this.root.style.setProperty('--btn-scale', String(scale));
    this.root.style.setProperty('--btn-opacity', String(opacity));
  }

  /** Show the Use button with a contextual label (e.g. "Workbench"), or hide it (the first version's call). */
  setInteractVisible(label: string | null): void {
    this.setInteract(label === null ? null : { icon: 'other', verb: t('ctl.interact'), label });
  }

  /** The Interact chip: the target's icon and verb ("Open · Chest"), or hidden. */
  setInteract(v: InteractView | null): void {
    const key = v ? `${v.icon}|${v.verb}|${v.label}` : null;
    if (key === this.useKey) return;
    this.useKey = key;
    this.useBtn.hidden = v === null;
    if (!v) return;
    this.useIcon.innerHTML = iconSvg(v.icon);
    this.useVerb.textContent = v.verb;
    this.useLabel.textContent = v.label;
    this.useBtn.setAttribute('aria-label', `${v.verb}: ${v.label}`);
  }

  /** The Place button shows only with something placeable in hand. */
  setPlaceVisible(b: boolean): void {
    if (b === this.placeShown) return;
    this.placeShown = b;
    this.placeBtn.hidden = !b;
  }

  /** Cooldowns in [0, 1] (0 ready): a ring sweeps back round the button. */
  setCooldowns(dash: number, sonar: number): void {
    const dq = Math.round(Math.max(0, Math.min(1, dash)) * CD_STEPS);
    if (dq !== this.dashQ) {
      this.dashQ = dq;
      this.dashBtn.style.setProperty('--cd', String(dq / CD_STEPS));
      this.dashBtn.classList.toggle('cooling', dq > 0);
    }
    const sq = Math.round(Math.max(0, Math.min(1, sonar)) * CD_STEPS);
    if (sq !== this.sonarQ) {
      this.sonarQ = sq;
      this.sonarBtn.style.setProperty('--cd', String(sq / CD_STEPS));
      this.sonarBtn.classList.toggle('cooling', sq > 0);
    }
  }

  /** Show the Flash Charge chip with the charges carried (0 hides it). */
  setFlash(count: number): void {
    const n = Math.max(0, Math.floor(count));
    if (n === this.flashShown) return;
    this.flashShown = n;
    this.flashBtn.hidden = n === 0;
    this.flashCount.textContent = n > 0 ? `×${n}` : '';
    this.flashBtn.setAttribute('aria-label', `${t('weapon.flash')} ×${n}`);
  }

  dispose(): void {
    this.releaseAll();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.el.remove();
  }

  // ------------------------------------------------------------------------------------

  /** Press on pointerdown (no click delay), release on up, cancel or a lost capture. */
  private wireHold(b: HTMLButtonElement, press: () => void, release?: () => void): void {
    let pressedAt = -Infinity;
    const up = () => {
      if (!b.classList.contains('pressed')) return;
      b.classList.remove('pressed');
      release?.();
    };
    b.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      // No focus, no compatibility mouse events, no look/mine underneath.
      e.preventDefault();
      if (e.pointerType === 'touch') this.noteTouch();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('pressed');
      pressedAt = e.timeStamp;
      press();
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    // Keyboard / switch-access activation arrives as a click without a pointer press. The
    // click that follows a touch can also report detail 0, so skip clicks right after a press.
    b.addEventListener('click', (e) => {
      if (!this.enabled || e.detail !== 0 || e.timeStamp - pressedAt < 1000) return;
      press();
      release?.();
    });
  }

  private accepts(e: PointerEvent): boolean {
    if (!this.enabled) return false;
    if (e.pointerType === 'touch') return true;
    return e.isPrimary && document.documentElement.dataset.touchUi === '1';
  }

  private noteTouch(): void {
    this.input.lastDevice = 'touch';
    if (!this.touchUi) {
      this.touchUi = true;
      this.root.classList.add('dd-touch-ui');
    }
  }

  private onDown(e: PointerEvent): void {
    if (!this.accepts(e)) return;
    const target = e.target as Element | null;
    if (target?.closest?.(OWN_POINTER_TARGETS)) return;
    if (e.pointerType === 'touch') this.noteTouch();
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    if (touchSide(e.clientX, w, this.leftHanded, e.clientY, hgt) === 'move') {
      if (this.stick) return;
      this.sizeStick(w, hgt);
      const [bx, by] = clampBase(e.clientX, e.clientY, w, hgt, this.radius);
      this.stick = { id: e.pointerId, baseX: bx, baseY: by, startX: e.clientX, startY: e.clientY, startT: e.timeStamp, maxOff: 0 };
      this.base.classList.remove('idle');
      this.placeBase();
      this.updateStick(e.clientX, e.clientY);
    } else {
      if (this.look) return;
      // Event timestamps (same clock as performance.now) judge the hold by when the finger
      // actually moved, even if a busy main thread delivers the move late.
      this.look = { id: e.pointerId, phase: 'pending', startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, startT: e.timeStamp };
      window.clearTimeout(this.aimResetTimer);
      window.clearTimeout(this.holdTimer);
      this.holdTimer = window.setTimeout(() => this.onHoldTimer(), HOLD_TO_MINE_MS);
    }
    e.preventDefault();
  }

  private onMove(e: PointerEvent): void {
    if (this.stick && e.pointerId === this.stick.id) {
      const s = this.stick;
      s.maxOff = Math.max(s.maxOff, Math.hypot(e.clientX - s.startX, e.clientY - s.startY));
      this.updateStick(e.clientX, e.clientY);
      return;
    }
    const look = this.look;
    if (!look || e.pointerId !== look.id) return;
    const x = e.clientX;
    const y = e.clientY;
    const prev = look.phase;
    look.phase = advanceLookPhase(prev, x - look.startX, y - look.startY, e.timeStamp - look.startT);
    if (look.phase === 'look') {
      // The first drag frame includes the slop so the camera follows the finger 1:1.
      this.actions.look(x - (prev === 'pending' ? look.startX : look.lastX), y - (prev === 'pending' ? look.startY : look.lastY));
    } else if (look.phase === 'mine') {
      if (prev === 'pending') this.beginMine();
      this.aimAt(x, y);
    }
    look.lastX = x;
    look.lastY = y;
  }

  private onUp(e: PointerEvent): void {
    if (this.stick && e.pointerId === this.stick.id) {
      const s = this.stick;
      this.endStick();
      // A quick still press where the joystick starts is still a tap on the world.
      if (e.type !== 'pointercancel' && isTap(e.timeStamp - s.startT, s.maxOff)) this.emitTap(s.startX, s.startY);
      return;
    }
    const look = this.look;
    if (!look || e.pointerId !== look.id) return;
    window.clearTimeout(this.holdTimer);
    this.look = null;
    const action = e.type === 'pointercancel' ? 'endMine' : releaseLook(look.phase);
    if (action === 'tapMine') {
      // A tap: the game mines the tapped block until it breaks (or walks there, or uses it).
      this.emitTap(look.lastX, look.lastY);
    } else if (action === 'endMine') this.endMining();
    if (action !== 'none') this.scheduleAimReset();
  }

  /** After mining at a finger, hand the aim back to the reticle once the swing has landed. */
  private scheduleAimReset(): void {
    window.clearTimeout(this.aimResetTimer);
    this.aimResetTimer = window.setTimeout(() => {
      if (!this.look && !this.input.mining) this.input.aimFromPointer = false;
    }, 900);
  }

  private onHoldTimer(): void {
    const look = this.look;
    if (!look || look.phase !== 'pending') return;
    // A busy frame can hold back a move that already happened: let queued input run first (input
    // events are dispatched before animation frames), then decide.
    requestAnimationFrame(() => this.decideHold(look));
  }

  private decideHold(look: LookTouch): void {
    if (this.look !== look || look.phase !== 'pending') return;
    look.phase = advanceLookPhase('pending', look.lastX - look.startX, look.lastY - look.startY, Math.max(HOLD_TO_MINE_MS, performance.now() - look.startT));
    if (look.phase === 'mine') {
      this.beginMine();
      this.aimAt(look.lastX, look.lastY);
    }
  }

  private beginMine(): void {
    this.input.mining = true;
    this.input.aimFromPointer = true;
    this.ownsMining = true;
    // The held block is also locked, so it is finished even if the finger lifts early.
    if (this.look) this.emitTap(this.look.startX, this.look.startY);
  }

  /** Report a tap on the world at a screen point (CSS px). */
  private emitTap(x: number, y: number): void {
    toNdc(x, y, window.innerWidth, window.innerHeight, this.ndc);
    this.input.tapX = this.ndc.x;
    this.input.tapY = this.ndc.y;
    this.input.tapPressed = true;
  }

  /**
   * Stop mining at the finger. The aim stays at the last finger position: a swing already in
   * flight re-acquires its target at the impact frame, and must find the block that was touched.
   */
  private endMining(): void {
    if (this.look?.phase === 'mine' || !this.ownsMining) return;
    this.ownsMining = false;
    this.input.mining = false;
  }

  private aimAt(x: number, y: number): void {
    toNdc(x, y, window.innerWidth, window.innerHeight, this.ndc);
    this.input.aimX = this.ndc.x;
    this.input.aimY = this.ndc.y;
  }

  /** Joystick size for this screen (also drives the CSS size of the base and knob). */
  private sizeStick(w: number, hgt: number): void {
    const r = joystickRadiusFor(w, hgt);
    if (r === this.radius) return;
    this.radius = r;
    this.el.style.setProperty('--stick-r', `${r}px`);
  }

  private placeBase(): void {
    const s = this.stick!;
    this.base.style.transform = `translate3d(${s.baseX - this.radius}px, ${s.baseY - this.radius}px, 0)`;
  }

  private updateStick(x: number, y: number): void {
    const s = this.stick!;
    // The base follows a thumb that overshoots the rim, so the stick is never lost.
    const [fx, fy] = followBase(s.baseX, s.baseY, x, y, this.radius);
    if (fx !== s.baseX || fy !== s.baseY) {
      [s.baseX, s.baseY] = clampBase(fx, fy, window.innerWidth, window.innerHeight, this.radius);
      this.placeBase();
    }
    const dx = x - s.baseX;
    const dy = y - s.baseY;
    const out = joystick(dx, dy, this.stickOut, this.radius);
    // Pushed to the edge: sprint (BRIEF §0.6).
    const sprint = Math.hypot(dx, dy) / this.radius >= SPRINT_DEFLECTION && out.y > 0.35;
    this.actions.move(out.x, out.y, sprint);
    if (sprint !== this.sprinting) {
      this.sprinting = sprint;
      this.base.classList.toggle('sprint', sprint);
    }
    this.knob.style.transform = `translate3d(${out.knobX}px, ${out.knobY}px, 0)`;
  }

  private endStick(): void {
    this.stick = null;
    this.actions.move(0, 0, false);
    this.sprinting = false;
    this.base.classList.remove('sprint');
    this.knob.style.transform = '';
    this.base.style.transform = '';
    this.base.classList.add('idle');
  }

  private releaseAll(): void {
    if (this.stick) this.endStick();
    window.clearTimeout(this.holdTimer);
    window.clearTimeout(this.aimResetTimer);
    this.look = null;
    this.actionLook = null;
    // Only release mining this layer started (a finger on the world): the desktop mouse writes
    // the same flag and a window blur must not cancel its swing.
    const touchMining = this.ownsMining;
    this.endMining();
    if (touchMining) this.input.mining = false;
    if (this.input.actionHeld && this.actionBtn.classList.contains('pressed')) this.actions.action(false);
    this.input.jumpHeld = false;
    for (const b of this.el.querySelectorAll('.pressed')) b.classList.remove('pressed');
  }
}
