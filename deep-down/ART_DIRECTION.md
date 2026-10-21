# DEEP DOWN — Art Direction

The reference image is a mood target, not a source. Everything is generated in code.

## Pillars

1. **Darkness with intent.** The underground is dark, never unreadable. Big spaces get a
   faint blue haze (openness ambient + fog) so silhouettes read against it.
2. **Warm safety vs. cold mystery.** Amber = people, camp, lanterns, safety. Cyan = minerals
   and the ancient builders. Violet = the deep and the unknown. Nothing
   else glows (moss, lichen and damp stone do not).
3. **Make the player forget the cubes.** The world is still built from 1 m voxels (mining,
   collision and light depend on it), but nothing on screen should frame a single block:
   materials are continuous in world space (16 texels per metre, 8 m period), materials of one
   family meet along irregular, texture-driven boundaries, and natural rock is sculpted
   (chamfered, relaxed and relieved on the CPU, smooth-shaded) so it reads as rock, with its
   texture following the sculpted surface. Built forms are authored meshes over the voxel
   collision — stairs with 0.25 m treads, lathed columns with entasis, base and capital, an
   arched bridge, dressed coping, timber in real sections — so architecture is drawn at
   architectural scale, not in 1 m steps. Props and the explorer use smaller boxes (about
   1/16 – 1/4 m) so they read as crafted objects.
4. **Pixel art without a pixel grid.** Materials are painted at 16 texels per metre and sampled
   sharp-bilinear: crisp texel edges where they mean something (cracks, joints, edges), no
   flat nearest-filtered grid on every surface.
5. **Restraint.** Glow is reserved for things that matter (crystals, glyphs, lanterns, the
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

## The first-person look (finished game, "Lantern Voxel")

The game is seen through the explorer's eyes, lantern in the left hand. What the frame follows now
(it overrides older lines above where they disagree, e.g. the faint blue haze in big spaces):
- **Clear air.** No haze within 12 m; the far dark fades into each zone's hued haze by 18-30 m.
  Volumetric light only in real beams (the rift's rising light, the Spindle, the shrine's tablet).
- **The pool.** The lantern throws a golden pool 6-8 m across; the darks beyond keep a cool hue
  (teal-blue in the passages and the Hollow, violet over the rift, moss-green in the Glowroot,
  smoky red in the Ember Deep), lifted, never crushed. Exposure stays at 1.0: the lights carry it.
- **Chunky cut stone.** Every rock face is a few bevelled plates with dark joints that fade in
  places; floors are worn flagstones; dressed stone is tooled; nothing shows a texel at arm's length.
  Wet stone, ore and crafted metal glint as the flame moves.
- **Calm.** A break crumbles into at most nine chunks and a few motes; no shake, rings or flashes;
  feedback tints only touch the screen edge. Glow spores drift; nothing else moves in the background.

## Material families

| Family | Materials | Boundary rule | Sculpting |
|---|---|---|---|
| Geology | ancient dark stone, deep stone, weathered rock, damp stone, soil, gravel, copper vein, iron vein, bedrock | blend with each other along height-driven, wobbling boundaries | natural (≈0.19 m) |
| Crystal | crystal | hard boundary with rock (credible), dark glass with lit facet edges | slight |
| Masonry | two stone vocabularies laid in world-space courses — coursed ashlar (long stretchers, 4 m blocks, headers, broken bond, cut-stone joints) and megalithic (slanted and joggled joints, rolled edges, fitted small stones) — plus cap stones, floor slabs, crumbling masonry, glyph stones | blend within masonry (crumbling ↔ sound stone) | chiselled bevel (≈0.1 m) |
| Timber & hearth | planks, beams, hearth stones | never blend | none / slight |

Cyan budget: emission only where it means something — crystal (a seam in the host rock and a
few faceted clusters, lit from inside with broken edge glints) and rune strokes in four authored
inscriptions: the gate frieze, the shrine's back-wall band, the shrine-door lintel and the
balcony parapet. Lichen and damp stone do not glow. Inscriptions are carved (dark groove, faint
ink), read as a line of script along their course, and wake when the explorer's lantern comes
near. The budget is a test (≤ 120 cyan emitter voxels; measured 86) and a capture metric
(saturated-cyan pixels per tour shot, ≤ 3 % after round 2).

## Palette (sRGB)

| Role | Colors (albedo ramps: real reflectances, dark → light; darkness comes from light, not paint) |
|---|---|
| Stone (base rock) | `#151920` … `#717784` (charcoal, blue-black shadows, neutral-grey lights) |
| Deep stone | `#0f1217` … `#595f6c` |
| Weathered rock | `#1b1d21` … `#6c7077` (neutral grey, never beige; ochre only in its cracks) |
| Damp stone / lichen | `#0f141a` … `#546475`, sheen `#5d728b` / lichen grey-olive `#2a352f` … `#5a6a5b` (no glow) |
| Soil / pebbles | `#1d1815` … `#5c4839` / `#252423` … `#71665d` |
| Ancient ashlar | `#1d2128` … `#717988` (cooler than the rock it was cut from), joints `#0e121c` |
| Glyph ink / crystal | crystal body `#030c11` … `#2f6a77`, inner glow `#2fb6cc`, edge glints `#8fe3ee` |
| Copper | `#3d2115` … `#e58444`, glints `#ffb978`, verdigris grey-green `#2b453d` … `#56856b` (not cyan) |
| Iron | steel `#24252a` … `#7f848d`, red jasper `#3a201a` … `#834434`, rust `#7e5232` |
| Timber / hearth | timber `#201915` … `#7f634d`; soot `#131212` … `#554d47`, embers `#4a1606` … `#d8722a` |
| Lantern / camp amber | lantern warm-pale at the core (`#ffe6c6`) → amber by ~1.8 m; route lamps amber-gold, never red-orange |
| Abyss violet | bedrock `#0b0b0f` … `#2f2c3d`, vein `#3c2f5d`, emitter (0.50, 0.32, 1.0) |
| Atmosphere (per zone) | Hollow fog `#203046` over a low pool `#121638`, cool open-space fill `#8a9ab5`; camp air cool charcoal `#1b1a1c`; tunnel `#161a20`; rift `#1e1a36` over `#2a1a4a` |

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
  edges are crisp near an occluder and widen with distance, like a real flame. It falls off
  like a real flame (windowed inverse square, about 4× dimmer at 6 m than at 1 m): pale and
  warm-pale close by, amber within about 1.8 m, and the pool reads as a ring on the ground
  ahead. The fuel tank leaves a dark disc about 1 m across under the flame, so the boots are
  never a hot spot.
- Unlit sides go blue-black, not brown: the Hollow, the shrine and the rift get a cool
  hemispheric fill from open space (floors most, walls less, overhangs none), and faces turned
  away from a lamp fall to that cool fill. Warm against cold is the main contrast, and each
  face belongs to one of them: warm light cuts the cool fill (up to 75 %), so a face reads
  amber or blue, never lavender.
- Every cyan-keyed space also has one warm practical (the shrine lamp, the Spindle-foot lamp),
  so cold light is always read against a human flame.
- Every space has one key light that tells the player where to look: the Spindle's uplight and
  rim lights, the seal's underglow and the lit frieze recess, the shrine dais and tablet,
  violet light low in the chasm under the bridge.
- The explorer is never the brightest thing on screen (its coat is darker than its paint and
  its rim light is faint and only on edges away from the flame).
- Placed lights get a soft additive halo so distant lamps read across the dark.
- Warm pools along the route alternate with dark gaps; the eye follows the next pool.
- The grade has real highlights and blacks that stay black (no lifted toe): a hue-keeping
  S-curve and a chroma-aware split grade. Neutral darks go blue-black; amber, cyan and violet
  darks keep their hue (no rose or mauve falloff). Highlights lean amber.

## Camera framing

Over the right shoulder on a 90° locked horizontal lens and an 8.3 m boom. The explorer is
about a quarter of the frame height (90–110 px on a 412 px screen), centred at about a third of
the width, feet near the bottom: clear of the joystick, with the route, the target and the space
ahead reading first, and the crosshair on the rock. Passages pull the boom in to 5.4 m, and the
lens opens toward 106° only while rock holds the boom short. In
tunnels the rig swaps to the left shoulder when the right is walled in, and the explorer fades
smoothly (true transparency, no dither pattern) when the camera gets close, instead of filling
the screen.

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

## UI — "Lamplight on the Lintel"

**Two registers, never mixed.**
- *Expedition kit* — everything the player owns or does (buttons, gauges, the pack, the
  workbench, reports): dark slate plates, an oiled brass rim, amber light, ledger typography
  (label · dotted brass leader · tabular value).
- *Builders' script* — only discoveries, lore, runes and the logo's O: cyan ink carved in stone.
- Violet means the unknown (locked entries, records, relics). Red means danger only.

**Tokens** (`src/ui/brand/tokens.ts`, mirrored as custom properties on `.dd-ui`; a unit test
checks they agree and computes WCAG contrast for every text/surface pair, all ≥ 4.5:1).
Slate 950–600 `#070a0f … #2a3544`, bone 100/300/500 `#efe7d8 #c9bfae #948b7d`, brass 300/500/700
`#e2b673 #b0823f #5e4220`, amber 300–700 and ember `#ffd29a #ffb35c #f39c45 #8a4f1c #d8722a`,
rune cyan 200/400/900 `#8fe3ee #2fb6cc #072a33`, deep violet `#b9a2ff`, danger `#ff6b5e #6a1712`,
verdigris `#8fc4a4`. Panels are slate-900 at 0.94. The old neon `#5ff0ff` is retired.

**The octagon.** Every plate is an octagon with a 45° chamfer (`--cut`: 9 px panels, 8 buttons,
6 chips, 3–4 bar caps), cut with `clip-path`. Because clip-path also cuts borders and shadows, the
1 px rim is drawn by layered backgrounds: four corner gradients lay brass along the chamfers and
the border draws the straight sides. A plate only sets `--fill`, `--rim` and optionally `--face`
(a gradient over the fill). No rounded rectangles, no pills, no glass, no backdrop blur. The one
round shape is the joystick base, a brass bezel. Focus is an amber-300 octagon drawn inside the
plate on `::after`.

**The lintel** is the signature device: a carved headline that things hang from — a 3 px groove
(1 px `#04070b` over 1 px brass at 55 %) with a 2 × 7 px pendant tick at each end. Panel headers
sit on one, the discovery band hangs its title from one (in cyan), the tagline sits between two
grooved rules, and the wordmark's words hang from theirs.

**Type.** UI text is the system stack (body 15/500, title 17/700, label 13/700 tabular, eyebrow
12/800 caps at 0.24 em; nothing under 12 px; buttons in mixed case). The display face is
**Lintel**: a stroke face on a 4 × 7 unit grid (M and W take 5), 1.0-unit strokes in the eight
compass directions, every end and bend chamfered (`src/ui/brand/strokeFont.ts`). Each glyph is
filled polygons: one rectangle per stroke segment and one octagon per node, all wound the same
way. It covers A–Z, 0–9 and − . · / ? ' (plus , : ! + ×). The same polygons become a small
TrueType font in memory at startup (`lintelFont.ts`, FontFace; no font file ships), so title
plates, discovery titles, the depth numerals and report numbers are set in Lintel while staying
real text; characters it lacks fall back to the system stack. Digits are tabular.

**The logo.** DEEP DOWN in Lintel, each word hanging from its own lintel. Stone letters: a cool
grey gradient, a carved `#04070b` outline and a top-left highlight. The O of DOWN is the
builders' lantern rune hanging from the lintel on its stem: a diamond ring in cyan ink
(`#8fe3ee → #2fb6cc`) with an amber flame inside (`#fff4dc → #ffc785 → #d8722a`). The flame's
warm light falls on D, W and N and on the lintel above them; DEEP stays cold. Lockups
(`wordmark.ts`): the landscape line (330–420 px), the portrait stack (250 px), the emblem (a
lintel segment with the lantern hanging from it, plus the rune's foot bar), and an optional
subtitle line ("LANTERN HOLLOW") ready for the title decision. The flame breathes on a 2.4 s
loop, off under reduced motion. Tagline: FOLLOW THE LIGHT DOWN, in Lintel brass between grooves.

**The emblem everywhere.** One geometry (`src/ui/brand/emblem.mjs`, a plain ES module) draws
the lantern O, the boot mark inlined in `index.html` (~0.9 KB of SVG, visible before the bundle
parses, its flame core breathing), the SVG favicon, the web app icons (a tile for "any",
full-bleed for "maskable") and the Android launcher (`android/make-icon.mjs` rasterizes the same
polygons: adaptive foreground inside the 66 dp safe circle, a warm-dark background with the
lantern's glow, a monochrome silhouette for themed icons, the legacy tile, the splash and the
512 px Play icon).

**Icons are specimens, not blocks.** 16 × 16 pixel sprites lit from the top left: a slate flake,
a coiled hank of root fibre, a copper lump with glints and a fleck of verdigris, a dark iron lump
with a jasper streak, the glimmer and echo shards, the Ancient Tablet carrying the Lantern rune,
and a rune stone per rune with its own mark. Icons map by item id; an id without art gets a
pebble in its colour. No isometric cubes.

**Motion** (`motion.ts`): micro 90, short 160, medium 240, exit 140, long 480, ceremony
900–1400 ms. An enter is an 8 px rise plus a fade; an exit is a fade only and shorter (the leaving
screen fades under the entering one on an inert layer). Only transform and opacity animate; at
most one loop is on screen. Reduced motion: opacity fades of 150 ms at most, no loops.

**Touch.** Targets are 48 px or more with 8 px gaps. The Mine button is a 100 px brass octagon
(88 px on short screens) around an amber core; Jump, Bag and Pause are octagons in the same kit.

## Audio

Original synthesis only. Stone = filtered noise thump; metal = inharmonic ringing partials;
crystal = glassy high partials with shimmer; wood = hollow knock. Cave reverb from a
procedural impulse response. Music: slow, sparse modal pads and plucks; warmer at camp.
