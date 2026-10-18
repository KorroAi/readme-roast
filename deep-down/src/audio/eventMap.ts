import { PLAYER } from '../config/balance';
import { blockDef, type SoundKind } from '../config/blocks';
import { ITEMS } from '../config/items';
import type { GameEvents } from '../core/events';
import { saturate } from '../core/math';
import type { SfxName, SfxParams, StepKind } from './sfx';

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
};

export const AUDIBLE_EVENTS = Object.keys(EVENT_SOUNDS) as Array<keyof GameEvents>;

export function sfxForEvent<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): SfxRequest | null {
  const fn = EVENT_SOUNDS[type] as ((p: GameEvents[K]) => SfxRequest | null) | undefined;
  return fn ? fn(payload) : null;
}
