# DEEP DOWN — Technical Architecture

## Engine decision

| Option | Status in this environment | Decision |
|---|---|---|
| Unity + URP (preferred by the brief) | No Unity, no .NET; `download.unity3d.com` blocked by network policy (HTTP 403); a license activation would need the owner's Unity account | Not possible here |
| Godot | Download host blocked (403) | Not possible here |
| **TypeScript + Three.js (WebGL 2)** | Node 22, npm registry reachable, headless Chromium with working WebGL 2 (SwiftShader) for real rendering, screenshots, and automated play tests | **Chosen** |

The game runs in any WebGL 2 browser. On Android it ships inside a thin native WebView
wrapper (`android/`). WebView is Chromium on every modern Android device, so the build we
test in headless Chromium is the same engine that runs on the phone. iOS can use the same
web build in a WKWebView wrapper (WebGL 2 is supported since iOS 15).

Pinned dependencies (exact versions, no ranges): `three@0.186.1` (runtime),
`vite@7.3.6`, `typescript@6.0.3`, `vitest@4.1.11`, `@playwright/test@1.56.1` (tooling).
No other runtime dependency. All art and audio are generated in code.

## Source layout

```
src/
  core/        math, seeded RNG, gradient noise, typed EventBus
  config/      blocks, tiles, items, recipes, balance (all tunable numbers)
  i18n/        en.ts (complete English table) + t()
  world/       VoxelWorld storage, DDA raycast, LightField + LanternField, gen/
  render/      mesher, ChunkRenderer, textures, terrain + entity materials,
               lighting rig, voxModel builder, PostFX, Renderer (quality presets),
               props/ (14 procedural prop kinds, PropRenderer with picking)
  entities/    character/ (jointed explorer model + pure pose math)
  game/        Game (modes, frame loop, flow), WorldSession, PlayerController, CameraRig,
               MiningController, Drops, Guidance, effects/ (debris, particles, halos,
               waterfall, target marker)
  gameplay/    inventory, crafting, equipment, lantern, mining rules, objectives, journal
  input/       InputState contract + desktop (keyboard/mouse) input
  ui/          DOM UI: menus, HUD, touch controls, inventory, crafting, settings, icons
  audio/       Web Audio synthesis: sfx, ambience, music, reverb
  save/        Settings + SaveData types, versioned two-slot persistence
  lab/         VisualLab entry (visuallab.html)
  debug/       window.__DD__ test/debug API, stub UI, developer world viewer (viewer.html)
tests/unit     Vitest (pure logic, world invariants, light correctness)
tests/e2e      Playwright (real WebGL in headless Chromium)
tools/         capture.mjs (screenshots), play.mjs (scripted play), perf.mjs, ui-check.mjs
               (UI + touch checks), apk-sim.mjs (APK files on the shell's origin),
               audio-check.mjs, run-ts.mjs, gen-stats.ts, png.mjs
android/       WebView shell (MainActivity), manifest, build-apk.sh (no Gradle)
```

## World and voxels

- One bounded world volume per expedition zone: `160 x 128 x 160` blocks, 1 byte per voxel
  (3.3 MB). Index = `x + sx * (y + sy * z)`, identical to the 3D light texture layout.
- Out-of-bounds reads return bedrock, and generation re-asserts a bedrock shell, so the
  player can never leave the world.
- 16³ chunks. `VoxelWorld.set()` marks the owning chunk and any neighbor whose ambient
  occlusion can change (edges/corners) dirty.
- New biomes are new zones (a new layout + world volume) entered through descent points.
  Nothing in the engine assumes a single zone, so adding biomes needs no rewrite.

### Generation (`world/gen/generateWorld.ts`)

Authored-procedural and deterministic per seed: the composition (camp, tunnel, ledge,
stairs, hall, shrine, chasm, rift, temple gate) is designed by hand in code; noise only adds
natural irregularity. Output `WorldLayout` = world + spawn + camp region + discovery
regions + prop specs + marked route + named landmarks.

Building blocks, in the order they run: base rock (dipping strata with marker beds, the weathered
band and ore bodies), the carved spaces, geology dressing (strata ledges, ribs, erosion pockets,
dripstone families, flowstone curtains, kept off the routes and away from the built walls), then
architecture helpers: `column` (octagonal shaft with footing, plinth, base ring and abacus, or a
fractured top), the stair flights on piers, the portal gate, the corbel-vaulted shrine, the arched
bridge, and `crystalSeam` (turns only the exposed host-rock faces along a segment into crystal,
so crystal follows the rock instead of standing as cubes). Lamp posts are placed at every
navigation point. The light budget is a tested contract (`worldgen.test.ts`): at most 120 cyan
emitter voxels (glyph stones, crystal, cyan lights) and a warm lamp within 7 m of every
navigation landmark; `tools/emission-budget.ts` prints the current numbers.

Generation and the first full light + openness pass run in a module Web Worker
(`world/gen/zoneWorker.ts`, loaded by `zoneLoader.ts`); the block and light buffers are
transferred back, not copied. Measured on the dev container: ~330 ms generation + ~280 ms
light, off the main thread, so the loading bar keeps moving. If module workers are
unavailable the same code runs on the main thread. The first whole-zone meshing then runs on
the main thread, time-sliced; remeshing in play runs in mesh workers (see Meshing).

### Structures (`render/structures/*`, `world/gen/architecture.ts`)

Built architecture is not drawn by the voxel mesher. The generator emits structure specs
(stair flights, columns, bridge, kerbs and copings, the landing tower cornice, camp timber, drums
and slabs) and fills their volume with hidden collision ids (`STRUCTURE`, `STRUCTURE_TIMBER`,
`RAMP_*`, `RAMP_BASE_*`, ids 24–33: solid, invisible, unbreakable, non-occluding for meshing), so
light, raycasts, mining, reachability and camera collision keep working on whole cubes and the
terrain mesher stays byte-identical. `StructureRenderer` builds one merged mesh per 32 m cell
(lazily, nearest first, at least one per frame, then within 6 ms), culled with the chunk view
distance and drawn at `renderOrder −1`. Vertices are 28 B (position f32×3, normal i8×4, texture
st i16×2, light-sampling offset i8×4, info u8×4). `structureMaterial.ts` reuses the terrain's
lighting composition and the masonry course libraries (`courseGlsl`), with world-course,
strip-stone, monolith and plain (timber) modes, contact occlusion against the terrain and a tone
per stone. Stair flights have a walking plane: `RAMP_*` wedge cells are solid below a 1:1 plane
and `PlayerController` supports, lifts and snaps the feet along it (`STAIR_EDGE` 0.34 m), so the
drawn feet stay within 0.15 m of the treads (unit-tested). Viewer flag `structures=0` hides them.

### Meshing (`render/mesher.ts`)

Culled faces, one quad per visible face, **sculpted on the CPU** into modelled rock:
- Shape: every quad corner sits on a lattice point, the centre of the 2×2×2 voxels around it (a
  surface-nets dual cell), and moves toward that cell's surface-nets point (a 256-entry table)
  weighted by rigidity (natural rock 1.0, firm rock 0.7, masonry 0.12, timber 0). Flat floors and
  walls move exactly 0, convex edges bevel 0.25 m, convex corners 0.33 m, concave creases fill; a
  1 m step becomes a slope and a 1-voxel column an octagon. A Laplacian relaxation (0.5) keeps
  1:2 and 1:3 voxel slopes from bevelling into identical lumps; natural rock then gets CPU
  value-noise relief along the normal (2.6 m and 7.3 m features, up to 0.36 m) plus a 0.13 m
  sideways jitter. Gameplay clamps: walkable tops keep 85 % of the bevel's vertical move and 10 %
  of the noise's (flat interiors 0, edges ≈ 0.21 m, corners ≤ 0.31 m), rock never reaches more
  than 0.4 m into open space, ceilings sag ≤ 0.12 m; thin features get less relief.
- Shading: smooth per-corner normals from a 4×4×4 occupancy gradient bent by the noise's analytic
  gradient (octahedral, 2 bytes) and a smooth depth-weighted AO for natural rock; masonry,
  crystal and timber keep flat face normals and per-face AO so arrises stay crisp. Quads are
  split along the diagonal whose corner normals agree most (folds follow the form). Crystal
  seams keep their host rock's shape, sunk 0.2 m, with flat faces.
- Vertex: one interleaved 16-byte buffer: `aGeo` (lattice corner xyz + octahedral normal x),
  `aData` (face, AO, material layer, bits: uv | rigidity << 2 | family << 4 | rune << 6), `aNb`
  (material layer of the in-plane neighbour across each face edge, 255 = no boundary), `aShape`
  (sculpted offset xyz + octahedral normal y). The shader keeps the undisplaced lattice position
  (`vGrid`) for cell picking, world texture coordinates and the boundary blend, so mining
  cracks, materials and boundaries stay on the right block.
- Crack-free: everything about a lattice point is a pure function of its world position and
  the voxels around it, with 2-voxel chunk padding, so a vertex shared by two chunks gets
  bit-identical bytes from both (unit-tested). Normals and AO read one voxel further than the
  world's dirty marking covers, so each chunk keeps 26 seam keys (hashes of its two-voxel band
  next to each neighbour); when a re-mesh finds one changed, `ChunkRenderer` queues that
  neighbour (unit-tested: the result is byte-identical to a fresh mesh).
- Cost: a meshed chunk 0.66–0.88 ms (dense up to ≈1.4 ms; was 0.37–0.48), whole zone unchanged
  (≈0.26–0.36 s). `ChunkRenderer` hides chunks beyond the view distance.
- Remeshing in play runs off the main thread (`render/meshPool.ts`, `render/meshWorker.ts`): 1–2
  module workers (2 from three hardware threads; `?meshworkers=N` overrides, 0 = main thread).
  Per dirty chunk, nearest first, the main thread copies its padded voxel block (`copyPadded`:
  20³ = 8000 bytes, everything the mesher reads) and transfers it; the worker runs the same pure
  mesher (`meshPadded`, byte-identical to `meshChunk`: unit-tested over every chunk of the zone,
  and `__DD__.meshCheck()` compares all GPU buffers with fresh main-thread meshes in the browser)
  and transfers the vertex, index and seam buffers back. A chunk keeps its old mesh until the new
  one arrives; at most one job per chunk is in flight (an edit meanwhile re-queues it); every
  result carries a job id and one that is no longer the chunk's latest request is dropped, so an
  older mesh never replaces a newer one; the chunks posted together (an edit's 1–8 chunks) switch
  in the same frame, in posting order; seam keys from worker results queue neighbours as before.
  At most 4 jobs per worker are in flight, so an edit waits behind 3 at most. Measured
  (`tools/perf.mjs`, production builds, 4 alternating runs each, 20 blocks mined in the frame
  loop, dev container at load 8–13 on 4 cores): main-thread chunk work per mined block 1.71 →
  0.82 ms (median), worst block 8.85 → 2.7 ms, worst frame 6.65 → 2.25 ms; the mined chunk is
  drawn one frame after the edit (was the same frame; 2 frames once in 80 edits).
- Whole-zone builds (load, New Game after edits, Continue) stay on the main thread, time-sliced,
  exactly as before: a build shared with the workers (`?meshbuild=pool`: workers take the queue
  front, the main thread the back, then steals unanswered jobs) measured slower on the loaded
  container (zone meshing 740 → 870 ms median; equal at load ≈5), so it is opt-in until measured
  on a device. The workers start 30 frames after the first build (nothing competes with loading)
  and first mesh the zone's 48 densest chunks once each, results dropped: a fresh V8 isolate needs
  ~10 meshes at 15–90 ms before its optimised mesher runs at ~1 ms, and synthetic blocks were not
  enough (real jobs then still took up to ~100 ms). Until that is done, edits mesh on the main
  thread.
- Fallback: no module workers (Node, old WebViews), a worker that cannot be constructed, fails to
  load, throws, or stops answering (8 s and 60 frames) → the same mesher on the main thread
  within a 4 ms/frame budget, nearest first and always at least one chunk, so an edit is never
  left invisible; jobs the workers still owed are queued again. `flush()` (`__DD__.meshIdle()`)
  resolves once every pending mesh is applied.

## Lighting (the core art system)

All lit materials share `LightingRig` uniforms (`render/lighting.ts`):

1. **World light volume** — `LightField`: colored flood-fill light from emitter blocks
   (crystals, glyph stones, invisible lamp/fire emitters owned by props), 18-connected,
   multiplicative falloff so hue is preserved. Stored RGBA8 in a world-sized 3D texture.
   Alpha = *openness* (fraction of open space nearby) → faint blue ambient fill that makes
   big chambers read as big.
   - Mining a non-emitter can only add light: incremental fill from neighbors (0.06–0.1 ms).
   - Removing an emitter runs a per-channel light-removal flood fill, then refills the gap
     from the brighter frontier (0.3 ms; a box rebuild took 17 ms). Open emitters next to the
     removed light drop back to their own emission, so no ghost light survives.
   - Only placing a solid voxel (props settling) rebuilds a local box of radius `LIGHT_REACH`.
   - A freshly opened voxel takes the openness of its most open neighbour.
   - Only the changed sub-box is uploaded (`texSubImage3D`).
   - Property tests prove incremental, removal and lamp-move updates equal a full recompute.
2. **Lantern** — the only dynamic light. `LanternField` (32³ R8 texture following the player)
   stores visibility from the flame, computed in one outward propagation pass: each voxel
   averages its up-to-three neighbours one step back toward the flame, weighted by the flame
   direction, and solids are 0. Walls cast shadows, penumbrae soften with distance, light
   never leaks through walls, and it costs 0.2–0.6 ms where ray-marching each voxel cost
   1.75–5.7 ms. It recomputes when the flame moves 0.35 m, the radius changes or the world
   changes; a flame a few cm inside a wall starts from the nearest open voxel. The shader
   applies a windowed inverse-square falloff from the flame's exact position (K 6, gain 1.6:
   0.95 at 1 m, 0.68 at 3 m, 0.30 at 6 m). The core is warm-pale (#ffe6c6) and reaches amber by
   about 1.8 m. A fuel-tank shadow cuts 90 % over 17–50° below the flame, leaving a dark disc
   about 1 m across under a flame that hangs about 0.66 m above the feet. Up-facing ground
   2.5–4.5 m out takes 40 % of the diffuse with 0.25 wrap, so the pool reads as a ring ahead of
   the explorer. The bounce is partly tank-shaded. `minDist` lets the explorer measure its own
   lantern from 3 m.
3. Surfaces sample both volumes at `position + normal * 0.5` (the open voxel in front of the
   face), so trilinear filtering yields soft light and natural corner darkening.
4. Atmosphere: four zone presets (`ATMOSPHERES` in `lighting.ts`: camp warm umber, tunnel
   neutral grey, Hollow blue-black with haze pooling low from y = 38, rift violet pooling low),
   blended per frame by `LightingRig.updateAtmosphere` from the distance to the camp box, the
   depth and the openness averaged over a 9×5×9 m box (75 reads, no allocation), eased with a
   0.7 s time constant and snapped on jumps over 6 m (respawn, teleport). The GLSL
   `atmosphere()` integrates a distance haze plus the low pool analytically along the view ray;
   fog colour lifts from the pool colour with height; the light volume at the fragment
   scatters into the haze with a soft cap (lamps warm the air); emission is absorbed by the
   haze (≈85–90 % in camp and tunnel, 60 % in the Hollow and rift) so distant glows do not
   float as specks, while a clearer near haze and a darker thin veil let nearer forms stand out
   against deeper, brighter haze. Each zone carries ambient and a cool hemispheric open-space
   fill (floors get it fully, walls 40 %, overhangs none), a lantern bounce amount and the
   scene exposure handed to post (camp 1.8, tunnel 1.36, Hollow 2.25, rift 2.1; the player's
   brightness multiplies it). The Hollow fill is #8a9ab5 at 0.95. The camp has cool charcoal
   air (fog #1b1a1c) and a cool base ambient. Warm and cool light own faces:
   `ambientFrom(ls, n, facing, ao, lantern)` cuts the cool open fill by up to 75 % by the ratio
   of warm light (lamps plus lantern) to the fill (0.6×–1.8×). A face reads either amber or
   blue, and the lavender band where they meet stays narrow. The terrain uses the lantern-aware
   overload. Structures still use the 4-argument form, which includes the lamp-light part
   only. Placed light gets a direction (`LAMP_DIR`): one extra light-volume
   tap one voxel further out along the normal gives the gradient of placed light and of open
   space, so faces turned away from a lamp, and recesses, fall to the cool fill (Battery
   compiles it out). Albedos are real reflectances (`materials/palette.ts`), so darkness comes
   from light, not paint.
5. Post (`render/PostFX.ts`): HalfFloat HDR target (MSAA on High, multisampled depth is not
   resolved), 4-level dual-filter bloom extracted on luminance (threshold 1.2, strength 0.4),
   a hue-preserving tone map (the filmic curve drives the brightest channel, mixed 50 % with
   the per-channel curve in the darks; ACES-like toe, not lifted), a hue-keeping contrast
   S-curve (pivot 0.1, power 1.3) and a chroma-aware split grade (neutral darks lerp to a
   blue-black of the same luminance, weighted by 1 − smoothstep(0.15, 0.45, saturation), so
   amber, cyan and violet darks keep their hue; amber highlights), an elliptical vignette
   weighted to the top so the touch-control corners stay clean, dithering, player brightness
   (exposure ×0.7–1.5). If the device cannot render to float targets (no
   `EXT_color_buffer_(half_)float`), 8-bit targets are used and the scene is encoded as
   √(x/(1+x)) (`SCENE_ENCODE`, decoded by the post passes) so values above 1 and fine darks
   survive; `?ldr=1` forces this path.
6. Halos: additive camera-facing quads on placed lights (one draw call). Quads rather than
   point sprites, because GPUs drop a whole point once its centre leaves the screen.

## First-person visual pass (finished game, 2026-10)

The game is played in first person (eye 1.62 m, lantern in the left hand, pick in the right), so
every surface is seen from 0.5 m to 15 m. What changed in the renderer for that view:

- **HD stone** (`render/detail.ts`): six detail layers (rock facets, worn floor, earth, dressed
  stone, timber, crystal) at 512² over 2 m (256 texels/m), painted once on the GPU at startup into
  one mipmapped array (tangent normal xy, height, tone; ~5 MB with mips, no read-back). The terrain
  and structure shaders sample them in world space with the material's own projection (warped
  biplanar on natural rock, per face on cut stone, dominant axis on structures), bend the shading
  normal by them and darken their creases. Facets are bevelled plates whose borders fade in places
  (one stone, weathered planes), so walls read as chunky cut rock, not as crazed paving. The 16 t/m
  material layers keep the colour and identity; their sharp-bilinear sampling eases into plain
  bilinear once a texel spans more than ~3 px, so nothing shows a texel stair-step at arm's length.
  Every material has a detail layer and a roughness (`detailOf`), unit-tested.
- **Specular**: one GGX lobe from the lantern (`lanternSpec`, the mobile Cook-Torrance
  approximation, Schlick Fresnel, roughness widened by the normal's screen derivative so it never
  sparkles) on terrain, structures and props; damp stone is glossier, ore metal (copper, iron,
  by the vein's saturation) reflects its own colour. Copper nuggets are re-sharpened from the vein
  layer's bilinear mask (crisp outlines at any magnification), seated with a dark rim and bulged
  along the mask's world-space gradient. Natural rock's 16 t/m colour comes from a softer mip at
  arm's length (its painted pixel features would otherwise read as blurred pixel art).
- **The lantern in the hand**: the light sits where the drawn lantern hangs (FP's
  `Viewmodel.lightWorld`); falloff K 16 (1 m 0.86, 3 m 0.4, 6 m 0.12 of the gain), so the pool reads
  6-8 m across and the far dark keeps its depth (gain 11.5; floors take more wrap than walls); pale gold at the core, amber by 3 m, deep
  amber at the rim (`uLanternColor` #ffb878); the floor right ahead takes 30 % less so it stays
  golden. Polish round: the near field rolls off (0.42x at 0.2 m, 0.52x at 1 m, 0.78x at 2 m, 1x
  from 3.4 m), so the light on a face is about level from the hand to 3 m, and `nearShoulder`
  eases the flame-lit colour of terrain, structures and props under a ceiling (knee 0.24, ceiling
  0.46 linear, hue kept), so lit stone peaks at about 0.75 display at 1 m (`tools/vis-near.mjs`
  measures it) instead of clipping to cream; the tank shades only the floor below the flame, so a
  2 m tunnel's roof stays lit. Inside the pool (`gLanternOwn`: in sight of the flame, within ~3.3 m
  and fading by 7.5 m, turned to it) the lantern owns the face: cool placed light gives way by up
  to 80 %, the cool fill by 85 % and the zone's constant ambient by 70 %, so the floor ahead reads golden even under the rift's violet or
  the Glowroot's green; structures take the same ownership.
- **Exposure 1.0, the lights carry the brightness**: each zone preset has `exposure: 1.0` (x 1.05 at
  the player's default brightness) and a `lightGain` (camp 1.8, tunnel 1.36, Hollow 2.25, rift 2.09,
  Glowroot and Ember Deep 1.98) on its ambient, open fill, haze colours, placed lights
  (`uEmitGain` = 3.6 x gain) and emission (`uAtmos.w`: terrain, props, halos, spores, beams, fall).
- **Clear air**: the haze starts 12 m out and is fully in by 18 m (`FOG_START`); densities were
  raised so the far dark still fades into each zone's hued haze.
- **Deep zones' own air**: `LightingRig.setZoneAnchors` (from the `glowroot` and `emberDeep`
  landmarks, 20 m): moss-green air over the Glowroot, smoky red over the Ember Deep.
- **Post**: Khronos PBR Neutral tone map (hue and saturation kept; its highlight desaturation halved), the Lantern Voxel grade (cool
  teal lift of the darks, warm gain, saturation 1.06), a portrait vignette with a darker crown,
  triangular dither, then **FXAA** (Balanced; High has MSAA, Battery neither). Feedback tints
  (damage, a rune waking) are drawn at the screen edge only, never as a full-screen flash.
- **Beams** (`game/effects/LightBeams.ts`): the only volumetric light, three soft additive cones in
  one draw call (the rift's violet light rising past the monolith, the Spindle's uplight, the light
  on the shrine's tablet), dust drifting slowly through them, faded near the lens and into the haze.
- **Calm FX**: a burst throws at most 9 chunks (`CRUMBLE_MAX`), dust and glints are capped per call
  (`FX_MAX`); the lumen moths are drawn as glow spores (round breathing motes, no wings). Debris is
  lit from the open air on the lantern's side (a chip in the broken block's stale cell is never
  black) and shrinks away near the lens (gone within 0.6 m). The mining fractures are hairlines
  (~1 cm, at least ~1 px) that darken the stone by at most about half. A glyph band at the feet
  (the Choir's kerb) keeps only a thin, dim core of ink, so the landmark it rings holds the eye.
- **Ambient wonder** (`game/effects/Ambience.ts`, from CONTENT's `layout.content.ambient`): drips
  (a bead gathers under the roof and falls every 3-8 s, a glint of the lantern, GPU-animated, gone
  past 16 m), warm glow caps against the walls (a soft halo each), a halo of heat in every ember
  fissure (`LIGHT_MAGMA`), a faint wide glow round the glowroot lights, and the heat over the Ember
  Deep's hearth (with a low warm beam). Three draw calls; nothing moves but the drips.
- **Draw distance**: chunks and structures stop at the zone's haze (`FOG_CULL`: where distance fog
  reaches 97 %, e.g. ~60 m in passages), props smaller than 2 m at 45 m; measured first-person
  views stay at 31-125 draw calls and 17-134k triangles on Balanced (`tools/perf.mjs`).
- Tools: `tools/fp-shots.mjs` (+ `fp-shots.json`) captures the spaces at 390 x 844 @2 in first
  person; `tools/perf.mjs` now measures first-person portrait views against the budget below;
  `tools/vis-near.mjs` reads back how lantern-lit walls read from 0.8 to 6 m.
- No depth, AO, shaft or shadow pass exists in this renderer (one forward pass, then the post
  chain), so the viewmodel (`userData.viewmodel`, layer 5, no shadow casting) is in none; a future
  auxiliary pass must disable layer 5 on its camera.

## Rendering budgets (target device class: 2022 mid-range Android, e.g. Mali-G68 / Adreno 642L)

| Budget | High | Balanced (default) | Battery |
|---|---|---|---|
| Frame cap | 60 | 60 | 30 |
| Pixel ratio cap × scale | 2.5 × 1.0 | 1.75 × 0.9 | 1.25 × 0.8 |
| Bloom | on | on | off |
| MSAA | 4x | off | off |
| View distance | 110 | 88 | 64 |
| Particle budget | 400 | 220 | 120 |
| Terrain boundary blend (`USE_BLEND`) | on | on | off |
| Placed-light direction (`LAMP_DIR`, +1 fetch) | on | on | off |

Dynamic lights: exactly one (lantern). Static light is a texture lookup. Measured frames:
59–187 draw calls, 21–95k triangles (camp to ledge vista; TEST_REPORT.md).

Frame loop: the cap is enforced for every preset (the remainder carries over, so 90/120 Hz
panels average the cap). Behind the pause and death overlays the game renders at 15 fps.

## Materials

- `terrainMaterial` — the terrain material system (`render/materials/*`, `render/terrainRig.ts`):
  - 29 material layers, 128×128 (sRGB + height or emissive alpha), painted procedurally in the
    zone worker (~0.5–0.9 s cold depending on load) and sampled in **world space** (16 texels/m,
    8 m period, RepeatWrapping) with **sharp-bilinear** filtering: texel-snapped bilinear (mag
    Linear, min LinearMipmapLinear, 2× anisotropy), so texel edges stay crisp about 1 px wide at
    reading distance without the nearest-filter camouflage grid; rock edges soften only once a
    texel spans more than ~6 px, while cut stone, cracks and joints stay crisp; a fine ALU grain
    (no fetch) fades in near the lens. Natural rock (GEOLOGY) is sampled from the **sculpted**
    position, not the voxel lattice: top layers from above, side layers from the two wall planes
    blended by the normal (both with v = −y, so beds are level contours on any slope), ceilings
    from below; the top or side layer is chosen per fragment from the smooth normal (~38°, moved
    by world noise, the taller layer claims a narrow band). Masonry keeps its course mapping on
    the face plane. Textures never restart at a voxel edge. Every ramp lives in
    `materials/palette.ts`; painters build a value field (`rock.ts`: `rockField`, `floorField`;
    `paint.ts`: `engrave`, `chip`, `resolve`) and quantize it through a ramp. Each layer's random stream is
    keyed by its name, and the shared host rock and masonry wall are painted once per pass, so
    ore and damp stone sit on the same rock as their neighbours and crumbling masonry is the
    same wall loosening.
  - Masonry is laid in world space from **course libraries** (`materials/courses.ts`): each
    masonry layer (wall, cap stones, floor slabs, crumbling, and the megalithic `masonryB` /
    `crumblingB`) is a set of one-course strips. The shader splits every 2 m of wall height into
    one 2 m course, two 1 m courses, or 1.5 + 0.5 m (thin courses never stack), gives each course
    its own offset and cuts it into 4 m pieces that pick strip, half and mirroring by hash, so no
    stretch of wall repeats. A ~24 × 16 m region hash picks the vocabulary (coursed ashlar or
    megalithic, chance chosen per 4 m piece so region edges follow joints); the region plane is
    taken from the solid cell, not the interpolated position. The masonry fetch uses
    `textureGrad` with the continuous projection's gradients (no mip jump at joints).
  - Natural rock's projection is bent by a slow world-space warp that reuses the 190 m macro
    noise fetch (8 m autocorrelation on a lab wall 0.113 → 0.011, no extra fetch).
  - Cracks are painted as tapered grooves (`paint.ts` `groove`: 1–2.5 texels, lit lip and shaded
    side, core at 65 % of the stone tone) that follow the strata; the seam test skips the course
    libraries, which are never tiled (their piece rule is tested instead).
  - Boundaries: a face with a same-family neighbour of another material (from `aNb`) compares
    the two materials' heights at the texel; the taller one claims the texel up to ~0.6 m from
    the edge, with a world-space wobble whose sign depends on which side the neighbour is, so
    both faces draw the same curve. Faces without partners do no extra work.
  - Sculpting and normals come from the mesher (see Meshing): the vertex shader only adds the
    baked offset and decodes the octahedral normal; it does no texture fetch.
  - Shading: the smooth mesher normal (natural rock) or the face normal (masonry, crystal,
    timber), smooth hemisphere shade, macro albedo variation from world noise (≈1.2 m and 6 m),
    crystal faces not lit by their own emission.
  - Inscriptions: glyph stones sample a 'script' material layer (8 procedurally carved lines: a
    headline, glyphs 0.3–0.55 m wide from pierced rings, vees, zigzags, hooks and diamonds, word
    gaps, a baseline groove) laid in world space along the course, so a band reads as one line
    of text; eroded by world-space noise, dim until the lantern comes near.
  - Mining feedback is drawn here (`uTarget`, `uTargetHit`): a soft warm light centred on the ray
    hit and world-space hairline fractures with a lit lip that grow with damage (the stone's own
    joints open first), red when too hard; no cube rim and no crack-tile fetch.
  - Debug defines `NO_DISP`, `NO_MACRO`, `NO_DERIV`, `USE_BLEND` (viewer URL flags) isolate the
    cost of each feature.
- `textures.ts` keeps the 16×16 tile atlas for icons and drops (and the crack stages used where no
  terrain rig exists).
- `entityMaterial` — vertex-colored boxes/facets built with `VoxBuilder`
  (`render/voxModel.ts`): position, normal, sRGB color (Uint8), `aEmissive` (Uint8).
  Instancing supported. Uniforms: `uTint`, `uEmissiveScale`, `uEmissiveColor`, `uFlash`,
  `uFade` (constant blend alpha for the explorer's near-camera fade, drawn after a depth
  pre-pass), `uRim` (the explorer only: coat darkened 28 %, its own lantern measured from 3 m,
  a 0.15 warm rim only on silhouette edges facing away from the flame, cool world light half
  desaturated on it).
- No shader in the opaque pass can `discard` in normal play: only the debug section clip
  (`DEBUG_CLIP`) does, as a compile-time define, so tile-based mobile GPUs keep early depth
  rejection / hidden-surface removal.

## Camera (first person, `game/CameraRig.ts`, `game/fp/*`)

- The eye is 1.62 m above the feet (`fp/constants.ts`). The lens is 78° tall on an upright phone
  and 90° wide on wide screens (`fpVerticalFov`); the near plane is 0.05 m.
- A clearance guard (`clearOfRock`, sphere against voxel boxes) keeps the eye 0.42 m from whole
  rock, moving it at most 0.32 m; stair-flight cells do not count. It applies deeper pushes at
  once and eases back out. Unit tests: a 1 x 2 tunnel brushed and turned in, and a fuzz over the
  real zone standing and at a Grip Boots jump.
- `yaw` / `pitch` are the look; the lens eases to them (26/s, ~40 ms). Pitch is held within ±75°,
  no roll, no head bob. A landing dips the view (`addTrauma`); mining never shakes it.
- The body faces the view (`player.yaw = cameraRig.yaw + π`). The explorer model is never
  constructed in play (the Visual Lab keeps `ExplorerModel`).

**Viewmodel (`game/fp/Viewmodel.ts`, `viewmodelParts.ts`).** The pickaxe (lower right) and the
lantern (lower left; mirrored left-handed), each in a gloved hand with a sleeve, built from
bevelled primitives by tier: four pick heads (rusty, copper, iron, glimmer) and three lanterns
(iron, copper with a cage, attuned brass with a rune ring). The meshes sit in the world scene at
the camera, but every vertex goes through the viewmodel's own 60° projection into the nearest
1.5 % of the depth range, so the tools never clip into a wall and pass through the same post
chain. They carry `userData.viewmodel` and layer 5, cast no shadow, and are lit in display terms:
the flame as the key light, the light volume at the eye as the ambient. The pick swings at each
strike (`swingAngle`): lift, an accelerating strike that lands on the frame of the hit
(MiningController's `contact` = 0.55 of the swing), a small rebound; the arc aims at the struck
point. The lantern hangs on a stiff damped pendulum driven by sideways walking and turning, still
at rest; a raise lifts it (and its light) for 1.4 s. The world's lantern light hangs at
`LANTERN_LIGHT_CAM` from the eye, kept off rock and on the eye's side of any wall.

## Touch input and phone screen format

- `ui/TouchControls.ts` writes the same `InputState` as the desktop input, first person:
  - a tap on the world is `input.tapPressed`/`tapX`/`tapY` (NDC) for `game/TapController`;
  - a drag anywhere looks;
  - a still hold (230 ms, 14 px slop) mines at the finger and locks that block. After a break
    the held finger moves on to the next block of the same kind near it
    (`MiningController.sameKindNear`). The hold decision waits one animation frame, so a move
    already queued behind a busy frame still makes it a drag.
  - The optional joystick lives in the lower part of the outer third (`touchSide`). It is drawn
    only where the thumb lands, with radius `joystickRadiusFor(w, h)` (54–72 px). A quick tap
    there is still a world tap.
  - The Use chip sits bottom centre. There are no Mine or Jump buttons: the auto-step takes
    1-block ledges. The bag and the menu are the HUD's top-bar plates.
- `game/TapController.ts` runs at the start of `Game.updatePlaying`. It casts a tap with
  `MiningController.pick()` and does one of these:
  - locks a target in reach (≤ 3.5 m from the eye), which is mined until it is gone or too hard;
  - plans a path (`findPath`, a BFS over standable cells) to ground, to a block out of reach
    (then mines it) or to an object (then uses it);
  - when nothing can be done, nudges: the view turns 30 % toward the tap and the lantern is
    raised, so no tap does nothing.

  While a tapped walk runs and the look is still, `Game.followWalk` turns the view along the
  path (Camera follow setting). On arrival, a locked block off to the side is turned toward.
- First person shows only what the dot (or the finger) is on: touch aim assist is off
  (`MiningController.assist`).
- `ui/hud/Hud.ts` + `hud/fp.css`. The top bar holds depth (Lintel numerals), the lantern's oil
  with the turn-back tick, the pack count (a button: the bag) and ≡ (pause). Under it are the
  compass chip(s) and the objective line, always on. Hearts show only when hurt or cold. The
  centre dot brightens over a target in reach or something usable, turns red on rock too hard,
  and a thin ring fills as the block cracks. Nothing covers the centre: the hints and the Use
  chip sit at the bottom between the tools, and pickups rise on the left above the lantern.
- `ui/haptics.ts` maps bus events to short `navigator.vibrate` patterns, rate-limited per kind.
  It is gated on the Vibration setting, the last input device being touch, and play mode.
- `ui/screenFormat.ts`: `enterGameScreen()` runs synchronously in the Start / Continue tap
  (fullscreen needs a user gesture). It is skipped in the Android shell, on fine or hovering
  pointers, and when `navigator.webdriver` is set.
- `vite.config.ts` → `webApp()` emits the manifest and icons at build time, and serves them from
  memory in dev.

## World features (final pass W2)

**Feature pass** (`world/gen/features/{index,places,living,types}.ts`)
- `buildFeatures(ctx)` runs in generateWorld after the key lights and before the bedrock re-assert.
- It has its own Rng (`seed ^ 0xfea70001`) and Noise (`seed ^ 0xfea7`). Prop ids are `f_<place>_<n>`.
- It writes voxels only inside `layout.features.boxes`. `generateWorld(seed, {features:false})` leaves it out, and the containment test diffs the two.
- It returns a FeatureLayout:
  - boxes, pois (with mustReach), links (hoist, riftRope: top, bottom, path, speeds, lock);
  - runeDoors (cells, lintel, wake, radius, hold, minLanternTier);
  - mothAnchors, living (cells, host, table), blooms, areas, sockets.fossil, eventSites.
- `reachableCells(..., links)` and `ReachSet.addEdge` take the links.

**Runtime** (`game/WorldFeatures.ts`, created in Game.boot)
- `attach(removedProps)`, called before progression.attachWorld:
  - rebuilds the door states from the world voxels;
  - places the epoch's bloom;
  - sets the moth anchors;
  - places the hoist cage;
  - passes the ride edges (`rideEdges(links, hoistReleased, RIDES.stepsPerSecond)`) to `Progression.setRides`, which adds them to HomeField, the cache field and ReachSet.
- The hoist is released when the journal has 'hoist', so no new save field.
- Rides (`ropeRide.ts`):
  - constant-acceleration easing over 0.6 m;
  - Game.updatePlaying replaces PlayerController.update with `features.updateRide(dt)` while riding;
  - a save mid-ride stores the end stand;
  - a black-out, respawn or the menu cancels the ride.
- Rune doors (`runeDoor.ts`):
  - `wakeStep` holds 1.2 s, decays at 2x and checks the tier;
  - the door is open when its cells are air, so world edits persist it;
  - rows sink top to bottom every 0.3 s.
- Interactions go through PropSpec.interact 'feature' plus `feature {kind, id, end}`: note, relic (grants `relicItems[id]` only if it is in ITEMS), monolith, rope, hoist.
- Hooks for W3:
  - `stoneAwake()`;
  - the `world:monolith {first}` event;
  - `sites(): LiveSite[]` (living and bloom sites with area, epoch, ore, present);
  - the `relicItems` map.
- Events: world:ride, world:runeWake, world:runeOpen, world:hoistReleased, world:note, world:monolith, world:regrow, world:bloom, moths:startled.

**Moths** (`game/moths.ts`, `game/effects/LumenMoths.ts`)
- MothFlock keeps typed arrays: roost (a breathing circle), drawn, scatter and spiral states.
- A step never moves a moth into rock. Moths at secret anchors with rank < 3 are tappers and are never drawn.
- LumenMoths is one InstancedBufferGeometry sharing the flock's arrays, with additive procedural wings, a near fade and a haze fade.

**Breath** (`living.ts`, `config/livingRock.ts`)
- `rollLiving(site, seed, epoch)` uses a golden-ratio sliding window over stable per-cell hash keys, so counts are exact and consecutive epochs never overlap.
- `applyLiving` restores only generated-solid cells and skips cells within 1.5 m of drops or the cache.
- `bloomSiteFor` never repeats a site twice in a row; epoch 0 is chasmEast.
- `WorldFeatures.breathe(epoch)` runs on camp entry:
  - light is rebuilt in ±4 boxes per 8 m bin of regrown holes, and crystal swaps go through onBlockChanged;
  - the bloom (prop `bloom_e<epoch>` with a LIGHT_CYAN emitter) is placed by `growBloom()` one frame later.

**Debug and tools**
- `__DD__.features {state, ride, release, openDoor, wake, setEpoch, sites, layout}`; `report().features` gives mothMs, regrowMs, bloomMs.
- `tools/poi-density.ts` measures sight gaps on 7 legs and the empty-floor share.

**Costs**
- Feature phase 6.4–14.7 ms; light computeAll +1.3 to +2.1 %.
- Draw calls +2 to +10 per tour shot.
- Moths about 0.004 ms per frame (browser).
- First breath 15–18 ms plus 10–11 ms (next frame) under SwiftShader.

## Brand identity (final pass W2)

- **src/ui/brand/:**
  - `tokens.ts`: colour tokens, WCAG contrast and the cut and type scales; ui.css mirrors them as --slate-950… on .dd-ui.
  - `strokeFont.ts`: the Lintel face. 4×7 grid (M/W 5); lattice polylines become a rectangle per segment and an octagon per node, wound clockwise; nonzero union.
  - `lintelFont.ts`: builds a TrueType (glyf, loca, cmap format 4, hmtx, head, hhea, maxp, OS/2 v4, name, post, with checksums) from those polygons and registers it with FontFace('Lintel'). Lower case maps to the caps; digits are tabular. UI.ts installs it.
  - `wordmark.ts`: SVG lockup strings; `logo.ts` puts both lockups in the DOM (CSS picks the line or the stack by orientation).
  - `emblem.mjs`: plain ESM geometry for the lantern rune and the emblem, plus emblemSvg and bootMarkSvg. It is used by wordmark.ts, by vite.config.ts (the %DD_BOOT_MARK% injection and favicon.svg) and by android/make-icon.mjs, which now rasterizes polygons with a 4×4 supersampled scanline fill instead of a 24-cell pixel MARK.
  - `motion.ts`: duration and easing tokens.
- **ui.css:** a `:where(...)` plate rule. The octagon comes from a clip-path on --cut; the rim from four corner gradients plus the border; the fill from --fill/--face. Focus is an evenodd octagon ring on ::after.
- **UI.ts:**
  - The exit layer (.dd-screens-exit, inert, aria-hidden, z-index under the live screens, after them in the DOM) holds a leaving screen for 140 ms.
  - `veil(on, ms)`.
  - The boot mark (#dd-boot, z-index 1 under #ui, which is z-index 2) is removed two frames after the first screen, which enters without its fade.
- **sprites.ts:** itemRaster(id, size) is pure and maps by id (SPECIMENS, RUNE_MARKS carved into the rune stone, shard, tablet, pebble fallback).
- **ui-check.mjs:** mid and short viewports, a 48 px target audit, layout problems in the exit code, boot and discovery checks.

## Loop core (final pass W1)

- game/Progression.ts is the seam later waves extend. Game delegates camp entry and exit, black-out (onBlackout), abandon (onAbandon), camp-prop interaction, the HUD fields (hud(out)), and save (toSave/fromSave). It owns Records (gameplay/Records.ts), Cold (gameplay/Cold.ts), the cache (gameplay/Expedition.ts makeCache/replaceCache/recoverCache, placement in gameplay/CacheSpot.ts) and the Next line (gameplay/NextStep.ts).
- world/analysis/homeField.ts: HomeField is a backwards BFS from the camp's standable cells over the reachability moves (walk, step up 1, drop up to 3) into one reused Int32Array (13 MB), resetting only the cells it touched. Extra edges cost whole steps (rides). cellNear() finds the explorer's cell; descend() and downhill() follow the steepest descent. walkSeconds = steps x 1.35 / 4.6. ReachSet is the same idea forward from the spawn (Uint8Array) and equals reachableCells. A second HomeField toward the cache is allocated while a cache exists. Recomputes run in requestIdleCallback or setTimeout, not inside a frame: about 2-3 ms warm on the container, 10-15 ms cold.
- Cache placement: the last cell the explorer stood on, grounded at least 0.3 s, that is on the ReachSet and has a home distance; otherwise the nearest such cell within 8; otherwise the spawn.
- game/FrameGuard.ts wraps step(). After 3 failures in a row it stops the loop, sets mode 'crashed', calls keepScreenOn(false), suspends audio and sends window CustomEvent 'dd:crash'. No save from the first error until a good frame. Game.crash(err) is public (src/main.ts calls it).
- game/MenuCamera.ts: menuPose(t) is the old pose; the lens is lockedVerticalFov(aspect, 94); MENU_FPS 30 in Game.frame.
- Save pipeline: parse, check version, migrate (MIGRATIONS[1] = migrateV1), normalizeSave (drop unknown ids and count them; key items found in the pack go to the journal; overflow to storage; progression defaults; unknown progression fields kept), validateSaveData, then in Game shiftWorldIfNeeded (genVersion mismatch: drop edits and removed props, wake at spawn, carry the cache to storage). WORLD.genVersion is pinned by world/analysis/fingerprint.ts (FNV-1a over the volume and prop ids) in tests/unit/genVersion.test.ts.
- Events added: expedition:started/ended, cache:created/recovered, lantern:turnBack, player:cold, record:depth; item:picked gains sx/sy; player:damaged cause 'cold'. DiscoveryNotice gains index/total/major from the gameplay/discoveries.ts table.
- __DD__.loop: recompute, timings, homeSteps, reachable, cache, report, next. __DD__.report().loop gives field timings.

## Gameplay architecture

- `EventBus<GameEvents>` (`core/events.ts`) decouples systems. Gameplay emits events;
  audio, UI and effects listen. A throwing listener is logged and never breaks gameplay.
- `InputState` (`input/types.ts`) is the only input the simulation reads. Touch controls and
  desktop input both write it. Edges (`jumpPressed`, `pausePressed`, …) are cleared after every
  step. `pausePressed` toggles pause; `pauseRequested` only pauses (used when the pointer
  capture is lost unexpectedly, e.g. the browser taking Esc), so it can never resume the game.
- `HudState` / `InventoryView` / `UiActions` (`ui/types.ts`): the UI reads snapshots and
  requests actions. It never mutates game state directly.
- Pure gameplay modules (`gameplay/*`) have no Three.js or DOM dependency and are unit
  tested in Node.

## Persistence

- `SaveData` (`save/types.ts`), JSON, versioned, migrations keyed by version.
- World edits are stored as a delta against the deterministic generator output.
- Two-slot writes with checksums: write the inactive slot, then flip the pointer. On load,
  a corrupt/partial slot falls back to the other one and the player is told.
- Autosave on camp entry, crafting, discoveries, every 45 s, and on `visibilitychange`/
  `pagehide` (Android backgrounding). A death is saved at once as the respawn it leads to.
- The delta is a word-compare scan of the 3.3 MB volume (~2 ms); Continue restores the
  generated world, applies the delta and rebuilds light and meshes once.
- Unreadable saves (newer version, both slots corrupt) are never wiped silently: Continue
  explains, New Game asks before replacing.

## Release shell (src/main.ts, final pass W1)
`main.ts` boots the game and wraps it, using only Game's public API:
- **Crash panel** (`.dd-crash`, styles.css): shown on window `dd:crash` (from Game's frame guard), and after boot on window `error` (only events with an error object) and `unhandledrejection` (DOMExceptions are platform refusals and are ignored); those call `game.crash(err)` first. Boot failures (`fatal()`) use the same panel. The details are built on demand: version, versionCode, build, mode, time, user agent, the GL renderer (read once at boot, because getParameter is a synchronous GPU round trip) and the first stack. They are copied with the Clipboard API, falling back to a select-and-copy textarea. `deepDownBack` returns false while the panel is up.
- **Android bridge**: `setBackHandled(bool)` is pushed on change and polled every 250 ms (false only at mode menu and screen menu, or on the panel). `window.deepDownLifecycle('pause'|'resume')`: pause = saveNow('background') unless a save happened < 1 s ago, then pause and audio suspend; resume = audio resume.
- **Context loss**: on webglcontextlost the game pauses and shows `.dd-gl-notice`; restore hides it; after 10 s of visible time without a restore the crash panel shows.
- **QualityGovernor** (`src/render/QualityGovernor.ts`, pure): fed requestAnimationFrame intervals while mode is 'playing' and the page is visible. 5 s warm-up, 8 s window, median by in-place quickselect over a Float32Array ring (no allocations); limits 22 ms (Balanced/High → Battery) and 40 ms (Battery → renderScale 0.65); gaps > 2 s ignored. The first-launch preset (Battery if deviceMemory ≤ 3 or hardwareConcurrency ≤ 4) is written through SaveSystem before Game is constructed. State is in localStorage `deepdown.autoquality` {auto, toasted}. A settings change it did not make → auto off for good. Off under navigator.webdriver unless `?autoq=1`.
- `window.__DD_RELEASE__`: test/support surface (version, crashPanel(), crashDetails(), backHandled(), governor()).

## Versioning
`tools/version.mjs`: versionName = package.json version, versionCode = (MAJOR×10000+MINOR×100+PATCH)×100+BUILD (DD_BUILD 0–99); prereleases refused. vite.config.ts defines `__DD_VERSION__`, `__DD_BUILD__` and `__DD_VERSION_CODE__` (read by src/version.ts) and writes dist/version.json, which build-apk.sh and Gradle compare before packaging.

## Build outputs (vite.config.ts)
Plugins: htmlStrings, webApp (manifest + icons from make-icon.mjs), and releaseFiles (licenses.txt = three.js LICENSE + Vite's MIT notice; privacy.html = self-contained, built from en/release.ts; version.json). `DD_RELEASE=1` builds index.html only.

## Android shell
One MainActivity source, two builds. build-apk.sh: API 23 toolchain, targetSdk 36, min 24, debug key, smoke test. Gradle (android/app/build.gradle.kts): compile/target 36, the Play AAB, built in CI. Every API > 23 call goes through reflection, or a Proxy for OnBackInvokedCallback; onRenderProcessGone compiles against a compile-only stub (android/stubs). The Gradle-only `src/modern` adds the manifest overlay (appCategory game, enableOnBackInvokedCallback, density) and the values-v31 splash theme. The cutout insets reach CSS as `--dd-inset-*`, and styles.css's `--safe-*` take max(env(), injected). Icons and the splash logo are generated by make-icon.mjs (the Gradle task generateIcons<Variant>); the web assets come from a stale-checked copy of ../dist (copyWeb<Variant>).

## Testing strategy

- Unit (Vitest, Node): voxel storage, mesher geometry and winding, raycast, light
  correctness (incl. incremental == full property test), world invariants (determinism,
  bedrock shell, reachability of every critical location, sufficient materials), gameplay
  rules, save round-trip and corruption recovery, audio logic on a fake Web Audio context
  (offline rendering of every sound runs in Chromium: `tools/audio-check.mjs`).
- E2E (Playwright, real WebGL, production build), in `tests/e2e/`, type-checked with one
  shared `window.__DD__` type (`dd.ts`). Input is real (touch through CDP, Playwright mouse and
  keyboard); travel between places uses the debug teleport.
  `slice.spec.ts` (915×412 touch) — the 9-step success path plus autosave reasons and every HUD
  element. `world.spec.ts` (touch) — all six discoveries, fall damage, lantern burn-down, death,
  saved death, respawn, backgrounding. `desktop.spec.ts` (1280×720) — keyboard and mouse.
- UI (`tools/ui-check.mjs`): 60 checks over the sandbox and the real game (touch zones,
  hold/tap mining, multi-touch, buttons, left-handed, keyboard focus, no DOM churn).
- Packaging (`tools/apk-sim.mjs`): the files inside the APK, served the way the shell
  serves them, boot and play.
- Visual: `tools/capture.mjs` renders deterministic camera presets and `tools/play.mjs` runs
  scripted play; screenshots are inspected and iterated (see TEST_REPORT.md).
- Performance: `tools/perf.mjs` measures the production build (CPU frame time, draw calls,
  triangles, mining, saves, memory).

## Debug API

`window.__DD__` (always present, read-mostly): `ready`, `state()`, `report()` (perf stats),
and test helpers (`teleport`, `aimAt` (visible face through any screen point), `prepareMining`,
`give`, `setBlock`, `standableNear`, `events`, `save`, `setQuality`, `debugLight`, …) used by
the e2e tests and tools. Edits change voxels at once and their meshes arrive from the mesh
workers a frame later: `meshIdle()` waits for pending meshes, `meshCheck()` also compares every
chunk's GPU data with a fresh main-thread mesh.
