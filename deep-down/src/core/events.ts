// The generic, typed event bus. The idle model's events (IdleEvents) live in src/idle/bus.ts; the shell's own
// (saved, toast, mode) in src/game/IdleGame.ts. Listeners never break the emitter: a failing handler is logged.
// `emit` allocates nothing (handlers are kept in arrays rebuilt only when a listener is added or removed).

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Array<Handler<never>>>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    const list = this.handlers.get(type);
    // Copy on write: an emit in progress keeps iterating the old array.
    this.handlers.set(type, list ? [...list, fn as Handler<never>] : [fn as Handler<never>]);
    return () => this.off(type, fn);
  }

  off<K extends keyof E>(type: K, fn: Handler<E[K]>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const next = list.filter((h) => h !== (fn as Handler<never>));
    if (next.length) this.handlers.set(type, next);
    else this.handlers.delete(type);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        (list[i] as Handler<E[K]>)(payload);
      } catch (err) {
        // A failing listener (e.g. audio) must never break the game.
        console.error(`[events] handler for "${String(type)}" failed`, err);
      }
    }
  }

  /** True when someone listens to `type`. */
  has(type: keyof E): boolean {
    return this.handlers.has(type);
  }

  clear(): void {
    this.handlers.clear();
  }
}
