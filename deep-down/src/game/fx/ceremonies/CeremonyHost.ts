// Which ceremony each IdleEvent plays (SPEC §10.3, §10.8), built once with their views and played through the
// CeremonyDirector's rules. The model has already credited every reward when its event fires; ceremonies only show
// it (the chest's held gold flies at its open moment). Pick tiers and crowns play in full only the first time a tier
// is ever reached (CRITIQUE critic 1 SHOULD 10); later runs get the T2 chip.

import type { ChestTier, IdleBus, IdleEvents } from '../../../idle/bus';
import { BIOME_LOOKS } from '../../../idle/config/biomeLooks';
import { biomeDef, biomeStart } from '../../../idle/config/biomes';
import type { IdleState } from '../../../idle/model/state';
import { format, formatEta } from '../../../idle/num/notation';
import { Big } from '../../../core/big';
import { BiomeRevealCeremony, GateCeremony, SealBreakCeremony, TitleView } from './BiomeReveal';
import { ChestCeremony, ChestView, TIER_ORDER } from './Chest';
import type { CeremonyDirector } from './CeremonyDirector';
import { RankStampCeremony, roman, ToastCeremony, ToastView } from './Feat';
import { PickTierCeremony, PickTierView } from './PickTier';
import { RekindleCeremony, RekindleView } from './Rekindle';
import type { CeremonyStage } from './stage';

export interface CeremonyHostDeps {
  bus: IdleBus;
  stage: CeremonyStage;
  director: CeremonyDirector;
  state: () => IdleState;
  /** Where a chest sits on screen (CSS px) by its entity id, null when unknown (rack, daily: the centre). */
  chestPoint(id: string): { x: number; y: number } | null;
  /** The rank badge pops (TopBar). */
  popRank(): void;
  /** The gear cards arrived after a reveal: the Dig tab's dot. */
  gearArrived(): void;
  /** Names for the a11y lines and plates: a pick tier, a named tool form (CRITIQUE MUST 10). */
  toolName(tier: number): string;
  formName(form: number): string;
}

/** A biome accent, half way to white (a reveal flash is never a saturated colour: SPEC §10.13). */
function flashRgb(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return [0.5 + 0.5 * r, 0.5 + 0.5 * g, 0.5 + 0.5 * b];
}

export class CeremonyHost {
  private readonly offs: Array<() => void> = [];
  readonly pickView: PickTierView;
  readonly chestView: ChestView;
  readonly toastView: ToastView;
  readonly titleView: TitleView;
  readonly rekindleView: RekindleView;
  /** The highest pick tier ever celebrated in full (lifetime; read from the model at boot). */
  private tierSeen = 1;

  /** The next tier that would play in full (the capture hook asks for it). */
  get nextTier(): number {
    return this.tierSeen + 1;
  }
  private toastMerge = 0;

  constructor(private readonly d: CeremonyHostDeps, toastLayer: HTMLElement) {
    const st = d.stage;
    this.pickView = new PickTierView(st.layer);
    this.chestView = new ChestView(st.layer);
    this.toastView = new ToastView(toastLayer);
    this.titleView = new TitleView(st.layer);
    this.rekindleView = new RekindleView(st.layer);
    this.tierSeen = Math.max(1, d.state().meta.bestTier || 1);
    const on = <K extends keyof IdleEvents>(k: K, fn: (p: IdleEvents[K]) => void) => this.offs.push(d.bus.on(k, fn));
    on('pick:tier', (p) => this.pickTier(p));
    on('chest:open', (p) => this.chest(p));
    on('feat:tier', (p) => this.feat(p));
    on('feat:secret', (p) => this.secret(p.id));
    on('rank:up', (p) => this.rankUp(p.rank));
    on('seal:break', (p) => this.sealBreak(p.biome));
    on('biome:reveal', (p) => this.reveal(p.biome));
    on('gate:break', (p) => this.gate(p));
    on('tool:form', (p) => this.toolForm(p.form));
    on('seal:fail', (p) => st.hud.stamp(st.text('ui.seal.holdsStamp'), st.text('ui.seal.holds', { pct: Math.round((p.pct ?? p.left * 100)) }), 'white'));
  }

  private pickTier(p: IdleEvents['pick:tier']): void {
    const st = this.d.stage;
    const name = this.d.toolName(p.tier).toUpperCase();
    const sub = p.tiers > 1 ? st.text('ui.ceremony.tiers', { n: p.tiers }) : st.text('ui.ceremony.tier');
    if (p.tier > this.tierSeen && st.motion() !== 'off') {
      this.tierSeen = p.tier;
      this.d.director.play(new PickTierCeremony(st, this.pickView, name, sub), performance.now());
    } else {
      // A tier reached before: the T2 chip.
      st.hud.stamp(`${name} ✓`, sub, 'amber');
      st.audio.play('buy.star', {});
      st.haptics.play('star');
    }
  }

  private chest(p: IdleEvents['chest:open']): void {
    const st = this.d.stage;
    const at = this.d.chestPoint(p.id) ?? { x: st.centre().x, y: st.region().top + (st.region().bottom - st.region().top) * 0.62 };
    const extras = p.extras ?? [];
    const ti = TIER_ORDER.indexOf(p.tier);
    const lines: string[] = [];
    if (!p.gold.isZero()) lines.push(st.text('ui.chest.gold', { gold: format(p.gold) }));
    if (p.gems > 0) lines.push(st.text('ui.chest.gems', { gems: p.gems }));
    let isNew = false;
    for (const e of extras) {
      const [k, a, b] = e.split(':');
      if (k === 'levels') lines.push(st.text('ui.chest.levels', { n: b ?? a }));
      else if (k === 'find' || k === 'findLevel') {
        lines.push(st.text('ui.chest.find'));
        if (k === 'find') isNew = true;
      } else if (k === 'reroll') lines.push(st.text('ui.chest.reroll', { n: a }));
      else if (k === 'crystal') lines.push(st.text('ui.chest.crystals', { n: a }));
      else if (k === 'storm') lines.push(st.text('ui.chest.storm'));
    }
    const card = ti >= 2 ? { title: st.text(`ui.chest.${p.tier}`), lines: lines.filter(Boolean).slice(0, 4), isNew } : null;
    this.d.director.play(
      new ChestCeremony(st, this.chestView, {
        floor: p.floor,
        tier: p.tier,
        path: (p.path as ChestTier[] | undefined) ?? [p.floor, p.tier],
        x: at.x,
        y: at.y,
        gold: format(p.gold),
        gems: p.gems,
        extras,
        card,
      }),
      performance.now(),
    );
  }

  /** The Feat family last toasted (the Feats tab opens on it for 30 s) and when (ms). */
  lastFeat = { family: '', at: -Infinity };

  private feat(p: IdleEvents['feat:tier']): void {
    const st = this.d.stage;
    const name = st.text(`idle.feat.${p.family}`);
    if (!name) return;
    this.lastFeat = { family: p.family, at: performance.now() };
    st.hud.tabDot('feats', true);
    const tone = p.tier >= 10 ? 'violet' : p.tier >= 7 ? 'rune' : p.tier >= 4 ? 'brass' : 'bronze';
    this.toast(st.text('ui.feat.toast', { family: name.toUpperCase(), tier: roman(p.tier) }), name, st.text('ui.feat.reward', { gems: p.gems ?? 5 * Math.min(10, p.tier) }), tone, 0.9 + 0.05 * Math.min(10, p.tier));
  }

  private secret(id: string): void {
    const st = this.d.stage;
    const name = st.text(`idle.secret.${id}`);
    if (!name) return;
    this.toast(st.text('ui.feat.secret'), name, st.text('ui.feat.reward', { gems: 25 }), 'violet', 1.2);
  }

  /** A toast; past 3 waiting they collapse into one "+N Feats". */
  private toast(head: string, name: string, reward: string, tone: string, pitch: number): void {
    const st = this.d.stage;
    const dir = this.d.director;
    if (dir.toastQueue.length >= 3) {
      const dropped = dir.clearToasts(2);
      this.toastMerge += dropped.length + 1;
      dir.play(new ToastCeremony(st, this.toastView, { head: st.text('ui.feat.more', { n: this.toastMerge + 2 }), name: '', reward: '', tone: 'brass', icon: 'medal', sound: 'feat', pitch: 1.1 }), performance.now());
      return;
    }
    this.toastMerge = 0;
    dir.play(new ToastCeremony(st, this.toastView, { head, name, reward, tone, icon: 'medal', sound: 'feat', pitch }), performance.now());
  }

  /** A new named tool form (every new biome ever reached): a toast after the reveal, the foreman's tool changes. */
  private toolForm(form: number): void {
    const st = this.d.stage;
    const name = this.d.formName(form);
    if (!name || form <= 0) return;
    st.hud.announce(st.text('ui.tool.newA11y', { name }));
    this.d.director.play(new ToastCeremony(st, this.toastView, { head: st.text('ui.tool.new'), name, reward: st.text('ui.tool.newSub'), tone: 'brass', icon: 'pick', sound: 'feat', pitch: 0.8 }), performance.now());
  }

  private rankUp(rank: number): void {
    this.d.director.play(new RankStampCeremony(this.d.stage, rank, () => this.d.popRank()), performance.now());
  }

  private sealBreak(biome: number): void {
    const look = BIOME_LOOKS[Math.min(BIOME_LOOKS.length - 1, Math.max(0, biome))];
    this.d.director.play(new SealBreakCeremony(this.d.stage, flashRgb(look?.accent ?? 0x8fe3ee)), performance.now());
  }

  private reveal(biome: number): void {
    const st = this.d.stage;
    const def = biomeDef(biome);
    const name = st.text(`idle.biome.${def.id}`).toUpperCase();
    if (!name) return;
    const s = this.d.state();
    const split = s.run.splits?.[String(biome)];
    const sub = Number.isFinite(split) && split !== undefined
      ? st.text('ui.ceremony.revealSplit', { depth: `${biomeStart(biome)} m`, n: biome + 1, split: formatEta(split) })
      : st.text('ui.ceremony.revealSub', { depth: `${biomeStart(biome)} m`, n: biome + 1 });
    st.hud.announce(st.text('ui.a11y.biome', { name }));
    this.d.director.play(new BiomeRevealCeremony(st, this.titleView, { name, sub, rgb: [1, 1, 1], tone: biome % 2 ? 'rune' : 'amber', onDone: () => this.d.gearArrived() }), performance.now());
  }

  private gate(p: IdleEvents['gate:break']): void {
    const st = this.d.stage;
    const name = st.text(`idle.biome.${biomeDef(p.biome).id}`);
    if (!name) return;
    const delta = p.best !== undefined && Number.isFinite(p.best) ? p.split - p.best : NaN;
    const split = formatEta(p.split) + (Number.isFinite(delta) ? ` · ${delta < 0 ? '−' : '+'}${formatEta(Math.abs(delta))}` : '');
    this.d.director.play(new GateCeremony(st, this.titleView, name.toUpperCase(), p.green ? `${split} · ${st.text('ui.ceremony.green')}` : split, p.green ? 'green' : 'amber'), performance.now());
  }

  /** The Rekindle (T5): the iris closes on the lantern, `reset()` runs behind it, and it opens on the new run. */
  rekindle(gain: Big, reset: () => void): void {
    this.d.director.play(new RekindleCeremony(this.d.stage, this.rekindleView, format(gain), reset), performance.now());
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.offs.length = 0;
  }
}
