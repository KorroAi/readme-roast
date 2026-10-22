/** A block or minable prop locked by a tap: it is mined until it breaks, with nothing held. */
export type MineLock = { kind: 'block'; x: number; y: number; z: number } | { kind: 'prop'; id: string };

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
  /** Pause if playing, never resume (focus or pointer capture lost). Edge, cleared each frame. */
  pauseRequested: boolean;
  /** Which device produced the last meaningful input; drives on-screen hints. */
  lastDevice: 'touch' | 'mouse' | 'keyboard';
  /** A tap on the world this frame (touch), at (tapX, tapY) in NDC. Edge, cleared each frame. */
  tapPressed: boolean;
  tapX: number;
  tapY: number;
  /** The Mine button was pressed: lock onto the highlighted block. Edge, cleared each frame. */
  lockAssistPressed: boolean;
  /** Use a Flash Charge (its chip on touch, F on the keyboard). Edge, cleared each frame. */
  flashPressed: boolean;
  /** Tap to mine: the locked target (game/TapController), mined until it breaks. */
  lock: MineLock | null;
  /** Tap to walk: automatic movement, camera-relative like moveX/moveY; the stick overrides it. */
  autoMoveX: number;
  autoMoveY: number;
  // Round 3 (ui/hud/actions): the action layout.
  /** Sprint: the stick pushed to its edge, or Shift held. */
  sprint: boolean;
  /** The Action button or the left mouse button is held: mine or attack at the reticle. */
  actionHeld: boolean;
  /** The Action control went down this frame. Edge. */
  actionPressed: boolean;
  /** Dash (Ctrl, the Dash button). Edge. */
  dashPressed: boolean;
  /** Sonar pulse (Q, the Sonar button). Edge. */
  sonarPressed: boolean;
  /** Place the held placeable (right mouse button, the Place button). Edge. */
  placePressed: boolean;
  /** Hotbar slot chosen this frame (0-based), -1 none. Edge. */
  hotbarPressed: number;
  /** A menu screen asked for this frame (C, M, J, the HUD buttons), null none. Edge. */
  openRequest: 'crafting' | 'map' | 'quests' | 'bestiary' | 'settings' | null;
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
    pauseRequested: false,
    lastDevice: 'touch',
    tapPressed: false,
    tapX: 0,
    tapY: 0,
    lockAssistPressed: false,
    flashPressed: false,
    lock: null,
    autoMoveX: 0,
    autoMoveY: 0,
    sprint: false,
    actionHeld: false,
    actionPressed: false,
    dashPressed: false,
    sonarPressed: false,
    placePressed: false,
    hotbarPressed: -1,
    openRequest: null,
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
  s.pauseRequested = false;
  s.tapPressed = false;
  s.lockAssistPressed = false;
  s.flashPressed = false;
  s.actionPressed = false;
  s.dashPressed = false;
  s.sonarPressed = false;
  s.placePressed = false;
  s.hotbarPressed = -1;
  s.openRequest = null;
}
