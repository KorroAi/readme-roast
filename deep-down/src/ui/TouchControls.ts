import { t } from '../i18n';
import type { InputState } from '../input/types';
import { h } from './dom';
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

/**
 * First-person touch controls, one thumb first:
 * - tap the world: game/TapController mines the tapped block to the end, walks to tapped ground,
 *   or walks to a tapped object and uses it (a tap on nothing turns the view toward it);
 * - drag anywhere: look;
 * - hold still on a block: mine at the finger, on to the next block of the same kind;
 * - an optional floating joystick in the lower part of the left third (right third left-handed),
 *   shown only where the thumb lands;
 * - a Use chip when something usable is near. The bag and the menu are HUD plates.
 * Writes only InputState.
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
  private ownsMining = false;
  /** A held Mine control (none in first person; kept so a blur releases any mining this layer started). */
  private mineHeld = false;
  private holdTimer = 0;
  private tapTimer = 0;
  private aimResetTimer = 0;
  private radius = 60;
  private readonly stickOut: StickOutput = { x: 0, y: 0, knobX: 0, knobY: 0 };
  private readonly ndc = { x: 0, y: 0 };
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly useBtn: HTMLButtonElement;
  private readonly useLabel: HTMLElement;
  private useText: string | null = null;
  private readonly disposers: Array<() => void> = [];

  constructor(private readonly root: HTMLElement, private readonly input: InputState) {
    this.knob = h('div', { class: 'dd-stick-knob' });
    this.base = h('div', { class: 'dd-stick idle', 'aria-hidden': 'true' }, this.knob);
    this.ring = h('div', { class: 'dd-mine-ring', 'aria-hidden': 'true' });
    this.useLabel = h('span', { class: 'dd-use-label' });
    this.useBtn = this.button('dd-tbtn dd-use', [h('span', { class: 'dd-use-key', text: t('hud.interact') }), this.useLabel], () => {
      input.interactPressed = true;
    });
    this.useBtn.hidden = true;
    // First person: no Mine or Jump buttons (a tap mines, holding mines on, ledges are stepped up
    // on their own); the bag and the menu are plates of the HUD's top bar.
    this.el = h(
      'div',
      { class: 'dd-touch dd-fp' },
      this.base,
      this.ring,
      h('div', { class: 'dd-action-cluster' }, this.useBtn),
    );
    root.appendChild(this.el);
    this.sizeStick(window.innerWidth, window.innerHeight);
    this.wire(root);
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

  /** Show the Use button with a contextual label (e.g. "Workbench"), or hide it. */
  setInteractVisible(label: string | null): void {
    if (label === this.useText) return;
    this.useText = label;
    this.useBtn.hidden = label === null;
    if (label !== null) this.useLabel.textContent = label;
  }

  dispose(): void {
    this.releaseAll();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.el.remove();
  }

  // ------------------------------------------------------------------------------------

  private button(cls: string, content: HTMLElement[], press: () => void, release?: () => void): HTMLButtonElement {
    const b = h('button', { class: cls, type: 'button' }, ...content);
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
    return b;
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
      this.showRing(e.clientX, e.clientY, 'pending');
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
      this.input.lookDX += x - (prev === 'pending' ? look.startX : look.lastX);
      this.input.lookDY += y - (prev === 'pending' ? look.startY : look.lastY);
      if (prev === 'pending') this.hideRing();
    } else if (look.phase === 'mine') {
      if (prev === 'pending') this.beginMine();
      this.aimAt(x, y);
      this.moveRing(x, y);
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
      this.flashRing();
    } else {
      if (action === 'endMine') this.endMining();
      this.hideRing();
    }
    if (action !== 'none') this.scheduleAimReset();
  }

  /**
   * After mining at a finger, hand the aim back to aim assist once the swing has landed, so the
   * highlighted block (and the Mine button) follow the view again.
   */
  private scheduleAimReset(): void {
    window.clearTimeout(this.aimResetTimer);
    this.aimResetTimer = window.setTimeout(() => {
      if (!this.look && !this.mineHeld && !this.input.mining) this.input.aimFromPointer = false;
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
    window.clearTimeout(this.tapTimer);
    this.input.mining = true;
    this.input.aimFromPointer = true;
    this.ownsMining = true;
    this.ring.className = 'dd-mine-ring on mine';
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
   * Stop mining. The aim stays at the last finger position: a swing already in flight
   * re-acquires its target at the impact frame, and must find the block that was touched.
   */
  private endMining(): void {
    window.clearTimeout(this.tapTimer);
    if (this.look?.phase === 'mine' || !this.ownsMining) return;
    this.ownsMining = false;
    if (!this.mineHeld) this.input.mining = false;
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
    const out = joystick(x - s.baseX, y - s.baseY, this.stickOut, this.radius);
    this.input.moveX = out.x;
    this.input.moveY = out.y;
    this.knob.style.transform = `translate3d(${out.knobX}px, ${out.knobY}px, 0)`;
  }

  private endStick(): void {
    this.stick = null;
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.knob.style.transform = '';
    this.base.style.transform = '';
    this.base.classList.add('idle');
  }

  private releaseAll(): void {
    if (this.stick) this.endStick();
    window.clearTimeout(this.holdTimer);
    window.clearTimeout(this.aimResetTimer);
    this.look = null;
    // Only release mining this layer started (the Mine button or a finger on the world): the
    // desktop mouse writes the same flag and a window blur must not cancel its swing.
    const touchMining = this.mineHeld || this.ownsMining;
    this.mineHeld = false;
    this.endMining();
    if (touchMining) this.input.mining = false;
    this.hideRing();
    this.input.jumpHeld = false;
    for (const b of this.el.querySelectorAll('.pressed')) b.classList.remove('pressed');
  }

  private showRing(x: number, y: number, state: 'pending'): void {
    this.moveRing(x, y);
    this.ring.className = `dd-mine-ring on ${state}`;
  }

  private moveRing(x: number, y: number): void {
    this.ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  private flashRing(): void {
    this.ring.className = 'dd-mine-ring on tap';
  }

  private hideRing(): void {
    this.ring.className = 'dd-mine-ring';
  }
}
