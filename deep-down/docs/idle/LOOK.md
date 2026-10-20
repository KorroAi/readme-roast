# DEEP DOWN: the HD look (W2, owner 2D)

The key-frame briefs per biome, the value plan, the pipeline and the seams other workstreams build against.

## 0. Seams (published at W2 + 0:45)

### 0.1 The section look, shared with B's shards (`src/render/look.ts`)

- `SECTION_SHADE_GLSL`: include it **after** `LIGHTING_GLSL` (it uses `uLanternPos`, `cameraPosition`).
  - `float sectionRow(float blockId)`: the ramp row of a block id (biome blocks 64..175, specials 41..56, emitters 176..191), -1 otherwise.
  - `SecTexel sectionTexel(vec2 p, float row)`: albedo (linear), height, specular, emission at world point `p` (metres on the cut plane, x right, y up).
  - `vec3 sectionLight(SecTexel s, vec2 p, vec3 diffuse, vec3 lantern, vec3 worldPos)`: lit colour (emboss + lantern glint), no emission.
  - `vec3 sectionEmission(SecTexel s)`, `float sectionValue(float row)`.
  - `vec3 sectionShade(vec2 p, float blockId, vec3 diffuse, vec3 lantern, vec3 worldPos)`: all of it in one call.
  - For a shard at F0: `p` = the spawn-time world xy of the fragment on the cell's face (keep it per vertex from the spawn), `diffuse` = the
    section key x the depth key + light volume + camera fill + impacts, `lantern` = the lantern term. The terrain computes them the same way.
- `sectionUniforms()`: the one shared uniform set (spread it into the material's uniforms): `uSecRamp`, `uSecParam`, `uSecNoise`,
  `uSecIds`, `uSecIdsOn`, `uSecFallback`, `uSecHue`.
- `new SectionIds(ring.blocks)`: the exact block id of every cut-plane voxel as a 64 x 160 ring texture. **B: construct it once in
  DescentScene next to SectionField and call `sectionIds.update()` once per frame** (it diffs 10 KB and uploads on change). Until then the
  shader guesses the biome from the depth and the slot from the material layer (correct except inside the 8-row ragged boundary).
- `lookShared()` + `LOOK_FOG_GLSL`: the live fog, accent and clock for self-lit materials (Vistas, cones, set pieces). BiomeLook writes it.

### 0.2 Post parameters (`src/render/PostFX.ts`, `PostParams`)

Kept: `flash`, `flashColor`, `bloomStrength` (the look writes it every frame: ceremonies use `bloomPulse` instead).
New (C's ceremonies drive them and restore them):

| Field | Range | Meaning |
|---|---|---|
| `dim` | 0..1 | darkens the frame toward black |
| `iris`, `irisCenter` | 0..1.5 (screen heights), UV (y up) | black outside the radius, a 1 px brass rim; 1.5 = open |
| `shock`, `shockCenter` | 0..1, UV | one expanding refraction ring; animate 0 → 1 |
| `bloomPulse` | 0..1 | up to +0.6 bloom strength and a lower threshold |

### 0.3 Vistas and set pieces

- `src/render/descent/VistaBackdrop.ts` satisfies DescentScene's `VistaHost`: `scene.setVistas(new VistaBackdrop(renderer.quality))`
  (before `precompile()`, so its hidden warm-up meshes compile at load); DescentScene calls `show({ id, biome, y0, y1, x0, x1 })` (world y,
  y0 the top) / `hide(id)` / `update(time, camera)`. `setQuality(level)` on a preset change. It draws 1/2/3 layers (Battery/Balanced/High)
  at z = 110/190/320 m behind the cut and 2-3 god-ray cones in the cavern.
- `src/render/descent/LightCones.ts`: `vistas.cones.set(ownerId, cones[])` also takes grotto cones (one draw for all).
- `src/render/descent/setPieces/index.ts`: `buildSetPiece(biome, rng): { object, footprint: { w, h } } | null` (biomes 0-6 now). The
  object stands on its local origin (the floor point at its centre), front facing +z. Light is baked; it animates itself.

### 0.4 Biome looks (`src/idle/config/biomeLooks.ts`)

`BiomeLook.update(depth, dt)` keeps its signature; `LookMix` grows (lantern colour, LUT pair). B reads looks, never writes them.
`update()` itself now writes the shared state (`lookShared()`, the section fallback, and `LANTERN_COLOR`, the one lantern-colour uniform
every rig and material reads, so the warm biomes' whitened lantern holds even before B calls `apply()`).

## 1. The pipeline (`src/render/Renderer.ts`, `PostFX.ts`, `post/*`)

Two resolutions (CRITIQUE B15, B16; SPEC §11.3): the canvas composites at the native DPR (capped per preset), the scene renders at a
dynamic fraction of it through a sub-viewport of a target allocated at the preset's top scale, so a scale step never reallocates.

| Pass | Resolution | What it does |
|---|---|---|
| scene | scene (s x native) | the world into a HalfFloat target (MSAA 4x on High); clear colour = the blended fog |
| bright, 3-4 down, 3-4 up | 1/2 .. 1/32 scene | luminance bloom, every tap clamped to the live rect (CRITIQUE B SHOULD 6) |
| resolve | scene | exposure, flash, the hue-preserving tone map, the 32^3 LUT pair of the two nearest biomes (sRGB-encoded domain, CRITIQUE B12), luma to alpha |
| fxaa | scene | FXAA 3.11 quality 12 before the upsample (Balanced; CRITIQUE B13) |
| final | native | the screen shock, 5-tap Catmull-Rom upsample, CAS 0.2 while s < 1 (its cross is the Catmull-Rom's outer taps: no fetch of its own), the portrait vignette (top 0.30, bottom 0.25, sides 0.10), dim, the octagon iris with its brass rim, dither |

| Preset | Composite DPR cap | Scene scale (dynamic) | Bloom | AA | Vista layers / cones | Terrain blend, lamp direction |
|---|---|---|---|---|---|---|
| Battery | 2 | 0.45-0.55 | off | none | 1 / 8 | off (uniforms) |
| Balanced (default) | 2.25 | 0.60-0.70 | 4 levels | FXAA | 2 / 24 | on |
| High | 3 | 0.80-1.00 | 5 levels | MSAA 4x | 3 / 64 | on |

- **Every program compiles at load.** The post programs compile in the PostFX constructor; the terrain's preset switches are uniforms
  (`TERRAIN_PRESET`), not defines; bloom off is a zero strength and a black texture; the Vista layers, cones and set pieces each use one
  program, with hidden warm-up meshes in `VistaBackdrop.group` for the scene's `precompile()`. A preset change or a biome change only
  touches uniforms and textures (e2e `idle-hd.spec.ts`).
- **The fine controller** (`QualityGovernor.ts` `FineScaleController`): the median frame interval over 1 s; above 17.5 ms the scale steps
  -0.05, below 14.5 ms held for 4 s it steps +0.05, at most once per 2 s, inside the preset's range. `?rscale=0.65` pins it (captures).
- **The cost model** (`tools/perf.mjs`): each pass's pixels x (fetches, ALU, bytes written) priced for the reference GPU and the reference
  DPR 2.75 (capped per preset); it fails above SPEC §11.6 (bloom 1.0 ms, composite 1.9 ms, terrain 4.5 ms, frame 12 ms, memory 80 MB).

### 1.1 GPU memory, recomputed (CRITIQUE B SHOULD 8; Balanced, 390 x 844 at DPR 2.75 → composite 2.25)

| Item | Size |
|---|---|
| Native canvas 878 x 1899: back buffer double-buffered RGBA8 + depth | 20.0 MB |
| Scene target at the top scale 0.70 (615 x 1330 HalfFloat + depth 24/8) | 9.8 MB |
| Resolve + FXAA targets (RGBA8 each) | 6.5 MB |
| Bloom, 4 levels and their scratch twins (HalfFloat) | 4.3 MB |
| LUT cache (6 x 32^3 RGBA8) | 0.8 MB |
| Light volume 64 x 160 x 64 RGBA8 + lantern 32^3 | 2.7 MB |
| Blocks (CPU only) | 0 |
| Legacy material array 49 x 128^2 with mips (3D faces) | 4.3 MB |
| Section tables, noise lattice, section ids | 0.2 MB |
| Terrain, props, crew geometry | ≈ 6 MB |
| FX canvas (C) at native | ≈ 6.5 MB |
| **Total** | **≈ 61 MB** (budget 80 MB, against 4 GB devices; the old 40 MB line ignored the native back buffer) |

There is no HD texture array: the section is painted procedurally (§2), which saves the 5.6 MB SPEC §11.3 planned for it.

## 2. The section (`src/render/look.ts`, `terrainMaterial.ts`)

Every cut-plane face of a painted block, the shaft's back wall and alcove backs (all camera-facing faces), and the ledge tops of the dig band
are painted per pixel from the block's 5-stop ramp and its pattern style, in world metres: no texels, so nothing stair-steps at DPR 2-3
(CRITIQUE B7, B8). Fine detail fades out below 2 scene px per feature. The other faces of biome blocks (cavern walls, ledges, alcoves)
keep the legacy painters but walk their values through the biome's ramp, so a Fungal wall is violet even where it shares Topsoil's painter
(CRITIQUE B8's fallback: never the wrong biome). Near-grain on the legacy faces starts at 2 px per texel (CRITIQUE B SHOULD 16).

| Style | Used for | What it draws |
|---|---|---|
| strata | host beds | 0.5-0.8 m beds that undulate (no fixed dip), each with its own tone; fine laminae; crisp partings that pinch out, with a lit lip; sand grain; rimmed pebbles |
| soft | soil, moss, clay, ash | the same beds, softer and more mottled |
| hard | lenses, basalt, void stone | darker beds with jagged cracks that come and go |
| ore | common and rich ore | a matrix in the ore's dark stops, thin veins, faceted grains lit on their top-left facet, a lantern glint (Blinn-Phong on the emboss normal, CRITIQUE B SHOULD 3) |
| glow | glowing veins (amber, jade, magma, star shards) | ore with emission |
| gem | gem cells, crystal | a Voronoi of facets with bright edges and a glowing core |
| glass | ice, obsidian, echo crystal, star glass | large flat facets with a sliding reflection, hairline cracks |
| wood, masonry, metal, bone, chest, organic, fibrous | timber, brick and tile, brass and steel, fossils, the chest shell, caps and coral, mycelium and light threads | their own patterns |

**Value plan for the four bands (CRITIQUE B18).**

| Band | Mean luminance (display) | How |
|---|---|---|
| HUD | plates glass ≤ 0.45 alpha (C), text bone-100 on a ≥ 4.5:1 scrim | the vignette darkens the top 0.30 and bottom 0.25 under the plates |
| Stage (the dug shaft, 5 m above the floor) | 0.18-0.30 | the back wall in the camera fill and the lamps; alcoves as warm pockets 0.4-0.6 |
| Dig band (the floor +-1 m) | 0.35-0.55, the brightest band (V7 ≥ 1.25) | the lantern pool, +45 % key on the floor rows, the ledge tops; valuables 0.6-0.9 with glints |
| Section (below) | 0.25-0.35 at the floor → 0.10-0.15 by 7 m | the focus falloff (x0.52 by 7.5 m), the depth key into the rock mass, the fog of rock by 9 m; valuables glow through |

**Host toning.** Host ramps are authored, then toned (saturation x0.55, value x0.82, `toneHex`), so the matrix is a quiet near-neutral and
the ore, gems and chests carry the colour (V11). Each valuable's light stop is ≥ 25 ΔE2000 from every host mid of its biome (`look.test.ts`).

## 3. Key frames per biome (CRITIQUE B18, B SHOULD 12)

Each brief: the dig-band shot (palette, value, accent) and the Vista shot (backdrop shape, hero, light rig, moving part). The hero stands
in the Vista or Reveal Hall, front to the camera, 25-35 m behind the cut (8-24 m of it fill the 16.9 m dolly width).

| # | Biome | Dig band | Accent | Vista backdrop (shape) | Hero (setPieces/*) | Light rig / moving part |
|---|---|---|---|---|---|---|
| 0 | Topsoil Roots | cool grey-brown soil beds with rimmed pebbles, taupe clay, root wood; red-orange copper grains gleam, amber veins glow, rose gems | lamps #ffb35c, sky shaft #9fc3e6 | dusk-hazed hills with camp lights on the crests | the root chandelier: a 12 m inverted tree of roots with Halden lamps on its tips | 9 warm lamp points + cool fill; the lamps flicker |
| 1 | Glowroot Caverns | olive-grey moss beds, blue slate, root wood laced with glowroot threads; silver tin grains, jade veins (green is the light, not the rock) | glowroot #9be7a8, teal #5fe0c0 | root tangles hanging from the dark, tips glowing | the Rootheart: an 18 m knot of roots around a glowing green heart | the heart (3.2) + tendril tips; the heart pulses |
| 2 | Crystal Grotto | neutral slate and dark deep slate, grey echo crystal, cyan crystal lenses; carnelian quartz, azure sapphire glow, violet gems | cyan #2fb6cc / #8fe3ee | crystal spires lit by the glow | the Hand in the Crystal: a 20 m leaning crystal with a dark hand pressed inside, a crowd of crystals at its foot | cyan key + uplight; facets glint as the lantern moves |
| 3 | Halden Works | blue-grey deep slate, umber brick courses, timber, brass plate; rust-orange iron, bright silver | steam teal #6fd6c4, brass #e2b673; lantern whitened | gear wheels turning under a hoist tower | the Crusher Hall: a timber hoist tower, a boiler with a glowing firebox, two meshing gear wheels | firebox orange + teal pressure lamps; the gears turn |
| 4 | Fungal Deep | violet-brown umber, olive moss, magenta cap flesh, pale mycelium; gold grains, spore pearls, lime gems | magenta #c58cff, lime #a8ff6a | mushroom caps on tall stems, gills spotted with light | the Mother Cap: a 20 m mushroom with glowing violet gills and lime spots, small caps around | gill glow (3.4) + lime floor light; spots pulse |
| 5 | Drowned Ruins | teal tile and cool glyph courses, pale masonry, coral; pearl, lapis, aquamarine | aquamarine #5fb7ff, braziers #ff9a48 | a drowned city: stepped towers with lit windows | the Drowned Procession: five stone figures descending steps into the water, lanterns burning | five brazier points + blue fill; lanterns flicker |
| 6 | Magma Veins | charcoal basalt, black-violet obsidian glass, ash, glowing magma lenses; crimson ruby, fire opal, sun-yellow gems | lava #ff6a2a → #ffc04a; lantern whitened | the forge: an anvil and basalt towers over a lava river, lava falls | the Forge of the Bearers: a 15 m anvil on basalt columns, a hammer, a lava channel | lava river (4.0) + the anvil's hot seam; the river flows |
| 7 | Fossil Halls | ivory bone with pores, amber resin glass, umber, flint; bone gold, insect amber, ghost-violet gems | ghost light #c0b4ff, resin #ff9a2a; lantern whitened | a leviathan's ribs arching over the hall | (W3) the Leviathan's skull | — |
| 8 | Frost Hollow | glacier ice facets, frost slate, rime, echo crystal; rose-silver rime ore, frost diamond, aurora gems | glacier #7fd8ff, aurora #9dffd8 | a frozen waterfall among ice pillars | (W3) the frozen crew | — |
| 9 | The Loom | pale ashlar and glyph courses, violet thread rock; white-gold lumen crystal, loomstone | white-gold #fff4d0, thread #b9a2ff | the Archive of Light: shelves of identical crystals to the horizon | (W3) the Great Loom | — |
| 10 | Iron Core | dark ironbound plate, deep slate, rust, brass gear plate; blue mythril, lavender-silver magnetite | steel #8fb8ff, forge #ff7a2a | giant gears turning | (W3) the Escapement | — |
| 11 | Star Heart | near-black star glass, gold rock beds, pale sunstone; blue-white star shards, plasma pearls, violet gems | sun #fff1c2, nova #ff8ac8; lantern whitened | the Buried Star among floating rocks | (W3) the Buried Star | — |
| 12 | Void Sea | indigo void stone, pale violet echo glass, bedrock, black null glass; gold void pearls, cyan null glass | violet #7a6cff, star #d8e0ff | floating islands over an upward fall | (W3) the Watcher | — |
| 13 | The Gate | rune-carved glyph courses, bedrock, black stone with gold veins; cyan gate stone, gold sigil ore | rune #8fe3ee, gold #e2b673 | the Last Gate: a vast arch with rune lights | (W3) the Keeper | — |

## 4. Palette (generated from `biomeLooks.ts`: each slot's style and its mid stop after toning)

| # | Biome | hostA | hostB | soft | hard | ore | rich | gem | special | accent / accent2 | fog / low | lantern | exposure | grade shadow → highlight |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | topsoil | strata #4a4644 | strata #5d5a55 | soft #5a574e | wood #4a3c31 | ore #e0682a | glow #e88c1c | gem #e0508e | wood #6e4626 | #ffb35c / #9fc3e6 | #2a2420 / #17130f | #ffe6c6 | 1.85 | #1a1e2a → #fff1d8 |
| 1 | glowroot | soft #373e33 | strata #3c4248 | soft #374047 | wood #40372f | ore #8290a0 | glow #26a062 | gem #2cac74 | fibrous #26a452 | #9be7a8 / #5fe0c0 | #142226 / #0c1a1e | #ffe6c6 | 2.2 | #0b1a1a → #f0ffe8 |
| 2 | crystal | strata #515155 | hard #53575f | glass #5b5a5d | glass #3a6069 | ore #d84a5a | glow #22a8f0 | gem #6c36b4 | gem #1a8aa0 | #2fb6cc / #8fe3ee | #1e2a3a / #121a30 | #ffe6c6 | 2.15 | #0e1530 → #e8fbff |
| 3 | halden | strata #37393e | masonry #45403e | wood #4d4035 | metal #8d7b5b | ore #f07020 | ore #a0a8b6 | gem #c42c4e | wood #44301e | #6fd6c4 / #e2b673 | #231a12 / #140e0a | #fff4ea | 2.1 | #120c10 → #ffd8a0 |
| 4 | fungal | strata #43383f | soft #384233 | organic #764d70 | fibrous #726e79 | ore #c8a040 | glow #b44cbc | gem #68b422 | organic #5aa02a | #c58cff / #a8ff6a | #1a0f22 / #0c1a12 | #ffe6c6 | 2.12 | #100818 → #e8ffc8 |
| 5 | drowned | masonry #3d4d54 | masonry #424a55 | strata #5c6261 | organic #94685d | ore #b0b6c8 | ore #2a50b8 | gem #1a8eac | masonry #384058 | #5fb7ff / #ff9a48 | #0a2236 / #061628 | #ffe6c6 | 2.1 | #04101e → #c0f0ff |
| 6 | magma | hard #352f2d | glass #3c3647 | soft #4d4946 | glow #c44208 | ore #d8203e | glow #ec6610 | gem #e8c040 | glow #d83a06 | #ff6a2a / #ffc04a | #2a140c / #1a0a06 | #fff4ea | 2.15 | #1a0a0a → #fff0c0 |
| 7 | fossil | bone #746f65 | glass #4a4037 | strata #4d4741 | hard #3e3934 | ore #c8a44c | glow #d87a12 | gem #7064aa | bone #a49680 | #c0b4ff / #ff9a2a | #221e1a / #15110e | #fff4ea | 1.5 | #16120e → #fff4dc |
| 8 | frost | glass #515f6a | strata #383f46 | soft #62676c | glass #585e67 | ore #c85aa8 | gem #9a7ae8 | gem #32b88c | glass #80b4d4 | #7fd8ff / #9dffd8 | #1a2a3a / #0e1826 | #ffe6c6 | 1.1 | #06202a → #eafffa |
| 9 | loom | masonry #545149 | masonry #3e3d47 | masonry #4d4640 | fibrous #49445c | glow #dcc060 | glow #764ac6 | gem #d8c070 | fibrous #c8b070 | #fff4d0 / #b9a2ff | #1e1c18 / #0e1420 | #ffe6c6 | 1.65 | #1c1408 → #fff2cc |
| 10 | ironCore | metal #35383d | strata #2c2f34 | soft #55443a | metal #7d6c51 | ore #548cc0 | ore #9a8ad8 | gem #3060b4 | glow #c04a10 | #8fb8ff / #ff7a2a | #141820 / #0c0e14 | #ffe6c6 | 2.1 | #081426 → #e4eeff |
| 11 | starHeart | glass #0f0e14 | strata #564b35 | soft #6b614e | gem #c8b058 | glow #a8c8ff | glow #dc4cb4 | gem #8a4ae8 | glow #f0d060 | #fff1c2 / #ff8ac8 | #3a2a10 / #20160a | #fff4ea | 1.6 | #201408 → #ffffff |
| 12 | voidSea | hard #2b273d | glass #4b495b | strata #26252b | glass #212f36 | glow #e0c060 | glow #188caa | gem #5a6cc4 | fibrous #5a44c0 | #7a6cff / #d8e0ff | #0c0820 / #1a0c3a | #ffe6c6 | 1.75 | #06041a → #e8e0ff |
| 13 | gate | masonry #43414b | strata #2e2d34 | masonry #6a6e74 | ore #907f5b | glow #18869c | glow #c89c40 | gem #784cc8 | fibrous #1c90a8 | #8fe3ee / #e2b673 | #1a1226 / #0e0a18 | #ffe6c6 | 2.6 | #061a1e → #fff6e0 |

Ramps run dark → light in 5 stops (crevice, shadow, mid, light, highlight); the shader walks them with the pattern's tone, the lighting
does the rest. The grade pulls the shadows 0.95, the mid-tones 0.42 and the highlights 0.55 toward each look's tints while keeping
luminance; consecutive biomes differ by ≥ 9 ΔE2000 on a neutral ramp (V5 ≥ 8).

## 5. Capture rounds (W2 §5 MUST 6; `tools/look-capture.mjs`)

Every round shoots the 14 biomes at their dig face through the Biome Lab (`visuallab.html`, real WebGL in headless Chromium on
SwiftShader, Balanced, Reduced motion, the camera at rest) at 390 x 844 @2, and prints the look metrics per shot into
`artifacts/idle/w2/look/<round>-metrics.json`. The PNGs are next to them (`<round>-biome-NN.png`).

| Metric | Target | How it is measured |
|---|---|---|
| V1 | mean 0.20-0.38, std ≥ 0.16 | display luminance of the world region (y 96-700 CSS px) |
| V2 | ≤ 10 % | share of world pixels below 0.03 |
| V3 | ≤ 0.8 % | share clipped (all channels > 0.98) |
| V4 | 1-6 % | accent share: saturation > 0.6 and luminance > 0.5 |
| V7 | ≥ 1.25 | the dig band (floor ± 1 m) mean over the world mean |
| V11 | ≥ 1 | per valuable in rows 0-2: max(luminance ratio / 1.6, ΔE2000 / 25) against its row's host cells, the worst one on screen |
| detail | ≥ 85 % | share of 32 px tiles of the world region with luminance std ≥ 0.02 |

**Scores** (1-10, by eye on the full-size shot): **R**eadability (the floor, the next cell and every valuable found in a second, the HUD
bands clear), **W**ow (would the frame stop a thumb: light, depth, one signature colour moment), **C**ohesion (one world: palette
families, one lighting logic, nothing stray).

### 5.1 Metric passes per round

| Round | Pass all | What changed before it | Fails |
|---|---|---|---|
| r1 | 2/14 | first HD section, ramps and looks | 0 V4 V7 V11; 1 V7; 2 V1 V11; 3 V7 V11; 4 V4 detail; 6 V4; 7 V1 V4 V11; 8 V1 V4 V7 V11; 9 V1 V11; 10 V2 V11 detail; 11 V1 V11; 12 V1 V11 |
| r2 | 3/14 | per-kit layer fallback (Halden was all brick, Magma all obsidian, Fossil all resin), fine detail threshold 22-50 px/m, glass facets calmed, host toning | 0 V4 V11; 2 V1 V11; 3 V2 V11; 4 V2 V4 detail; 6 V1 V2 V4 detail; 7 V4 V11; 8 V1 V4 V11; 9 V1 V11; 10 V11; 11 V1 V11; 12 V1 V11 |
| r3 | 3/14 | exposures per biome, deep hosts darkened (8, 9, 11, 12), the lantern colour shared (warm biomes really whiten it now), gem facets centred on the mid stop, valuable self-light up | 0 V11; 2 V11; 3 V11; 4 V2 V4 detail; 6 detail; 7 V4 V11; 8 V11; 9 V11; 10 V11; 11 V1 V2 V11; 12 V11 |
| r4 | 3/14 | the flame's amber halved on host rock (valuables keep it), crimson chest shell, azure sapphire, stronger rime and iron, highlight knee, Glowroot de-greened | 0 V11; 2 V11; 3 V11; 4 V2 V4 detail; 6 detail; 7 V4 V11; 8 V11; 9 V11; 10 V11; 11 V1 V2 V11; 12 V11 |
| r5 | 5/14 | Topsoil beds cooled to grey-brown, copper red-orange; coral quartz; rust iron on umber brick; lavender-silver magnetite; gold void pearls; violet frost diamond; Fungal gold muted; exposures 4, 6, 11 | 2 V11; 3 V11; 4 V2 V4 detail; 6 detail; 7 V4 V11; 8 V4 V11; 9 V11; 11 V1 V2 V11; 12 V4 |
| r6 (2, 3, 6, 7, 8, 11) | — | knees on the back-wall light (lantern and light volume) for the white pool; brighter sapphire and iron | 2 V11 0.93; 3 V11 0.98; 6 detail; 7 V4 V11 (chest); 8 passes (V11 1.03); 11 V1 V2 V11 (chest) |
| r7 (2, 3, 6, 7) | — | carnelian quartz, brighter iron, stronger knees | 2 V11 0.97 (sapphire at the shaft edge); 3 passes (V11 1.06); 6 detail 82; 7 V4 V11 (chest) |

V11 is the hard one, and the tool now names the worst cell (`V11worstId`, `V11worstAt` row/col): r3-r4 showed three causes. (1) A
valuable in its host's hue family under the lantern (Topsoil copper on lamp-warmed soil, Halden iron on brick, Grotto quartz on lilac
slate, Iron Core magnetite on blue plate, Void pearls on violet glass): ΔE2000 saturates at high chroma, so the fix is hue, not
saturation (copper red-orange on cooled grey-brown beds, rust iron on umber brick, coral quartz, lavender-silver magnetite, gold
pearls). (2) The chest at the floor (`41` at row 0, col 3 in Fossil, Loom, Star Heart): the cell is covered by B's popped chest entity
and its amber tier glow, which merges with warm rock (ΔE 9-17); the shell under it is now crimson and brass, the glow is B's (request).
(3) Pale valuables on pale hosts (Frost rime, Grotto quartz): saturated and brighter now.

**V11, the latest shot per biome:** Topsoil 1.00 (r5), Glowroot 1.78, Crystal 0.97 (r7; the azure sapphire in the shaft's edge column,
ΔE 24.2), Halden 1.06 (r7), Fungal 1.48, Drowned 1.26, Magma 1.40, Fossil 0.83, Frost 1.03 (r6), Loom 0.98, Iron Core 1.16, Star Heart
0.66, Void Sea 1.54, Gate 1.85. It holds in 10 of 14. Fossil, Loom and Star Heart fail on one cell, the chest at the floor, which B's
popped chest entity covers with its amber tier glow (ΔE 8-17 against warm rock; the crimson shell under it is not what is measured).

### 5.2 Scores (R / W / C), 390 x 844 @2

| # | Biome | r1 | r2 | r3 | r4 | r5 | r6 | r7 |
|---|---|---|---|---|---|---|---|---|
| 0 | Topsoil | 7/6/6 | 7/6/7 | 7/6/7 | 7/6/7 | 7/6/7 | — | — |
| 1 | Glowroot | — | 5/6/6 | 6/6/7 | 7/6/7 | 7/6/7 | — | — |
| 2 | Crystal | 7/7/6 | 7/7/7 | 7/8/7 | 7/8/7 | 7/8/7 | 7/8/7 | 7/8/7 |
| 3 | Halden | 5/5/5 | 7/6/6 | 7/6/7 | 7/6/7 | 7/6/7 | 7/7/7 | 7/7/7 |
| 4 | Fungal | 6/7/6 | 6/7/6 | 7/8/7 | 7/8/7 | 7/8/7 | — | — |
| 5 | Drowned | 6/6/6 | 7/7/7 | 7/7/7 | 7/7/7 | 7/7/7 | — | — |
| 6 | Magma | 4/6/4 | 5/6/5 | 6/7/6 | 6/7/6 | 6/7/6 | 7/7/7 | 7/7/7 |
| 7 | Fossil | 4/5/4 | 5/6/5 | 6/6/6 | 6/6/6 | 6/6/6 | 7/6/6 | 7/6/7 |
| 8 | Frost | 5/5/5 | 6/6/6 | 7/7/7 | 7/7/7 | 7/7/7 | 7/7/7 | — |
| 9 | Loom | 6/6/6 | 6/6/6 | 7/7/6 | 7/7/6 | 7/7/6 | — | — |
| 10 | Iron Core | 6/5/6 | 7/6/7 | 7/6/7 | 7/6/7 | 7/7/7 | — | — |
| 11 | Star Heart | 5/6/5 | 5/6/5 | 6/7/6 | 6/7/6 | 6/7/6 | 6/7/6 | — |
| 12 | Void Sea | 5/6/6 | 6/6/6 | 7/7/7 | 7/7/7 | 7/8/7 | — | — |
| 13 | Gate | 6/6/7 | 7/7/7 | 7/7/7 | 7/7/7 | 7/7/7 | — | — |

(r1 biome 1 was shot but not on a contact sheet I scored.) What held the low scores: r1 the wrong-biome fallback (Halden all brick,
Magma all obsidian glass, Fossil all resin) and pale washed deep biomes; r2 a monochrome Glowroot and pale Frost, Star, Void; r3-r5 the
back wall right behind the flame burning white in Magma and Fossil (C 6) and the Loom and Star Heart gold glare (C 6), and the dig
face alone lacking a signature moment in Topsoil, Glowroot and Halden (W 6: their moment is the Vista and its light cones, §7).

### 5.3 Round 5 metrics

| # | Biome | V1 mean / std | V2 dark % | V3 clip % | V4 accent % | V7 | V11 near (dE) | V11 rows 4-5 | detail % | fails |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Topsoil | 0.331 / 0.17 | 3.42 | 0 | 4.81 | 1.27 | 1 (25) | — | 98.3 | — |
| 1 | Glowroot | 0.27 / 0.195 | 2.94 | 0 | 3.03 | 1.25 | 1.78 (44.6) | 5.16 | 88.4 | — |
| 2 | Crystal | 0.355 / 0.176 | 1.27 | 0 | 2.74 | 1.39 | 0.88 (22) | 1.46 | 96.5 | V11 |
| 3 | Halden | 0.25 / 0.199 | 8.22 | 0 | 1.9 | 1.48 | 0.91 (22.8) | — | 91.4 | V11 |
| 4 | Fungal | 0.26 / 0.233 | 10.73 | 0 | 8.17 | 1.73 | 1.48 (36.9) | 5.18 | 83.7 | V2, V4, detail |
| 5 | Drowned | 0.342 / 0.274 | 4.34 | 0 | 5.07 | 1.63 | 1.26 (31.6) | — | 96.6 | — |
| 6 | Magma | 0.229 / 0.22 | 6.42 | 0 | 3.22 | 1.43 | 1.4 (35.1) | 2.79 | 81.8 | detail |
| 7 | Fossil | 0.319 / 0.23 | 3.66 | 0 | 9.3 | 1.37 | 0.82 (17.3) | — | 88 | V4, V11 |
| 8 | Frost | 0.361 / 0.254 | 4.82 | 0 | 0.79 | 1.51 | 0.95 (23.7) | — | 93.9 | V4, V11 |
| 9 | Loom | 0.358 / 0.27 | 3.45 | 0 | 4.38 | 1.58 | 0.98 (24.6) | 2.7 | 96.7 | V11 |
| 10 | Iron Core | 0.337 / 0.243 | 3.31 | 0 | 1.72 | 1.5 | 1.16 (29) | 4.38 | 91 | — |
| 11 | Star Heart | 0.381 / 0.275 | 13.48 | 0.06 | 2.17 | 1.46 | 0.66 (8.4) | — | 88.4 | V1, V2, V11 |
| 12 | Void Sea | 0.373 / 0.26 | 5.9 | 0 | 10.79 | 1.51 | 1.54 (38.4) | — | 90.8 | V4 |
| 13 | Gate | 0.266 / 0.202 | 2.8 | 0 | 3.86 | 1.56 | 1.85 (46.3) | 2.65 | 97.3 | — |

V5 (consecutive biomes ≥ 8 ΔE2000 on a neutral ramp through their grades): min 9.2 (`lut.test.ts`). Human amber ≥ 25° of hue from the
accents of the warm biomes 3, 6, 7, 11 (their lantern whitened, `look.test.ts`). V4 runs high where the shot is full of gold
(Fungal, Void pearls) or the warm pool (Fossil): the valuables are the accent there, by design.

### 5.4 Other viewports (r4, biomes 0, 2, 4)

| Shot | V1 | V2 | V4 | V7 | V11 | detail | Score R/W/C |
|---|---|---|---|---|---|---|---|
| `r4-biome-00-360x740.png` (@2) | 0.346 | 1.92 | 5.03 | 1.22 | 1.01 | 99 | 7/6/7 |
| `r4-biome-02-360x740.png` | 0.363 | 1.18 | 2.18 | 1.35 | 0.79 | 98.6 | 7/8/7 |
| `r4-biome-04-360x740.png` | 0.273 | 10.41 | 9.15 | 1.67 | 1.46 | 85.8 | 7/8/7 |
| `r4-biome-00-412x915.png` (@2.625) | 0.323 | 3.58 | 4.61 | 1.29 | 1.01 | 95.8 | 7/7/7 |
| `r4-biome-02-412x915.png` | 0.344 | 1.13 | 2.95 | 1.43 | 0.87 | 93.1 | 7/8/7 |
| `r4-biome-04-412x915.png` | 0.247 | 10.88 | 7.4 | 1.77 | 1.47 | 77 | 7/8/7 |

The framing holds at both: seven columns edge to edge, the floor at the same band, the HUD bands clear. The narrower 360 frame crops
the Grotto's crystal ceiling; the 412 @2.625 one renders the finest grain (detail stays ≥ 77 % even in Fungal's dark deep end).

## 6. Before and after (W1 at `4b5af14` | W2)

`artifacts/idle/w2/look/pair-biome-00.png`, `pair-biome-02.png`, `pair-biome-04.png` (W1 shot with W1's own `descent-capture.mjs`,
same viewport, depth and Reduced motion; W2 is round 5). W1 drew the section from 32 px texels magnified to 22 screen px per texel, so
every bed, crack and grain stair-stepped and the valuables were dark squares in pale rock (Grotto) or orange blocks in orange rock
(Fungal, which had no kit of its own). W2 paints every camera-facing face per pixel in world metres: beds with lit partings, pebbles
with rims, ore as faceted grains on a matrix, gems as Voronoi facets, the chest as a crimson-and-brass front; the hosts are quiet and
toned, so the valuables carry the colour.

## 7. Vistas and heroes, biomes 0-6 (MUST 4)

`tools/look-capture.mjs --vista 1` opens a 56 x 14 m hall behind the shaft (a stand-in for B's Vista cavern, which DescentScene will
open through `VistaHost`), shows the biome's `VistaBackdrop` (2 layers on Balanced plus the opaque far haze, the light cones) and stands
its hero (`setPieces/*`) 26 m behind the cut. Shots `artifacts/idle/w2/look/r7-vista-0N.png` (earlier rounds r4-r6 kept for the
history).

| # | Backdrop | Hero | r4 | r5/r6 | r7 |
|---|---|---|---|---|---|
| 0 | hills under a dusk band, camp lights | the root chandelier, 9 lamps on its tips | 6/5/5 | 6/5/5 | 7/6/7 |
| 1 | root tangles glowing at their tips | the Rootheart, its green heart pulsing | 6/5/5 | — | 7/7/7 |
| 2 | crystal spires catching the glow | the Hand in the Crystal and its crowd, two cyan cones | 7/8/7 | — | 7/8/7 |
| 3 | gear wheels under a hoist tower | the Crusher Hall: tower, boiler with its firebox, turning gears | — | — | 7/7/7 |
| 4 | caps on tall stems, spotted gills | the Mother Cap, lilac gills lit from below | — | — | 7/8/7 |
| 5 | a drowned city of stepped towers with lit windows | the Procession with their braziers | — | — | 7/8/7 |
| 6 | the forge: anvil and basalt towers over the lava river | the Forge of the Bearers, the hot seam, the lava channel | — | — | 6/7/7 |

What r4-r6 got wrong and r7 fixed: the far layer's mystery glow was a wash over the whole opening and the silhouettes carried a 0.12
glow tint, which, exposed and encoded, read as a flat tan (Topsoil) or mint (Glowroot) card; the chandelier's lamp bodies sat inside
their own housings (invisible). Now the glow is a pool behind the hero, the silhouettes stay dark with only their lit points bright,
and the lamps are caps around a glowing body. Open: the Topsoil dusk band sits below the hall's opening at this camera (the hills hide
it), and the Forge's anvil is a dark mass that needs a rim light (W3, with B's real Vista caverns and their heights).
Not yet in the game: B has not bound `VistaBackdrop` (`setVistas`) or placed the heroes (requests).

## 8. The surface at dusk (MUST 5)

`artifacts/idle/w2/look/surface-biome-00.png` (depth 0, Balanced, 390 x 844 @2): a dusk sky from ember at the horizon through rose and
violet to the zenith, the sun's afterglow behind the left ridge, a pale moon, stars by magnitude and a faint star river, two ridges in
haze, and the camp in the foreground (the pickaxe rack, the workbench, the survey table, the satchel, the plot stake and the lamp posts)
above the first rows of the cut (the crimson chest and the first copper already showing). Score 7/7/7. V1 0.275 / 0.169, V2 8.1 %,
V4 2.8 %; V7 0.98 and detail 72 % are expected here (the sky is the subject, not a dig band). Still to do (W3): the far town's lights
read only as a few points at this size.

## 9. Ceremony post (MUST 7)

`PostParams.dim`, `iris` + `irisCenter`, `shock` + `shockCenter` and `bloomPulse` (§0.2) are drawn in the native final pass, compiled at
load (no variant), and tested as pure functions in `tests/unit/idle/composite.test.ts` (the octagon, the iris mask and its rim, the
vignette, the Catmull-Rom weights, CAS). Shots: `ceremony-iris-biome-02.png` (`iris 0.42, dim 0.25`, centred on the floor: the octagon
with its 1 px brass rim, the frame outside it black, the dim inside) and `ceremony-shock-biome-04.png` (`shock 0.45, bloomPulse 0.8`:
the chest's glow swells; the shock ring is a refraction, so a still shows it only as a faint ripple; its motion is unverified here).

## 10. Cost (MUST 1; `node tools/perf.mjs --outDir .e2e-dist-4176`, Balanced, the production build)

The modelled GPU frame at the reference 390 x 844 @2.75 (composite capped at 2.25, scene scale 0.65), from
`artifacts/idle/w2/perf-balanced.json`:

| Pass | Pixels | ms |
|---|---|---|
| bright, 3 down, 3 up | 176k ... 2.6k | 0.347 (budget 1.0) |
| resolve | 706k | 0.393 |
| fxaa | 706k | 0.405 |
| final (shock, Catmull-Rom, CAS, vignette, dim, iris, dither) | 1666k | 1.093 |
| composite = resolve + fxaa + final | | **1.891** (budget 1.9) |
| terrain estimate | | 1.135 (budget 4.5) |
| frame | | 7.37 (budget 12) |
| GPU memory | | 55.7 MB (budget 80) |

The first run put the composite at 2.279 ms (CAS fetched its own four neighbours: 1.481 ms for the final pass) and failed; CAS now
reads the Catmull-Rom's outer taps and the tool exits 0. Shader programs: 20 at boot, 20 at the end (P3). Draw calls 92-107 and
136-166 k triangles at the four spots (B's content; SPEC P1 asks for fewer calls).
