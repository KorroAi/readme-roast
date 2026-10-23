import { BIOMES, type BiomeId } from '../../config/biomes';
import { ITEMS, gearFor, type ItemId } from '../../config/items';

/** Seconds between two first-time item tips. */
const ITEM_TIP_GAP = 7;
import { GUIDE, stratumOfBiome } from '../../config/quests';
import type { EventBus, GameEvents } from '../../core/events';
import { hasText, t, type TextKey } from '../../i18n';
import type { UiTargetId } from '../../ui/hud/actions';
import type { ArrivalCard } from './types';
import type { MainStepId } from './mainQuest';

/** What the guide reads every frame. */
export interface GuideInput {
  mainId: string;
  mainStep: MainStepId;
  mainText: string;
  flame: number;
  health: number;
  inCamp: boolean;
  playing: boolean;
}

/** The hazard counter line per WORLD hazard kind (LOOP text), shown on the arrival card. */
const COUNTER: Partial<Record<string, TextKey>> = {
  chill: 'hazard.chill.counter',
  cold: 'hazard.cold.counter',
  gas: 'hazard.gas.counter',
  lava: 'hazard.heat.counter',
  dark: 'hazard.dark.counter',
  void: 'hazard.void.counter',
};

const STUCK: Partial<Record<MainStepId, TextKey>> = {
  furnace: 'hint3.stuck.arm',
  placeFurnace: 'hint3.stuck.place',
  bars: 'hint3.stuck.arm',
  forge: 'hint3.stuck.arm',
  placeForge: 'hint3.stuck.place',
  hide: 'hint3.stuck.hide',
  machete: 'hint3.stuck.arm',
  tutorial: 'hint3.stuck.tutorial',
  lairs: 'hint3.stuck.lairs',
  guardian: 'hint3.stuck.guardian',
  prepare: 'hint3.stuck.prepare',
  gate: 'hint3.stuck.gate',
  descend: 'hint3.stuck.descend',
  heart: 'hint3.stuck.heart',
  boss: 'hint3.stuck.guardian',
};

const TIPS: Partial<Record<string, { key: TextKey; target: UiTargetId }>> = {
  sonar: { key: 'tip.sonar', target: 'sonar' },
  dash: { key: 'tip.dash', target: 'dash' },
  place: { key: 'tip.place', target: 'place' },
  interact: { key: 'tip.interact', target: 'interact' },
};

/** The arrival card of a biome (BRIEF §0.7). */
export function arrivalCard(biome: BiomeId, first: boolean): ArrivalCard {
  const d = BIOMES[biome];
  const text = (k: TextKey | string) => (hasText(k) ? t(k as TextKey) : '');
  const hazard = d.hazard.kind === 'none' ? null : text(d.hazardText) || null;
  // The metered hazards name the loop's counters (the items and the set); the others (falls,
  // rockfall, thorns, and the Heart) WORLD's gear line.
  const counterKey = biome === 'heart' ? undefined : COUNTER[d.hazard.kind];
  const counter = d.hazard.kind === 'none' ? null : (counterKey ? t(counterKey) : text(d.gearText)) || null;
  return {
    biome: biome as ArrivalCard['biome'],
    name: text(d.name) || biome,
    line: text(d.desc),
    stratum: biome === 'heart' ? 6 : stratumOfBiome(biome as ArrivalCard['biome']),
    hazard,
    counter,
    rumour: text(d.rumour),
    first,
  };
}

/**
 * Guidance (round 3, LOOP; BRIEF §0.7): hints when stuck (no progress on the main step for 90 s),
 * when the flame or health is low, when the bag is full or the pick too weak; first-time tips for
 * the buttons; the biome arrival cards. Each hint is a toast plus 'guide:hint' (the UI may ring
 * its target); each card is 'guide:arrival'.
 */
export class Guide {
  private stuckId = '';
  private stuckText = '';
  private stuckT = 0;
  private stuckShown = 0;
  private flameT = -Infinity;
  private healthT = -Infinity;
  private bagT = -Infinity;
  private hardT = -Infinity;
  private clock = 0;
  readonly tipsShown = new Set<string>();
  /** First-time item tips waiting their turn (one every ITEM_TIP_GAP seconds). */
  private readonly itemTips: string[] = [];
  private itemTipT = -Infinity;

  constructor(private readonly bus: EventBus<GameEvents>) {}

  wire(): void {
    const bus = this.bus;
    bus.on('ui:used', (e) => {
      const tip = TIPS[e.control];
      if (tip) this.tip(e.control, tip.key, tip.target);
    });
    bus.on('item:rejected', () => {
      if (this.clock - this.bagT < 30) return;
      this.bagT = this.clock;
      this.hint('bagFull', t('hint3.bagFull'), 'bag');
    });
    bus.on('block:tooHard', (e) => {
      if (this.clock - this.hardT < 20) return;
      this.hardT = this.clock;
      const pick = gearFor('pick', e.requiredTier);
      this.hint('tooHard', pick ? t('hint3.tooHardPick', { pick: t(ITEMS[pick].name), tier: e.requiredTier }) : t('hint3.tooHard', { tier: e.requiredTier }), 'craft');
    });
    bus.on('world:biome', (e) => {
      if (!(e.biome in BIOMES)) return;
      this.bus.emit('guide:arrival', { card: arrivalCard(e.biome, e.first) });
      if (e.first && e.stratum >= 2) this.tip(`outpost${e.stratum}`, 'hint3.outpost', 'craft');
    });
    bus.on('station:placed', (e) => {
      if (e.station === 'outpost') this.tip('outposts', 'tip.outpost', 'map');
      if (e.station === 'furnace') this.tip('furnace', 'tip.furnace', 'craft');
    });
    bus.on('quest:shard', () => this.tip('shard', 'tip.shard', 'tracker'));
  }

  reset(): void {
    this.stuckId = '';
    this.stuckT = 0;
    this.stuckShown = 0;
    this.flameT = this.healthT = this.bagT = this.hardT = -Infinity;
    this.tipsShown.clear();
    this.itemTips.length = 0;
    this.itemTipT = -Infinity;
  }

  /** A hint: the UI shows it once, as its hint line and a tip by the `target` control ('guide:hint'). */
  private hint(id: string, text: string, target: UiTargetId | null): void {
    this.bus.emit('guide:hint', { id, text, target });
  }

  private tip(id: string, key: TextKey, target: UiTargetId | null): void {
    if (this.tipsShown.has(id)) return;
    this.tipsShown.add(id);
    this.hint(`tip:${id}`, t(key), target);
  }

  /** Items the explorer starts with need no tip. */
  quietItems(items: Iterable<ItemId>): void {
    for (const id of items) this.tipsShown.add(`item:${id}`);
    this.itemTips.length = 0;
  }

  /** The first time an item is held: a short tip with what it is for (queued, one at a time). */
  firstItem(item: ItemId): void {
    const id = `item:${item}`;
    if (this.tipsShown.has(id) || !ITEMS[item] || ITEMS[item].keyItem) return;
    this.tipsShown.add(id);
    if (this.itemTips.length < 6) this.itemTips.push(item);
  }

  update(dt: number, g: GuideInput): void {
    if (!(dt > 0) || !g.playing) return;
    this.clock += dt;
    // (Not during the tutorial: its own lines teach the first things.)
    if (this.itemTips.length && g.mainStep !== 'tutorial' && this.clock - this.itemTipT >= ITEM_TIP_GAP) {
      const item = this.itemTips.shift() as ItemId;
      this.itemTipT = this.clock;
      this.hint(`item:${item}`, t('tip.item', { name: t(ITEMS[item].name), desc: t(ITEMS[item].desc) }), 'bag');
    }
    // Stuck: the main step has not moved (its text counts as progress too).
    if (g.mainId !== this.stuckId || g.mainText !== this.stuckText) {
      this.stuckId = g.mainId;
      this.stuckText = g.mainText;
      this.stuckT = 0;
      this.stuckShown = 0;
    } else if (this.stuckShown < GUIDE.stuckMax) {
      this.stuckT += dt;
      const due = GUIDE.stuckSeconds + this.stuckShown * GUIDE.stuckRepeat;
      if (this.stuckT >= due) {
        this.stuckShown++;
        const key = STUCK[g.mainStep];
        if (key) this.hint(`stuck:${g.mainStep}`, t(key), g.mainStep === 'prepare' ? 'craft' : g.mainStep === 'lairs' ? 'sonar' : 'tracker');
      }
    }
    if (!g.inCamp && g.flame < GUIDE.lowFlame && g.flame > 0 && this.clock - this.flameT > GUIDE.gapSeconds) {
      this.flameT = this.clock;
      this.hint('lowFlame', t('hint3.lowFlame'), 'flame');
    }
    if (g.health > 0 && g.health < GUIDE.lowHealth && this.clock - this.healthT > GUIDE.gapSeconds) {
      this.healthT = this.clock;
      this.hint('lowHealth', t('hint3.lowHealth'), 'hotbar:4');
    }
  }

  toSave(): string[] {
    return [...this.tipsShown];
  }

  fromSave(x: unknown): void {
    this.reset();
    if (Array.isArray(x)) for (const s of x) if (typeof s === 'string') this.tipsShown.add(s);
  }
}
