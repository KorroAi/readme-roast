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
unavailable the same code runs on the main thread. Meshing then runs on the main thread,
time-sliced (~125 ms total).

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
  (≈0.26–0.36 s). `ChunkRenderer` rebuilds dirty chunks nearest-first within a 4 ms/frame budget
  (always at least one, so an edit is never left invisible) and hides chunks beyond the view
  distance.

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
   applies a smooth falloff from the flame's exact position, so light moves continuously.
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
   haze (≈90 %) so distant glows do not float as specks. Each zone also carries ambient and
   open-space fill colours, a lantern bounce amount and an exposure handed to post.
5. Post (`render/PostFX.ts`): HalfFloat HDR target (MSAA on High, multisampled depth is not
   resolved), 4-level dual-filter bloom extracted on luminance (threshold 1.2, strength 0.4),
   a hue-preserving tone map (the filmic curve drives the brightest channel, mixed 50 % with
   the per-channel curve in the darks, toe lifted), a light split tone, an elliptical vignette
   weighted to the top so the touch-control corners stay clean, dithering, player brightness
   (exposure ×0.7–1.5). If the device cannot render to float targets (no
   `EXT_color_buffer_(half_)float`), 8-bit targets are used and the scene is encoded as
   √(x/(1+x)) (`SCENE_ENCODE`, decoded by the post passes) so values above 1 and fine darks
   survive; `?ldr=1` forces this path.
6. Halos: additive camera-facing quads on placed lights (one draw call). Quads rather than
   point sprites, because GPUs drop a whole point once its centre leaves the screen.

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

Dynamic lights: exactly one (lantern). Static light is a texture lookup. Measured frames:
59–187 draw calls, 21–95k triangles (camp to ledge vista; TEST_REPORT.md).

Frame loop: the cap is enforced for every preset (the remainder carries over, so 90/120 Hz
panels average the cap). Behind the pause and death overlays the game renders at 15 fps.

## Materials

- `terrainMaterial` — the terrain material system (`render/materials/*`, `render/terrainRig.ts`):
  - 26 seamless 128×128 material layers (sRGB + height or emissive alpha) painted procedurally
    in the zone worker (~0.4–0.5 s) and sampled in **world space** (16 texels/m, 8 m period,
    RepeatWrapping, nearest magnification, mipmapped minification). Projection per face axis is
    upright and unmirrored; textures never restart at a voxel edge. Every ramp lives in
    `materials/palette.ts`; painters build a value field (`rock.ts`: `rockField`, `floorField`;
    `paint.ts`: `engrave`, `chip`, `resolve`) and quantize it through a ramp. Each layer's random stream is
    keyed by its name, and the shared host rock and masonry wall are painted once per pass, so
    ore and damp stone sit on the same rock as their neighbours and crumbling masonry is the
    same wall loosening.
  - Boundaries: a face with a same-family neighbour of another material (from `aNb`) compares
    the two materials' heights at the texel; the taller one claims the texel up to ~0.6 m from
    the edge, with a world-space wobble whose sign depends on which side the neighbour is, so
    both faces draw the same curve. Faces without partners do no extra work.
  - Sculpting and normals come from the mesher (see Meshing): the vertex shader only adds the
    baked offset and decodes the octahedral normal; it does no texture fetch.
  - Shading: the smooth mesher normal (natural rock) or the face normal (masonry, crystal,
    timber), smooth hemisphere shade, macro albedo variation from world noise (≈1.2 m and 6 m),
    crystal faces not lit by their own emission.
  - Runes: glyph blocks get a per-block carved rune decal from the tile atlas (8 runes), eroded by
    world-space noise and brightened as the lantern approaches.
  - Mining cracks and the target rim are drawn here (uniform `uTarget`), on the sculpted face.
  - Debug defines `NO_DISP`, `NO_MACRO`, `NO_DERIV`, `USE_BLEND` (viewer URL flags) isolate the
    cost of each feature.
- `textures.ts` keeps the 16×16 tile atlas for icons, drops, crack stages and rune decals.
- `entityMaterial` — vertex-colored boxes/facets built with `VoxBuilder`
  (`render/voxModel.ts`): position, normal, sRGB color (Uint8), `aEmissive` (Uint8).
  Instancing supported. Uniforms: `uTint`, `uEmissiveScale`, `uEmissiveColor`, `uFlash`,
  `uFade` (screen-door fade when the camera is too close).
- No shader in the opaque pass can `discard` in normal play: the debug section clip
  (`DEBUG_CLIP`) and the screen-door fade (`USE_FADE`, explorer only) are compile-time
  defines, so tile-based mobile GPUs keep early depth rejection / hidden-surface removal.

## Camera

Third-person over-the-shoulder rig (`game/CameraRig.ts`): 1.15 m shoulder, 4.8 m boom, a 67°
lens in landscape (up to 72° in portrait, where the shoulder also shrinks), and the boom tilted
against the lens (0.17 rad pitch, 0.06 rad yaw) with the look target about 0.8 m above the chest,
so the explorer stands in the lower-left third and the route ahead stays visible. Because the
framing is an angle, it shrinks with the boom as rock pulls it in, so tunnels behave as before.
The shoulder offset is cast sideways first and shortened against walls: room shrinks at once and
grows back slowly (no jerks along rough walls); when the right side is walled in and the left is
open, the rig swaps shoulders through a critically damped spring (no overshoot, with
hysteresis); when a post or corner behind the shoulder cuts the boom short, the shoulder slides
in to 0.7 or 0.4 of its width and back out once clear. The boom is a bundle of 9 rays from the
shoulder point: it snaps in at once and eases back out, and a last check pulls the lens out of
rock if a ray grazed a corner. Unit tests sweep fast turns in a tight tunnel, fuzz 400 poses
over the real zone, and assert the camera is never inside or behind rock. When the camera is
genuinely close, the explorer fades with true alpha: each part writes depth first, then draws
its colour with constant blend alpha after the opaque scene, so only its nearest surface shows
and no dither pattern is printed over the world.

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

## Android shell

`android/app/src/main/java/.../MainActivity.java`: one Activity with a WebView. Files are
served from `https://appassets.androidplatform.net/` out of `assets/www`; every other request
is refused (the game is offline). Text zoom is pinned to 100% (the game has its own Large
Text setting), Back goes to `window.deepDownBack()` (close screen / pause / resume; exit at
the main menu; history back on pages without a handler), and a small JS bridge keeps the
screen on only while playing. `build-apk.sh` refuses to package a stale or placeholder web
build.

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
the e2e tests and tools.
