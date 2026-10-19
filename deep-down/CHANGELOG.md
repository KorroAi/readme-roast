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

### Round 3 — sculpted rock geometry (`mesher.ts`, `ChunkRenderer.ts`, terrain vertex shader)
- The 1 m voxel step and the printed triangle lattice are gone from natural rock: the mesher
  moves every quad corner toward its surface-nets point (chamfered edges and corners, filled
  creases, steps become slopes, 1-voxel columns octagons), relaxes slopes, and adds world-space
  relief; smooth normals and AO from a 4×4×4 occupancy gradient model the rock under the
  lantern. Masonry keeps a crisp, slightly chiselled arris; timber is exact.
- Gameplay held: walkable flat interiors move 0, edges ≈ 0.21 m, corners ≤ 0.31 m; rock reaches
  ≤ 0.4 m into open space (the camera now keeps 0.4 m from voxel hits instead of 0.3 m); cell
  picking, mining cracks and material boundaries use the undisplaced lattice position.
- Crack-free across chunks by construction (bit-identical shared vertices, 2-voxel padding,
  seam keys that re-mesh a neighbour when its seam data changed), unit-tested.
- Ledge: the flat plane, kerb box and lone cubes became a broken crag parapet; the Hollow's rim
  terraces wander instead of ringing the floor.
- Crystal seams follow their host rock, sunk 0.2 m into a groove.
- Vertex 11 → 16 bytes (one interleaved buffer); the vertex shader no longer fetches textures.
- Verified: `tsc`, 363 unit tests (new `mesh-sculpt.test.ts`: seam bit-identity, flat floors 0,
  walkable bounds, intrusion and sag caps, masonry crisp, step → slope, smooth AO, seam
  re-mesh); SwiftShader FPS within ±10 % of the previous build (6 alternating runs each); terrain
  GPU geometry 3.6 → 4.9 MB. Cost: dense chunks mesh 2.7× slower, so mining re-mesh rose to ≈2 ms
  on the main thread (spikes to 10 ms) — fixed by the mesh worker below.

### Round 3 — chunk meshing off the main thread (`meshWorker.ts`, `meshPool.ts`, `ChunkRenderer.ts`)
- Edits re-mesh in a pool of 1–2 module workers (sized from `hardwareConcurrency`; `?meshworkers=N`
  overrides): the main thread copies the 20³ padded block (8000 bytes, transferred), posts, and
  uploads the result. Byte-identical to the synchronous mesher (unit-tested over all 800 zone
  chunks; `__DD__.meshCheck()` found 800/800 identical in every browser run). Stale results are
  dropped, the old mesh stays until its replacement lands, an edit's chunks switch together, seam
  neighbours re-mesh from worker results.
- Fallback to the synchronous path when workers are unavailable, fail to load, error, or stop
  answering (watchdog); verified in the browser with `?meshworkers=0`, a throwing constructor and
  a missing worker script. The initial zone build stays on the main thread (a worker-assisted
  build was slower on this loaded container; opt-in `?meshbuild=pool` for a phone A/B).
- Measured (production builds, 4 alternating runs each): main-thread ms per mined block 1.71 →
  0.82, worst block 8.85 → 2.7, worst frame 6.65 → 2.25; a mined chunk is drawn 1 frame after
  the edit (was the same frame; 2 frames once in 80 edits). Boot unchanged within noise.
- Debug API: `meshIdle()` waits for pending meshes, `meshCheck()` verifies GPU buffers against a
  fresh mesh. `aimAt()` now lets the camera rig come to rest between corrections: with the new
  shoulder-swap spring an unsettled aim drifted ~0.3 m sideways a second later and the touch e2e
  mined the stone next to its copper target (reproduced in the browser, fixed, re-verified).

### Round 3 — mining-aim regression found and fixed (`CameraRig.ts`)
- The touch e2e then failed at the deep seal: with the new framing (lens aimed 0.8 m over the
  explorer, boom tilted 0.17 rad) a block at the boots needed a pitch past the −1.2 rad limit,
  so it could not be targeted at all. Looking down, the framing now eases toward a plain
  over-the-shoulder view (pitch tilt and yaw framing fade out, shoulder to 55 %, smoothstep
  over −0.3 → −1.0 rad); normal-pitch framing is unchanged.
- Measured offline over 260 sampled mining spots with a damped, settle-aware aim: round-2 rig
  49.6 %, round-3 rig 36.9 % (feet 41/131), fixed 50.4 % (feet 69/131). New unit tests: a block
  at the feet is targetable (fails on the unfixed rig, passes at 0.66 rad), and the explorer
  stays left and low at normal pitch.

### Round 4 — architecture off the voxel lattice (`render/structures/*`, `architecture.ts`)
- Built forms are procedural meshes drawn over hidden collision cells (new block ids 24–33:
  solid, invisible, unbreakable), so light, raycasts, mining, reachability and camera collision
  still work on whole cubes and the terrain mesher and mesh workers are untouched:
  - stair flights: 0.25 m monolithic treads with worn nosings, raking parapets with sloped
    coping, newels, rampant-arch bays with voussoirs; a jointless plinth course hides the 1 m
    flank;
  - columns: 32-segment lathe with entasis, attic base, grooved drums, echinus and abacus, or a
    fractured broken shaft;
  - the bridge: a segmental arch over a chasm widened to a 6.2 m half-width, voussoirs, keystone,
    a parapet of separate stones, saddleback coping, newels and a mid-span lamp pedestal;
  - kerbs and copings as dressed stone; the processional way levelled with kerb slopes; the
    landing tower cornice;
  - camp timber in real sections (0.18–0.34 m), a butt-jointed frame with knee braces, one
    fallen beam, plank decks on joists;
  - the abyss monolith rebuilt as a battered octagonal pylon with incised rings and a
    pyramidion; violet only in the portal niche, cyan only in the core.
- Stairs get a walking-plane collision (wedge cells solid below a 1:1 plane; the player is lifted
  along it and snapped down when descending): the drawn feet stay within 0.141 m of the treads
  (36 measured walks, unit-tested at 60 and 30 fps).
- Rendering: a dedicated structure material sharing the terrain's lighting composition and
  course libraries (world-course, strip-stone, monolith and plain modes, contact occlusion, a tone
  per stone); one mesh per 32 m cell (10 meshes, 63k vertices, 49k triangles, 2.06 MB), built
  lazily nearest-first and drawn before the terrain.
- Verified: `tsc`, 398 unit tests (new `structures.test.ts`: closed outward meshes, every hidden
  cell covered, stair planes match the spec, feet within 0.15 m), Playwright e2e 4/4 on the first
  run. Perf (5 alternating runs each, shared machine): boot and zone load within noise; triangles
  +19–39k at four spots; GPU geometry 6.4 → 7.5 MB; CPU frame time ×0.97–1.33 with overlapping
  ranges (a same-session toggle shows the structures CPU-neutral and slightly faster on fill,
  since they hide voxel faces).

### Round 4 — surface presentation (`terrainMaterial.ts` sampling, `materials/*`, `Waterfall.ts`)
- Natural rock is textured from the sculpted surface (top from above, sides from two blended wall
  planes with level beds, ceilings from below; top/side chosen from the smooth normal), so
  chamfers no longer stretch and smoothed steps no longer print 1 m top/side stripes.
- Sharp-bilinear sampling with 2× anisotropy replaces nearest magnification: crisp texel edges
  without the camouflage grid; a fine near-lens grain without a fetch.
- Rock painter: world-warped folding (no per-tile sine folds), height-only facets, broken laminae
  instead of a barcode, long open partings, dark pits; floors two ramp steps under their walls
  with dark grit (a04 foreground p90 197 → 138, pale-neutral pixels 43 → 0.7 %).
- Inscriptions read as script: a carved 'script' layer laid along the course (headline, baseline
  groove, varying glyphs and word gaps).
- Mining feedback: a soft strike light at the ray hit and growing hairline fractures replace the
  cube rim and crack stamp.
- Crystal is a dark druse of faceted points with tip glints; the hearth is soot fieldstones with
  sparse embers; the Glimmerfall is one draw call — a spreading, breaking sheet with mist and a
  ripple ring at the foot, below the bloom threshold.
- Verified: `tsc`, 398 unit tests (new: floors darker than walls, no pale floor speckle, hearth
  emission bounds, script-layer structure, geology partner tables); tour metrics hold (local
  contrast 10.1 → 9.7, a deliberate trade: the rejected speckle was part of it). Fetches on rock
  5–7 (round 3: 6); +45–70 ALU on rock. SwiftShader is slower than round 3 after a rewrite of the
  projection (feature isolation: software bilinear/anisotropy first); phone GPU cost unmeasured.

### Round 3 — exposure chain, value and hue structure, key lights (`lighting.ts`, `PostFX.ts`, palette)
- Albedos are real reflectances (rock and ashlar 1.8–3.1× brighter in linear, darkest steps
  kept low, weathered rock raised less so it never goes pale or beige); the darkness comes from
  light. Scene exposure lives in each zone preset (camp 1.8, tunnel 1.36, Hollow 2.3, rift 2.1).
- Lantern: windowed inverse-square falloff (≈4× lower at 6 m), nearly neutral core and amber
  rim, a shadow cone under the fuel tank, cool-grey bounce.
- Cool hemispheric open-space fills in the Hollow, tunnel and rift; placed light gets a
  direction from the light volume (`LAMP_DIR`, one extra fetch, off on Battery) so faces turned
  away from lamps and recesses fall to the cool fill; clearer near haze with a darker veil.
- Post: no lifted toe, a hue-keeping contrast S-curve and a split grade (blue-black shadows,
  amber highlights).
- The explorer is demoted (coat 28 % darker, its own lantern measured from 3 m, a faint rim only
  on edges away from the flame); the screen-door fade branch is gone.
- Key lights authored per space (a pass after all geometry): the Spindle's uplight and rim
  lights, the seal's underglow and the frieze recess, the shrine dais and tablet, four violet
  lights low in the chasm. Cyan/violet emitter voxels 86 → 103 (the tested cap stays 120); a new
  test checks every key light exists.
- Measured on the 16-shot tour (`metrics.py`, before → after): p95 luma 56 → 135, std 17.9 → 38.4,
  local contrast 4.9 → 10.3, below luma 12 11.9 → 7.5 % (worst shot 18 %), clipped 0 %, saturated
  cyan 0.6 %, coldDark 50 → 75 %, explorer share of the brightest 1 % 54 → 26 %. Battery and
  `?ldr=1` checked (0 % clipped). SwiftShader A/B within noise; GPU cost on a phone unmeasured
  (+1 3D fetch per terrain fragment on Balanced/High, ≈+25 ALU).

### Round 3 — masonry vocabulary, grooved cracks, no texture repeat (`materials/*`, sampling)
- Masonry is laid in world space from course libraries: 2 m of height becomes one 2 m course,
  two 1 m courses or 1.5 + 0.5 m (thin courses never stack — what made the old wall read as
  brick), each course offset and cut into hash-chosen 4 m pieces. Two vocabularies chosen by
  region without new blocks: coursed ashlar and megalithic (new layers `masonryB`,
  `crumblingB`). Crumbling is the same wall coming apart (open joints, slipped and missing
  stones, rubble core, a small cyan leak).
- Cracks are tapered grooves with a lit lip and a shaded side, following the strata (no more
  black ink lines or "dried mud" facet networks); grains are stamped in clusters (isolated
  single texels 2.5 → 0.9 % on rock); weathered rock keeps its ochre inside cracks only.
- The rock projection is bent by a slow world-space warp reusing an existing noise fetch: the
  8 m repeat is gone (autocorrelation 0.113 → 0.011 on the lab wall). A per-pixel region-hash
  flip on planes at multiples of 24 m (the dotted patch in a06) was found and fixed.
- Verified: `tsc`, 383 unit tests (3 new course-library tests); painting 0.52–0.59 s cold
  (baseline 0.50–0.52 s, same session); no added texture fetch; +170 KiB texture with mipmaps.

### Round 3 — camera framing, fade and a judgeable Visual Lab
- Camera: 1.15 m shoulder, 4.8 m boom, 67° lens (72° in portrait), the explorer small in the
  lower-left third so the route and target read; room that shrinks at once and recovers slowly,
  a critically damped shoulder swap, a shoulder that slides in behind posts.
- The explorer's near-camera fade is true transparency with a depth pre-pass (no dither pattern
  over the scene) and only starts when the camera is genuinely close.
- Visual Lab: a review light (default) makes every view judgeable; a button and `?light=game`
  switch to the real game lighting; the Transitions overview frames the whole court.
- Review tour: three new shots (gate frieze, hall columns, the Spindle); a01–a13 unchanged.
- Verified: camera tests 10/10 (5 new: framing, portrait, shoulder slide and recovery, wall end,
  alpha fade), 400-pose fuzz unchanged (0 inside, 0 blocked); offline replay of the e2e mining
  flows hits the intended blocks; lab views mean luma 35–64 with < 25 % below luma 12.

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

### Round 2 — lighting, atmosphere and post (`lighting.ts`, `PostFX.ts`, effects)
- Four authored zone atmospheres (camp warm umber, tunnel neutral grey, Hollow blue-black with
  haze pooling low, rift violet pooling low), blended by where the explorer is; lamps scatter
  into the haze; distant emission is absorbed instead of floating as specks; desaturated
  open-space fill.
- Post: hue-preserving tone map with a lifted toe (crystals stay cyan instead of clipping to
  white, darks stay rich), luminance bloom (threshold 0.75 → 1.2, strength 0.55 → 0.4), lighter
  split tone, elliptical top-weighted vignette that keeps the touch-control corners clean. The
  8-bit fallback now encodes the scene so values above 1 survive (`?ldr=1` forces it).
- Practical light: a flat, pale-gold-to-amber lantern pool, a visibility-gated bounce, softer
  emitter shoulders. The explorer gets a warm lantern rim and stays ochre under cyan or violet
  light; props and boots get contact darkening. The Glimmerfall is a thin rope that breaks into
  ragged sheets, below the bloom threshold.
- Battery preset turns the terrain boundary blend off (cheaper; verified the define is removed).
- Lead integration: the boundary claim lost a constant bias that let both faces claim a strip at
  the edge (swapping the materials there); runes follow the position along their course (no
  repeat within 8 stones) with a slow pulse travelling along the line; the debug viewer uses the
  real zone atmosphere; tour shots settle the simulation (`__DD__.step(60)`) before capture.
- Verified: `tsc`, unit tests; 12-shot tour runs `artifacts/light-0..11`: pixels below luma 12
  33.3 % → 9.4 % (shrine 67 % → 23 %), 0 % clipped, saturated cyan 0.4 %. GPU cost on a phone is
  unmeasured (shader inspection: no new texture fetch on terrain, ~25 ALU ops for the haze).

### Explorer redesign (`src/entities/character/*`)
- A silhouette readable from behind at phone size: pack-frame poles above a tipped-back brim, red
  scarf, ochre coat with mid-calf tails, olive duffel, cream bedroll, tall boots; no cyan on the
  explorer. Coat tails flare and swing without passing through the legs; a vial swings like a
  tiny lantern. Rig and animation API unchanged; 17 meshes / 2220 triangles (was 14 / 1932).
- Verified: character tests 14/14 (tail and vial behaviour included).

## 0.1.0 — vertical slice "The Lantern Hollow"
- Complete M1 slice: voxel world + light, world generation, player/camera/mining, props and
  explorer, audio, gameplay rules, saves, UI, Visual Lab, Android shell. See TEST_REPORT.md.
