# DEEP DOWN — Changelog

Newest first. Each entry says what changed and how it was verified.

## Unreleased — visual identity pass

Checkpoint before this pass: git tag `checkpoint/pre-visual-refactor` (commit ce23151).

### Visual audit (baseline)
- 12 gameplay screenshots + 4 Visual Lab views captured from the running game (915×412, Balanced,
  SwiftShader) in `artifacts/audit-before/` (git-ignored) and scored by three independent critics
  (originality/geometry, materials/seams, lighting/readability). Consensus (1–10): geometry 3,
  textures 3, transitions ~2, lighting ~5, cyan/glyphs ~3, originality 2, readability ~5,
  character/props 5, post ~5, mobile risk 6. See ART_DIRECTION.md → "Visual audit".

### Terrain material system (replaces per-block tiles for terrain)
- Seamless 128×128 material layers sampled in **world space** (16 texels/m, 8 m period): a wall is
  one continuous surface, no per-block frame, bevel or brightness hash.
  (`src/render/materials/*`, `src/render/terrainMaterial.ts`)
- New material library: ancient dark stone, deep stone, weathered rock, damp stone with sparse
  lichen, soil with embedded stones and roots, scree gravel, copper and iron **veins** that run
  through the rock, faceted crystal, the plated seal stone, large-course ashlar masonry, cap
  stones, worn floor slabs, crumbling masonry, hearth stones, timber, abyssal bedrock.
- Natural material boundaries: the mesher bakes each face's in-plane neighbour materials into
  the vertex data; the shader lets the "taller" material (pebbles, rock nubs, vein metal) push
  across the edge with a world-space wobble, identically from both sides. Only same-family
  materials blend (geology with geology, masonry with masonry).
- Crack-free sculpting: vertices are displaced by world-space noise scaled by a per-vertex
  rigidity (natural rock most, masonry a little, timber not at all) taken from the 8 voxels
  around the vertex, so shared vertices always move together. Faceted normals from screen-space
  derivatives catch the lantern.
- Shading: equalized wall shade (no Minecraft per-axis brightness steps), AO floor raised; crystal
  faces no longer lit by their own emission.
- Runes: eight-glyph "builders' script" decals (`rune0..7` tiles) carved into glyph stones,
  eroded by world-space noise, dim until the lantern is near.
- Mining cracks and the target highlight are drawn by the terrain shader on the sculpted surface
  (the floating crack box and outline are only used by tools without a terrain rig).
- Material painting (≈0.35 s) runs in the zone worker with the world generation.
- Verified: `tsc` clean, 340 unit tests, 4/4 e2e (slice spec's seal step allowed 30 s instead of
  12 s: software rendering on this container is slower, see TEST_REPORT.md), screenshots in
  `artifacts/iter1/`.
- Cost: on SwiftShader the new terrain renders ~20–35 % slower than the old one in an A/B on the
  same machine (camp 13 → 11 fps, tunnel 8 → 5). GPU cost on a phone is unmeasured.

## 0.1.0 — vertical slice "The Lantern Hollow"
- Complete M1 slice: voxel world + light, world generation, player/camera/mining, props and
  explorer, audio, gameplay rules, saves, UI, Visual Lab, Android shell. See TEST_REPORT.md.
