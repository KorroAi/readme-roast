import type { InputState } from './types';

/**
 * Keyboard + mouse controls for desktop play and development.
 *   WASD / arrows move, Space jumps, E interacts, I or Tab opens the bag, Esc pauses.
 *   Click the canvas to capture the mouse (pointer lock); hold the left button to mine the
 *   block under the crosshair. Without pointer lock, hold left to mine under the cursor and
 *   drag with the right button to look.
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

  private updateMove(): void {
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (f === 0 && r === 0 && this.input.lastDevice === 'touch') return; // don't stomp the joystick
    this.input.moveX = r;
    this.input.moveY = f;
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.enabled || (e as PointerEvent).pointerType === 'touch') return;
    this.input.lastDevice = 'mouse';
    if (e.button === 0) {
      if (!this.pointerLocked && matchMedia('(pointer: fine)').matches) {
        this.canvas.requestPointerLock?.();
      }
      this.input.mining = true;
      this.setAim(e);
    } else if (e.button === 2) {
      this.rightDrag = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.input.mining = false;
    if (e.button === 2) this.rightDrag = false;
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
