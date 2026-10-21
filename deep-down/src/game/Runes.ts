import { RUNE_ITEMS, type ItemId } from '../config/items';
import { MOTHS } from '../config/balance';
import { RUNE_GLYPH } from '../config/runes';
import { t, type TextKey } from '../i18n';
import type { PropSpec } from '../world/gen/types';
import type { Game } from './Game';

/** Within this far of the black stone's faces (m), the eight runes wake it. */
export const FINALE_RANGE = 4;
/** "The Answer" shows first; the end card follows after this long (s). */
export const ENDING_DELAY = 4.5;

export const RUNES_TOTAL = RUNE_ITEMS.length;

/**
 * The eight runes and the finale (final pass W3).
 *
 * - Seven rune stones (world/gen/progression) and the shrine's Ancient Tablet (the Lantern rune).
 *   Taking one gives its key item (never lost), a journal page with one line, a lit socket on the
 *   Relic Shelf (the first rune raises the shelf at camp), and 'relic:found'.
 * - With all eight, the black stone's niche turns from violet to cyan. Touching it, or coming
 *   within 4 m of its faces, gives "The Answer" (one line), and then 'finale:reached' (once,
 *   saved; the screens show the end card on it).
 *
 * The world's black stone (game/WorldFeatures) stays cold and silent until then: its stoneAwake
 * hook reads this class.
 */
export class Runes {
  /** Seconds until the end card is announced (after "The Answer"), or null. */
  private endingIn: number | null = null;
  private awakeShown = false;

  constructor(private readonly game: Game) {}

  /** Rune key items found, in RUNE_ITEMS order. */
  found(): ItemId[] {
    const j = this.game.journal;
    return RUNE_ITEMS.filter((id) => j.hasKeyItem(id));
  }

  get count(): number {
    return this.found().length;
  }

  /** Bit i set: the rune with glyph i is found (the Relic Shelf's lit sockets). */
  get mask(): number {
    let m = 0;
    for (const id of this.found()) m |= 1 << (RUNE_GLYPH[id] ?? 0);
    return m;
  }

  get awake(): boolean {
    return this.count >= RUNES_TOTAL;
  }

  /** A world was loaded: taken stones are gone, the stone wakes if all eight are home. */
  attach(): void {
    const g = this.game;
    const s = g.session;
    this.endingIn = null;
    this.awakeShown = false;
    g.features.stoneAwake = () => this.awake;
    for (const r of s.layout.progression?.runes ?? []) {
      if (g.journal.hasKeyItem(r.item) && s.liveProps.has(r.prop)) s.removeProp(r.prop, false);
    }
    this.syncStone();
    // A finale reached but whose end card never showed (the game closed in between): show it now.
    if (g.progression.finale && !g.progression.hintsShown.has('ending')) this.endingIn = 1;
  }

  label(): string {
    return t('hint.takeRune');
  }

  /** Take a rune stone (interact 'rune'). */
  take(spec: PropSpec): void {
    const g = this.game;
    const item = spec.rune?.item as ItemId | undefined;
    if (!item || !RUNE_ITEMS.includes(item as (typeof RUNE_ITEMS)[number])) return;
    g.session.removeProp(spec.id);
    g.clearFocus();
    g.markHalosDirty();
    g.particles.sparkle(spec.x, spec.y + 0.5, spec.z, 0x8ff6ff, 18, g.rng, 2);
    g.grant(item, 1);
    this.onFound(item);
  }

  /**
   * A rune joined the journal (a stone, or the shrine's tablet): its page, its socket, the shelf.
   * Safe to call twice for one rune (the second call does nothing).
   */
  onFound(item: ItemId): void {
    const g = this.game;
    const p = g.progression;
    if (!g.journal.hasKeyItem(item) || p.relicPlaced(item)) return;
    p.placeRelic(item);
    p.markFound(item);
    const count = this.count;
    g.bus.emit('relic:found', { id: item, count, total: RUNES_TOTAL });
    // Its page: the banner shows "count / 8" over the rune's one line.
    g.ui.showDiscovery({ id: `rune.${item}`, title: t(`item.${item}` as TextKey), body: t(`item.${item}.line` as TextKey), index: count, total: RUNES_TOTAL, major: count === RUNES_TOTAL });
    if (p.ensureShelf()) g.ui.toast(t('toast.shelfRises'), 'info');
    else g.ui.toast(t('toast.runeSocket', { count, total: RUNES_TOTAL }), 'info');
    p.syncShelf();
    this.syncStone();
    g.saveNow('rune');
  }

  /** The world's black stone was touched (WorldFeatures emits 'world:monolith'). */
  onStoneTouched(): void {
    if (this.awake && !this.game.progression.finale) this.reach();
    else if (this.awake) this.game.ui.hint(t('hint.stoneStirs'), 2600);
  }

  update(dt: number): void {
    const g = this.game;
    if (this.awake && !g.progression.finale) {
      const stone = this.stoneSpec();
      if (stone && g.features.focusDistance(stone, g.player.x, g.player.y, g.player.z) <= FINALE_RANGE) this.reach();
    }
    if (this.endingIn !== null) {
      this.endingIn -= dt;
      if (this.endingIn <= 0 && !g.ui.isBlockingInput()) {
        this.endingIn = null;
        g.progression.hintsShown.add('ending');
        g.bus.emit('finale:reached', {});
        g.saveNow('ending');
      }
    }
  }

  /** Debug: give the first `n` runes (glyph order is not kept: RUNE_ITEMS order), with their pages. */
  debugGrant(n: number): number {
    let k = 0;
    for (const id of RUNE_ITEMS) {
      if (k >= n) break;
      k++;
      if (this.game.journal.hasKeyItem(id)) continue;
      const stone = this.game.session.layout.progression?.runes.find((r) => r.item === id);
      if (stone && this.game.session.liveProps.has(stone.prop)) this.game.session.removeProp(stone.prop);
      this.game.grant(id, 1);
      this.onFound(id);
    }
    return this.count;
  }

  /** The black stone answers: "The Answer", then the end card. Once per game. */
  private reach(): void {
    const g = this.game;
    const p = g.progression;
    if (p.finale) return;
    p.finale = true;
    const stone = this.stoneSpec();
    if (stone) g.features.flock.spiral(stone.x, stone.y + 4, stone.z, MOTHS.spiralRadius, MOTHS.spiralSeconds);
    g.cameraRig.addTrauma(0.25);
    g.discover('answer');
    g.renderer.post.params.flash = 0.3;
    g.renderer.post.params.flashColor.setRGB(0.3, 0.85, 0.95);
    this.endingIn = ENDING_DELAY;
  }

  private stoneSpec(): PropSpec | null {
    for (const spec of this.game.session.liveProps.values()) if (spec.kind === 'abyssMonolith') return spec;
    return null;
  }

  /** The stone's niche: violet asleep, cyan once all eight runes are found. */
  private syncStone(): void {
    const g = this.game;
    const stone = this.stoneSpec();
    if (!stone) return;
    const v = this.awake ? 1 : 0;
    if ((stone.modelVariant ?? 0) === v) return;
    stone.modelVariant = v;
    g.session.props.add(stone);
    if (v === 1 && !this.awakeShown) {
      this.awakeShown = true;
      g.renderer.post.params.flash = 0.2;
      g.renderer.post.params.flashColor.setRGB(0.25, 0.75, 0.9);
    }
  }
}
