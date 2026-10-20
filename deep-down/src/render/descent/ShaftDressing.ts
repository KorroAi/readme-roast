import { B } from '../../config/blocks';
import { HaloSystem, type HaloSource } from '../../game/effects/Halos';
import type { LightingUniforms } from '../lighting';
import type { DescentWorld } from './DescentWorld';
import { SHAFT_CX } from './DescentCamera';

/** Lamps every 6 m, lit once the floor is 4 m below them; brass plaques every 20 m (SPEC §6.8). */
export const LAMP_EVERY = 6;
export const PLAQUE_EVERY = 20;
const LAMP_Z = 57;

/**
 * The shaft's dressing: the receding trail of lamps up the dug shaft (the visual record of progress), with
 * their halos, and the brass depth plaques. Lamps are lit as the floor passes (a LIGHT_LAMP voxel in the dug
 * cell space in front of the back wall, and a hanging lantern prop), so the light floods in as you dig.
 */
export class ShaftDressing {
  readonly halos: HaloSystem;
  private readonly lit = new Map<number, { x: number; y: number; z: number }>();
  private readonly plaques = new Set<number>();
  private dirty = true;

  constructor(private readonly world: DescentWorld, lighting: LightingUniforms) {
    this.halos = new HaloSystem(lighting, []);
  }

  /** Lamp position for row r (alternating sides of the back wall). */
  static lampAt(r: number): { x: number; y: number; z: number } {
    const side = (r / LAMP_EVERY) % 2 === 0 ? -1 : 1;
    return { x: Math.floor(SHAFT_CX + side * 2.6), y: -r - 1, z: LAMP_Z };
  }

  update(floor: number): void {
    const w = this.world;
    const { first, last } = w.window;
    const top = Math.max(LAMP_EVERY, first * 16);
    // Light every lamp row at least 4 m above the floor, inside the live window.
    for (let r = Math.ceil(top / LAMP_EVERY) * LAMP_EVERY; r <= floor - 4 && r <= last * 16 + 15; r += LAMP_EVERY) {
      if (this.lit.has(r)) continue;
      const p = ShaftDressing.lampAt(r);
      if (w.ring.get(p.x, p.y, p.z) !== B.AIR) continue;
      w.setVoxel(p.x, p.y, p.z, B.LIGHT_LAMP);
      w.props.add({ id: `lamp:${r}`, kind: 'hangingLantern', x: p.x + 0.5, y: p.y, z: p.z + 0.5, rotY: 0, scale: 0.9, anchor: [p.x, p.y + 1, p.z - 1], emitters: [], seed: r });
      this.lit.set(r, p);
      this.dirty = true;
    }
    for (let r = Math.ceil(Math.max(PLAQUE_EVERY, top) / PLAQUE_EVERY) * PLAQUE_EVERY; r <= floor - 2 && r <= last * 16 + 15; r += PLAQUE_EVERY) {
      if (this.plaques.has(r)) continue;
      w.props.add({ id: `plaque:${r}`, kind: 'tablet', x: SHAFT_CX + 2.9, y: -r - 0.9, z: LAMP_Z - 0.35, rotY: 0, scale: 0.55, anchor: null, emitters: [], seed: r * 7 + 1, modelVariant: 0 });
      this.plaques.add(r);
    }
    // Forget what left the window (its voxels went with the slab).
    for (const [r] of this.lit)
      if (r < first * 16 || r > last * 16 + 15) {
        w.props.remove(`lamp:${r}`);
        this.lit.delete(r);
        this.dirty = true;
      }
    for (const r of this.plaques)
      if (r < first * 16 || r > last * 16 + 15) {
        w.props.remove(`plaque:${r}`);
        this.plaques.delete(r);
      }
    if (this.dirty) {
      this.dirty = false;
      const sources: HaloSource[] = [];
      for (const p of this.lit.values()) sources.push({ x: p.x, y: p.y, z: p.z, id: B.LIGHT_LAMP });
      for (const spec of w.liveProps.values()) for (const [x, y, z] of spec.emitters) sources.push({ x, y, z, id: B.LIGHT_LAMP });
      this.halos.setSources(sources);
    }
  }

  /** A full reset (a jump). */
  reset(): void {
    for (const [r] of this.lit) this.world.props.remove(`lamp:${r}`);
    for (const r of this.plaques) this.world.props.remove(`plaque:${r}`);
    this.lit.clear();
    this.plaques.clear();
    this.dirty = true;
  }

  /** Mark the halos for a rebuild (props came or went). */
  touch(): void {
    this.dirty = true;
  }

  get lamps(): number {
    return this.lit.size;
  }
}
