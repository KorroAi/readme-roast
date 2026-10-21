import { B, BLOCKS } from '../config/blocks';
import { NODES } from '../config/recipes';
import type { GameEvents } from '../core/events';
import { t, type TextKey } from '../i18n';

/**
 * The first-expedition objective chain, shown one at a time on the HUD. It teaches by doing: the
 * first two steps are the controls (look round, walk), then the loop:
 *
 *   look → walk → mineStone → findCopper → returnToCamp → craftPickaxe → breakSeal → goDeeper
 *
 * After the last step the HUD shows the Next line (gameplay/NextStep) instead.
 *
 * Progress is stored as plain counters (stats), and each objective is a condition over them.
 * After every change the chain jumps to just past the furthest satisfied objective, so it can
 * never get stuck behind a step the player already did out of order (or in an older save).
 */

export type ObjectiveId = 'look' | 'walk' | 'mineStone' | 'findCopper' | 'returnToCamp' | 'craftPickaxe' | 'breakSeal' | 'goDeeper';

export const OBJECTIVE_CHAIN: readonly ObjectiveId[] = ['look', 'walk', 'mineStone', 'findCopper', 'returnToCamp', 'craftPickaxe', 'breakSeal', 'goDeeper'];

/** The control steps: degrees of turning, metres walked (content, finished game). */
export const TUTORIAL_NEED = { lookDegrees: 70, walkMetres: 5 } as const;

/** Targets match the Copper Pickaxe node (it makes pickaxe tier 2), so finishing the steps means it can be made. */
export const OBJECTIVE_NEED = {
  stone: NODES.copperPickaxe.inputs.stone ?? 12,
  copper: NODES.copperPickaxe.inputs.copperOre ?? 8,
} as const;

export interface ObjectiveView {
  id: ObjectiveId | 'findShrine' | 'done';
  text: string;
}

/** Serialized form (SaveData.objectives). */
export interface ObjectiveState {
  completed: string[];
  /** Current objective id, or null once the chain is complete. */
  current: string | null;
  stats: Record<string, number>;
}

/** Live totals the game knows better than the event stream (polled every frame). */
export interface ObjectiveTotals {
  /** Copper ore in backpack + camp storage. */
  copperOwned?: number;
  /** True while the player is inside the camp region. */
  atCamp?: boolean;
  pickaxeTier?: number;
  /** A touch screen (the steps say tap; otherwise click and keys). */
  touch?: boolean;
}

export type ObjectiveEventType = 'item:picked' | 'block:broken' | 'camp:entered' | 'craft:done' | 'discovery';

/** Progress counters persisted in SaveData.objectives.stats. */
const STATS = [
  'looked',
  'walked',
  'stoneMined',
  'stonePicked',
  'copperPicked',
  'returnedWithCopper',
  'craftedPickaxe',
  'sealBroken',
  'gateFound',
  'hollowFound',
  'shrineFound',
] as const;

type Stat = (typeof STATS)[number];

const DISCOVERY_STAT = new Map<string, Stat>([
  ['gate', 'gateFound'],
  ['hollow', 'hollowFound'],
  ['shrine', 'shrineFound'],
]);

export class Objectives {
  private readonly stats = new Map<Stat, number>();
  private index = 0;
  private copperOwned: number | null = null;
  private pickaxeTier = 1;
  private touch = true;
  // current() is read every frame by the HUD; rebuild its text only after a change.
  private view: ObjectiveView | null = null;
  private hint: ObjectiveView | null | undefined;

  constructor(state?: Partial<ObjectiveState> | null) {
    if (state && typeof state === 'object') this.restore(state);
    this.advance();
  }

  static fromJSON(x: unknown): Objectives {
    return new Objectives(x && typeof x === 'object' ? (x as Partial<ObjectiveState>) : null);
  }

  /** Feed a game event. @returns true if the current objective changed. */
  onEvent<K extends ObjectiveEventType>(type: K, payload: GameEvents[K]): boolean {
    switch (type) {
      case 'item:picked': {
        const { item, count } = payload as GameEvents['item:picked'];
        const n = count > 0 ? count : 0;
        if (item === 'stone') this.bump('stonePicked', n);
        else if (item === 'copperOre') this.bump('copperPicked', n);
        break;
      }
      case 'block:broken': {
        const { block } = payload as GameEvents['block:broken'];
        if (BLOCKS[block]?.drop?.item === 'stone') this.bump('stoneMined', 1);
        if (block === B.HARDENED_SLATE) this.bump('sealBroken', 1);
        break;
      }
      case 'camp:entered':
        this.checkReturn();
        break;
      case 'craft:done':
        if ((payload as GameEvents['craft:done']).recipe === 'copperPickaxe') this.bump('craftedPickaxe', 1);
        break;
      case 'discovery': {
        const stat = DISCOVERY_STAT.get((payload as GameEvents['discovery']).id);
        if (stat) this.bump(stat, 1);
        break;
      }
    }
    return this.advance();
  }

  /**
   * Update live totals. Passing `atCamp` lets "Return to camp" complete when the last copper
   * is picked up inside the camp, where no new camp entry will happen.
   * @returns true if the current objective changed.
   */
  setTotals(totals: ObjectiveTotals): boolean {
    const copper = totals.copperOwned;
    if (copper !== undefined && Number.isFinite(copper) && copper !== this.copperOwned) {
      this.copperOwned = Math.max(0, copper);
      this.view = null;
    }
    if (totals.pickaxeTier !== undefined) this.pickaxeTier = totals.pickaxeTier;
    if (totals.touch !== undefined && totals.touch !== this.touch) {
      this.touch = totals.touch;
      this.view = null;
    }
    if (totals.atCamp) this.checkReturn();
    return this.advance();
  }

  /**
   * The control steps (content): degrees the view turned and metres walked since the last call.
   * @returns true if the current objective changed.
   */
  noteControls(lookDegrees: number, walkMetres: number): boolean {
    if (this.index > 1) return false;
    if (lookDegrees > 0 && Number.isFinite(lookDegrees)) this.bump('looked', lookDegrees);
    if (walkMetres > 0 && Number.isFinite(walkMetres)) this.bump('walked', walkMetres);
    return this.advance();
  }

  get currentId(): ObjectiveId | 'done' {
    return OBJECTIVE_CHAIN[this.index] ?? 'done';
  }

  get done(): boolean {
    return this.index >= OBJECTIVE_CHAIN.length;
  }

  get completed(): readonly ObjectiveId[] {
    return OBJECTIVE_CHAIN.slice(0, this.index);
  }

  /**
   * What the HUD shows. While "Return to camp" is current but the player no longer owns
   * enough copper (spent or lost on death), it shows the copper count again instead.
   * The returned object is cached until something changes; do not mutate it.
   */
  current(): Readonly<ObjectiveView> {
    if (this.view) return this.view;
    const id = this.currentId;
    const copper = this.copperOwned;
    if (id === 'returnToCamp' && copper !== null && copper < OBJECTIVE_NEED.copper) {
      this.view = { id: 'findCopper', text: counted('objective.findCopper', copper, OBJECTIVE_NEED.copper) };
    } else if (id === 'look') {
      this.view = { id, text: t(this.touch ? 'objective.look' : 'objective.lookDesktop') };
    } else if (id === 'walk') {
      this.view = { id, text: t(this.touch ? 'objective.walk' : 'objective.walkDesktop') };
    } else if (id === 'mineStone') {
      this.view = { id, text: counted(this.touch ? 'objective.mineStoneTap' : 'objective.mineStone', this.stoneProgress(), OBJECTIVE_NEED.stone) };
    } else if (id === 'findCopper') {
      this.view = { id, text: counted('objective.findCopper', this.copperProgress(), OBJECTIVE_NEED.copper) };
    } else if (id === 'done') {
      // The chain is over: the HUD shows the Next line instead (gameplay/NextStep).
      this.view = { id, text: '' };
    } else {
      this.view = { id, text: t(`objective.${id}` as TextKey) };
    }
    return this.view;
  }

  /** The chain's current step, or null once it is complete (the Next line takes over). */
  step(): Readonly<ObjectiveView> | null {
    return this.done ? null : this.current();
  }

  /** Optional side objective outside the chain: hint at the shrine once the Hollow is found. */
  sideHint(): Readonly<ObjectiveView> | null {
    if (this.hint === undefined) {
      this.hint = this.stat('hollowFound') > 0 && this.stat('shrineFound') === 0 ? { id: 'findShrine', text: t('objective.findShrine') } : null;
    }
    return this.hint;
  }

  toJSON(): ObjectiveState {
    const stats: Record<string, number> = {};
    for (const [k, v] of this.stats) if (v > 0) stats[k] = v;
    return { completed: [...this.completed], current: this.done ? null : this.currentId, stats };
  }

  private restore(state: Partial<ObjectiveState>): void {
    const raw = state.stats && typeof state.stats === 'object' ? state.stats : {};
    for (const k of STATS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) this.stats.set(k, v);
    }
    const completed = new Set(Array.isArray(state.completed) ? state.completed : []);
    const saved = OBJECTIVE_CHAIN.indexOf(state.current as ObjectiveId);
    let firstOpen = OBJECTIVE_CHAIN.findIndex((id) => !completed.has(id));
    if (firstOpen < 0) firstOpen = OBJECTIVE_CHAIN.length;
    // A save from before the control steps existed: its finished chain never listed them, so
    // resume past the furthest step it completed (a finished chain stays finished).
    let furthest = -1;
    for (const id of completed) furthest = Math.max(furthest, OBJECTIVE_CHAIN.indexOf(id as ObjectiveId));
    if (saved < 0 && furthest >= 0) firstOpen = Math.max(firstOpen, furthest + 1);
    this.index = saved >= 0 ? saved : firstOpen;
  }

  private stat(k: Stat): number {
    return this.stats.get(k) ?? 0;
  }

  private bump(k: Stat, n: number): void {
    if (n <= 0) return;
    this.stats.set(k, this.stat(k) + n);
    this.view = null;
    this.hint = undefined;
  }

  /** Called while the player is at camp. Banking moves copper between bags but never changes the total. */
  private checkReturn(): void {
    if (this.stat('returnedWithCopper') === 0 && (this.copperOwned ?? 0) >= OBJECTIVE_NEED.copper) this.bump('returnedWithCopper', 1);
  }

  private stoneProgress(): number {
    return Math.max(this.stat('stoneMined'), this.stat('stonePicked'));
  }

  private copperProgress(): number {
    return Math.max(this.stat('copperPicked'), this.copperOwned ?? 0);
  }

  private satisfied(id: ObjectiveId): boolean {
    switch (id) {
      case 'look':
        return this.stat('looked') >= TUTORIAL_NEED.lookDegrees;
      case 'walk':
        return this.stat('walked') >= TUTORIAL_NEED.walkMetres;
      case 'mineStone':
        return this.stoneProgress() >= OBJECTIVE_NEED.stone;
      case 'findCopper':
        return this.copperProgress() >= OBJECTIVE_NEED.copper;
      case 'returnToCamp':
        return this.stat('returnedWithCopper') > 0;
      case 'craftPickaxe':
        return this.stat('craftedPickaxe') > 0 || this.pickaxeTier >= 2;
      case 'breakSeal':
        return this.stat('sealBroken') > 0;
      case 'goDeeper':
        return this.stat('gateFound') > 0;
    }
  }

  /** Jump past the furthest satisfied objective. @returns true if the current one changed. */
  private advance(): boolean {
    for (let i = OBJECTIVE_CHAIN.length - 1; i >= this.index; i--) {
      if (!this.satisfied(OBJECTIVE_CHAIN[i])) continue;
      this.index = i + 1;
      this.view = null;
      return true;
    }
    return false;
  }
}

function counted(key: TextKey, have: number, need: number): string {
  return t(key, { have: Math.min(have, need), need });
}
