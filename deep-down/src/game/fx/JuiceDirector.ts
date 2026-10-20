// IdleEvents → cues under the budgets (SPEC §10.2–§10.6): the same-frame impact of a tap (cell flash and pop, the
// strike, the number, the kick, the sound and the haptic, F1), breaks with their shards, dust and tokens, pierce
// chains, column bursts and row wipes, row clears, the crumble, purchases, ★, combo tiers, chests, the seal and the
// reveal. Gains travel (L8): every gold and gem credit launches tokens through the display ledger, and the counter
// changes when they land. The more frequent, the smaller (L9): every cue belongs to a tier and its caps.

import { Big } from '../../core/big';
import type { IdleBus, IdleEvents } from '../../idle/bus';
import { CELL, type IdleState } from '../../idle/model/state';
import { t } from '../../i18n';
import type { DescentScene } from '../../render/descent/DescentScene';
import type { DisplayLedger } from '../../ui/fx/displayLedger';
import type { FxCanvas, SparkKind } from '../../ui/fx/FxCanvas';
import type { Haptics } from '../../ui/haptics';
import type { CameraFx } from './CameraFx';
import { CUES, escalation, numberSize, tokensFor, type Cue } from './juice';

/** What the director needs from the HUD (screen points of UI elements, and its stamps). */
export interface JuiceHud {
  /** Centre of a card by id (null when not on screen). */
  cardRect(id: string): DOMRect | null;
  /** The ★ stamp on a card (and its rig). */
  stampStar(id: string, crown: boolean): void;
  /** The combo counter's centre (null when hidden). */
  comboPoint(): { x: number; y: number } | null;
  /** The depth plate's centre (the "+1 m" chip). */
  depthPoint(): { x: number; y: number } | null;
  /** A stamp at the world-window centre ("IRON PICK", "SEAL BROKEN"). */
  stamp(text: string, sub: string, tone: 'amber' | 'rune' | 'white'): void;
  /** Announce for screen readers. */
  announce(text: string): void;
}

export interface JuiceAudio {
  play(name: string, params?: { pitch?: number; gain?: number; intensity?: number; count?: number }): void;
}

export interface JuiceDeps {
  bus: IdleBus;
  state: () => IdleState;
  scene: DescentScene;
  fx: FxCanvas;
  cam: CameraFx;
  haptics: Haptics;
  audio: JuiceAudio;
  gold: DisplayLedger<Big>;
  gems: DisplayLedger<number>;
  hud: JuiceHud;
  /** The quality preset (particle scale). */
  preset: () => 'battery' | 'balanced' | 'high';
  /** A finger holds (the hold stream): no hit-stops then. */
  holding: () => boolean;
  /** The world region's centre (kick direction origin). */
  centre: () => { x: number; y: number };
  /** A purchase chain is running (hold-to-buy): ★ ceremonies merge into the last. */
  buyChain: () => boolean;
  /** Names for the a11y announcements. */
  cardName: (id: string) => string;
}

const BREAK_WINDOW_MS = 1000;

export class JuiceDirector {
  private readonly offs: Array<() => void> = [];
  /** Break times in the last second (the hit-stop rule: no stop at ≥ 3 breaks/s). */
  private readonly breaks: number[] = [];
  /** Running means of log10 tap damage and log10 break gold (the "biome median"). */
  private dmgMean = Number.NaN;
  private goldMean = Number.NaN;
  /** Every 10th break of a combo gets an accent (+30 % particles, a bigger pop). */
  private comboBreaks = 0;
  /** The kinds of the cells broken this frame, so a tap's escalation can read them. */
  private lastTapCells = 0;
  /** Crew numbers: at most 6 a second. */
  private crewNumbers: number[] = [];
  private starMerged = 0;
  private readonly tmpBig = Big.zero();
  /** Gold and gem credits that went straight to the counter (F7 audit). */
  directGold = 0;

  constructor(private readonly d: JuiceDeps) {
    const on = <K extends keyof IdleEvents>(k: K, fn: (p: IdleEvents[K]) => void) => this.offs.push(d.bus.on(k, fn));
    on('tap:hit', (p) => this.onTap(p));
    on('cell:hit', (p) => this.onCellHit(p));
    on('cell:break', (p) => this.onBreak(p));
    on('gold:gain', (p) => this.onGold(p));
    on('gems:gain', (p) => this.onGems(p));
    on('row:clear', (p) => this.onRowClear(p));
    on('row:crumble', (p) => this.onCrumble(p));
    on('buy:done', (p) => this.onBuy(p));
    on('crew:star', (p) => this.onStar(`crew:${p.line}`, false));
    on('crew:crown', (p) => this.onStar(`crew:${p.line}`, true));
    on('pick:tier', (p) => this.onPickTier(p));
    on('combo:tier', (p) => this.onComboTier(p));
    on('chest:exposed', (p) => this.play(CUES.chestExposed, p.depth, p.col));
    on('chest:open', () => this.play(CUES.chestOpen, this.d.state().run.depth, 3));
    on('seal:start', (p) => this.play(CUES.sealAppear, p.depth, 3));
    on('seal:hit', () => this.onSealHit());
    on('seal:break', (p) => this.onSealBreak(p));
    on('cavern:breakthrough', () => this.play(CUES.breakthrough, this.d.state().run.depth, 3));
    on('moth:catch', () => this.play(CUES.moth, this.d.state().run.depth, 3));
    on('skill:dynamite', (p) => this.play(CUES.dynamite, p.from, 3));
  }

  private now(): number {
    return performance.now();
  }

  private breakRate(now: number): number {
    while (this.breaks.length && now - this.breaks[0] > BREAK_WINDOW_MS) this.breaks.shift();
    return this.breaks.length;
  }

  private stopCtx(now: number) {
    const s = this.d.state();
    return { breakRate: this.breakRate(now), holding: this.d.holding(), surge: s.tap.surgeEnd > s.time };
  }

  /** Play a cue's generic channels at a cell (stop, trauma, bloom, full flash, world particles, haptic). */
  private play(c: Cue, row: number, col: number, scale = 1): void {
    const now = this.now();
    const cam = this.d.cam;
    const b = cam.budget;
    if (c.stop) cam.stop(c.stop, c.tier, now, this.stopCtx(now), c.tier >= 4);
    if (c.trauma) cam.trauma(c.trauma * scale, c.tier, c.tier >= 4);
    if (c.bloom) cam.bloom(c.bloom[0] * scale, c.bloom[1], now);
    if (c.full) cam.fullFlash(c.full[0], c.tier, now, [1, 1, 1], c.full[1]);
    const fresh = b.freshness(`${c.tier}:${c.dust ?? 0}:${c.sparks ?? 0}`, now);
    const preset = this.d.preset();
    if (c.dust) this.d.scene.burst('dust', row, col, b.particles(c.dust * scale, preset, now, fresh));
    if (c.sparks) this.d.scene.burst('sparks', row, col, b.particles(c.sparks * scale, preset, now, fresh));
    if (c.glints) this.d.scene.burst('gold', row, col, b.particles(c.glints * scale, preset, now, fresh));
    if (c.haptic) this.d.haptics.play(c.haptic);
  }

  // ----- the tap -------------------------------------------------------------------------------------------

  private onTap(p: IdleEvents['tap:hit']): void {
    const now = this.now();
    const s = this.d.state();
    const scene = this.d.scene;
    const crit = p.crit;
    const cue = crit ? CUES.crit : CUES.tap;
    // F0: the cell flashes and pops, the strike lands (the swing that "already happened" is a smear).
    scene.cellFx(p.depth, p.col, cue.flash, cue.pop, 0);
    const tier = Math.floor(s.run.pick / 25) + 1;
    scene.strike(p.depth, p.col, crit, tier);
    // The kick toward the cell (2 px; a crit 4 px). Taps never add trauma; a crit's own trauma is its T2 cue.
    const at = scene.screenOf(p.depth, p.col);
    const c = this.d.centre();
    this.d.cam.kick(at.x - c.x, at.y - c.y, crit);
    // The number: accumulates per column within 350 ms.
    const l = p.dmg.log10();
    this.dmgMean = Number.isNaN(this.dmgMean) ? l : this.dmgMean + (l - this.dmgMean) * 0.06;
    this.d.fx.number(p.col, at.x, at.y - 26, p.dmg, crit ? 'crit' : 'tap', numberSize(l, this.dmgMean, crit), now);
    // Sound comes from the audio's own listener (the ladders); the haptic here.
    this.d.haptics.play(crit ? 'crit' : 'tap');
    if (crit) {
      this.play(CUES.crit, p.depth, p.col);
      this.d.fx.sparksAt(at.x, at.y, 6, 'amber', now, 200, 420, 300);
    } else {
      const fresh = this.d.cam.budget.freshness('tap', now);
      this.d.scene.burst('chips', p.depth, p.col, this.d.cam.budget.particles(CUES.tap.dust, this.d.preset(), now, fresh));
    }
    // Escalation from what the tap broke (E2 pierce is per cell in onBreak).
    const e = escalation(p.cells, false);
    if (e === 3) {
      this.play(CUES.column, p.depth, p.col);
      this.d.audio.play('boom', { intensity: 0.5 });
      this.d.fx.label(at.x, at.y - 60, `×${p.cells}`, 'gold', 30, now);
    } else if (e === 4) {
      this.play(CUES.rowWipe, p.depth, p.col);
      this.d.audio.play('boom', { intensity: 1 });
      this.d.fx.label(at.x, at.y - 60, `×${p.cells}`, 'gold', 38, now);
    }
    this.lastTapCells = p.cells;
  }

  private onCellHit(p: IdleEvents['cell:hit']): void {
    const scene = this.d.scene;
    if (p.source === 'crew') {
      scene.cellFx(p.depth, p.col, 0.25, 0.3, p.stage / 3);
      this.crewNumber(p.col, p.depth, p.dmg);
    } else scene.cellFx(p.depth, p.col, p.crit ? 0.9 : 0.6, p.crit ? 1.75 : 1, p.stage / 3);
  }

  /** Crew numbers: small and grey, at most 6 a second, merged per column (the player's taps stay the stars). */
  private crewNumber(col: number, depth: number, dmg: Big): void {
    const now = this.now();
    while (this.crewNumbers.length && now - this.crewNumbers[0] > 1000) this.crewNumbers.shift();
    if (this.crewNumbers.length >= 6) return;
    this.crewNumbers.push(now);
    const at = this.d.scene.screenOf(depth, col);
    this.d.fx.number(col + 100, at.x, at.y - 14, dmg, 'crew', 14, now);
  }

  // ----- breaks ---------------------------------------------------------------------------------------------

  private onBreak(p: IdleEvents['cell:break']): void {
    const now = this.now();
    this.breaks.push(now);
    const scene = this.d.scene;
    scene.shock(p.depth, p.col);
    const accent = p.source === 'tap' && ++this.comboBreaks % 10 === 0 ? 1.3 : 1;
    if (p.source === 'crumble') {
      this.play(CUES.crumble, p.depth, p.col);
      return;
    }
    const k = p.kind;
    if (k === CELL.GEM || k === CELL.GEODE) this.play(CUES.gem, p.depth, p.col, accent);
    else if (k === CELL.ORE || k === CELL.RICH || k === CELL.GOLDEN) this.play(CUES.ore, p.depth, p.col, accent);
    else this.play(CUES.break, p.depth, p.col, accent);
    if (k === CELL.ORE || k === CELL.RICH || k === CELL.GOLDEN || k === CELL.GEM) scene.burst(k === CELL.GEM ? 'gem' : 'gold', p.depth, p.col, 10);
    // E2: the pierce chain counter "×N" and +0.04 trauma per cell.
    if (p.chainIndex >= 1) {
      this.play(CUES.pierce, p.depth, p.col);
      const at = scene.screenOf(p.depth, p.col);
      this.d.fx.label(at.x + 18, at.y - 8, `×${p.chainIndex + 1}`, 'gold', 20 + 2 * p.chainIndex, now);
    }
  }

  private onCrumble(p: IdleEvents['row:crumble']): void {
    for (const c of p.cols) this.d.scene.cellFx(p.depth, c, 0.35, 0.4, 0.66);
  }

  private onRowClear(p: IdleEvents['row:clear']): void {
    const now = this.now();
    this.play(CUES.rowClear, p.depth, 3);
    const dp = this.d.hud.depthPoint();
    if (dp) this.d.fx.label(dp.x, dp.y + 34, `+${p.rows} m`, 'tap', 16, now);
  }

  // ----- gains travel ---------------------------------------------------------------------------------------

  private onGold(p: IdleEvents['gold:gain']): void {
    const now = this.now();
    const fx = this.d.fx;
    if (p.amount.isZero()) return;
    let x: number;
    let y: number;
    let n: number;
    if (p.col >= 0) {
      const at = this.d.scene.screenOf(p.depth, p.col);
      x = at.x;
      y = at.y;
      const l = p.amount.log10();
      this.goldMean = Number.isNaN(this.goldMean) ? l : this.goldMean + (l - this.goldMean) * 0.07;
      n = tokensFor(l, this.goldMean);
    } else {
      const c = this.d.centre();
      x = c.x;
      y = c.y;
      n = p.source === 'offline' ? 24 : p.source === 'chest' ? 8 : 5;
    }
    // Split the amount into n tokens; each reserves its share in the ledger and credits it on landing.
    const share = this.tmpBig.set(p.amount).divIn(n);
    for (let i = 0; i < n; i++) {
      const amt = share.clone();
      const id = this.d.gold.launch(amt);
      if (id === 0 || !fx.token('coin', x + (i - n / 2) * 4, y, 'gold', id, i, now)) {
        if (id !== 0) this.d.gold.land(id);
        this.directGold++;
      }
    }
  }

  private onGems(p: IdleEvents['gems:gain']): void {
    const now = this.now();
    let x: number;
    let y: number;
    if (p.col >= 0) ({ x, y } = this.d.scene.screenOf(p.depth, p.col));
    else ({ x, y } = this.d.centre());
    const n = Math.max(1, Math.min(6, Math.round(p.amount)));
    const share = p.amount / n;
    for (let i = 0; i < n; i++) {
      const id = this.d.gems.launch(share);
      if (id === 0 || !this.d.fx.token('gem', x, y, 'gems', id, i, now)) {
        if (id !== 0) this.d.gems.land(id);
      }
    }
  }

  // ----- buying ---------------------------------------------------------------------------------------------

  private onBuy(p: IdleEvents['buy:done']): void {
    const now = this.now();
    const r = this.d.hud.cardRect(p.id);
    if (r) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      this.d.fx.sparksAt(cx, cy, this.d.cam.budget.particles(CUES.purchase.fxSparks, this.d.preset(), now), 'brass', now, 180, 420, 450, Math.PI, Math.PI * 2);
      this.d.fx.ring(cx, cy, r.width * 0.3, r.width * 0.9, 450, '226,182,115', now, 2);
    }
    this.d.haptics.play('purchase');
    if (p.id === 'pick') this.d.scene.strike(this.d.state().run.depth, 3, false, Math.floor(this.d.state().run.pick / 25) + 1);
    this.d.hud.announce(`${this.d.cardName(p.id)} ${p.to}`);
  }

  private onStar(id: string, crown: boolean): void {
    const now = this.now();
    // Inside a hold-to-buy chain, ★ ceremonies merge into the last one (§10.3 ²).
    if (this.d.buyChain() && this.starMerged++ > 0) {
      this.d.hud.stampStar(id, crown);
      return;
    }
    this.starMerged = this.d.buyChain() ? 1 : 0;
    const merged = this.d.cam.budget.admitT3(now);
    this.d.hud.stampStar(id, crown);
    if (merged > 0) return;
    const cue = crown ? CUES.crown : CUES.star;
    this.play(cue, this.d.state().run.depth, 3);
    const r = this.d.hud.cardRect(id);
    if (r) {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      this.d.fx.sparksAt(cx, cy, this.d.cam.budget.particles(cue.fxSparks, this.d.preset(), now), 'gold', now, 200, 520, 700, 0, Math.PI * 2, 500, 'star');
      this.d.fx.ring(cx, cy, r.width * 0.4, r.width * 1.3, 600, '255,213,107', now, 3);
      this.d.fx.label(cx, cy - r.height * 0.8, '★ ×2', 'gold', 30, now);
    }
    this.d.hud.announce(this.d.cardName(id));
  }

  private onPickTier(p: IdleEvents['pick:tier']): void {
    const now = this.now();
    if (!this.d.cam.budget.beginExclusive(1600, now)) return;
    this.play(CUES.pickTier, this.d.state().run.depth, 3);
    const r = this.d.hud.cardRect('pick');
    if (r) this.d.fx.sparksAt(r.left + r.width / 2, r.top + r.height / 2, 40, 'gold', now, 250, 600, 900, 0, Math.PI * 2, 300, 'star');
    this.d.hud.stamp(this.d.cardName(`tool:${p.tier}`), p.tiers > 1 ? `+${p.tiers}` : '×2.5', 'amber');
  }

  private onComboTier(p: IdleEvents['combo:tier']): void {
    const now = this.now();
    if (this.d.cam.budget.admitT3(now) > 0) return;
    this.play(CUES.comboTier, this.d.state().run.depth, 3);
    const pt = this.d.hud.comboPoint();
    if (pt) {
      this.d.fx.ring(pt.x, pt.y, 20, 64, 500, p.tier >= 50 ? '143,227,238' : '255,179,92', now, 3);
      this.d.fx.sparksAt(pt.x, pt.y, 24, (p.tier >= 50 ? 'rune' : 'amber') as SparkKind, now, 120, 300, 600, 0, Math.PI * 2, 0, 'star');
    }
  }

  private onSealHit(): void {
    const s = this.d.state();
    this.d.cam.kick(0, 1, false);
    for (let c = 0; c < 7; c++) this.d.scene.cellFx(s.run.depth, c, CUES.sealHit.flash * 0.6, c === 3 ? CUES.sealHit.pop : 0, 0);
  }

  private onSealBreak(p: IdleEvents['seal:break']): void {
    const now = this.now();
    this.d.cam.budget.beginExclusive(1200, now);
    this.play(CUES.sealBreak, p.depth, 3);
    this.d.hud.stamp(t('ui.stamp.sealBroken'), '', 'white');
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  /** Cells the last tap broke (tests). */
  get lastCells(): number {
    return this.lastTapCells;
  }
}
