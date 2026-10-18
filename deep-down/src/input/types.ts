/**
 * Device-independent input for one frame. Touch controls (ui/TouchControls) and desktop
 * controls (input/DesktopInput) both write into the same InputState; gameplay only reads it.
 */
export interface InputState {
  /** Movement intent in [-1, 1]; +y = forward, +x = right (relative to the camera). */
  moveX: number;
  moveY: number;
  /** Camera look delta accumulated this frame, in CSS pixels (scaled by sensitivity in the camera). */
  lookDX: number;
  lookDY: number;
  /** Mining is held. */
  mining: boolean;
  /** Where mining aims, in normalized device coordinates [-1, 1] (0,0 = screen center). */
  aimX: number;
  aimY: number;
  /** True when aim comes from a pointer position (touch / mouse) rather than the crosshair. */
  aimFromPointer: boolean;
  /** Edge-triggered actions: set true for one frame, cleared by consumeEdges(). */
  jumpPressed: boolean;
  jumpHeld: boolean;
  interactPressed: boolean;
  inventoryPressed: boolean;
  pausePressed: boolean;
  /** Which device produced the last meaningful input; drives on-screen hints. */
  lastDevice: 'touch' | 'mouse' | 'keyboard';
}

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    mining: false,
    aimX: 0,
    aimY: 0,
    aimFromPointer: false,
    jumpPressed: false,
    jumpHeld: false,
    interactPressed: false,
    inventoryPressed: false,
    pausePressed: false,
    lastDevice: 'touch',
  };
}

/** Clear per-frame deltas and edge-triggered flags after gameplay has consumed them. */
export function consumeEdges(s: InputState): void {
  s.lookDX = 0;
  s.lookDY = 0;
  s.jumpPressed = false;
  s.interactPressed = false;
  s.inventoryPressed = false;
  s.pausePressed = false;
}
