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

Generation and the first full light + openness pass run in a module Web Worker
(`world/gen/zoneWorker.ts`, loaded by `zoneLoader.ts`); the block and light buffers are
transferred back, not copied. Measured on the dev container: ~330 ms generation + ~280 ms
light, off the main thread, so the loading bar keeps moving. If module workers are
unavailable the same code runs on the main thread. Meshing then runs on the main thread,
time-sliced (~125 ms total).

### Meshing (`render/mesher.ts`)

Culled faces with per-vertex ambient occlusion and anisotropy-safe quad splitting.
Vertex = 7 bytes: `Uint8 x3` local position + `Uint8 x4` (face, AO, texture layer, uv bits),
in two non-interleaved attributes.
A 16³ chunk meshes in < 2 ms. `ChunkRenderer` rebuilds dirty chunks nearest-first within a
4 ms/frame budget (always at least one, so an edit is never left invisible) and hides chunks
beyond the view distance.

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
4. Fog: dark blue exponential-squared haze; emissive surfaces punch through partially.
5. Post (`render/PostFX.ts`): HalfFloat HDR target (MSAA on High, multisampled depth is not
   resolved), 4-level dual-filter bloom, ACES fitted tone map, cool-shadow/warm-highlight
   split tone, vignette, dithering, player brightness (exposure ×0.7–1.5). If the device
   cannot render to float targets (no `EXT_color_buffer_(half_)float`), 8-bit targets are
   used instead of a black screen.
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

Dynamic lights: exactly one (lantern). Static light is a texture lookup. Measured frames:
59–187 draw calls, 21–95k triangles (camp to ledge vista; TEST_REPORT.md).

Frame loop: the cap is enforced for every preset (the remainder carries over, so 90/120 Hz
panels average the cap). Behind the pause and death overlays the game renders at 15 fps.

## Materials

- `terrainMaterial` — texture array (16×16 pixel-art tiles, nearest magnification,
  mipmapped minification), per-face directional shade, AO, per-block tint jitter, emissive
  mask in texture alpha × per-tile glow, fog.
- `entityMaterial` — vertex-colored boxes/facets built with `VoxBuilder`
  (`render/voxModel.ts`): position, normal, sRGB color (Uint8), `aEmissive` (Uint8).
  Instancing supported. Uniforms: `uTint`, `uEmissiveScale`, `uEmissiveColor`, `uFlash`,
  `uFade` (screen-door fade when the camera is too close).
- No shader in the opaque pass can `discard` in normal play: the debug section clip
  (`DEBUG_CLIP`) and the screen-door fade (`USE_FADE`, explorer only) are compile-time
  defines, so tile-based mobile GPUs keep early depth rejection / hidden-surface removal.

## Camera

Third-person over-the-shoulder rig (`game/CameraRig.ts`). The shoulder offset (0.7 m) is cast
sideways first and shortened against walls; when the right side is walled in and the left is
open, the rig swaps shoulders (smoothed, with hysteresis). The boom is a bundle of 9 rays
from the shoulder point: it snaps in at once and eases back out, and a last check pulls the
lens out of rock if a ray grazed a corner. Unit tests sweep fast turns in a tight tunnel and
assert the camera is never inside rock or behind rock. The explorer dithers out when the
boom is shorter than 2 m.

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
