import { describe, expect, it } from 'vitest';
import { B, BIOME_BLOCKS, EMIT_B, EMIT_G, EMIT_R } from '../../../src/config/blocks';
import { CELL } from '../../../src/idle/model/state';
import { baseBiome, biomeAt } from '../../../src/idle/config/biomes';
import { kitOf } from '../../../src/world/descent/biomeKits';
import { CELL_Z0, CELL_Z1, CUT, EMITTER_BUDGET, SHAFT_X0, cellVoxels, generateSlab, shaftAllowed } from '../../../src/world/descent/slab';
import { RING_SX, RING_SZ, SLAB_ROWS } from '../../../src/world/descent/RingWorld';
import { fingerprintSlab } from '../../../src/world/descent/fingerprint';
import { kindsFor } from './ringFixture';

const at = (blocks: Uint8Array, x: number, r: number, z: number) => blocks[x + RING_SX * (r + SLAB_ROWS * z)];

describe('slab generation (SPEC §6.4)', () => {
  it('W3: a slab is a pure function of (runSeed, index)', () => {
    for (const k of [0, 1, 2, 3, 7, 15, 24]) {
      const a = generateSlab({ runSeed: 7, k, kinds: kindsFor(7, k) });
      const b = generateSlab({ runSeed: 7, k, kinds: kindsFor(7, k) });
      expect(fingerprintSlab(a), `slab ${k}`).toBe(fingerprintSlab(b));
    }
    // Another run has other veins and caverns.
    expect(fingerprintSlab(generateSlab({ runSeed: 8, k: 5, kinds: kindsFor(8, 5) }))).not.toBe(fingerprintSlab(generateSlab({ runSeed: 7, k: 5, kinds: kindsFor(7, 5) })));
  });

  it('W5: the shaft footprint holds exactly the model cells, over 2,000 slabs (0-32,000 m)', () => {
    let bad = 0;
    let checked = 0;
    const t0 = performance.now();
    for (let k = 0; k < 2000; k++) {
      const seed = 11 + (k % 5);
      const kinds = kindsFor(seed, k);
      const s = generateSlab({ runSeed: seed, k, kinds });
      for (let r = 0; r < SLAB_ROWS; r++) {
        const kit = kitOf(baseBiome(biomeAt(k * SLAB_ROWS + r)));
        for (let c = 0; c < 7; c++)
          for (let z = CELL_Z0; z <= CELL_Z1; z++) {
            checked++;
            const id = at(s.blocks, SHAFT_X0 + c, r, z);
            if (!shaftAllowed(id, kinds[r * 7 + c], kit)) bad++;
          }
      }
    }
    expect(checked).toBe(2000 * SLAB_ROWS * 7 * 3);
    expect(bad).toBe(0);
    // Timing is reported, not asserted (a loaded machine proves nothing): about 25-55 ms a slab in Node here.
    console.log(`slab generation: ${((performance.now() - t0) / 2000).toFixed(1)} ms a slab`);
  }, 120_000);

  it('keeps the apron (z >= 60) air and draws the gate rows in carved stone', () => {
    const s = generateSlab({ runSeed: 7, k: 2, kinds: kindsFor(7, 2) });
    for (let z = CUT; z < RING_SZ; z++) for (let r = 0; r < SLAB_ROWS; r++) for (let x = 0; x < RING_SX; x++) expect(at(s.blocks, x, r, z)).toBe(B.AIR);
    // Row 40 (slab 2, r 8) is Glowroot's gate row; its frame columns beside the shaft are gate stone.
    expect(at(s.blocks, SHAFT_X0 - 1, 8, CUT - 1)).toBe(B.GATE_STONE);
  });

  it('authors the tutorial rows: copper at row 3, the chest at 6, the gem at 9, the open crossing at 24-27', () => {
    const s0 = generateSlab({ runSeed: 7, k: 0, kinds: kindsFor(7, 0) });
    const kit0 = kitOf(0);
    expect(cellVoxels(s0, 3, 2)[0]).toBe(kit0.ore);
    expect(cellVoxels(s0, 3, 5)[0]).toBe(kit0.ore);
    expect(cellVoxels(s0, 6, 3)[0]).toBe(B.CHEST_SHELL);
    expect(cellVoxels(s0, 9, 4)[0]).toBe(kit0.gem);
    expect(cellVoxels(s0, 0, 0)[0]).toBe(B.TOPSOIL);
    // The fossil slab beside the shaft at row 14 is a tappable prop.
    expect(s0.props.some((p) => p.tap === 'fossil' && p.y === -15)).toBe(true);
    const s1 = generateSlab({ runSeed: 7, k: 1, kinds: kindsFor(7, 1) });
    for (let row = 24; row <= 27; row++) for (let c = 0; c < 7; c++) expect(cellVoxels(s1, row - 16, c).every((v) => v === B.AIR), `row ${row}`).toBe(true);
    // Three crystal clusters stand in the crossing's grotto, the cavern opens the cut beside the shaft.
    expect(s1.props.filter((p) => p.tap === 'crystal').length).toBe(3);
    expect(at(s1.blocks, SHAFT_X0 - 3, 26 - 16, CUT - 1)).toBe(B.AIR);
    // The creature alcove at row 30 (lit).
    expect(s1.caverns.some((c) => c.id === 't30')).toBe(true);
  });

  it('places alcoves every 6-8 m (lit, 2-4 props) and pockets that cut the section', () => {
    const tops: number[] = [];
    let pockets = 0;
    let props = 0;
    for (let k = 3; k < 23; k++) {
      const s = generateSlab({ runSeed: 21, k, kinds: kindsFor(21, k) });
      for (const c of s.caverns) {
        if (c.kind === 'alcove' && c.top >= k * 16 && c.top < k * 16 + 16) tops.push(c.top);
        if (c.kind === 'pocket' && c.top >= k * 16 && c.top < k * 16 + 16) pockets++;
      }
      props += s.props.length;
    }
    tops.sort((a, b) => a - b);
    // Alcoves skip the seal halls at biome starts (240 m here).
    for (let i = 1; i < tops.length; i++) if (!(tops[i - 1] < 240 && tops[i] > 236)) expect(tops[i] - tops[i - 1], `alcoves at ${tops[i - 1]} and ${tops[i]}`).toBeLessThanOrEqual(14);
    expect(tops.length).toBeGreaterThanOrEqual(Math.floor((320 * 0.8) / 8));
    expect(pockets).toBeGreaterThanOrEqual(Math.floor(320 / 14) - 2);
    expect(props).toBeGreaterThan(100);
  });

  it('W6: keeps each slab inside its biome light budget', () => {
    for (let k = 0; k < 25; k++) {
      const s = generateSlab({ runSeed: 3, k, kinds: kindsFor(3, k) });
      const b = baseBiome(biomeAt(k * 16 + 8));
      const [lo, hi] = EMITTER_BUDGET[b];
      // Lamps owned by props count on top of the budget (they are the warm human light).
      let n = 0;
      // The shaft's own cells (rich ore and gems glow) are the model's, not the budget's.
      for (let i = 0; i < s.blocks.length; i++) {
        const id = s.blocks[i];
        const x = i % RING_SX;
        const z = Math.floor(i / (RING_SX * SLAB_ROWS));
        if (x >= SHAFT_X0 && x < SHAFT_X0 + 7 && z >= CELL_Z0) continue;
        if (id !== B.LIGHT_LAMP && (EMIT_R[id] | EMIT_G[id] | EMIT_B[id])) n++;
      }
      expect(n, `slab ${k} (biome ${b})`).toBeGreaterThanOrEqual(lo);
      expect(n, `slab ${k} (biome ${b})`).toBeLessThanOrEqual(hi + 2);
    }
  });

  it('uses only the biome block ids of the rows it holds (ragged boundaries blend neighbours)', () => {
    const s = generateSlab({ runSeed: 5, k: 7, kinds: kindsFor(5, 7) }); // 112-127 m: Glowroot into the Crystal Grotto
    const biomes = new Set<number>();
    for (const id of s.blocks) if (id >= 64 && id < 64 + 8 * BIOME_BLOCKS) biomes.add((id - 64) >> 3);
    expect([...biomes].sort()).toEqual([1, 2]);
    expect(CELL.ROCK).toBe(1);
  });
});
