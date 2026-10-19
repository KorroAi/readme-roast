# DEEP DOWN — Art Direction

The reference image is a mood target, not a source. Everything is generated in code.

## Pillars

1. **Darkness with intent.** The underground is dark, never unreadable. Big spaces get a
   faint blue haze (openness ambient + fog) so silhouettes read against it.
2. **Warm safety vs. cold mystery.** Amber = people, camp, lanterns, safety. Cyan = minerals
   and the ancient builders. Violet = the deep and the unknown. Faint teal moss is the only
   other glow.
3. **Make the player forget the cubes.** The world is still built from 1 m voxels (mining,
   collision and light depend on it), but nothing on screen should frame a single block:
   materials are continuous in world space (16 texels per metre, 8 m period), materials of one
   family meet along irregular, texture-driven boundaries, and natural rock is sculpted
   (crack-free vertex displacement) so edges read as chipped stone. Only things that are
   built are straight: dressed masonry stays nearly straight, timber is exact. Props and the
   explorer use smaller boxes (about 1/16 – 1/4 m) so they read as crafted objects.
4. **Restraint.** Glow is reserved for things that matter (crystals, glyphs, lanterns, the
   abyss). Particles are short-lived and few. No full-screen effects except bloom, vignette,
   colour grading, and brief flashes on discoveries (cyan) and damage (red).

## Visual audit and identity pass (October 2026)

A director's review found the slice "too reminiscent of Minecraft". The baseline was captured
and scored before any change (12 gameplay shots + 4 Visual Lab views, three independent
critics, details in CHANGELOG.md and TEST_REPORT.md):

| Category | Baseline (avg of 3) | Main reasons |
|---|---|---|
| Geometry & silhouettes | 3 | every surface a flat plane of 1 m cubes; square shafts; stepped cones |
| Textures & material detail | 3 | a framed 16 px tile per block face, bevel + per-block tint print the grid |
| Material transitions & seams | ~2 | every change on a voxel edge; grass-block style moss caps |
| Lighting & atmosphere | ~5 | good warm/cold idea; one flat navy fog; crushed blacks; per-axis face shade |
| Cyan restraint & glyphs | ~3 | glyph lattice on every wall, inlays on every floor tile, blown-out crystal cubes |
| Originality | 2 | brick, ore blocks, grass-sided moss, planks: a resource-pack vocabulary |
| Readability on a phone | ~5 | clean HUD; explorer hides the path; ledges dissolve into the void |
| Character & props | 5 | props are the most crafted assets; explorer is a box avatar |
| Post-processing | ~5 | bloom glare on every glyph; vignette over the touch controls |

Agreed top three: (1) continuous world-space materials with natural transitions, (2) sculpted
geology and large-format architecture instead of brick boxes, (3) a strict cyan budget with
carved, clustered inscriptions and an authored lighting/atmosphere model.

## Material families

| Family | Materials | Boundary rule | Sculpting |
|---|---|---|---|
| Geology | ancient dark stone, deep stone, weathered rock, damp stone, soil, gravel, copper vein, iron vein, bedrock | blend with each other along height-driven, wobbling boundaries | natural (≈0.19 m) |
| Crystal | crystal | hard boundary with rock (credible), dark glass with lit facet edges | slight |
| Masonry | ashlar walls, cap stones, floor slabs, crumbling masonry, glyph stones | blend within masonry (crumbling ↔ sound stone) | chipped (≈0.05 m) |
| Timber & hearth | planks, beams, hearth stones | never blend | none / slight |

Cyan budget: emission only where it means something — crystal (a seam in the host rock and a
few faceted clusters, lit from inside with broken edge glints) and rune strokes in four authored
inscriptions: the gate frieze, the shrine's back-wall band, the shrine-door lintel and the
balcony parapet. Lichen and damp stone do not glow. Inscriptions are carved (dark groove, faint
ink), read as a line of script along their course, and wake when the explorer's lantern comes
near. The budget is a test (≤ 120 cyan emitter voxels; measured 86) and a capture metric
(saturated-cyan pixels per tour shot, ≤ 3 % after round 2).

## Palette (sRGB)

| Role | Colors |
|---|---|
| Stone (base rock) | `#0d1015` … `#41454d` (charcoal, blue-black shadows, neutral-grey lights) |
| Deep stone | `#090b0f` … `#33373f` |
| Weathered rock | `#131416` … `#4a4b4d` (neutral grey, never beige; ochre only in its cracks) |
| Damp stone / lichen | `#090d11` … `#313b46`, sheen `#46566a` / lichen grey-olive `#1a221e` … `#3c4b3d` (no glow) |
| Soil / pebbles | `#110d0b` … `#382b21` / `#171615` … `#463f39` |
| Ancient ashlar | `#13161b` … `#464b55` (cooler than the rock it was cut from), joints `#090a0d` |
| Glyph ink / crystal | crystal body `#030c11` … `#2f6a77`, inner glow `#2fb6cc`, edge glints `#8fe3ee` |
| Copper | `#2a150c` … `#c8733a`, glints `#e8a46a`, verdigris grey-green `#1d302a` … `#3a5c49` (not cyan) |
| Iron | steel `#16171a` … `#5e6269`, red jasper `#26130f` … `#572b20`, rust `#5b3a22` |
| Timber / hearth | timber `#130e0b` … `#4f3d2e`; soot `#0b0a0a` … `#37312d`, embers `#4a1606` … `#d8722a` |
| Lantern / camp amber | lantern pale gold at the core → amber at the rim; lamp emitters (0.86, 0.56, 0.31) |
| Abyss violet | bedrock `#060609` … `#1e1c28`, vein `#2c2246`, emitter (0.50, 0.32, 1.0) |
| Atmosphere (per zone) | Hollow fog `#18202b` over a low pool `#0c0b17`, open-space fill `#343c48`; camp `#22190f`; tunnel `#17191c`; rift `#171428` over `#22153c` |

The canonical ramps live in `src/render/materials/palette.ts` and the atmosphere presets in
`src/render/lighting.ts` (`ATMOSPHERES`); this table is a summary.

## Composition rules for environments

- Every space has one focal light and one silhouette layer.
- Narrow → wide: tunnels open into chambers through a framed threshold (the Hollow ledge).
- Vertical scale: full-height pillars, stalactites, stairs, a chasm with light from below.
- Guidance through light: route lanterns every ~10–15 m (warm pools with dark gaps).
- Secrets are hinted, not hidden: a rune lintel over the shrine door wakes as the lantern passes,
  and the crumbling masonry is the same wall loosening (open joints, sunk stones) with a faint leak.

## Light and shadow

- The lantern casts soft shadows: visibility is propagated outward from the flame, so shadow
  edges are crisp near an occluder and widen with distance, like a real flame.
- Placed lights get a soft additive halo so distant lamps read across the dark.
- Warm pools along the route alternate with dark gaps; the eye follows the next pool.

## Camera framing

Over the right shoulder, 3.8 m boom, explorer left of centre so the crosshair stays on the
rock. In tunnels the rig swaps to the left shoulder when the right is walled in, and the
explorer dithers out when the camera gets close, instead of filling the screen.

## Explorer

A delver of the expedition company, built to read from behind (the gameplay view) at ~80 px:
a broad felt hat worn tipped back (octagonal brim, low rounded crown, brass goggles pushed up on
the band, hair in a bun), a thick red knitted scarf pulled up at the nape (the one strong
accent), a long amber-ochre coat (open over a dark waistcoat, split swallow tails to mid-calf
that swing with the stride), dark trousers in tall boots. On the back a timber pack frame whose
poles rise past the hat; a small ember vial hangs from a peg on the left pole like a tiny lantern
post. Lashed to the frame: a waxed olive duffel, a cream bedroll, a rope coil (right) and a tin
canteen (left). Hand lantern in the left hand, pickaxe in the right. Chunky proportions (~1.75 m
to the crown, 1.87 m to the pole tips, under a 2 m tunnel), corners chamfered with crossed boxes,
nothing cyan. Secondary motion (coat tails, vial) is procedural and never passes through the legs.

## UI

The title is drawn with a pixel font defined in code: icy gradient, dark outline and bevel,
soft glow, and the first O of DOWN cut as a cyan crystal.

Clean sans-serif in caps with generous letter spacing for headers, mixed case for body.
Dark translucent panels (`rgba(9,14,22,0.82)`) with a thin cool edge. Amber for primary
actions, cyan for discoveries, red only for danger. Touch targets are at least 44 px (48 px
for primary buttons and tabs); button and body text 15 px, scaled up in Large mode;
secondary labels go down to 12 px. Icons are isometric voxel cubes drawn from the same tiles.

## Audio

Original synthesis only. Stone = filtered noise thump; metal = inharmonic ringing partials;
crystal = glassy high partials with shimmer; wood = hollow knock. Cave reverb from a
procedural impulse response. Music: slow, sparse modal pads and plucks; warmer at camp.
