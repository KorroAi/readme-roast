import { PLAYER } from '../config/balance';
import { blockDef, type SoundKind } from '../config/blocks';
import { ITEMS } from '../config/items';
import type { GameEvents } from '../core/events';
import { saturate } from '../core/math';
import { isSfxName, type SfxName, type SfxParams, type StepKind } from './sfx';

// Which sound each gameplay event makes. Pure data mapping, unit tested in Node.

export interface SfxRequest {
  name: SfxName;
  params: SfxParams;
}

export const soundKindOf = (block: number): SoundKind => blockDef(block).sound;

/** Footstep material: ore and crystal floors read as stone underfoot. */
export function stepKindOf(block: number): StepKind {
  const k = soundKindOf(block);
  return k === 'soil' || k === 'wood' || k === 'ancient' ? k : 'stone';
}

const req = (name: SfxName, params: SfxParams = {}): SfxRequest => ({ name, params });

type EventSounds = { [K in keyof GameEvents]?: (p: GameEvents[K]) => SfxRequest | null };

export const EVENT_SOUNDS: EventSounds = {
  'block:hit': (p) => req(`hit.${soundKindOf(p.block)}`, { progress: p.progress }),
  'block:broken': (p) => req(`break.${soundKindOf(p.block)}`),
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
  // A feat: the relic pickup's rising notes, quietly (content, finished game).
  'feat:earned': () => req('pickup.relic', { gain: 0.6 }),
  'player:footstep': (p) => req(`step.${stepKindOf(p.block)}`, { gain: 0.7 + 0.3 * saturate(p.speed / PLAYER.walkSpeed) }),
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
  // World variety (W2): existing voices, re-pitched (feel W5 may replace them with their own).
  'world:ride': (p) => (p.kind === 'hoist' ? req('break.metal', { pitch: p.phase === 'start' ? 0.7 : 0.85, gain: 0.7 }) : req('hit.wood', { pitch: 0.5, gain: 0.6 })),
  'world:runeOpen': () => req('break.ancient', { pitch: 0.7 }),
  'world:hoistReleased': () => req('break.metal', { pitch: 0.6 }),
  'world:note': () => req('hit.wood', { pitch: 1.7, gain: 0.35 }),
  'world:monolith': () => req('hit.ancient', { pitch: 0.45, gain: 0.7 }),
  // Round 2 (MOBS): the creatures, placed in stereo by game/mobs/MobDirector (pan, gain by distance).
  'mob:cue': (p) => (isMobCue(p.cue) ? req(`mob.${p.cue}`, { pan: p.pan, gain: p.gain }) : null),
  'mob:telegraph': (p) => req(TELEGRAPH[p.kind] ?? 'mob.chitter', { pan: p.pan, gain: Math.max(0.35, p.gain) }),
  'mob:hit': (p) => req(p.kind === 'wisp' ? 'mob.hit.smoke' : p.armoured ? 'mob.hit.armour' : 'mob.hit.flesh', { pan: p.pan, gain: Math.max(0.5, p.gain) }),
  'mob:died': (p) => req(p.kind === 'wisp' ? 'mob.die.smoke' : p.kind === 'sentinel' ? 'mob.die.stone' : 'mob.die.monster', { pan: p.pan, gain: Math.max(0.4, p.gain) }),
  'mob:interact': (p) => (p.action === 'spores' ? req('mob.spores') : p.action === 'harvested' ? req('break.crystal', { gain: 0.8 }) : p.action === 'petted' ? null : req('mob.catch')),
  'mob:shot': (p) => (p.phase === 'fly' ? null : req('weapon.spark', { pan: p.pan, gain: Math.max(0.3, p.gain) })),
  // FP's weapons (game/fp/events): the swing, the blade's bite, the flash, and the tunk on plain rock.
  'weapon:swing': (p) => req(p.ranged ? 'weapon.sling' : 'weapon.whoosh', { pitch: p.weapon === 'machete' ? 1.25 : p.weapon === 'spear' ? 0.8 : 1 }),
  'weapon:hit': (p) => (p.weapon === 'machete' || p.weapon === 'spear' ? req('weapon.slice') : null),
  'weapon:flash': () => req('weapon.flash'),
  'block:tunk': () => req('block.tunk'),
  // Polish 2 (FP): the world events (game/events), one cue as each starts; the falling rocks
  // creak first and are heard again as they land; a beaten gust ends with the flame catching.
  'world:event': (p) => (p.phase === 'start' ? (WORLD_EVENT_CUES[p.event.kind] ? req(WORLD_EVENT_CUES[p.event.kind]!) : null) : p.event.kind === 'gust' && p.ok ? req('lantern.refueled', { gain: 0.8 }) : null),
  'world:rockfall': (p) => req('event.rockland', { intensity: p.hit ? 1 : 0.6 }),
  // Round 3 (MOBS' request): their own voices, placed in stereo (audio/mobSfx through sfx.ts).
  'mob:sfx': (p) => (isSfxName(p.name) ? req(p.name, { pan: p.pan, gain: p.gain }) : null),
  // Round 3 (LOOP): the action layer's sounds (UI emits the events) and the loop's own.
  'player:sonar': () => req('loop.sonar'),
  'player:dash': () => req('loop.dash'),
  'mine:combo': (p) => (p.count > 1 ? req('loop.combo', { intensity: p.count / 5 }) : null),
  'player:placed': (p) => req(p.item === 'torch' ? 'loop.torch' : 'loop.place'),
  'hotbar:selected': () => req('ui.click', { gain: 0.6 }),
  'craft:made': () => req('craft'),
  'item:used': (p) => req(ITEMS[p.item]?.kind === 'potion' ? 'loop.potion' : 'loop.heal'),
  'gear:equipped': () => req('loop.equip'),
  'recipe:unlocked': () => req('loop.unlock'),
  'station:placed': () => req('loop.station'),
  'quest:step': (p) => (p.kind === 'main' ? req('loop.quest') : null),
  'quest:done': (p) => (p.kind === 'order' ? null : p.kind === 'tutorial' ? req('loop.quest') : req('loop.quest', { gain: 0.8 })),
  'quest:shard': () => req('loop.shard'),
  'world:gateOpened': () => req('loop.gate'),
  'quest:heartLit': () => req('loop.heart'),
  'guide:arrival': (p) => (p.card.first ? req('loop.arrival') : null),
  'order:paid': () => req('loop.order'),
  'tutorial:step': (p) => (p.id ? req('loop.tutorial') : null),
  'hazard:changed': (p) => (p.kind ? req(`loop.hazard.${p.kind}`) : null),
};

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

/** Each monster's wind-up has its own cue, heard before the blow. */
const TELEGRAPH: Partial<Record<string, SfxName>> = {
  crawler: 'mob.chitter',
  gnasher: 'mob.snarl',
  wisp: 'mob.whisper',
  stalker: 'mob.shriek',
  sentinel: 'mob.charge',
};

export const AUDIBLE_EVENTS = Object.keys(EVENT_SOUNDS) as Array<keyof GameEvents>;

export function sfxForEvent<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): SfxRequest | null {
  const fn = EVENT_SOUNDS[type] as ((p: GameEvents[K]) => SfxRequest | null) | undefined;
  return fn ? fn(payload) : null;
}
