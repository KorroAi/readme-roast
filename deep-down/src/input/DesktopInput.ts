import type { InputState } from './types';

/**
 * Keyboard + mouse controls for desktop play and development (round 3, BRIEF §0.6):
 *   WASD / arrows move, Shift sprints, Ctrl dashes, Space jumps, Q sonar, E interacts, F flash,
 *   1-6 pick a hotbar slot, I or Tab the Bag, C Craft, M Map, J Quests, B Bestiary, Esc pauses.
 *   Click the canvas to capture the mouse (pointer lock); then the left button is the Action (hold
 *   it to mine or strike what the reticle is on; it throws, places or uses what the hotbar holds) and
 *   the right button places the held torch, block, ladder or rope. Without
 *   pointer lock, hold left to mine under the cursor, drag with the right button to look, and a
 *   right click without a drag places.
 */
export class DesktopInput {
  enabled = true;
  private readonly keys = new Set<string>();
  private rightDrag = false;
  private wasLocked = false;
  /** The game itself released the pointer (opening a screen): not a reason to pause. */
  private expectRelease = false;
  /** When an unexpected unlock paused the game (ms); an Esc keydown right after is the same press. */
  private unlockPauseAt = -1e9;
  private lastX = 0;
  private lastY = 0;
  /** The right button went down here and has not dragged (a click places). */
  private rightDownAt: { x: number; y: number } | null = null;
  private readonly disposers: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement, private readonly input: InputState) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement | Document, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e) => this.onKey(e, true));
    on(window, 'keyup', (e) => this.onKey(e, false));
    on(window, 'blur', () => {
      this.keys.clear();
      this.input.mining = false;
      this.input.actionHeld = false;
      this.input.jumpHeld = false;
      this.rightDrag = false;
      this.updateMove();
    });
    // Once the pointer is captured, aim from the crosshair (the click that captured it set a cursor aim).
    // Losing the capture without the game asking for it (the browser takes Esc to release it, or
    // the window loses focus) pauses, so the first Esc while captured still pauses.
    const onLock = () => {
      if (this.pointerLocked) {
        this.wasLocked = true;
        this.input.aimX = 0;
        this.input.aimY = 0;
        this.input.aimFromPointer = false;
      } else {
        if (this.wasLocked && !this.expectRelease && this.enabled) {
          this.input.pauseRequested = true;
          this.unlockPauseAt = performance.now();
        }
        this.wasLocked = false;
        this.expectRelease = false;
        this.input.mining = false;
        this.input.actionHeld = false;
      }
    };
    document.addEventListener('pointerlockchange', onLock);
    this.disposers.push(() => document.removeEventListener('pointerlockchange', onLock));
    on(canvas, 'mousedown', (e) => this.onMouseDown(e));
    on(window, 'mouseup', (e) => this.onMouseUp(e));
    on(window, 'mousemove', (e) => this.onMouseMove(e));
    on(canvas, 'contextmenu', (e) => e.preventDefault());
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  releasePointer(): void {
    if (this.pointerLocked) {
      this.expectRelease = true;
      document.exitPointerLock();
    }
    this.input.mining = false;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    const k = e.code;
    if (down) {
      if (k === 'Space') {
        if (!e.repeat) this.input.jumpPressed = true;
        this.input.jumpHeld = true;
        e.preventDefault();
      } else if (k === 'KeyE' && !e.repeat) this.input.interactPressed = true;
      else if (k === 'KeyF' && !e.repeat) this.input.flashPressed = true;
      else if (k === 'KeyQ' && !e.repeat) this.input.sonarPressed = true;
      else if ((k === 'ControlLeft' || k === 'ControlRight') && !e.repeat) {
        this.input.dashPressed = true;
        e.preventDefault();
      } else if (/^Digit[1-6]$/.test(k) && !e.repeat) this.input.hotbarPressed = Number(k.slice(5)) - 1;
      else if (k === 'KeyC' && !e.repeat && !e.ctrlKey && !e.metaKey) this.input.openRequest = 'crafting';
      else if (k === 'KeyM' && !e.repeat) this.input.openRequest = 'map';
      else if (k === 'KeyJ' && !e.repeat) this.input.openRequest = 'quests';
      else if (k === 'KeyB' && !e.repeat) this.input.openRequest = 'bestiary';
      else if ((k === 'KeyI' || k === 'Tab') && !e.repeat) {
        this.input.inventoryPressed = true;
        e.preventDefault();
      } else if (k === 'Escape' && !e.repeat && performance.now() - this.unlockPauseAt > 400) this.input.pausePressed = true;
      this.keys.add(k);
    } else {
      if (k === 'Space') this.input.jumpHeld = false;
      this.keys.delete(k);
    }
    this.input.lastDevice = 'keyboard';
    this.updateMove();
  }

  /** Shift held: sprint (only while moving). */
  private get sprintHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  private updateMove(): void {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (f === 0 && r === 0 && this.input.lastDevice === 'touch') return; // don't stomp the joystick
    this.input.moveX = r;
    this.input.moveY = f;
    this.input.sprint = this.sprintHeld && (f !== 0 || r !== 0);
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled || (e as PointerEvent).pointerType === 'touch') return;
    this.input.lastDevice = 'mouse';
    if (e.button === 0) {
      // With the pointer captured the left button is the Action (mine, strike, throw, place or use
      // what the reticle is on, as the touch button does); free, it mines under the cursor.
      if (this.pointerLocked) {
        this.input.actionHeld = true;
        this.input.actionPressed = true;
        return;
      }
      if (matchMedia('(pointer: fine)').matches) this.canvas.requestPointerLock?.();
      this.input.mining = true;
      this.setAim(e);
    } else if (e.button === 2) {
      // With the pointer captured the right button places at once; free, it places on a click
      // and looks on a drag.
      if (this.pointerLocked) {
        this.input.placePressed = true;
        return;
      }
      this.rightDrag = true;
      this.rightDownAt = { x: e.clientX, y: e.clientY };
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.input.mining = false;
      this.input.actionHeld = false;
    }
    if (e.button === 2) {
      this.rightDrag = false;
      const d = this.rightDownAt;
      this.rightDownAt = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) this.input.placePressed = true;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.enabled) return;
    if (this.pointerLocked) {
      this.input.lookDX += e.movementX;
      this.input.lookDY += e.movementY;
      this.input.lastDevice = 'mouse';
      return;
    }
    if (this.rightDrag && (e.buttons & 2) === 0) this.rightDrag = false;
    if (this.rightDrag) {
      this.input.lookDX += e.clientX - this.lastX;
      this.input.lookDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
    if (this.input.mining) this.setAim(e);
  }

  private setAim(e: MouseEvent): void {
    if (this.pointerLocked) {
      this.input.aimX = 0;
      this.input.aimY = 0;
      this.input.aimFromPointer = false;
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    this.input.aimX = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.input.aimY = -(((e.clientY - r.top) / r.height) * 2 - 1);
    this.input.aimFromPointer = true;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}
