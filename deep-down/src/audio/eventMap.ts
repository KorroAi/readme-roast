import type { SoundKind } from '../config/blocks';
import { biomeAt } from '../idle/config/biomes';
import type { IdleEvents } from '../idle/bus';
import { CELL } from '../idle/model/state';
import type { SfxName, SfxParams } from './sfx';

// Which sound each IdleEvent makes (hybrid SPEC §9.2; the idle SPEC §10.10's ladders kept), with the ladders that make a spree sound like music: breaks climb a
// 2-octave major pentatonic (reset after 1 s without a break; a row clear plays a chord on the current step);
// purchases climb the arpeggio (reset 1.5 s after the last; the 10th note jumps an octave); pierce chains +2
// semitones per cell; combo tiers a step per tier; taps +1 semitone per 5 combo (cap +12). Every ladder sits in
// the biome's key, so they harmonise. Pure apart from the ladder clocks (`now` in seconds); unit tested in Node.

export interface SfxRequest {
  name: SfxName;
  params: SfxParams;
}

/** Major pentatonic offsets over two octaves (semitones). */
export const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] as const;

/** The biome's key relative to D (SPEC §6.5: D, D, E, C, G, B♭, D, C♯, B, A, E♭, E, whole-tone, —). */
const KEY_SEMIS = [0, 0, 2, -2, 5, -4, 0, -1, -3, -5, 1, 2, 0, 0];

export const semis = (n: number): number => Math.pow(2, n / 12);

/** The material a cell sounds like, from its kind and the biome. */
export function materialOf(kind: number, depth: number): SoundKind {
  if (kind === CELL.TOPSOIL) return 'soil';
  if (kind === CELL.GEM || kind === CELL.GEODE) return 'crystal';
  if (kind === CELL.ORE || kind === CELL.RICH || kind === CELL.GOLDEN) return 'metal';
  if (kind === CELL.CHEST) return 'wood';
  if (kind === CELL.GATE || kind === CELL.SEAL || kind === CELL.FOSSIL) return 'ancient';
  const b = biomeAt(depth);
  return b === 0 ? 'soil' : b === 2 ? 'crystal' : b === 3 ? 'ancient' : 'stone';
}

/** The ladder clocks (one per game). */
export class SoundCues {
  private breakStep = -1;
  private lastBreak = -Infinity;
  private buyStep = -1;
  private lastBuy = -Infinity;
  private buyRun = 0;
  /** The last purchase note (the ★ stinger sits a fifth above it). */
  private lastBuyPitch = 1;
  private key = 1;

  /** The biome key for the depth (the ladders follow it). */
  private keyAt(depth: number): number {
    return semis(KEY_SEMIS[Math.min(KEY_SEMIS.length - 1, biomeAt(depth))] ?? 0);
  }

  /** The sounds for one event (0, 1 or 2). `now` in seconds. */
  request<K extends keyof IdleEvents>(type: K, p: IdleEvents[K], now: number, out: SfxRequest[] = []): SfxRequest[] {
    out.length = 0;
    switch (type) {
      case 'tap:hit': {
        const e = p as IdleEvents['tap:hit'];
        this.key = this.keyAt(e.depth);
        const combo = Math.min(12, Math.floor(e.combo / 5));
        out.push({ name: `tap.${materialOf(e.kind, e.depth)}`, params: { pitch: semis(combo), progress: e.cells > 0 ? 1 : 0.4 } });
        if (e.crit) out.push({ name: 'crit', params: {} });
        break;
      }
      case 'cell:break': {
        const e = p as IdleEvents['cell:break'];
        if (e.source === 'crumble') break;
        if (now - this.lastBreak > 1) this.breakStep = -1;
        this.lastBreak = now;
        this.breakStep = Math.min(PENTATONIC.length - 1, this.breakStep + 1);
        const pierce = 2 * Math.max(0, e.chainIndex);
        const pitch = this.keyAt(e.depth) * semis(PENTATONIC[this.breakStep] + pierce);
        out.push({ name: `break.${materialOf(e.kind, e.depth)}`, params: { pitch } });
        if (e.kind === CELL.ORE || e.kind === CELL.RICH || e.kind === CELL.GOLDEN) out.push({ name: 'ore.chime', params: { pitch: this.keyAt(e.depth) * semis(e.kind === CELL.RICH ? 7 : e.kind === CELL.GOLDEN ? 12 : 0) } });
        else if (e.kind === CELL.GEM || e.kind === CELL.GEODE) out.push({ name: 'gem.ring', params: { pitch: this.keyAt(e.depth) } });
        break;
      }
      case 'row:clear': {
        const e = p as IdleEvents['row:clear'];
        const step = Math.max(0, this.breakStep);
        out.push({ name: 'row.clear', params: { pitch: this.keyAt(e.depth) * semis(PENTATONIC[step] - 12) } });
        break;
      }
      case 'row:crumble':
        out.push({ name: 'crumble', params: {} });
        break;
      case 'buy:done': {
        const e = p as IdleEvents['buy:done'];
        if (now - this.lastBuy > 1.5) {
          this.buyStep = -1;
          this.buyRun = 0;
        }
        this.lastBuy = now;
        this.buyRun++;
        this.buyStep = (this.buyStep + 1) % 5;
        const octave = this.buyRun >= 10 ? 12 : 0;
        const pitch = this.key * semis(PENTATONIC[this.buyStep] + octave);
        this.lastBuyPitch = pitch;
        out.push({ name: 'buy', params: { pitch, gain: e.levels > 1 ? 1.15 : 1 } });
        break;
      }
      case 'buy:fail':
        out.push({ name: 'ui.no', params: {} });
        break;
      case 'crew:star':
      case 'crew:crown':
        out.push({ name: 'buy.star', params: { pitch: this.lastBuyPitch * semis(7) * 0.5 } });
        break;
      case 'combo:tier': {
        const e = p as IdleEvents['combo:tier'];
        const step = e.tier >= 50 ? 7 : e.tier >= 25 ? 4 : 0;
        out.push({ name: 'combo.tier', params: { pitch: this.key * semis(step) } });
        break;
      }
      case 'combo:lost':
        out.push({ name: 'combo.lost', params: {} });
        break;
      case 'chest:exposed':
        out.push({ name: 'chest.creak', params: {} });
        break;
      case 'seal:start':
        out.push({ name: 'seal.appear', params: {} });
        break;
      case 'seal:hit':
        out.push({ name: 'seal.hit', params: {} });
        break;
      case 'skill:dynamite':
        out.push({ name: 'boom', params: { intensity: 1 } });
        break;
      case 'offline:collect':
        out.push({ name: 'cash.roll', params: { count: 16 } });
        break;
      // Wave 2 (SPEC §10.10). Pick tiers, chests, seal breaks and reveals are timed by their ceremonies.
      case 'surge:start':
        out.push({ name: 'surge.start', params: {} });
        break;
      case 'surge:end':
        out.push({ name: 'surge.end', params: {} });
        break;
      case 'skill:earthquake':
        out.push({ name: 'quake', params: {} });
        break;
      case 'skill:cataclysm':
        out.push({ name: 'boom', params: { intensity: 1 } });
        out.push({ name: 'tool.tier', params: {} });
        break;
      case 'event:start':
        out.push({ name: 'event.sting', params: {} });
        break;
      case 'record:new':
        out.push({ name: 'record', params: {} });
        break;
      case 'seal:fail':
        out.push({ name: 'combo.lost', params: {} });
        break;
      case 'facet:offer':
        out.push({ name: 'chest.creak', params: {} });
        break;
      // ----- the node crawl (hybrid SPEC §9.2) -----------------------------------------------------------------
      case 'drift:slice': {
        // Each slice cleared plays one note up the biome's pentatonic scale (resetting per drift): a rising phrase.
        const e = p as IdleEvents['drift:slice'];
        const step = Math.max(0, Math.min(PENTATONIC.length - 1, e.slice - 1));
        out.push({ name: 'row.clear', params: { pitch: this.keyAt(e.depth) * semis(PENTATONIC[step] - 12) } });
        break;
      }
      case 'node:breach': {
        const e = p as IdleEvents['node:breach'];
        if (e.by === 'player') out.push({ name: 'breach.rush', params: {} });
        break;
      }
      case 'node:firstLight': {
        const e = p as IdleEvents['node:firstLight'];
        out.push({ name: 'light.chord', params: { pitch: semis(KEY_SEMIS[Math.min(KEY_SEMIS.length - 1, e.biome)] ?? 0), gain: e.first ? 1 : 0.7 } });
        break;
      }
      case 'lamp:relight':
        out.push({ name: 'lamp.whoomp', params: {} });
        break;
      case 'chamber:charted':
        out.push({ name: 'chart.chime', params: { pitch: this.key } });
        break;
      case 'tappable:hit': {
        const e = p as IdleEvents['tappable:hit'];
        const mat = e.kind === 'gem' || e.kind === 'geode' ? 'crystal' : e.kind === 'secret' || e.kind === 'stash' ? 'ancient' : 'metal';
        out.push({ name: `tap.${mat}`, params: { progress: 1 - e.left } });
        if (e.crit) out.push({ name: 'crit', params: {} });
        break;
      }
      case 'chamber:harvest': {
        const e = p as IdleEvents['chamber:harvest'];
        if (now - this.lastBreak > 1) this.breakStep = -1;
        this.lastBreak = now;
        this.breakStep = Math.min(PENTATONIC.length - 1, this.breakStep + 1);
        const pitch = this.key * semis(PENTATONIC[this.breakStep]);
        const crystal = e.kind === 'gem' || e.kind === 'geode';
        out.push({ name: crystal ? 'break.crystal' : e.kind === 'secret' ? 'break.ancient' : 'break.metal', params: { pitch } });
        out.push(crystal ? { name: 'gem.ring', params: { pitch: this.key } } : { name: 'ore.chime', params: { pitch: this.key * semis(e.kind === 'rich' ? 7 : 0) } });
        break;
      }
      case 'skin:strike': {
        const e = p as IdleEvents['skin:strike'];
        out.push({ name: e.broke ? 'break.stone' : 'tap.stone', params: {} });
        break;
      }
      case 'skin:pocket':
        out.push({ name: 'ore.chime', params: { pitch: this.key * semis(12) } });
        break;
      case 'secret:found':
        out.push({ name: 'boom', params: { intensity: 0.35 } });
        out.push({ name: 'chest.creak', params: {} });
        break;
      case 'rock:tunk':
        out.push({ name: 'rock.tunk', params: {} });
        break;
      case 'lantern:raise':
        out.push({ name: 'lantern.lift', params: {} });
        break;
      case 'focus:open':
        out.push({ name: 'focus.lift', params: {} });
        break;
      case 'relic:grade': {
        const e = p as IdleEvents['relic:grade'];
        out.push({ name: e.grade === 'perfect' || e.grade === 'pristine' ? 'relic.bell' : 'relic.tick', params: { pitch: this.key } });
        break;
      }
      case 'ride:start': {
        const e = p as IdleEvents['ride:start'];
        out.push({ name: e.kind === 'cart' ? 'ride.cart' : 'ride.ladder', params: {} });
        break;
      }
      case 'ride:glint':
        out.push({ name: 'ore.chime', params: { pitch: this.key * semis(5) } });
        break;
      case 'seal:weak': {
        const e = p as IdleEvents['seal:weak'];
        if (e.lit) out.push({ name: 'ore.chime', params: { pitch: this.key * semis(12) } });
        break;
      }
      default:
        break;
    }
    return out;
  }
}

/** Every IdleEvent that makes a sound. */
/** Events whose sounds their ceremonies play on their own beats (SPEC §10.8): no cue here, only the music duck. */
export const CEREMONY_TIMED: ReadonlyArray<keyof IdleEvents> = ['biome:reveal', 'seal:break', 'pick:tier'];

export const AUDIBLE_EVENTS: ReadonlyArray<keyof IdleEvents> = [
  'tap:hit', 'cell:break', 'row:clear', 'row:crumble', 'buy:done', 'buy:fail', 'crew:star', 'crew:crown',
  'combo:tier', 'combo:lost', 'chest:exposed', 'seal:start', 'seal:hit',
  'skill:dynamite', 'offline:collect',
  // The node crawl (hybrid SPEC §9.2).
  'drift:slice', 'node:breach', 'node:firstLight', 'lamp:relight', 'chamber:charted', 'tappable:hit', 'chamber:harvest',
  'skin:strike', 'skin:pocket', 'secret:found', 'rock:tunk', 'lantern:raise', 'focus:open', 'relic:grade', 'ride:start',
  'ride:glint', 'seal:weak',
  'surge:start', 'surge:end', 'skill:earthquake', 'skill:cataclysm', 'event:start', 'record:new', 'seal:fail', 'facet:offer',
  // Silent here (their ceremonies time the sound), listened to for the music duck.
  ...CEREMONY_TIMED,
];
