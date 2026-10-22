import { B, blockDef, type SoundKind } from '../config/blocks';
import { ITEMS } from '../config/items';
import { RECIPES } from '../config/recipes';
import type { GameEvents } from '../core/events';
import { saturate } from '../core/math';
import { SPRINT_SPEED, WALK_SPEED } from '../game/fp/constants';
import type { MineKind } from './mineSfx';
import { isSfxName, type SfxName, type SfxParams, type StepKind } from './sfx';

// Which sound each gameplay event makes. Pure data mapping, unit tested in Node. Some events also
// drive the score (AudioSystem: biomes, guardians, the Heart, stingers) and the intensity (blows
// heard in a fight); those are handled there, beside this table.

export interface SfxRequest {
  name: SfxName;
  params: SfxParams;
}

export const soundKindOf = (block: number): SoundKind => blockDef(block).sound;

/** The biome rocks that mine as their own material (audio/mineSfx), not as their block's SoundKind. */
const MINE_SOUND: Partial<Record<number, MineKind>> = {
  [B.FROST_ICE]: 'ice', [B.ICE_CRYSTAL]: 'ice',
  [B.OBSIDIAN]: 'glass', [B.OBSIDIAN_FLOOR]: 'glass', [B.EMBER_GLASS]: 'glass',
  [B.MUSHROOM_CAP_TEAL]: 'fungus', [B.MUSHROOM_CAP_MAGENTA]: 'fungus', [B.MUSHROOM_STEM]: 'fungus', [B.MYCEL_FLOOR]: 'fungus',
  [B.BOG_MUD]: 'mud', [B.BOG_CRUST]: 'mud', [B.TOXIC_POOL]: 'mud',
  [B.FROST_SNOW]: 'snow',
  [B.GLOW_VINE]: 'vine',
  [B.AMBER_ORE]: 'resin', [B.SAP_AMBER]: 'resin',
};

/** How a block sounds when mined: its biome material, else its block's SoundKind. */
export const mineKindOf = (block: number): SoundKind | MineKind => MINE_SOUND[block] ?? soundKindOf(block);

/** The round-3 floors (and the climbables) underfoot: each biome sounds like its ground. */
const FLOOR_STEP: Partial<Record<number, StepKind>> = {
  [B.AMBER_FLOOR]: 'sand', [B.AMBER_SANDSTONE]: 'sand',
  [B.MYCEL_FLOOR]: 'fungus', [B.MYCEL_ROCK]: 'fungus', [B.SPORE_LOAM]: 'soil', [B.MUSHROOM_STEM]: 'fungus', [B.MUSHROOM_CAP_TEAL]: 'fungus', [B.MUSHROOM_CAP_MAGENTA]: 'fungus',
  [B.ROOT_FLOOR]: 'root', [B.ROOT_EARTH]: 'soil', [B.ROOT_CLAY]: 'soil', [B.THICK_ROOT]: 'wood', [B.ROOTS]: 'root',
  [B.FLOOD_FLOOR]: 'water', [B.FLOOD_SHALE]: 'stone',
  [B.GEODE_FLOOR]: 'crystal', [B.GEODE_CALCITE]: 'crystal', [B.AMETHYST]: 'crystal', [B.CRYSTAL]: 'crystal', [B.ECHO_CRYSTAL]: 'crystal', [B.GEM_ORE]: 'crystal',
  [B.MINE_FLOOR]: 'soil',
  [B.FROST_SNOW]: 'snow', [B.FROST_ICE]: 'ice', [B.ICE_CRYSTAL]: 'ice',
  [B.JUNGLE_MOSS]: 'moss', [B.JUNGLE_LOAM]: 'soil', [B.MOSS]: 'moss', [B.GLOW_VINE]: 'moss',
  [B.BOG_CRUST]: 'mud', [B.BOG_MUD]: 'mud', [B.TOXIC_POOL]: 'mud',
  [B.CITY_TILE]: 'ancient', [B.CITY_STONE]: 'ancient', [B.CITY_BRICK]: 'ancient',
  [B.ASH_FLOOR]: 'ash', [B.SCORIA]: 'ash', [B.LAVA]: 'ash',
  [B.OBSIDIAN_FLOOR]: 'glass', [B.OBSIDIAN]: 'glass', [B.VOID_STONE]: 'glass', [B.EMBER_GLASS]: 'glass', [B.HEART_STONE]: 'glass',
  [B.GATE_SEAL]: 'metal', [B.IRONBOUND]: 'metal',
  [B.BUILT_PLANK]: 'wood', [B.LADDER]: 'wood', [B.ROPE]: 'root', [B.DOOR]: 'wood', [B.DOOR_OPEN]: 'wood',
};

/** Footstep material: the biome floors first, then the block's sound (ore and crystal read as stone). */
export function stepKindOf(block: number): StepKind {
  const floor = FLOOR_STEP[block];
  if (floor) return floor;
  const k = soundKindOf(block);
  return k === 'soil' || k === 'wood' || k === 'ancient' ? k : 'stone';
}

/** 0 at a stroll, ~0.35 at a walk, 1 at a sprint. */
export const paceOf = (speed: number): number => saturate((speed - 1.5) / (SPRINT_SPEED - 1.5));

/** A step's level: soft at a creep, full at a walk, a little louder at a sprint (+1.2 dB). */
export const stepGainOf = (speed: number): number => (0.65 + 0.35 * saturate(speed / WALK_SPEED)) * (1 + 0.15 * saturate((speed - WALK_SPEED) / (SPRINT_SPEED - WALK_SPEED)));

const req = (name: SfxName, params: SfxParams = {}): SfxRequest => ({ name, params });

/** A crafting station's sound (the recipe's station). */
function craftSound(recipe: string): SfxName {
  if (recipe.startsWith('camp:')) return 'camp.upgrade';
  const station = RECIPES.find((r) => r.id === recipe)?.station;
  switch (station) {
    case 'workbench':
      return 'craft.workbench';
    case 'furnace':
      return 'craft.furnace';
    case 'forge':
      return 'craft.forge';
    case 'alchemy':
      return 'craft.alchemy';
    case 'trader':
      return 'craft.trader';
    default:
      return 'craft.hand';
  }
}

/** Using a consumable: food is eaten, potions drunk, oil poured, wards and flares as themselves. */
function useSound(item: string): SfxName {
  const d = ITEMS[item as keyof typeof ITEMS];
  const use = d?.use?.kind;
  if (item === 'bandage') return 'use.bandage';
  if (use === 'oil') return 'use.oil';
  if (use === 'ward') return 'use.ward';
  if (use === 'flare') return 'use.flare';
  if (use === 'feed') return 'companion.eat';
  if (use === 'lure') return 'use.lure';
  if (d?.kind === 'potion') return 'use.drink';
  return 'use.eat';
}

/** Equipping by slot: armour settles, a blade is drawn, a tool or lantern taken in hand. */
function equipSound(slot: string): SfxName {
  if (slot === 'head' || slot === 'chest' || slot === 'feet' || slot === 'pack') return 'equip.armour';
  if (slot === 'weapon') return 'equip.weapon';
  if (slot === 'lantern') return 'equip.lantern';
  return 'equip.tool';
}

/** Placing by item: a torch, a ladder, a rope, a door, a plank, a brick or block. */
function placeSound(item: string): SfxName {
  const d = ITEMS[item as keyof typeof ITEMS];
  const kind = d?.place;
  if (kind === 'torch' || item === 'torch') return 'place.torch';
  if (kind === 'ladder') return 'place.ladder';
  if (kind === 'rope') return 'place.rope';
  if (kind === 'door') return 'place.door';
  if (kind === 'outpost') return 'place.outpost';
  if (kind === 'station') return 'place.station';
  return /plank|wood/i.test(item) ? 'place.plank' : 'place.block';
}

type EventSounds = { [K in keyof GameEvents]?: (p: NonNullable<GameEvents[K]>) => SfxRequest | null };

export const EVENT_SOUNDS: EventSounds = {
  'block:hit': (p) => req(`hit.${mineKindOf(p.block)}`, { progress: p.progress }),
  'block:broken': (p) => req(`break.${mineKindOf(p.block)}`),
  'block:tooHard': () => req('tooHard'),
  // Crystal clusters are the only minable props.
  'prop:hit': (p) => req('hit.crystal', { progress: p.progress }),
  'prop:broken': () => req('break.crystal'),
  'tool:swing': (p) => req('swing', { tier: p.tier }),
  'item:picked': (p) => req(`pickup.${ITEMS[p.item]?.rarity ?? 'common'}`),
  'item:rejected': () => req('rejected'),
  'items:banked': (p) => req('banked', { count: p.total }),
  'craft:done': () => req('craft'),
  'craft:failed': () => req('ui.error'),
  discovery: () => req('discovery'),
  // A feat: a bright little fanfare (round 3).
  'feat:earned': () => req('feat.fanfare'),
  // Footsteps per floor; a sprint lands heavier and scuffs (pace from the speed).
  'player:footstep': (p) => req(`step.${stepKindOf(p.block)}`, { gain: stepGainOf(p.speed), intensity: paceOf(p.speed) }),
  'player:jump': () => req('jump'),
  'player:land': (p) => req('land', { intensity: saturate((p.fallSpeed - 3) / 17), material: stepKindOf(p.block) }),
  'player:damaged': (p) => req('damaged', { intensity: saturate(p.amount / 40) }),
  'player:died': () => req('died'),
  'player:respawned': () => req('respawned'),
  'camp:entered': () => req('camp'),
  'lantern:low': () => req('lantern.low'),
  'lantern:empty': () => req('lantern.empty'),
  'lantern:refueled': () => req('lantern.refueled'),
  'game:saved': () => req('saved'),
  // World variety (W2): existing voices, re-pitched.
  'world:ride': (p) => (p.kind === 'hoist' ? req('break.metal', { pitch: p.phase === 'start' ? 0.7 : 0.85, gain: 0.7 }) : req('hit.wood', { pitch: 0.5, gain: 0.6 })),
  'world:runeOpen': () => req('break.ancient', { pitch: 0.7 }),
  'world:hoistReleased': () => req('break.metal', { pitch: 0.6 }),
  'world:note': () => req('page.read'),
  'world:monolith': () => req('hit.ancient', { pitch: 0.45, gain: 0.7 }),
  // The creatures, placed in stereo by game/mobs/MobDirector (pan, gain by distance).
  'mob:cue': (p) => (isMobCue(p.cue) ? req(`mob.${p.cue}`, { pan: p.pan, gain: p.gain }) : null),
  // Round-3 brains voice their wind-up through 'mob:sfx' (sim.telegraph); only the first game's
  // five kinds, whose brains do not, are voiced here (so a telegraph is heard once).
  'mob:telegraph': (p) => {
    const cue = TELEGRAPH[p.kind];
    return cue ? req(cue, { pan: p.pan, gain: Math.max(0.35, p.gain) }) : null;
  },
  'mob:hit': (p) => (p.weak ? req('hit.crit', { pan: p.pan, gain: Math.max(0.5, p.gain) }) : req(p.kind === 'wisp' ? 'mob.hit.smoke' : p.armoured ? 'mob.hit.armour' : 'mob.hit.flesh', { pan: p.pan, gain: Math.max(0.5, p.gain) })),
  'mob:died': (p) => req(p.kind === 'wisp' ? 'mob.die.smoke' : p.kind === 'sentinel' ? 'mob.die.stone' : 'mob.die.monster', { pan: p.pan, gain: Math.max(0.4, p.gain) }),
  'mob:interact': (p) => (p.action === 'spores' ? req('mob.spores') : p.action === 'harvested' ? req('break.crystal', { gain: 0.8 }) : p.action === 'petted' ? req('companion.chirp', { gain: 0.6 }) : req('mob.catch')),
  'mob:shot': (p) => (p.phase === 'fly' ? null : req('weapon.spark', { pan: p.pan, gain: Math.max(0.3, p.gain) })),
  'mob:sfx': (p) => (isSfxName(p.name) ? req(p.name, { pan: p.pan, gain: p.gain, ...(p.pitch !== undefined && p.pitch !== 1 ? { pitch: p.pitch } : {}) }) : null),
  'mob:elite': () => req('elite.alert'),
  // A page of the bestiary: met (paper and a curious note), or completed by a scan or a defeat.
  'mob:bestiary': (p) => req(p.page === 'new' ? 'bestiary.page' : 'bestiary.complete', { gain: 0.8 }),
  // The companion (MOBS' stretch): MOBS voices its trust, taming, levels and ore alerts in stereo at
  // the Lampling ('mob:sfx' companion.*); these add what MOBS does not: the crunch of a treat, its zap.
  'companion:fed': () => req('companion.eat'),
  'companion:zap': () => req('companion.zap'),
  // FP's weapons (game/fp/events): the swing, the blade's bite, the flash, and the tunk on plain rock.
  // A bomb or a flare thrown from the hotbar is a ranged swing too (a heavier whoosh for the bomb).
  'weapon:swing': (p) => req(p.ranged ? 'weapon.sling' : 'weapon.whoosh', { pitch: SWING_PITCH[p.weapon] ?? 1 }),
  'weapon:hit': (p) => (p.weapon === 'machete' || p.weapon === 'spear' || p.weapon === 'sword' || p.weapon === 'crystalSpear' ? req('weapon.slice') : null),
  // A Flash Charge's burst, a blast bomb landing (radius 4: WEAPONS.bomb.area), a flare landing
  // (UI's `kind` when it sends one; AudioSystem tells a thrown flare by where it lands otherwise).
  'weapon:flash': (p) => {
    if (p.kind === 'bomb' || (p.kind === undefined && p.radius <= 4.5)) return req('act.bomb', { intensity: saturate(p.count / 4) });
    return req(p.kind === 'flare' ? 'use.flare' : 'weapon.flash');
  },
  'block:tunk': () => req('block.tunk'),
  // The world events (game/events): one cue as each starts; a beaten gust ends with the flame catching.
  'world:event': (p) => (p.phase === 'start' ? (WORLD_EVENT_CUES[p.event.kind] ? req(WORLD_EVENT_CUES[p.event.kind]!) : null) : p.event.kind === 'gust' && p.ok ? req('lantern.refueled', { gain: 0.8 }) : null),
  'world:rockfall': (p) => req('event.rockland', { intensity: p.hit ? 1 : 0.6 }),
  // Lumen moths scattered by a mining hit: their flutter, where they rose.
  'moths:startled': (p) => req('amb.moth', { gain: Math.min(1, 0.6 + 0.1 * p.count) }),
  // Round 3 (WORLD): the strata. The descent and the climb; the gate; a lair marked; places; the works.
  'world:stratum': (p) => (p.from === null ? null : p.stratum > p.from ? req('world.descent') : req('world.ascent')),
  'world:gateOpened': () => req('loop.gate'),
  'world:lairRevealed': (p) => (p.how === 'sonar' ? null : req('lair.revealed')),
  'world:site': (p) => (p.kind === 'vista' || p.kind === 'dungeon' ? req('discovery') : req('site.found')),
  'world:lever': () => req('world.lever'),
  'world:plate': (p) => (p.ok ? req('world.plate', { pitch: Math.pow(2, ([0, 2, 4, 7, 9, 12][Math.max(0, p.set - 1)] ?? 12) / 12) }) : req('world.plateReset')),
  'world:worksOpened': () => req('world.worksOpened'),
  // Round 3 (UI): the action layout. The sonar's pulse (its echoes: AudioSystem), the dash, placing.
  'player:sonar': () => req('sonar.pulse'),
  'player:dash': () => req('act.dash'),
  'mine:combo': (p) => (p.count > 1 ? req('loop.combo', { intensity: p.count / 5 }) : null),
  'player:placed': (p) => req(placeSound(p.item)),
  'hotbar:selected': (p) => req('ui.hotbar', { pitch: Math.pow(2, ([0, 2, 4, 7, 9, 12][p.slot] ?? 0) / 12) }),
  'player:travelled': () => req('travel.whoosh'),
  'ui:opened': (p) => req(p.screen === 'inventory' ? 'ui.bag' : p.screen === 'settings' || p.screen === 'pause' ? 'ui.open' : 'ui.page'),
  // Round 3 (LOOP): crafting per station, gear, consumables, quests, guidance, hazards, rewards.
  'craft:made': (p) => req(craftSound(p.recipe)),
  'item:used': (p) => req(useSound(p.item)),
  'gear:equipped': (p) => req(equipSound(p.slot)),
  'recipe:unlocked': () => req('loop.unlock'),
  'station:placed': (p) => req(p.station === 'outpost' ? 'place.outpost' : 'place.station'),
  'quest:step': (p) => (p.kind === 'main' ? req('quest.step') : null),
  // A quest done: a biome's task, the tutorial finished. An order is heard as its coins; a guardian's
  // step through its fall, the victory and the shard's ring; a gate's through the gate opening.
  'quest:done': (p) => (p.kind === 'order' || MOMENT_STEPS.test(p.id) ? null : req('quest.done', { gain: p.kind === 'biome' ? 0.8 : 0.9 })),
  'quest:shard': () => req('loop.shard'),
  'quest:heartLit': () => req('loop.heart'),
  'guide:arrival': () => req('ui.card'),
  // A hint: a hazard's warning (LOOP's, as its meter passes 40 %) in that hazard's own voice; a
  // hazard zone walked into (once per stratum) a low cue; a creature's first elemental blow nothing
  // (its hit sounds); the rumour's arrow a faint "this way"; the rest the hint's two notes.
  'guide:hint': (p) => {
    const [, family, kind] = /^(\w+):(\w+)/.exec(p.id) ?? [];
    if (family === 'hazard' && HAZARD_VOICE[kind]) return req(`hazard.${HAZARD_VOICE[kind]}`, { intensity: 0.5 });
    if (family === 'zone') return req('zone.enter', { pitch: ZONE_PITCH[kind] ?? 1 });
    if (family === 'element') return null;
    if (family === 'stuck') return req('guide.way');
    return req('ui.hint');
  },
  'order:paid': () => req('loop.order'),
  // Rewards are heard through their moment (an order's coins, a feat's fanfare, a task's chime, a
  // guardian's fall, a bestiary page); only a reward with no moment of its own (the camp garden's
  // harvest) jingles its pouch.
  'reward:paid': (p) => (REWARD_MOMENTS.has(p.reason) ? null : req('reward.pouch', { count: Object.values(p.items).reduce((a: number, b) => a + (b ?? 0), 0) })),
  'tutorial:step': (p) => (p.id ? req('tutorial.step') : null),
  'hazard:changed': (p) => (p.kind ? req(`loop.hazard.${p.kind}`) : null),
  'camp:upgraded': () => req('camp.upgrade'),
  'trade:done': () => req('craft.trader'),
  'gem:socketed': () => req('gem.socket'),
  'trip:summary': () => req('page.read', { gain: 0.8 }),
  'daily:done': () => req('feat.fanfare'),
};

/** A world hazard's warning voice (gameplay/Hazards meters: cold and chill bite as cold, lava as heat, the void as the dark). */
const HAZARD_VOICE: Record<string, 'cold' | 'gas' | 'heat' | 'dark'> = { cold: 'cold', chill: 'cold', gas: 'gas', lava: 'heat', heat: 'heat', dark: 'dark', void: 'dark' };

const SWING_PITCH: Record<string, number> = { machete: 1.25, spear: 0.8, crystalSpear: 0.85, greatAxe: 0.75, bomb: 0.8, flare: 1.1, flash: 1.05 };
/** A hazard zone's low cue, lower for the heavier dangers. */
const ZONE_PITCH: Record<string, number> = { falls: 1.12, rockfall: 0.94, chill: 1.06, gas: 0.9, lava: 0.84 };

/** Main-quest steps heard as their own moment (a guardian's fall, the Heart, a gate opening). */
export const MOMENT_STEPS = /^main:(guardian\.|heart$|s\d+\.gate$)/;

/** Reasons whose reward is heard through its own moment (eventMap 'reward:paid'). */
export const REWARD_MOMENTS: ReadonlySet<string> = new Set(['starter', 'order', 'feat', 'task', 'guardian', 'bestiary', 'daily', 'tutorial']);

/** Each world event's opening cue (the migration and the treasure mob are heard through their creatures). */
const WORLD_EVENT_CUES: Partial<Record<GameEvents['world:event']['event']['kind'], SfxName>> = {
  tremor: 'event.tremor',
  rockfall: 'event.creak',
  gust: 'event.gust',
  geyser: 'event.geyser',
  bloom: 'event.bloom',
  echo: 'event.echo',
};

const MOB_CUES = new Set(['breath', 'chitter', 'whisper', 'drone', 'grind', 'chirp', 'squeak', 'groan', 'chime']);
const isMobCue = (c: string): c is 'breath' | 'chitter' | 'whisper' | 'drone' | 'grind' | 'chirp' | 'squeak' | 'groan' | 'chime' => MOB_CUES.has(c);

/** The first game's five monsters: their wind-ups are voiced on 'mob:telegraph' (their brains send no 'mob:sfx'). */
export const TELEGRAPH: Partial<Record<string, SfxName>> = {
  crawler: 'mob.chitter',
  gnasher: 'mob.snarl',
  wisp: 'mob.whisper',
  stalker: 'mob.shriek',
  sentinel: 'mob.charge',
};

export const AUDIBLE_EVENTS = Object.keys(EVENT_SOUNDS) as Array<keyof GameEvents>;

/**
 * Events heard through another event or system, so that each moment sounds once, with where it is
 * heard. With EVENT_SOUNDS and SILENT_EVENTS this classifies every GameEvents key exactly once
 * (tests/unit/audio.test.ts: a new event fails to compile there until it is classified).
 */
export const VOICED_ELSEWHERE: Partial<Record<keyof GameEvents, string>> = {
  'companion:trust': "MOBS' 'mob:sfx' companion.chirp, at the Lampling",
  'companion:tamed': "MOBS' 'mob:sfx' companion.happy, at the Lampling",
  'companion:level': "MOBS' 'mob:sfx' companion.levelup, at the Lampling",
  'companion:ore': "MOBS' 'mob:sfx' companion.alert, at the vein",
  'companion:feed': "MOBS answers with 'companion:fed' (the crunch of the treat)",
  'companion:lure': "the lure's call ('item:used' use.lure); MOBS' companion.happy when one is tamed",
  'mob:spawned': "the creature's own voice ('mob:cue', 'mob:sfx')",
  'mob:met': "the bestiary's new page ('mob:bestiary')",
  'mob:scanned': "the bestiary's completed page ('mob:bestiary'); the sonar's echoes",
  'mob:attack': "a blow that lands is 'player:damaged'; the strike itself is the creature's 'mob:sfx'; the score's heat (AudioSystem)",
  'mob:guardianAwake': "MOBS' guardian.roar ('mob:sfx') and the stratum's guardian theme (AudioSystem)",
  'mob:guardianPhase': "MOBS' guardian.phase ('mob:sfx'), the score's phase sting and its next phase (AudioSystem)",
  'mob:guardianReset': "the score goes back to the biome (AudioSystem)",
  'mob:guardianOpen': "MOBS' guardian.open ('mob:sfx': an exhale and two rising chimes, the tell to strike)",
  'mob:guardianDefeated': "MOBS' guardian.fall ('mob:sfx', ending on the shard's ring) and the score's victory sting (AudioSystem)",
  'quest:page': "'world:note' (the page read)",
  'quest:ending': "the ending's theme (AudioSystem)",
  'bestiary:reward': "the bestiary's new page ('mob:bestiary')",
  'world:biome': "the score and the beds crossfade (AudioSystem); a first visit's motif and its arrival card ('guide:arrival')",
  'world:pocket': "the tremor's own crack ('world:event' event.tremor)",
  'world:runeWake': "the old world's rune door: its opening ('world:runeOpen')",
  'ui:used': "each control's own sound (the button's click, the dash, the sonar, the hotbar...)",
  'player:cold': "the hazard layer and its warnings (AudioSystem, from the hazard meter)",
  'camp:left': "the score and the bed leave the camp (AudioSystem)",
  'expedition:ended': "the return to camp ('camp:entered') and the trip's summary ('trip:summary')",
};

/** Events silent by design, with why. */
export const SILENT_EVENTS: Partial<Record<keyof GameEvents, string>> = {
  'inventory:changed': 'bookkeeping (a pickup, a craft or a use is heard as itself)',
  'objective:changed': "the old world's objectives (the round-3 quest beats are 'quest:step')",
  toast: 'a toast is the text of a moment that has its own sound',
  'game:saveFailed': 'a warning shown in the UI; a sound would only alarm',
  'expedition:started': 'leaving camp is heard as the bed and the score changing',
  'cache:created': "the old world's black-out cache",
  'cache:recovered': "the old world's black-out cache",
  'lantern:turnBack': "the old world's turn-back hint (the flame's own warnings are 'lantern:low' and 'lantern:empty')",
  'record:depth': 'a toast from the second expedition on; a sound every ten metres of descent would nag',
  'world:regrow': "the old world's living rock",
  'world:bloom': "the old world's living rock",
  'station:built': "the old world's camp plots (round 3's stations are 'station:placed')",
  'relic:found': "the old world's runes ('item:picked' plays the relic's pickup)",
  'finale:reached': "the old world's black stone ('world:monolith' plays it)",
};

export function sfxForEvent<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): SfxRequest | null {
  const fn = EVENT_SOUNDS[type] as ((p: GameEvents[K]) => SfxRequest | null) | undefined;
  if (!fn || payload === undefined || payload === null) return null;
  return fn(payload);
}
