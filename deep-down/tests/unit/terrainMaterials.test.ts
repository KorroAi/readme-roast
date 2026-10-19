import { describe, expect, it } from 'vitest';
import { B, BLOCKS } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { meshChunk } from '../../src/render/mesher';
import { BLOCK_SURFACES, COURSE_LAYERS, FAMILY, FAMILY_OF, GEO_SIDE_OF, GEO_TOP_OF, MAT, MAT_SIDE, MAT_TOP, MATERIAL_NAMES, generateMaterials } from '../../src/render/materials';
import { COURSE_PIECE, courseGlsl, strips } from '../../src/render/materials/courses';
import { masonryBond } from '../../src/render/materials/masonry';
import { MAT_SIZE } from '../../src/render/materials/paint';

// Guarantees of the world-space terrain material system (see TECHNICAL_ARCHITECTURE.md).

describe('terrain material layers', () => {
  const atlas = generateMaterials();
  const S = atlas.size;
  const px = (layer: number, x: number, y: number, ch: number) => atlas.data[layer * S * S * 4 + (((y + S) % S) * S + ((x + S) % S)) * 4 + ch];

  it('paints one layer per material, deterministically', () => {
    expect(atlas.layers).toBe(MATERIAL_NAMES.length);
    const again = generateMaterials();
    let diff = 0;
    for (let i = 0; i < atlas.data.length; i++) if (atlas.data[i] !== again.data[i]) diff++;
    expect(diff).toBe(0);
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
      // Course libraries (masonry) are not tiled: the shader lays them strip by strip in 4 m
      // pieces and never samples across a strip or piece edge, so their wrap is not a seam
      // (each piece starting with a stone and ending on a joint is tested below).
      if (COURSE_LAYERS.includes(name)) continue;
      // Structured materials have joints (mortar, board gaps) at the wrap like anywhere else;
      // a seam is a boundary rougher than every interior one.
      expect(rowDiff(l, S - 1, 0), `${name} vertical wrap`).toBeLessThanOrEqual(maxRow * 1.1 + 1);
      expect(colDiff(l, S - 1, 0), `${name} horizontal wrap`).toBeLessThanOrEqual(maxCol * 1.1 + 1);
    }
  });

  // Mean linear luminance of a layer's albedo.
  const lum = (l: number) => {
    let sum = 0;
    for (let i = 0; i < S * S; i++) {
      const lin = (c: number) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
      const o = l * S * S * 4 + i * 4;
      sum += 0.2126 * lin(atlas.data[o]) + 0.7152 * lin(atlas.data[o + 1]) + 0.0722 * lin(atlas.data[o + 2]);
    }
    return sum / (S * S);
  };

  it('keeps worn rock floors darker than their walls (albedos are reflectances; floors get more light)', () => {
    for (const [top, side] of [['stoneTop', 'stoneSide'], ['deepTop', 'deepSide'], ['weatheredTop', 'weatheredSide'], ['dampTop', 'dampSide']] as const) {
      expect(lum(MAT[top]), `${top} vs ${side}`).toBeLessThan(lum(MAT[side]) * 0.9);
    }
  });

  it('paints no pale speckle on rock floors: isolated texels a step above their neighbours are rare', () => {
    // Speckle = a small cluster brighter than everything around it (worn plates are broad areas).
    for (const name of ['stoneTop', 'deepTop'] as const) {
      const l = MAT[name];
      const v = (x: number, y: number) => px(l, x, y, 0) + px(l, x, y, 1) + px(l, x, y, 2);
      let speck = 0;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          let ring = 0;
          for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) ring = Math.max(ring, v(x + dx, y + dy));
          if (v(x, y) > ring * 1.12 + 6) speck++;
        }
      expect(speck / (S * S), name).toBeLessThan(0.01);
    }
  });

  it('keeps the hearth a soot fire bed with a few embers, not a glowing crack network', () => {
    const l = MAT.hearth;
    let glowing = 0;
    for (let i = 0; i < S * S; i++) if (atlas.data[l * S * S * 4 + i * 4 + 3] > 40) glowing++;
    expect(glowing / (S * S)).toBeGreaterThan(0);
    expect(glowing / (S * S)).toBeLessThan(0.006);
  });

  it('lays the builders\' script as eight lines with a headline, glyphs and a baseline groove', () => {
    const l = MAT.script;
    for (let line = 0; line < 8; line++) {
      const rowInk = (r: number) => {
        let n = 0;
        for (let x = 0; x < S; x++) if (px(l, x, line * 16 + r, 3) >= 250) n++;
        return n / S;
      };
      const rowCarved = (r: number) => {
        let n = 0;
        for (let x = 0; x < S; x++) if (px(l, x, line * 16 + r, 3) >= 60) n++;
        return n / S;
      };
      // Headline under most of the line (broken at word gaps), glyph strokes below it, the
      // baseline groove almost continuous, and blank margins between lines.
      expect(rowInk(1), `line ${line} headline`).toBeGreaterThan(0.6);
      expect(rowInk(1), `line ${line} word gaps`).toBeLessThan(0.97);
      let body = 0;
      for (let r = 3; r <= 11; r++) body += rowInk(r);
      expect(body / 9, `line ${line} glyphs`).toBeGreaterThan(0.12);
      expect(rowCarved(14), `line ${line} baseline`).toBeGreaterThan(0.9);
      expect(rowCarved(0) + rowCarved(15), `line ${line} margins`).toBe(0);
    }
  });

  it('gives natural rock both of its layers (the shader picks top or side from the sculpted normal)', () => {
    for (const [idStr, sfc] of Object.entries(BLOCK_SURFACES)) {
      const id = Number(idStr);
      if (sfc.family !== FAMILY.GEOLOGY) continue;
      expect(GEO_TOP_OF[MAT_SIDE[id]], `block ${id} side -> top`).toBe(MAT_TOP[id]);
      expect(GEO_TOP_OF[MAT_TOP[id]], `block ${id} top -> top`).toBe(MAT_TOP[id]);
      expect(GEO_SIDE_OF[MAT_TOP[id]], `block ${id} top -> side`).toBe(MAT_SIDE[id]);
      expect(GEO_SIDE_OF[MAT_SIDE[id]], `block ${id} side -> side`).toBe(MAT_SIDE[id]);
    }
    // Masonry, timber and crystal layers map to themselves.
    for (const n of ['masonry', 'floorSlab', 'plank', 'crystal', 'hearth'] as const) {
      expect(GEO_TOP_OF[MAT[n]]).toBe(MAT[n]);
      expect(GEO_SIDE_OF[MAT[n]]).toBe(MAT[n]);
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

describe('masonry course libraries (laid in courses by the terrain shader)', () => {
  it('fills every library layer with strips whose 4 m pieces start with a stone and end on a joint', () => {
    for (const lib of ['A', 'B'] as const) {
      const { ids, strips: list } = masonryBond(lib);
      expect(list.reduce((a, s) => a + s.h, 0), `library ${lib} rows`).toBe(MAT_SIZE);
      for (const st of list) {
        for (let y = st.y0; y < st.y0 + st.h; y++) {
          // The shader may lay any piece after any other, mirrored or not, so the joint must sit
          // exactly on each piece's last column and never on the one before it.
          for (let p = 0; p < MAT_SIZE; p += COURSE_PIECE) {
            expect(ids[p + COURSE_PIECE - 1 + y * MAT_SIZE], `${lib} row ${y} piece ${p} last column`).toBe(-1);
            if (y < st.y0 + st.h - 1 && ids[p + y * MAT_SIZE] >= 0) expect(ids[p + COURSE_PIECE - 2 + y * MAT_SIZE], `${lib} row ${y} piece ${p}`).toBeGreaterThanOrEqual(0);
          }
        }
        // The bottom row of every course is its bed joint.
        for (let x = 0; x < MAT_SIZE; x++) expect(ids[x + (st.y0 + st.h - 1) * MAT_SIZE]).toBe(-1);
      }
    }
  });

  it('treats exactly the masonry-family layers as course libraries (the shader courses that family)', () => {
    const masonryLayers = new Set<string>();
    for (const sfc of Object.values(BLOCK_SURFACES)) if (sfc.family === FAMILY.MASONRY) for (const n of [sfc.top, sfc.side, sfc.bottom]) masonryLayers.add(n);
    for (const n of masonryLayers) expect(COURSE_LAYERS, n).toContain(n);
    for (const n of COURSE_LAYERS) expect(MATERIAL_NAMES).toContain(n);
  });

  it('gives the shader a strip for every course height of library A', () => {
    const glsl = courseGlsl({ masonry: 1, masonryB: 2, crumbling: 3, crumblingB: 4 });
    for (const st of strips('A')) expect(glsl).toContain(`${st.y0.toFixed(1)}`);
    expect(new Set(strips('A').map((s) => s.h))).toEqual(new Set([8, 16, 24, 32]));
  });
});
