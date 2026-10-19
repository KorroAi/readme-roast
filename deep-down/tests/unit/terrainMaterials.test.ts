import { describe, expect, it } from 'vitest';
import { B, BLOCKS } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { meshChunk } from '../../src/render/mesher';
import { BLOCK_SURFACES, FAMILY_OF, MAT_SIDE, MATERIAL_NAMES, generateMaterials } from '../../src/render/materials';

// Guarantees of the world-space terrain material system (see TECHNICAL_ARCHITECTURE.md).

describe('terrain material layers', () => {
  const atlas = generateMaterials();
  const S = atlas.size;
  const px = (layer: number, x: number, y: number, ch: number) => atlas.data[layer * S * S * 4 + (((y + S) % S) * S + ((x + S) % S)) * 4 + ch];

  it('paints one layer per material, deterministically', () => {
    expect(atlas.layers).toBe(MATERIAL_NAMES.length);
    const again = generateMaterials();
    expect(Buffer.compare(Buffer.from(atlas.data), Buffer.from(again.data))).toBe(0);
  });

  it('tiles seamlessly: the wrap seam is no rougher than any boundary inside the texture', () => {
    // Mean |difference| between two adjacent rows (or columns) a and b of a layer.
    const rowDiff = (l: number, a: number, b: number) => {
      let d = 0;
      for (let x = 0; x < S; x++) for (let ch = 0; ch < 3; ch++) d += Math.abs(px(l, x, a, ch) - px(l, x, b, ch));
      return d / (S * 3);
    };
    const colDiff = (l: number, a: number, b: number) => {
      let d = 0;
      for (let y = 0; y < S; y++) for (let ch = 0; ch < 3; ch++) d += Math.abs(px(l, a, y, ch) - px(l, b, y, ch));
      return d / (S * 3);
    };
    for (let l = 0; l < atlas.layers; l++) {
      let maxRow = 0;
      let maxCol = 0;
      for (let k = 1; k < S; k++) {
        maxRow = Math.max(maxRow, rowDiff(l, k - 1, k));
        maxCol = Math.max(maxCol, colDiff(l, k - 1, k));
      }
      const name = MATERIAL_NAMES[l];
      // Structured materials have joints (mortar, board gaps) at the wrap like anywhere else;
      // a seam is a boundary rougher than every interior one.
      expect(rowDiff(l, S - 1, 0), `${name} vertical wrap`).toBeLessThanOrEqual(maxRow * 1.1 + 1);
      expect(colDiff(l, S - 1, 0), `${name} horizontal wrap`).toBeLessThanOrEqual(maxCol * 1.1 + 1);
    }
  });

  it('gives every visible block a surface', () => {
    for (const b of BLOCKS) {
      if (!b || !b.visible) continue;
      expect(BLOCK_SURFACES[b.id], `block ${b.id}`).toBeDefined();
    }
  });
});

describe('mesher data for the terrain shader', () => {
  /** World 32 wide: a slate wall crossing the x = 16 chunk boundary, with soil in it. */
  function world(): VoxelWorld {
    const w = new VoxelWorld(32, 16, 16);
    for (let x = 4; x < 28; x++) for (let y = 0; y < 8; y++) w.setRaw(x, y, 8, B.SLATE);
    w.setRaw(10, 3, 8, B.SOIL);
    w.setRaw(20, 3, 8, B.ANCIENT_BRICK);
    return w;
  }

  it('gives a vertex on a chunk boundary the same sculpting rigidity from both chunks (no cracks)', () => {
    const w = world();
    const a = meshChunk(w, 0, 0, 0);
    const b = meshChunk(w, 1, 0, 0);
    const rig = (m: ReturnType<typeof meshChunk>, ox: number) => {
      const out = new Map<string, number>();
      for (let v = 0; v < m.vertexCount; v++) {
        const key = `${m.positions[v * 3] + ox},${m.positions[v * 3 + 1]},${m.positions[v * 3 + 2]}`;
        const r = (m.data[v * 4 + 3] >> 2) & 3;
        if (out.has(key)) expect(out.get(key), `vertex ${key} within one chunk`).toBe(r);
        out.set(key, r);
      }
      return out;
    };
    const ra = rig(a, 0);
    const rb = rig(b, 16);
    let shared = 0;
    for (const [k, r] of ra) {
      if (!rb.has(k)) continue;
      shared++;
      expect(rb.get(k), `vertex ${k} across the boundary`).toBe(r);
    }
    expect(shared).toBeGreaterThan(4);
  });

  it('lists same-family neighbours of another material as boundary partners, and nothing else', () => {
    const w = world();
    const m = meshChunk(w, 0, 0, 0);
    // The +Z face (face 4) of slate (9,3,8) has soil at +X: soil must be a partner, its other edges none.
    let checked = 0;
    for (let f = 0; f < m.faceCount; f++) {
      const v = f * 4;
      const face = m.data[v * 4];
      if (face !== 4) continue;
      const xs = [0, 1, 2, 3].map((c) => m.positions[(v + c) * 3]);
      const ys = [0, 1, 2, 3].map((c) => m.positions[(v + c) * 3 + 1]);
      if (Math.min(...xs) !== 9 || Math.min(...ys) !== 3) continue;
      const nb = [0, 1, 2, 3].map((k) => m.nb[v * 4 + k]);
      // Z faces: t1 = X, t2 = Y -> [-X, +X, -Y, +Y]
      expect(nb[1]).toBe(MAT_SIDE[B.SOIL]);
      expect(nb[0]).toBe(255);
      expect(nb[2]).toBe(255);
      expect(nb[3]).toBe(255);
      checked++;
    }
    expect(checked).toBe(1);
    // Masonry is another family: the slate beside it lists no partner toward it.
    const m2 = meshChunk(w, 1, 0, 0);
    for (let f = 0; f < m2.faceCount; f++) {
      const v = f * 4;
      if (m2.data[v * 4] !== 4) continue;
      const xs = [0, 1, 2, 3].map((c) => m2.positions[(v + c) * 3]);
      const ys = [0, 1, 2, 3].map((c) => m2.positions[(v + c) * 3 + 1]);
      if (Math.min(...xs) + 16 !== 19 || Math.min(...ys) !== 3) continue;
      expect(m2.nb[v * 4 + 1]).toBe(255);
      checked++;
    }
    expect(checked).toBe(2);
    expect(FAMILY_OF[B.SLATE]).toBe(FAMILY_OF[B.SOIL]);
    expect(FAMILY_OF[B.SLATE]).not.toBe(FAMILY_OF[B.ANCIENT_BRICK]);
  });
});
