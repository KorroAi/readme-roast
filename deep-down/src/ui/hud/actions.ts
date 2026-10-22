/**
 * Round 3 seam (UI): the one action API every button, key and gesture drives.
 *
 * - The touch layout (ui/TouchControls: joystick, drag to look, Action, Jump, Dash, Interact, Sonar,
 *   Place, the hotbar and the top-bar menu buttons) and the desktop keys (input/DesktopInput) call
 *   these, and nothing else. Each call writes the device-independent InputState (input/types) that
 *   the simulation reads once per frame (game/Game.updatePlaying), so a key, a button and a test
 *   drive exactly the same path.
 * - `UiHighlighter.highlight(id)` rings one control for the tutorial (LOOP owns the steps and
 *   names the control by its `UiTargetId`; UI draws the ring and the short line). Every control
 *   carries `data-ui-target="<id>"` in the DOM, which e2e tests and captures can use too.
 * - 'ui:used' (game/fp/events) is emitted when a control is used, so the taught-by-doing tutorial
 *   can advance on it (look and move at most a few times a second).
 */
import type { InputState } from '../../input/types';

/** Screens the HUD buttons, the keys (I/C/M/J, Esc) and the tutorial can open. */
export type MenuScreen = 'inventory' | 'crafting' | 'map' | 'quests' | 'bestiary' | 'settings' | 'pause';

export const MENU_SCREENS: readonly MenuScreen[] = ['inventory', 'crafting', 'map', 'quests', 'bestiary', 'settings', 'pause'];

/** Hotbar slots (BRIEF §0.6: pick, weapon, bombs, torches, food, one free). */
export const HOTBAR_SLOTS = 6;

/**
 * Every control the tutorial can point at (the `highlight` id of a LOOP tutorial step). The DOM
 * element of each carries `data-ui-target` with this id. `hotbar:N` is slot N (0-based).
 */
export type UiTargetId =
  // the right-thumb buttons and the gestures
  | 'joystick'
  | 'look'
  | 'action'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'sonar'
  | 'place'
  | 'reticle'
  // the bottom hotbar
  | 'hotbar'
  | 'hotbar:0'
  | 'hotbar:1'
  | 'hotbar:2'
  | 'hotbar:3'
  | 'hotbar:4'
  | 'hotbar:5'
  // the top HUD
  | 'health'
  | 'flame'
  | 'depth'
  | 'minimap'
  | 'tracker'
  | 'compass'
  | 'bag'
  | 'craft'
  | 'map'
  | 'quests'
  | 'menu'
  | 'companion';

export const UI_TARGETS: readonly UiTargetId[] = [
  'joystick', 'look', 'action', 'jump', 'dash', 'interact', 'sonar', 'place', 'reticle',
  'hotbar', 'hotbar:0', 'hotbar:1', 'hotbar:2', 'hotbar:3', 'hotbar:4', 'hotbar:5',
  'health', 'flame', 'depth', 'minimap', 'tracker', 'compass', 'bag', 'craft', 'map', 'quests', 'menu', 'companion',
];

export function isUiTarget(id: string): id is UiTargetId {
  return (UI_TARGETS as readonly string[]).includes(id);
}

/** What a control did, for the tutorial ('ui:used'). */
export type UiControl = 'look' | 'move' | 'sprint' | 'action' | 'jump' | 'dash' | 'interact' | 'sonar' | 'place' | 'hotbar' | 'open';

/**
 * The player's actions. Buttons, keys and gestures call these; they only write InputState.
 * Edge actions (jump, dash, interact, sonar, place, hotbar, open) are consumed after one frame.
 */
export interface PlayerActions {
  /** Movement intent in [-1, 1] (+y forward, +x right, relative to the view); `sprint` at the stick's edge or Shift. */
  move(x: number, y: number, sprint?: boolean): void;
  /** Add a look delta in CSS pixels (scaled by the look sensitivity in the camera). */
  look(dx: number, dy: number): void;
  /** The Action button (or the left mouse button) is held: mine or attack what the reticle is on. */
  action(down: boolean): void;
  /** Jump (held for the variable jump; `down` false releases it). */
  jump(down?: boolean): void;
  /** A short dodge with brief invulnerability (on a cooldown, game/fp/Dash). */
  dash(): void;
  /** Use the contextual target (chest, station, being, door, rope...). */
  interact(): void;
  /** The lantern pulse: reveals ores, chests and lairs through rock for 2 s (on a cooldown). */
  sonar(): void;
  /** Place the hotbar's block, torch, ladder or rope on the face under the reticle. */
  place(): void;
  /** Select hotbar slot i (0-based). */
  hotbar(i: number): void;
  /** Open a menu screen. */
  open(screen: MenuScreen): void;
}

/** The tutorial's ring on one control (null clears it); `line` is the short instruction shown by it. */
export interface UiHighlighter {
  highlight(target: UiTargetId | null, line?: string | null): void;
}

/** The PlayerActions over an InputState (the only implementation: every device goes through it). */
export function createPlayerActions(input: InputState): PlayerActions {
  return {
    move(x, y, sprint = false) {
      input.moveX = clamp1(x);
      input.moveY = clamp1(y);
      input.sprint = sprint && (x !== 0 || y !== 0);
    },
    look(dx, dy) {
      if (Number.isFinite(dx)) input.lookDX += dx;
      if (Number.isFinite(dy)) input.lookDY += dy;
    },
    action(down) {
      input.actionHeld = down;
      if (down) input.actionPressed = true;
    },
    jump(down = true) {
      if (down) input.jumpPressed = true;
      input.jumpHeld = down;
    },
    dash() {
      input.dashPressed = true;
    },
    interact() {
      input.interactPressed = true;
    },
    sonar() {
      input.sonarPressed = true;
    },
    place() {
      input.placePressed = true;
    },
    hotbar(i) {
      if (Number.isInteger(i) && i >= 0 && i < HOTBAR_SLOTS) input.hotbarPressed = i;
    },
    open(screen) {
      if (screen === 'inventory') input.inventoryPressed = true;
      else if (screen === 'pause') input.pausePressed = true;
      else input.openRequest = screen;
    },
  };
}

function clamp1(v: number): number {
  return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}
