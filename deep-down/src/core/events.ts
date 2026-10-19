import type { ItemId } from '../config/items';
import type { RecipeId } from '../config/recipes';
import type { ExpeditionReport } from '../gameplay/Records';

/**
 * Every cross-system notification in the game. Systems never call each other's
 * presentation code directly (audio, UI, particles); they emit one of these.
 */
export interface GameEvents {
  'block:hit': { x: number; y: number; z: number; block: number; progress: number };
  'block:broken': { x: number; y: number; z: number; block: number };
  'block:tooHard': { x: number; y: number; z: number; block: number; requiredTier: number };
  'prop:hit': { propId: string; progress: number; x: number; y: number; z: number };
  'prop:broken': { propId: string; x: number; y: number; z: number };
  'tool:swing': { tier: number };
  /** sx, sy: the drop's point on screen (0..1 from the top left) when it flew in. */
  'item:picked': { item: ItemId; count: number; sx?: number; sy?: number };
  'item:rejected': { item: ItemId };
  'inventory:changed': Record<string, never>;
  'items:banked': { total: number; items: Partial<Record<ItemId, number>> };
  'craft:done': { recipe: RecipeId };
  'craft:failed': { recipe: RecipeId; reason: string };
  discovery: { id: string };
  'objective:changed': { id: string };
  'player:footstep': { block: number; speed: number };
  'player:jump': Record<string, never>;
  'player:land': { fallSpeed: number; block: number };
  'player:damaged': { amount: number; cause: 'fall' | 'hazard' | 'cold' };
  'player:died': { lost: Partial<Record<ItemId, number>> };
  'player:respawned': Record<string, never>;
  'camp:entered': Record<string, never>;
  'camp:left': Record<string, never>;
  'lantern:low': Record<string, never>;
  'lantern:empty': Record<string, never>;
  'lantern:refueled': Record<string, never>;
  'game:saved': { reason: string };
  'game:saveFailed': { reason: string };
  toast: { text: string; tone?: 'info' | 'warn' | 'good' };
  // Loop core (final pass W1).
  'expedition:started': { n: number };
  'expedition:ended': { report: ExpeditionReport };
  'cache:created': { x: number; y: number; z: number; count: number; replaced: number };
  'cache:recovered': { count: number; left: number };
  'lantern:turnBack': { seconds: number };
  /** One full interval of cold has bitten (the heartbeat / haptic moment). */
  'player:cold': { damage: number };
  'record:depth': { depth: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  off<K extends keyof E>(type: K, fn: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Handler<E[K]>)(payload);
      } catch (err) {
        // A failing listener (e.g. audio) must never break gameplay.
        console.error(`[events] handler for "${String(type)}" failed`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
