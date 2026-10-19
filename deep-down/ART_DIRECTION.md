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

Cyan budget: emission only where it means something — crystal facet edges, rune strokes in a few
authored inscription panels, rare lichen. Inscriptions are carved (dark groove, faint ink) and
wake up when the explorer's lantern comes near.

## Palette (sRGB)

| Role | Colors |
|---|---|
| Slate (base rock) | `#1f242c` `#282e38` `#313844` `#3b4351` `#464f5e` `#535d6d` |
| Deep slate (lower) | `#15181e` … `#313844` with strata |
| Umber strata / soil | `#271f1a` … `#544538` |
| Ancient brick | `#2a2f3a` … `#58606f`, mortar `#1b1e25` |
| Glyph / crystal cyan | `#1f8fa6` `#48d6ea` `#b4fbff` / `#0a3a4c` … `#e2ffff` |
| Copper | `#6b3519` `#a9582a` `#db8547` `#ffc58e`, verdigris `#48b29c` |
| Iron | `#4a3d35` `#7d6857` `#b9a38c` `#ece0cf` |
| Lantern / camp amber | lantern light `#ffd2a6` (×1.6), lantern glass `#ffc58a`, emitters (1.0, 0.70, 0.42) |
| Abyss violet | emitter (0.50, 0.32, 1.0) |
| Fog | `#12263a`; ambient `#0b1220`; openness fill `#2a4a6e` |

## Composition rules for environments

- Every space has one focal light and one silhouette layer.
- Narrow → wide: tunnels open into chambers through a framed threshold (the Hollow ledge).
- Vertical scale: full-height pillars, stalactites, stairs, a chasm with light from below.
- Guidance through light: route lanterns every ~10–15 m (warm pools with dark gaps).
- Secrets are hinted, not hidden: crumbling brick leaks thin cyan light through cracks.

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
