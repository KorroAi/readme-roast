import type { WorldLayout } from '../gen/types';

/**
 * FNV-1a (32-bit) fingerprint of a generated zone: every voxel of the volume plus the prop ids
 * in order. Saves record WORLD.genVersion; tests/unit/genVersion.test.ts pins this fingerprint
 * to it, so a generator change that moves a single block or prop fails until genVersion is
 * bumped (and old world edits are then dropped instead of being applied to a different world).
 */
export function worldFingerprint(layout: Pick<WorldLayout, 'world' | 'props'>): string {
  let h = 0x811c9dc5;
  const blocks = layout.world.blocks;
  for (let i = 0; i < blocks.length; i++) {
    h ^= blocks[i];
    h = Math.imul(h, 0x01000193);
  }
  for (const p of layout.props) {
    for (let i = 0; i < p.id.length; i++) {
      h ^= p.id.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // Separator so ["ab","c"] and ["a","bc"] differ.
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
