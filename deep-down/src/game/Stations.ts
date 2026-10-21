import { B, SOLID } from '../config/blocks';
import { NODES, type StationId } from '../config/recipes';
import { t } from '../i18n';
import type { PlotDef, PropSpec } from '../world/gen/types';
import type { Game } from './Game';

/** How long a station takes to rise out of the floor (s), and how deep it starts (m, per kind). */
export const RISE_SECONDS = 1.6;
const RISE_DEPTH: Record<StationId, number> = { forge: 2.9, surveyTable: 1.25, relicShelf: 1.8 };
/** Stations are drawn a little larger than the camp furniture: they are the camp's landmarks. */
export const STATION_SCALE: Record<StationId, number> = { forge: 1.2, surveyTable: 1.15, relicShelf: 1.2 };

/** Prop id of a built station. */
export const stationPropId = (id: StationId): string => `station:${id}`;

interface Rising {
  id: StationId;
  t: number;
  dust: number;
}

/**
 * The camp stations (final pass W3): the Survey Table, the Forge and the Relic Shelf. Each has a
 * plot at camp (a chalk outline and a stake, world/gen/progression); once built, the station rises
 * out of the floor there in 1.6 s with dust, and stays (Progression saves the built list). The
 * Forge opens its tab of the tree, the Table the Survey board, the Shelf the Journal's runes.
 *
 * The rise waits until no screen covers the camp, so it is seen: building from the tree queues it.
 */
export class Stations {
  private rising: Rising[] = [];
  private pending: StationId[] = [];

  constructor(private readonly game: Game) {}

  private get plots(): readonly PlotDef[] {
    return this.game.session.layout.progression?.plots ?? [];
  }

  plot(id: StationId): PlotDef | null {
    return this.plots.find((p) => p.station === id) ?? null;
  }

  /** The stake prop of a plot (generated), by station. */
  stakeId(id: StationId): string | null {
    return this.game.session.layout.props.find((p) => p.kind === 'plotStake' && p.station === id)?.id ?? null;
  }

  /** A world was loaded: built stations stand on their plots (no rise), the rest keep their stakes. */
  attach(built: ReadonlySet<string>): void {
    this.rising = [];
    this.pending = [];
    for (const p of this.plots) {
      if (!built.has(p.station)) continue;
      this.removeStake(p.station);
      this.place(p, 0);
    }
  }

  /** A station was just built: it rises as soon as no screen covers the camp. */
  build(id: StationId): void {
    if (!this.plot(id) || this.pending.includes(id) || this.rising.some((r) => r.id === id)) return;
    this.pending.push(id);
  }

  /** The station is standing or rising now (not only queued). */
  standing(id: StationId): boolean {
    return this.game.session.liveProps.has(stationPropId(id));
  }

  get busy(): boolean {
    return this.pending.length > 0 || this.rising.length > 0;
  }

  update(dt: number): void {
    const g = this.game;
    if (this.pending.length && !g.ui.isBlockingInput()) {
      for (const id of this.pending) this.startRise(id);
      this.pending = [];
    }
    if (!this.rising.length) return;
    const s = g.session;
    for (const r of this.rising) {
      r.t += dt;
      const p = this.plot(r.id)!;
      const k = Math.min(1, r.t / RISE_SECONDS);
      const ease = 1 - Math.pow(1 - k, 3);
      s.props.setLift(stationPropId(r.id), -RISE_DEPTH[r.id] * (1 - ease));
      r.dust -= dt;
      if (r.dust <= 0 && k < 1) {
        r.dust = 0.08;
        const a = g.rng.next() * Math.PI * 2;
        const rad = 0.7 + g.rng.next() * 0.5;
        g.particles.dust(p.x + Math.cos(a) * rad, p.y + 0.1, p.z + Math.sin(a) * rad, 0x6b5e50, 3, g.rng, 0.5);
      }
      if (k >= 1) {
        s.props.setLift(stationPropId(r.id), 0);
        g.cameraRig.addTrauma(0.06);
      }
    }
    this.rising = this.rising.filter((r) => r.t < RISE_SECONDS);
  }

  /** The Relic Shelf shows these sockets lit (bit i = glyph i). */
  setShelfMask(mask: number): void {
    const s = this.game.session;
    const spec = s.liveProps.get(stationPropId('relicShelf'));
    if (!spec || spec.modelVariant === mask) return;
    spec.modelVariant = mask;
    s.props.add(spec);
  }

  label(spec: PropSpec): string {
    const id = spec.station;
    if (!id) return t('hud.interact');
    if (spec.kind === 'plotStake') return id === 'relicShelf' ? t('hint.plotShelf') : t('hint.plotBuild', { item: t(NODES[id].name) });
    return t(id === 'forge' ? 'hint.useForge' : id === 'surveyTable' ? 'hint.useTable' : 'hint.useShelf');
  }

  interact(spec: PropSpec): void {
    const g = this.game;
    const id = spec.station;
    if (!id) return;
    if (spec.kind === 'plotStake') {
      g.openCrafting('camp', id);
      return;
    }
    if (id === 'forge') g.openCrafting('forge');
    else if (id === 'surveyTable') g.openBoard();
    else g.openJournal('runes');
  }

  private startRise(id: StationId): void {
    const g = this.game;
    const p = this.plot(id);
    if (!p) return;
    this.removeStake(id);
    this.place(p, -RISE_DEPTH[id]);
    this.rising.push({ id, t: 0, dust: 0 });
    g.debris.burst(p.x, p.y + 0.15, p.z, [0x6b5e50, 0x4a4038, 0x3a332c], g.rng, { count: 16, speed: 2.4, size: [0.06, 0.16], spread: 0.9 });
    g.particles.dust(p.x, p.y + 0.2, p.z, 0x6b5e50, 12, g.rng, 1);
    g.cameraRig.addTrauma(0.1);
    g.bus.emit('station:built', { id, x: p.x, y: p.y, z: p.z });
  }

  private removeStake(id: StationId): void {
    const stake = this.stakeId(id);
    if (stake && this.game.session.liveProps.has(stake)) this.game.session.removeProp(stake);
  }

  /** Put the station prop on its plot (`lift` < 0: sunk into the floor, about to rise). */
  private place(p: PlotDef, lift: number): void {
    const g = this.game;
    const s = g.session;
    const id = stationPropId(p.station);
    if (s.liveProps.has(id)) {
      s.props.setLift(id, lift);
      return;
    }
    const emitters: Array<[number, number, number]> = [];
    if (p.station === 'forge') {
      // The coals' glow: a warm ember in the cell over the coal pan.
      const ex = Math.floor(p.x - 0.1 * Math.cos(p.rotY));
      const ez = Math.floor(p.z + 0.1 * Math.sin(p.rotY));
      emitters.push([ex, p.y, ez]);
      if (!SOLID[s.world.get(ex, p.y, ez)] && s.world.get(ex, p.y, ez) !== B.LIGHT_EMBER) s.setBlock(ex, p.y, ez, B.LIGHT_EMBER);
    }
    const spec: PropSpec = {
      id,
      kind: p.station,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY,
      scale: STATION_SCALE[p.station],
      // Built in place: a station never settles (mining the floor round it leaves it standing).
      anchor: null,
      emitters,
      interact: 'station',
      station: p.station,
      seed: 0x57a7 + p.station.length,
      ...(p.station === 'relicShelf' ? { modelVariant: g.progression.runeMask } : {}),
    };
    s.liveProps.set(id, spec);
    s.props.add(spec);
    s.props.setLift(id, lift);
    g.markHalosDirty();
  }
}
