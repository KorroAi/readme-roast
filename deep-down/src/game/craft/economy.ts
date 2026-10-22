import { ITEMS, type BiomeKey, type ItemId } from '../../config/items';
import { RECIPES, recipeInputs, recipesFor, type Recipe } from '../../config/recipes';
import { STATIONS } from '../../config/stations';
import { WEAPONS, dps, type WeaponId } from '../../config/weapons';
import { pickaxeForTier, STRATA_GEN } from '../../config/balance';
import { GUARDIAN_LOOT, NEXT_PICK, STARTER_KIT, STRATUM_BIOMES } from '../../config/quests';
import { lootFor, type ChestKind } from '../../config/loot';
import { Rng } from '../../core/rng';

/**
 * The economy and quest simulation (round 3, LOOP; BRIEF §3 "Proof"): a new explorer descends the
 * six strata following the plan below with the recipes as written, gathering what the strata
 * actually offer (measured from WORLD's generator by tools/loop-economy.ts: sight-minable ore
 * blocks, chests, rosters), and the clock runs on the game's own numbers (walk speed, pick power
 * and swing, weapon damage, guardian health). It answers two questions per stratum: can the plan
 * be made from what is there (and from what was banked above), and how long does it take
 * (target: 15–25 minutes per stratum).
 *
 * The model is deterministic (expected values, chest loot averaged over many rolls). The explorer
 * walks a share φ of the stratum's tunnels (WORLD places a chest about every 25 m of walked tunnel,
 * so the tunnel length is chests × 25 m), mines the ores it passes that its pick can break, opens
 * the chests, fights what it meets (an encounter every 30 s of walking), and walks on until the
 * plan's materials are in. Then both guardians, the crafts, and the gate.
 */

export type Counts = Partial<Record<ItemId, number>>;

export interface OreSupply {
  item: ItemId;
  biome: BiomeKey;
  /** The pick tier it needs, and its hardness (pick-power units). */
  tier: number;
  hardness: number;
  /** Sight-minable blocks in the stratum (within reach of a walkable cell). */
  blocks: number;
  /** Mean items one block drops. */
  perBlock: number;
  /** Mean loose stone one block adds (config/loot BONUS_DROPS). */
  stone: number;
}

export interface CreatureSupply {
  kind: string;
  hp: number;
  /** Relative spawn weight in its biome. */
  weight: number;
  /** Mean pack size (creatures per encounter). */
  pack: number;
  drops: Counts;
}

export interface StratumSupply {
  stratum: number;
  /** Reachable floor cells (for the record) and the tunnel length the chests imply (m). */
  floorCells: number;
  tunnelMetres: number;
  ores: OreSupply[];
  chests: Array<{ kind: ChestKind; tier: number; biome: BiomeKey }>;
  creatures: CreatureSupply[];
  guardians: Array<{ biome: BiomeKey; kind: string; hp: number; drops: Counts }>;
}

/** The game's pace, in one place (seconds and metres; see the file comment). */
export const PACE = {
  /** Walking while exploring, looking round and climbing (the walk is 4.2 m/s, the sprint 6.5). */
  exploreSpeed: 2.4,
  /**
   * Blocks an explorer mines anyway per metre walked (it is the game: a vein every 15-20 m), spread
   * over the ores passed; a budget of time, not a share of the veins, so denser strata do not make the
   * walk longer. At most `mineShare` of the blocks passed are in reach of a pick swing.
   */
  mineAnywayPerMetre: 0.22,
  mineShare: 0.8,
  /** Per block mined: aiming and stepping to the next one (s). */
  blockOverhead: 0.45,
  /** The action layer's base swing tempo (×0.8 of the pick's swing interval). */
  swingTempo: 0.8,
  /** A creature encounter every this many seconds of walking (BRIEF §0.6: 20–40 s in the deep). */
  encounterSeconds: 30,
  /** Per fight: the approach and the dodges beside the blows (s). */
  fightOverhead: 3,
  /** A guardian fight: the share of the time the blows land (dodging the telegraphs), plus the walk in. */
  guardianUptime: 0.5,
  guardianWalkIn: 40,
  /** Per chest: walking to it and opening it (s). */
  chestSeconds: 3,
  /** Per stratum: trips to the stations and the bank, menus, the gate's lift (s). */
  stratumOverhead: 150,
  /** The first stratum's tutorial (about 5 minutes, BRIEF §0.7). */
  tutorialSeconds: 300,
  /**
   * The share of a stratum's tunnels a new explorer walks anyway, finding both lairs and the gate
   * (sonar, Halden's pages, walking deep into each biome): what is gathered on that walk pays for
   * the plan's extras.
   */
  exploreShare: 0.35,
} as const;

/**
 * A step of the plan: what the explorer makes in a stratum (gear once, consumables by count).
 * `make` is needed to go on (stations, the next pick, the weapon band, the hazard's armour and
 * wards); `extra` is made when the stratum's walk has paid for it.
 */
export interface PlanStep {
  stratum: number;
  make: ReadonlyArray<readonly [ItemId, number]>;
  extra?: ReadonlyArray<readonly [ItemId, number]>;
}

/**
 * The descent as a new player is guided through it (the quests' "prepare" step, the arrival cards'
 * gear, the hints): per stratum, the stations and the outpost for it, the weapon band, the armour
 * for its hazard, light and room, the food and wards it eats, and the next pick for the gate.
 */
export const DESCENT_PLAN: readonly PlanStep[] = [
  {
    stratum: 1,
    make: [['torch', 12], ['furnace', 1], ['forge', 1], ['machete', 1], ['copperPick', 1]],
    extra: [['sling', 1], ['minerHelmet', 1], ['minerVest', 1], ['minerBoots', 1], ['bandage', 4]],
  },
  {
    stratum: 2,
    make: [['outpostKit', 1], ['furnace', 1], ['forge', 1], ['torch', 12], ['ironPick', 1]],
    extra: [['alchemyTable', 1], ['healingDraught', 3], ['sturdyPack', 1], ['copperLantern', 1], ['spear', 1], ['rope', 4]],
  },
  {
    stratum: 3,
    make: [['outpostKit', 1], ['furnace', 1], ['forge', 1], ['sword', 1], ['crystalPick', 1]],
    extra: [['crossbow', 1], ['crystalLantern', 1], ['expeditionPack', 1], ['healingDraught', 3], ['blastBomb', 4]],
  },
  {
    stratum: 4,
    make: [['outpostKit', 1], ['furnace', 1], ['forge', 1], ['alchemyTable', 1], ['furHood', 1], ['furCoat', 1], ['furBoots', 1], ['warmingTonic', 4], ['coldsteelPick', 1]],
    extra: [['crystalSpear', 1], ['glowLantern', 1], ['deepPack', 1], ['healingDraught', 2]],
  },
  {
    stratum: 5,
    make: [['outpostKit', 1], ['furnace', 1], ['forge', 1], ['alchemyTable', 1], ['bogMask', 1], ['bogCoat', 1], ['bogBoots', 1], ['antidote', 4], ['greatAxe', 1], ['sunmetalPick', 1]],
    extra: [['sunLantern', 1], ['healingDraught', 3], ['blastBomb', 4]],
  },
  {
    stratum: 6,
    make: [['outpostKit', 1], ['furnace', 1], ['forge', 1], ['alchemyTable', 1], ['emberHelm', 1], ['emberPlate', 1], ['emberGreaves', 1], ['coolingDraught', 4], ['healingDraught', 4]],
    extra: [['emberCrossbow', 1], ['sunLance', 1]],
  },
];

/** Gear kinds made once. */
const ONCE = new Set(['tool', 'weapon', 'armour', 'lantern', 'pack']);

// -------------------------------------------------------------------------------------
// The bill: what a plan costs in raw materials

export interface Bill {
  /** Raw materials (no recipe, or none chosen) still to gather beyond what `have` held. */
  raw: Counts;
  /** What was taken from `have` (raw materials and made things alike). */
  spent: Counts;
  /** Furnace fuel units. */
  fuel: number;
  /** Recipes made, with how many times. */
  crafts: Array<{ recipe: string; times: number }>;
}

/**
 * Expand a list of things to make into raw materials, using what `have` holds first (it is spent),
 * and for each intermediate the first recipe whose raw inputs are `available` (else the first one).
 */
export function billOf(make: ReadonlyArray<readonly [ItemId, number]>, have: Counts, available: (item: ItemId) => boolean, local: (item: ItemId) => boolean = available): Bill {
  const bill: Bill = { raw: {}, spent: {}, fuel: 0, crafts: [] };
  const inv: Counts = { ...have };
  const made: Counts = {};
  const need = (item: ItemId, n: number, depth: number): void => {
    if (n <= 0) return;
    // Spare outputs of earlier crafts first, then the bank.
    const spare = Math.min(made[item] ?? 0, n);
    if (spare > 0) {
      made[item] = (made[item] ?? 0) - spare;
      n -= spare;
    }
    const inHand = Math.min(inv[item] ?? 0, n);
    if (inHand > 0) {
      inv[item] = (inv[item] ?? 0) - inHand;
      bill.spent[item] = (bill.spent[item] ?? 0) + inHand;
      n -= inHand;
    }
    if (n <= 0) return;
    const recipes = depth < 8 ? recipesFor(item) : [];
    if (recipes.length === 0 || available(item) && isRaw(item)) {
      bill.raw[item] = (bill.raw[item] ?? 0) + n;
      return;
    }
    // A recipe made of what this stratum offers first, then of what the bank holds, else the first.
    const rec =
      recipes.find((r) => recipeInputs(r).every(([i]) => reachable(i, local, 0))) ??
      recipes.find((r) => recipeInputs(r).every(([i]) => reachable(i, available, 0))) ??
      recipes[0];
    const times = Math.ceil(n / rec.output.count);
    bill.crafts.push({ recipe: rec.id, times });
    if (STATIONS[rec.station].fuel) bill.fuel += (rec.fuel ?? 0) * times;
    for (const [i, k] of recipeInputs(rec)) need(i, k * times, depth + 1);
    // The extra outputs wait in the bag for the next need.
    const extra = times * rec.output.count - n;
    if (extra > 0) made[item] = (made[item] ?? 0) + extra;
  };
  for (const [item, n] of make) need(item, n, 0);
  return bill;
}

/** Items with no recipe (gathered). */
function isRaw(item: ItemId): boolean {
  return recipesFor(item).length === 0;
}

function reachable(item: ItemId, available: (item: ItemId) => boolean, depth: number): boolean {
  if (available(item)) return true;
  if (depth > 6) return false;
  return recipesFor(item).some((r) => recipeInputs(r).every(([i]) => reachable(i, available, depth + 1)));
}

// -------------------------------------------------------------------------------------
// Yields of exploring a share of a stratum

export interface Yields {
  items: Counts;
  /** Seconds spent: walking, mining, fighting, opening chests. */
  walk: number;
  mine: number;
  fight: number;
  chests: number;
  blocks: number;
  kills: number;
}

/** Expected loot of one chest (averaged over many rolls; cached). */
const lootCache = new Map<string, Counts>();
export function expectedLoot(kind: ChestKind, tier: number, biome: BiomeKey): Counts {
  const key = `${kind}:${tier}:${biome}`;
  let c = lootCache.get(key);
  if (c) return c;
  c = {};
  const N = 64;
  for (let i = 0; i < N; i++) {
    const l = lootFor(kind, tier, new Rng(0x10070 + i * 977), biome);
    for (const [id, n] of Object.entries(l) as Array<[ItemId, number]>) c[id] = (c[id] ?? 0) + n / N;
  }
  lootCache.set(key, c);
  return c;
}

/** Mining time of one block (s) with a pick tier (Infinity when the pick cannot break it). */
export function blockSeconds(hardness: number, tier: number, pickTier: number): number {
  if (tier > pickTier) return Infinity;
  const pick = pickaxeForTier(pickTier);
  return Math.ceil(hardness / pick.power - 1e-9) * pick.swingInterval * PACE.swingTempo + PACE.blockOverhead;
}

/** What exploring a share `phi` of the stratum yields (expected values) and costs in time. */
export function yieldsOf(s: StratumSupply, phi: number, pickTier: number, weaponDps: number): Yields {
  const p = potentialOf(s, phi, pickTier, weaponDps);
  const items: Counts = { ...p.free };
  let mine = 0;
  let blocks = 0;
  for (const o of p.ores) {
    blocks += o.blocks;
    mine += o.blocks * o.seconds;
    items[o.ore.item] = (items[o.ore.item] ?? 0) + o.blocks * o.ore.perBlock;
    if (o.ore.stone > 0) items.stone = (items.stone ?? 0) + o.blocks * o.ore.stone;
  }
  return { items, walk: p.walk, mine, fight: p.fight, chests: p.chests, blocks, kills: p.kills };
}

/** Within a walked share: what comes without mining (chests, creatures), and the blocks a pick can take. */
export interface Potential {
  free: Counts;
  ores: Array<{ ore: OreSupply; blocks: number; seconds: number }>;
  /** Metres walked, and the seconds it takes. */
  metres: number;
  walk: number;
  fight: number;
  chests: number;
  kills: number;
}

export function potentialOf(s: StratumSupply, phi: number, pickTier: number, weaponDps: number): Potential {
  const f = Math.max(0, Math.min(1, phi));
  const free: Counts = {};
  const add = (id: ItemId, n: number) => {
    if (n > 0) free[id] = (free[id] ?? 0) + n;
  };
  const ores: Potential['ores'] = [];
  for (const o of s.ores) {
    const t = blockSeconds(o.hardness, o.tier, pickTier);
    if (!Number.isFinite(t)) continue;
    ores.push({ ore: o, blocks: o.blocks * f * PACE.mineShare, seconds: t });
  }
  for (const c of s.chests) for (const [id, n] of Object.entries(expectedLoot(c.kind, c.tier, c.biome)) as Array<[ItemId, number]>) add(id, n * f);
  const metres = s.tunnelMetres * f;
  const walk = metres / PACE.exploreSpeed;
  const kills = walk / PACE.encounterSeconds;
  const totalW = s.creatures.reduce((a, c) => a + c.weight, 0) || 1;
  let fight = 0;
  let killed = 0;
  for (const c of s.creatures) {
    // Encounters of this kind, each a pack.
    const k = ((kills * c.weight) / totalW) * Math.max(1, c.pack || 1);
    killed += k;
    fight += k * (c.hp / Math.max(0.5, weaponDps) + PACE.fightOverhead);
    for (const [id, n] of Object.entries(c.drops) as Array<[ItemId, number]>) add(id, n * k);
  }
  return { free, ores, metres, walk, fight, chests: s.chests.length * f * PACE.chestSeconds, kills: killed };
}

export interface MinePlan {
  /** Items mined (with the loose stone). */
  mined: Counts;
  seconds: number;
  blocks: number;
  /** What could not be found within the share. */
  short: Counts;
}

/**
 * Mine what `want` still needs after the free items: per item, the quickest blocks per item first;
 * stone last, from the loose rock of the ores already mined, then rubble, cracked walls and more ore.
 */
export function minePlan(p: Potential, want: Counts): MinePlan {
  const mined: Counts = {};
  const short: Counts = {};
  let seconds = 0;
  let blocks = 0;
  const left = new Map(p.ores.map((o) => [o, o.blocks]));
  // The veins mined anyway along the way: PACE.mineAnywayPerMetre of the walk, spread over the ores
  // passed in proportion to their blocks.
  const passed = p.ores.reduce((a, o) => a + o.blocks, 0);
  const anyway = Math.min(passed, p.metres * PACE.mineAnywayPerMetre);
  for (const o of p.ores) {
    const b = passed > 0 ? (o.blocks / passed) * anyway : 0;
    left.set(o, o.blocks - b);
    blocks += b;
    seconds += b * o.seconds;
    mined[o.ore.item] = (mined[o.ore.item] ?? 0) + b * o.ore.perBlock;
    if (o.ore.stone > 0) mined.stone = (mined.stone ?? 0) + b * o.ore.stone;
  }
  const take = (o: Potential['ores'][number], n: number) => {
    const b = Math.min(n, left.get(o) ?? 0);
    if (b <= 0) return 0;
    left.set(o, (left.get(o) ?? 0) - b);
    blocks += b;
    seconds += b * o.seconds;
    mined[o.ore.item] = (mined[o.ore.item] ?? 0) + b * o.ore.perBlock;
    if (o.ore.stone > 0) mined.stone = (mined.stone ?? 0) + b * o.ore.stone;
    return b;
  };
  const rest = (id: ItemId) => Math.max(0, (want[id] ?? 0) - (p.free[id] ?? 0) - (mined[id] ?? 0));
  for (const id of Object.keys(want) as ItemId[]) {
    if (id === 'stone') continue;
    const by = p.ores.filter((o) => o.ore.item === id && o.ore.perBlock > 0).sort((a, b) => a.seconds / a.ore.perBlock - b.seconds / b.ore.perBlock);
    for (const o of by) {
      const r = rest(id);
      if (r <= 1e-9) break;
      take(o, r / o.ore.perBlock);
    }
    if (rest(id) > 1e-6) short[id] = rest(id);
  }
  if (rest('stone') > 1e-9) {
    const stoneOf = (o: Potential['ores'][number]) => (o.ore.item === 'stone' ? o.ore.perBlock : 0) + o.ore.stone;
    const by = p.ores.filter((o) => stoneOf(o) > 0).sort((a, b) => a.seconds / stoneOf(a) - b.seconds / stoneOf(b));
    for (const o of by) {
      const r = rest('stone');
      if (r <= 1e-9) break;
      take(o, r / stoneOf(o));
    }
    if (rest('stone') > 1e-6) short.stone = rest('stone');
  }
  return { mined, seconds, blocks, short };
}

// -------------------------------------------------------------------------------------
// The descent

export interface StratumReport {
  stratum: number;
  /** Share of the stratum's tunnels walked to gather the plan. */
  phi: number;
  /** Minutes: total, and its parts. */
  minutes: number;
  parts: { walk: number; mine: number; fight: number; chests: number; guardians: number; overhead: number };
  /** What the plan's bill was short of even after the whole stratum (empty when feasible). */
  short: Counts;
  bill: Bill;
  /** What was made (the needs, and the extras the walk paid for), and the extras left for later. */
  made: ItemId[];
  skipped: ItemId[];
  dps: number;
  pickTier: number;
  blocks: number;
  kills: number;
}

export interface DescentReport {
  strata: StratumReport[];
  totalMinutes: number;
  feasible: boolean;
  /** What is left in the bank at the Heart. */
  bank: Counts;
}

/** The best damage per second of the weapons owned (the pick when none). */
export function bestDps(owned: ReadonlySet<ItemId>): number {
  let best = dps(WEAPONS.pick);
  for (const id of owned) if (id in WEAPONS && !WEAPONS[id as WeaponId].consumes) best = Math.max(best, dps(WEAPONS[id as WeaponId]));
  return best;
}

/**
 * Run the descent: per stratum, the plan's bill against the bank and the stratum's supply; the
 * share walked is the least that covers the bill (the bisection of yieldsOf); then the guardians.
 */
export function simulateDescent(supplies: readonly StratumSupply[], plan: readonly PlanStep[] = DESCENT_PLAN, start: Counts = STARTER_KIT, explore: number = PACE.exploreShare): DescentReport {
  const bank: Counts = { ...start };
  const owned = new Set<ItemId>(['rustyPick', 'oilLantern']);
  let pickTier = 1;
  const reports: StratumReport[] = [];
  let feasible = true;
  for (const s of supplies) {
    const step = plan.find((p) => p.stratum === s.stratum) ?? { stratum: s.stratum, make: [] };
    const weaponDps = bestDps(owned);
    // What this stratum can give at the current pick tier (for the recipe choice).
    const full = yieldsOf(s, 1, pickTier, weaponDps);
    const local = (item: ItemId) => (full.items[item] ?? 0) > 0.5;
    const available = (item: ItemId) => local(item) || (bank[item] ?? 0) > 0;
    const fresh = (list: ReadonlyArray<readonly [ItemId, number]>) => list.filter(([item]) => !(ONCE.has(ITEMS[item].kind) && owned.has(item)));
    /** What a list costs against the bank: the bill, the bank left after it, and what is left to gather. */
    const costOf = (list: ReadonlyArray<readonly [ItemId, number]>) => {
      const bill = billOf(list, bank, available, local);
      const left: Counts = { ...bank };
      for (const [id, n] of Object.entries(bill.spent) as Array<[ItemId, number]>) left[id] = Math.max(0, (left[id] ?? 0) - n);
      // Fuel: from the bank's fuel first (coal 4 units, then what burns), the rest to gather.
      const want: Counts = { ...bill.raw };
      const fuelItems: ItemId[] = ['coal', 'blackOil', 'sulphur', 'fungalWood', 'heartwood'];
      let fuelLeft = bill.fuel;
      for (const id of fuelItems) {
        if (fuelLeft <= 0) break;
        const per = ITEMS[id].fuel ?? 0;
        const take = Math.min(left[id] ?? 0, Math.ceil(fuelLeft / per));
        if (take <= 0) continue;
        fuelLeft -= take * per;
        left[id] = (left[id] ?? 0) - take;
      }
      if (fuelLeft > 0) {
        const id = fuelItems.find((x) => (full.items[x] ?? 0) > 1) ?? 'coal';
        want[id] = (want[id] ?? 0) + Math.ceil(fuelLeft / (ITEMS[id].fuel ?? 1));
      }
      return { bill, left, want };
    };
    const coveredAt = (want: Counts, phi: number) => Object.keys(minePlan(potentialOf(s, phi, pickTier, weaponDps), want).short).length === 0;
    const leastPhi = (want: Counts) => {
      if (!coveredAt(want, 1)) return Infinity;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (coveredAt(want, mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    // The needs first; the walk is at least the exploring share; then each extra the walk pays for.
    const make: Array<readonly [ItemId, number]> = [...fresh(step.make)];
    const needPhi = leastPhi(costOf(make).want);
    let phi = Math.min(1, Math.max(Number.isFinite(needPhi) ? needPhi : 1, explore));
    const skipped: ItemId[] = [];
    for (const x of fresh(step.extra ?? [])) {
      const trial = [...make, x];
      if (coveredAt(costOf(trial).want, phi)) make.push(x);
      else skipped.push(x[0]);
    }
    const { bill, left, want } = costOf(make);
    if (!Number.isFinite(needPhi)) phi = 1;
    const pot = potentialOf(s, phi, pickTier, weaponDps);
    const mp = minePlan(pot, want);
    const short: Counts = {};
    for (const [id, n] of Object.entries(mp.short) as Array<[ItemId, number]>) short[id] = Math.ceil(n ?? 0);
    if (Object.keys(short).length) feasible = false;
    const y: Yields = { items: {}, walk: pot.walk, mine: mp.seconds, fight: pot.fight, chests: pot.chests, blocks: mp.blocks, kills: pot.kills };
    for (const src of [pot.free, mp.mined]) for (const [id, n] of Object.entries(src) as Array<[ItemId, number]>) y.items[id] = (y.items[id] ?? 0) + n;
    // The bank: what was left, plus what was gathered, minus what the crafts took of it.
    for (const id of Object.keys(bank) as ItemId[]) delete bank[id];
    for (const [id, n] of Object.entries(left) as Array<[ItemId, number]>) if (n > 1e-9) bank[id] = n;
    for (const [id, n] of Object.entries(y.items) as Array<[ItemId, number]>) bank[id] = (bank[id] ?? 0) + n;
    for (const [id, n] of Object.entries(want) as Array<[ItemId, number]>) bank[id] = Math.max(0, (bank[id] ?? 0) - n);
    // The plan's gear is owned (consumables are used up in the stratum, stations stand in it).
    for (const [item] of make) {
      if (ONCE.has(ITEMS[item].kind)) owned.add(item);
      const t = ITEMS[item].tier;
      if (ITEMS[item].equip === 'pick' && t && NEXT_PICK[s.stratum] === item) pickTier = Math.max(pickTier, t);
    }
    // The guardians, with the best weapon now (the plan's weapons were made before the fights).
    const dpsNow = bestDps(owned);
    let guardians = 0;
    for (const g of s.guardians) {
      guardians += g.hp / (dpsNow * PACE.guardianUptime) + PACE.guardianWalkIn;
      for (const [id, n] of Object.entries(g.drops) as Array<[ItemId, number]>) bank[id] = (bank[id] ?? 0) + n;
      for (const [id, n] of Object.entries(GUARDIAN_LOOT[g.biome] ?? {}) as Array<[ItemId, number]>) bank[id] = (bank[id] ?? 0) + n;
    }
    const overhead = PACE.stratumOverhead + (s.stratum === 1 ? PACE.tutorialSeconds : 0);
    const secs = y.walk + y.mine + y.fight + y.chests + guardians + overhead;
    reports.push({
      stratum: s.stratum,
      phi,
      minutes: secs / 60,
      parts: { walk: y.walk / 60, mine: y.mine / 60, fight: y.fight / 60, chests: y.chests / 60, guardians: guardians / 60, overhead: overhead / 60 },
      short,
      bill,
      made: make.map(([i]) => i),
      skipped,
      dps: dpsNow,
      pickTier,
      blocks: y.blocks,
      kills: y.kills,
    });
  }
  const totalMinutes = reports.reduce((a, r) => a + r.minutes, 0);
  return { strata: reports, totalMinutes, feasible, bank };
}

/** The biomes of a stratum (for the tools). */
export function biomesOf(stratum: number): readonly [BiomeKey, BiomeKey] {
  return STRATUM_BIOMES[stratum] ?? STRATUM_BIOMES[1];
}

/** Chest spacing the generator aims for (m of walked tunnel per chest). */
export const CHEST_SPACING = STRATA_GEN.chestSpacing;

/** Every recipe the plan uses, for the report. */
export function planRecipes(r: DescentReport): Recipe[] {
  const ids = new Set(r.strata.flatMap((s) => s.bill.crafts.map((c) => c.recipe)));
  return RECIPES.filter((x) => ids.has(x.id));
}
