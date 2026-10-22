import { B } from '../config/blocks';
import type { EventBus, GameEvents } from '../core/events';
import { t } from '../i18n';
import type { DungeonSite, StratumLayout, V3 } from '../world/gen/strata/types';
import type { WorldSession } from './WorldSession';

declare module '../core/events' {
  interface GameEvents {
    /** A lever of the Halden works was pulled (k: its socket, 0-based). */
    'world:lever': { id: string; k: number; set: number; total: number };
    /** A pressure plate was stepped on: in order (ok) or not (every plate springs back). */
    'world:plate': { k: number; set: number; total: number; ok: boolean };
    /** The works' vault door opened. */
    'world:worksOpened': { id: string };
  }
}

/** What the lock needs from the game. */
export interface WorksHost {
  readonly session: WorldSession;
  readonly bus: EventBus<GameEvents>;
}

/**
 * The lock of the Halden works (round 3, WORLD; the §6 mini-dungeon): its levers or pressure plates
 * light the sockets over the vault door one by one; when every socket is lit the door opens. The
 * state lives in the voxels themselves (a socket's lamp cell is air or LIGHT_RUNE, the door's cells
 * HALDEN_DOOR or air), so a save keeps it as ordinary world edits and a reload resumes it exactly.
 *
 * Levers: any order (a pulled lever stays down). Plates: in order, the order shown by the lamps over
 * each plate room's drift (one lamp, two, three...); a wrong plate springs every plate back up.
 */
export class WorksLock {
  /** Seconds before a plate can trigger again (standing still on one does not repeat it). */
  private plateCool = 0;
  private lastPlate = -1;

  constructor(private readonly host: WorksHost) {}

  private get site(): DungeonSite | null {
    const l = this.host.session.layout as Partial<StratumLayout>;
    return l.dungeon ?? null;
  }

  private lit(c: V3): boolean {
    return this.host.session.world.get(c[0], c[1], c[2]) === B.LIGHT_RUNE;
  }

  /** How many sockets are lit (levers: any of them; plates: the first n in order). */
  setCount(): number {
    const d = this.site;
    return d ? d.sockets.filter((c) => this.lit(c)).length : 0;
  }

  isOpen(): boolean {
    const d = this.site;
    return !!d && d.door.every(([x, y, z]) => this.host.session.world.get(x, y, z) !== B.HALDEN_DOOR);
  }

  /** The Interact label of a lever. */
  leverLabel(id: string): string {
    const d = this.site;
    const k = d ? d.levers.indexOf(id) : -1;
    if (!d || k < 0) return t('world.lever.pull');
    return this.lit(d.sockets[k]) ? t('world.lever.down') : t('world.lever.pull');
  }

  /** Pull a lever (once: it stays down). Opens the door when it was the last. */
  pull(id: string): boolean {
    const d = this.site;
    const k = d ? d.levers.indexOf(id) : -1;
    if (!d || k < 0 || this.lit(d.sockets[k])) return false;
    this.setSocket(d.sockets[k], true);
    const set = this.setCount();
    this.host.bus.emit('world:lever', { id, k, set, total: d.sockets.length });
    if (set >= d.sockets.length) this.open();
    else this.host.bus.emit('toast', { text: t('world.lever.click', { count: set, total: d.sockets.length }), tone: 'info' });
    return true;
  }

  /** Per frame: a plate under the explorer's feet (feet height y). */
  update(dt: number, x: number, y: number, z: number): void {
    const d = this.site;
    if (!d || d.puzzle !== 'plates' || !d.plates.length) return;
    this.plateCool = Math.max(0, this.plateCool - dt);
    const fx = Math.floor(x);
    const fy = Math.floor(y - 0.05);
    const fz = Math.floor(z);
    if (this.host.session.world.get(fx, fy, fz) !== B.PRESSURE_PLATE) {
      this.lastPlate = -1;
      return;
    }
    const k = d.plates.findIndex((cells) => cells.some(([cx, cy, cz]) => cx === fx && cy === fy && cz === fz));
    if (k < 0 || k === this.lastPlate || this.plateCool > 0 || this.isOpen()) return;
    this.lastPlate = k;
    this.plateCool = 0.6;
    if (this.lit(d.sockets[k])) return;
    // In order: plate k is right when the first k sockets are lit and no later one.
    const next = d.sockets.findIndex((c) => !this.lit(c));
    const total = d.sockets.length;
    if (k === next) {
      this.setSocket(d.sockets[k], true);
      const set = this.setCount();
      this.host.bus.emit('world:plate', { k, set, total, ok: true });
      if (set >= total) this.open();
      else this.host.bus.emit('toast', { text: t('world.plate.click', { count: set, total }), tone: 'info' });
    } else {
      for (const c of d.sockets) if (this.lit(c)) this.setSocket(c, false);
      this.host.bus.emit('world:plate', { k, set: 0, total, ok: false });
      this.host.bus.emit('toast', { text: t('world.plate.wrong'), tone: 'warn' });
      this.plateCool = 1.5;
    }
  }

  /** Open the vault's door (every socket lit), or say how to (the door's hint). */
  open(): boolean {
    const d = this.site;
    if (!d || this.isOpen()) return false;
    const s = this.host.session;
    for (const [x, y, z] of d.door) if (s.world.get(x, y, z) === B.HALDEN_DOOR) s.setBlock(x, y, z, B.AIR);
    this.host.bus.emit('world:worksOpened', { id: d.id });
    this.host.bus.emit('toast', { text: t('world.works.open'), tone: 'good' });
    return true;
  }

  /** The line for a barred door (UI may show it when the explorer bumps it). */
  sealedLine(): string {
    const d = this.site;
    return t(d?.puzzle === 'plates' ? 'world.works.sealedPlates' : 'world.works.sealed');
  }

  private setSocket(c: V3, on: boolean): void {
    this.host.session.setBlock(c[0], c[1], c[2], on ? B.LIGHT_RUNE : B.AIR);
  }
}
