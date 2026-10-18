import type { TextKey } from '../i18n';
import type { ItemId } from './items';

export type RecipeId = 'copperPickaxe' | 'copperLantern' | 'sturdyPack';

export type EquipmentSlot = 'pickaxe' | 'lantern' | 'pack';

export interface RecipeDef {
  id: RecipeId;
  name: TextKey;
  /** Equipment upgrade produced by the recipe. */
  result: { slot: EquipmentSlot; tier: number };
  inputs: Partial<Record<ItemId, number>>;
  /** Recipes listed in this order at the Workbench. */
  order: number;
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  copperPickaxe: {
    id: 'copperPickaxe',
    name: 'recipe.copperPickaxe',
    result: { slot: 'pickaxe', tier: 2 },
    inputs: { copperOre: 8, stone: 12 },
    order: 0,
  },
  sturdyPack: {
    id: 'sturdyPack',
    name: 'recipe.sturdyPack',
    result: { slot: 'pack', tier: 2 },
    inputs: { stone: 16, copperOre: 4 },
    order: 1,
  },
  copperLantern: {
    id: 'copperLantern',
    name: 'recipe.copperLantern',
    result: { slot: 'lantern', tier: 2 },
    inputs: { copperOre: 6, glimmerShard: 3 },
    order: 2,
  },
};

export const RECIPE_LIST: readonly RecipeDef[] = Object.values(RECIPES).sort((a, b) => a.order - b.order);
