// Determinism of the hybrid's slabs (W3 of the old descent, kept for the new world): two generations of the same
// slab are byte-identical, and the slab worker's build equals the main thread's.
import { describe, expect, it } from 'vitest';
import { fingerprintBytes } from '../../../src/world/hybrid/fingerprint';
import { generateSlab } from '../../../src/world/hybrid/slab';
import { buildSlab } from '../../../src/world/hybrid/slabWorker';
import { clearLayoutCache } from '../../../src/world/hybrid/layout';
import { CONTEXT_ROWS } from '../../../src/world/hybrid/slabLight';
import { RING_SX, RING_SZ } from '../../../src/world/hybrid/grid';

describe('hybrid slab fingerprints', () => {
  it('are stable across caches and between the worker path and a direct generation', () => {
    const a = [0, 1, 2].map((k) => fingerprintBytes(generateSlab({ lifeSeed: 777, runSeed: 3, k, dugTo: 0 }).blocks));
    clearLayoutCache();
    const b = [0, 1, 2].map((k) => fingerprintBytes(generateSlab({ lifeSeed: 777, runSeed: 3, k, dugTo: 0 }).blocks));
    expect(b).toEqual(a);
    const w = buildSlab({ id: 1, lifeSeed: 777, runSeed: 3, k: 1, dugTo: 0, opened: [], context: new Uint8Array(RING_SX * CONTEXT_ROWS * RING_SZ) });
    expect(fingerprintBytes(w.blocks)).toBe(a[1]);
  });
});
