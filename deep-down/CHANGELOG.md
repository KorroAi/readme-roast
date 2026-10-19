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

### Round 2 — architecture, geology and the light budget (`generateWorld.ts`, `blocks.ts`)
- Cyan budget: the shrine's glyph lattice, the all-glyph floor, glowing inlays, glyph balusters,
  pillar bands and bridge/balcony glyph posts are gone. Four inscriptions remain (22 glyph stones,
  was 160): the gate frieze, the shrine's back-wall band over a dais, the shrine-door lintel (the
  secret's hint) and three runes in the balcony parapet. Glyph emission ÷4, crystal emission ÷2,
  cyan light ×0.76. Crystal is now a *seam* in exposed host rock plus faceted cluster props
  (crystal voxels 179 → 35). Saturated-cyan pixels per tour shot ≤ 3.1 % (shrine 17.6 % → 0.1 %).
- Built forms: octagonal columns (footing, plinth, base ring, shaft, ring and abacus at the dome,
  fractured tops on broken ones) forming a processional way from the shrine to the gate, with
  kerbs, worn slabs, fallen drums and slabs; stair flights on piers with slab treads between
  cheek walls, battered bases and stepped arches, corbelled passages under them; a portal gate
  (stepped buttresses, pilasters, two doorway orders, lintel, frieze, cornices, forecourt); a
  corbel-vaulted shrine with a framed door; a single-arch bridge with end posts. The camp's
  glowing 3×3 hearth grid became a gravel ring with one ember under the fire.
- Geology: dipping strata with marker beds, ledges with sloping undersides, ribs, erosion
  pockets, dripstone with thick roots and uneven tapers, flowstone curtains, tunnel fissures and
  rubble, a broken lip on the ledge. New landmark **the Spindle**, a fluted hourglass column from
  floor to dome beside the Glimmerfall (`landmarks.spindle`; nothing renamed).
- Warm navigation light: 20 lamp posts (was 13) on the landings, mid-flights, stair foot, bridge
  ends, shrine door, seal and processional way; lamp light slightly warmer.
- Verified: `tsc`, all unit tests (worldgen, route walk, mining preconditions re-checked);
  generation 302–441 ms vs 363–628 ms before (same process); faces +14 %. New test: the light
  budget (≤ 120 cyan emitter voxels, today 86; a warm lamp within 7 m of every navigation point),
  measured by `tools/emission-budget.ts`.

### Round 2 — material library retune (`src/render/materials/*`)
- One palette (`palette.ts`): charcoal / blue-black rock, neutral-grey weathered rock (was
  beige), grey-green verdigris (was cyan), deep teal crystal lit from inside, cool ashlar,
  grey-brown aged timber. Value-field painters quantized through the ramps; the Bayer dither and
  single-pixel speckle are gone.
- Painters: folded beds, partings, joints that stop at partings, fractures, chips and facets for
  rock; worn plates for floors; laminated, pitted, stained weathered rock; damp stone painted on
  the slate's own rock (no glow); soil horizons with roots (new `soilSide`); angular gravel;
  copper veins riding the host rock's fractures (ore guaranteed in 99.9 % of 1 m windows); iron
  as banded metal and jasper with rust; prismatic crystal; large-course ashlar (1.5–3.5 m stones)
  and crumbling masonry as the *same* wall loosening; soot hearth stones; checked timber.
  Layers 23 → 26 (`soilSide`, `copperTop`, `ironTop`). Inventory icons and debris colours follow
  the palette.
- Visual Lab **Transitions** view (`visuallab.html?view=transitions`): stone↔soil, ↔weathered,
  ↔copper/iron, ↔crystal, masonry↔crumbling, masonry under natural rock, a mixed wall across a
  chunk seam, irregular steps; orbiting lantern + fixed cyan light, Angle and Fog buttons,
  `cam= fog= lt= amb= labels=` URL parameters for repeatable captures.
- Verified: `tsc`, unit tests, five capture rounds (`artifacts/matlib-0..5`). Painting 0.37–0.54 s
  (was 0.23–0.39 s, same session), +0.25 MiB of texture.

### Explorer redesign (`src/entities/character/*`)
- A silhouette readable from behind at phone size: pack-frame poles above a tipped-back brim, red
  scarf, ochre coat with mid-calf tails, olive duffel, cream bedroll, tall boots; no cyan on the
  explorer. Coat tails flare and swing without passing through the legs; a vial swings like a
  tiny lantern. Rig and animation API unchanged; 17 meshes / 2220 triangles (was 14 / 1932).
- Verified: character tests 14/14 (tail and vial behaviour included).

## 0.1.0 — vertical slice "The Lantern Hollow"
- Complete M1 slice: voxel world + light, world generation, player/camera/mining, props and
  explorer, audio, gameplay rules, saves, UI, Visual Lab, Android shell. See TEST_REPORT.md.
