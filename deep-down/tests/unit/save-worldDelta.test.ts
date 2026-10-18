import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/config/balance';
import { B, BLOCK_COUNT } from '../../src/config/blocks';
import { Rng } from '../../src/core/rng';
import { applyWorldEdits, encodeWorldEdits } from '../../src/save/worldDelta';

/** Index of the first differing byte, or -1. (Deep equality on 3 MB arrays is very slow in expect.) */
function firstDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

function randomWorld(n: number, seed: number): Uint8Array {
  const rng = new Rng(seed);
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = rng.int(0, BLOCK_COUNT - 1);
  return a;
}

describe('encodeWorldEdits', () => {
  it('is empty for an unchanged world', () => {
    const g = randomWorld(1000, 1);
    expect(encodeWorldEdits(g, g.slice())).toEqual([]);
  });

  it('lists [index, id] pairs in ascending index order', () => {
    const g = new Uint8Array(37).fill(B.SLATE);
    const c = g.slice();
    c[36] = B.AIR; // in the non-word tail
    c[0] = B.AIR;
    c[5] = B.COPPER_ORE;
    c[6] = B.AIR; // same word as 5
    expect(encodeWorldEdits(g, c)).toEqual([0, B.AIR, 5, B.COPPER_ORE, 6, B.AIR, 36, B.AIR]);
  });

  it('works on unaligned views', () => {
    const gBuf = new Uint8Array(41).fill(B.SLATE);
    const cBuf = gBuf.slice();
    cBuf[3] = B.AIR;
    cBuf[40] = B.AIR;
    const g = gBuf.subarray(1);
    const c = cBuf.subarray(1);
    expect(encodeWorldEdits(g, c)).toEqual([2, B.AIR, 39, B.AIR]);
  });

  it('throws on a size mismatch', () => {
    expect(() => encodeWorldEdits(new Uint8Array(8), new Uint8Array(9))).toThrow(RangeError);
  });
});

describe('applyWorldEdits', () => {
  it('reproduces the edited world from the generated one', () => {
    const g = randomWorld(5000, 2);
    const c = g.slice();
    const rng = new Rng(9);
    for (let k = 0; k < 300; k++) c[rng.int(0, c.length - 1)] = rng.int(0, BLOCK_COUNT - 1);
    const edits = encodeWorldEdits(g, c);
    const restored = g.slice();
    expect(applyWorldEdits(restored, edits)).toBe(edits.length / 2);
    expect(firstDiff(restored, c)).toBe(-1);
  });

  it('skips invalid pairs and a dangling index', () => {
    const blocks = new Uint8Array(10).fill(B.SLATE);
    const applied = applyWorldEdits(blocks, [
      1, B.AIR, // ok
      -1, B.AIR, // negative index
      10, B.AIR, // out of range
      2.5, B.AIR, // fractional index
      3, BLOCK_COUNT, // unknown block id
      4, -2, // negative id
      5, Number.NaN, // NaN id
      6, 255, // byte-sized but not a block
      7, B.COPPER_ORE, // ok
      8, // dangling
    ]);
    expect(applied).toBe(2);
    expect([...blocks]).toEqual([B.SLATE, B.AIR, B.SLATE, B.SLATE, B.SLATE, B.SLATE, B.SLATE, B.COPPER_ORE, B.SLATE, B.SLATE]);
  });

  it('accepts an empty list', () => {
    const blocks = new Uint8Array(4);
    expect(applyWorldEdits(blocks, [])).toBe(0);
  });
});

describe('world delta at full size', () => {
  it('an hour of mining stays compact and survives JSON', () => {
    const n = WORLD.sizeX * WORLD.sizeY * WORLD.sizeZ;
    const g = new Uint8Array(n).fill(B.SLATE);
    const c = g.slice();
    // ~3000 mined voxels, in tunnels (clustered), like real play.
    const rng = new Rng(4);
    let mined = 0;
    while (mined < 3000) {
      const start = rng.int(0, n - 64);
      for (let i = 0; i < 30; i++, mined++) c[start + i] = B.AIR;
    }
    const t0 = performance.now();
    const edits = encodeWorldEdits(g, c);
    const ms = performance.now() - t0;
    const json = JSON.stringify(edits);
    const restored = g.slice();
    applyWorldEdits(restored, JSON.parse(json));
    expect(firstDiff(restored, c)).toBe(-1);
    expect(edits.length / 2).toBeLessThanOrEqual(3000);
    expect(json.length).toBeLessThan(40_000);
    console.info(`[worldDelta] ${n} voxels scanned in ${ms.toFixed(2)} ms; ${edits.length / 2} edits = ${json.length} chars of JSON`);
  });
});
