import { CONTENT } from '../config/content';
import type { ItemId } from '../config/items';
import type { TextKey } from '../i18n';

/**
 * Hints for when the player is stuck (content, finished game). The objective line always says
 * what to do next; when it has not moved for CONTENT.stuckSeconds of play, a hint says how, once,
 * then again after CONTENT.stuckRepeatSeconds, at most CONTENT.stuckMaxHints times per objective.
 * Pure: game/Progression feeds it the Next line and the metres walked, and shows what it returns.
 */
export class StuckWatch {
  private id = '';
  private text = '';
  private timer = 0;
  private shown = 0;

  /**
   * @param nextId the Next line's id (gameplay/NextStep: an objective, craft:<node>, runes...)
   * @param nextText its text: a change of text (a count going up) is progress too
   * @param material the material the closest node is short of, if any
   * @returns the hint to show now, or null
   */
  update(dt: number, nextId: string, nextText: string, material: ItemId | null): TextKey | null {
    if (nextId !== this.id || nextText !== this.text) {
      this.id = nextId;
      this.text = nextText;
      this.timer = 0;
      this.shown = 0;
      return null;
    }
    if (!(dt > 0)) return null;
    this.timer += dt;
    if (this.shown >= CONTENT.stuckMaxHints) return null;
    const due = this.shown === 0 ? CONTENT.stuckSeconds : CONTENT.stuckSeconds + this.shown * CONTENT.stuckRepeatSeconds;
    if (this.timer < due) return null;
    this.shown++;
    return stuckKey(nextId, material);
  }

  /** Forget the clock (camp, a new game). */
  reset(): void {
    this.id = '';
    this.text = '';
    this.timer = 0;
    this.shown = 0;
  }
}

const OBJECTIVE_KEYS: Readonly<Record<string, TextKey>> = {
  look: 'stuck.look',
  walk: 'stuck.walk',
  mineStone: 'stuck.mineStone',
  findCopper: 'stuck.findCopper',
  returnToCamp: 'stuck.returnToCamp',
  recoverPack: 'stuck.returnToCamp',
  craftPickaxe: 'stuck.craftPickaxe',
  breakSeal: 'stuck.breakSeal',
  goDeeper: 'stuck.goDeeper',
  deeper: 'stuck.goDeeper',
  runes: 'stuck.runes',
  stone: 'stuck.runes',
};

/** What to say for a Next line that has not moved. */
export function stuckKey(nextId: string, material: ItemId | null): TextKey | null {
  if (nextId.startsWith('craft:')) return material ? (`stuck.material.${material}` as TextKey) : 'hint.workbench';
  if (nextId === 'beyond:glowroot') return 'stuck.beyond';
  return OBJECTIVE_KEYS[nextId] ?? null;
}
