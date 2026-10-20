import { describe, expect, it } from 'vitest';
import { BIOME_BLOCKS, BLOCKS, EMITTER_BASE } from '../../../src/config/blocks';
import { BIOME_LOOKS, EMITTER_RAMPS, HUMAN_AMBER, SECTION_STYLE, SPECIAL_RAMPS, WARM_BIOMES, toneHex } from '../../../src/idle/config/biomeLooks';
import { BIOMES } from '../../../src/idle/config/biomes';
import { EMITTER_ROW0, RAMP_STOPS, SECTION_ROWS, SPECIAL_ROW0, buildSectionTables, sectionRow, slotLookOfRow } from '../../../src/render/look';
import { deltaE2000, neutralRampLab, srgbToLab } from '../../../src/render/post/lut';

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

const rgb = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: number) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Display luminance (luma of the sRGB-encoded values). */
const dlum = (hex: number) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
function hue(hex: number): { h: number; s: number } {
  const [r, g, b] = rgb(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return { h: 0, s: 0 };
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: d / mx };
}
const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('the biome looks (src/idle/config/biomeLooks.ts)', () => {
  it('14 looks, one per authored biome, each with 8 slot ramps of 5 stops dark to light', () => {
    expect(BIOME_LOOKS.length).toBe(BIOMES.length);
    expect(BIOME_LOOKS.length).toBe(BIOME_BLOCKS);
    for (const [b, look] of BIOME_LOOKS.entries()) {
      expect(look.ramps.length, `biome ${b}`).toBe(8);
      for (const [slot, r] of look.ramps.entries()) {
        expect(r.stops.length).toBe(RAMP_STOPS);
        expect(SECTION_STYLE[r.style]).toBeTypeOf('number');
        for (let i = 1; i < 5; i++) expect(lum(r.stops[i]), `biome ${b} slot ${slot} stop ${i}`).toBeGreaterThan(lum(r.stops[i - 1]));
      }
    }
  });

  it('CRITIQUE B7: every host ramp mid sits ≥ 0.08 display luminance away from its biome fog', () => {
    for (const [b, look] of BIOME_LOOKS.entries())
      for (let slot = 0; slot < 4; slot++) expect(Math.abs(dlum(look.ramps[slot].stops[2]) - dlum(look.fog)), `biome ${b} slot ${slot}`).toBeGreaterThanOrEqual(0.08);
  });

  it('V5 distinctness from the look table: consecutive grades ΔE2000 ≥ 8 on a neutral ramp', () => {
    for (let i = 1; i < BIOME_LOOKS.length; i++) expect(deltaE2000(neutralRampLab(BIOME_LOOKS[i - 1]), neutralRampLab(BIOME_LOOKS[i])), `${i - 1} -> ${i}`).toBeGreaterThanOrEqual(8);
  });

  it('CRITIQUE B SHOULD 11: in warm biomes the human amber is ≥ 25° of hue from the accents, or the lantern whitens', () => {
    const amber = hue(HUMAN_AMBER).h;
    for (const b of WARM_BIOMES) {
      const L = BIOME_LOOKS[b];
      const lantern = hue(L.lantern);
      const apart = [L.accent, L.accent2].every((a) => hueDist(hue(a).h, amber) >= 25 || hue(a).s < 0.15);
      expect(apart || lantern.s < 0.12, `biome ${b}`).toBe(true);
    }
  });

  it('valuables stand out in their own ramps: ore, rich and gem mids ≥ 25 ΔE2000 from the host mids (V11 by design)', () => {
    for (const [b, look] of BIOME_LOOKS.entries())
      for (let v = 4; v <= 6; v++) {
        const vm = rgb(look.ramps[v].stops[3]);
        const best = Math.min(...[0, 1, 2, 3].map((h) => deltaE2000(srgbToLab(...vm), srgbToLab(...rgb(look.ramps[h].stops[2])))));
        expect(best, `biome ${b} slot ${v}`).toBeGreaterThanOrEqual(25);
      }
  });

  it('host toning is a pure desaturate-and-darken', () => {
    expect(toneHex(0x808080, 0.5, 1)).toBe(0x808080);
    expect(toneHex(0xc28c5e, 1, 1)).toBe(0xc28c5e);
    expect(toneHex(0xff0000, 0, 1)).toBe(0xffffff);
    const t = hue(toneHex(0xc28c5e, 0.55, 0.82));
    expect(t.s).toBeLessThan(hue(0xc28c5e).s);
  });
});

describe('the section tables (src/render/look.ts)', () => {
  it('maps every painted block id to a row and back', () => {
    for (let b = 0; b < BIOME_BLOCKS; b++) for (let slot = 0; slot < 8; slot++) expect(sectionRow(64 + 8 * b + slot)).toBe(8 * b + slot);
    expect(sectionRow(41)).toBe(SPECIAL_ROW0);
    expect(sectionRow(EMITTER_BASE)).toBe(EMITTER_ROW0);
    expect(sectionRow(1)).toBe(-1);
    expect(sectionRow(0)).toBe(-1);
    for (let row = 0; row < SECTION_ROWS; row++) expect(slotLookOfRow(row)).not.toBeNull();
    expect(SPECIAL_RAMPS.length).toBe(16);
    expect(EMITTER_RAMPS.length).toBe(16);
    // Every visible descent block 41..191 that is painted has a row.
    for (let id = 41; id < 192; id++) if (BLOCKS[id]?.visible && (id < 57 || id >= 64)) expect(sectionRow(id), `block ${id}`).toBeGreaterThanOrEqual(0);
  });

  it('builds deterministic ramp and parameter textures', () => {
    const a = buildSectionTables();
    const b = buildSectionTables();
    expect(a.ramp.length).toBe(RAMP_STOPS * SECTION_ROWS * 4);
    expect(a.param.length).toBe(2 * SECTION_ROWS * 4);
    expect(sameBytes(a.ramp, b.ramp)).toBe(true);
    // Row 0, stop 2 is biome 0 hostA's mid.
    const mid = BIOME_LOOKS[0].ramps[0].stops[2];
    expect([a.ramp[8], a.ramp[9], a.ramp[10]]).toEqual([(mid >> 16) & 255, (mid >> 8) & 255, mid & 255]);
    expect(a.param[0]).toBe(SECTION_STYLE[BIOME_LOOKS[0].ramps[0].style]);
  });
});
