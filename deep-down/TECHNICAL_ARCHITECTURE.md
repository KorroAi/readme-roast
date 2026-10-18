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
               lighting rig, voxModel builder, PostFX, Renderer (quality presets)
  entities/    explorer character, player controller & physics, camera, drops, debris
  gameplay/    inventory, crafting, equipment, lantern, mining rules, objectives, discoveries
  input/       InputState contract + desktop (keyboard/mouse) input
  ui/          DOM UI: menus, HUD, touch controls, inventory, crafting, settings, icons
  audio/       Web Audio synthesis: sfx, ambience, music, reverb
  save/        Settings + SaveData types, versioned two-slot persistence
  lab/         VisualLab entry (visuallab.html)
  debug/       window.__DD__ test/debug API, perf overlay
tests/unit     Vitest (pure logic, world invariants, light correctness)
tests/e2e      Playwright (real WebGL in headless Chromium)
tools/         capture.mjs (screenshots), run-ts.mjs, gen-stats.ts, png.mjs
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
regions + prop specs + marked route + named landmarks. ~380 ms on the dev container.

### Meshing (`render/mesher.ts`)

Culled faces with per-vertex ambient occlusion and anisotropy-safe quad splitting.
Vertex = 8 bytes: `Uint8 x3` local position + `Uint8 x4` (face, AO, texture layer, uv bits).
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
   - Mining a non-emitter can only add light: incremental fill from neighbors.
   - Removing an emitter (or adding a solid) rebuilds a local box of radius `LIGHT_REACH`.
   - Only the changed sub-box is uploaded (`texSubImage3D`).
   - A property test proves incremental updates equal a full recompute.
2. **Lantern** — the only dynamic light. `LanternField` ray-traces line-of-sight from the
   lantern to every voxel within its radius (32³ R8 texture following the player), so light
   never leaks through walls. The shader applies a smooth falloff from the lantern's exact
   position, so light moves continuously.
3. Surfaces sample both volumes at `position + normal * 0.5` (the open voxel in front of the
   face), so trilinear filtering yields soft light and natural corner darkening.
4. Fog: dark blue exponential-squared haze; emissive surfaces punch through partially.
5. Post (`render/PostFX.ts`): HalfFloat HDR target (MSAA on High), 4-level dual-filter bloom,
   ACES fitted tone map, cool-shadow/warm-highlight split tone, vignette, dithering.

## Rendering budgets (target device class: 2022 mid-range Android, e.g. Mali-G68 / Adreno 642L)

| Budget | High | Balanced (default) | Battery |
|---|---|---|---|
| Frame cap | 60 | 60 | 30 |
| Pixel ratio cap × scale | 2.5 × 1.0 | 1.75 × 0.9 | 1.25 × 0.8 |
| Bloom | on | on | off |
| MSAA | 4x | off | off |
| View distance | 110 | 88 | 64 |
| Particle budget | 400 | 220 | 120 |

Dynamic lights: exactly one (lantern). Static light is a texture lookup. Typical frame:
~120 draw calls, ~70k triangles in the Hollow (measured in headless Chromium).

## Materials

- `terrainMaterial` — texture array (16×16 pixel-art tiles, nearest magnification,
  mipmapped minification), per-face directional shade, AO, per-block tint jitter, emissive
  mask in texture alpha × per-tile glow, fog.
- `entityMaterial` — vertex-colored boxes/facets built with `VoxBuilder`
  (`render/voxModel.ts`): position, normal, sRGB color (Uint8), `aEmissive` (Uint8).
  Instancing supported. Uniforms: `uTint`, `uEmissiveScale`, `uEmissiveColor`, `uFlash`,
  `uFade` (screen-door fade when the camera is too close).

## Gameplay architecture

- `EventBus<GameEvents>` (`core/events.ts`) decouples systems. Gameplay emits events;
  audio, UI and effects listen. A throwing listener is logged and never breaks gameplay.
- `InputState` (`input/types.ts`) is the only input the simulation reads. Touch controls and
  desktop input both write it.
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
  `pagehide` (Android backgrounding).

## Testing strategy

- Unit (Vitest, Node): voxel storage, mesher geometry and winding, raycast, light
  correctness (incl. incremental == full property test), world invariants (determinism,
  bedrock shell, reachability of every critical location, sufficient materials), gameplay
  rules, save round-trip and corruption recovery, audio graph rendering (offline).
- E2E (Playwright, real WebGL): boot → menu → new game → move with touch → mine → collect →
  return to camp → craft → verify faster mining → save → reload → resume.
- Visual: `tools/capture.mjs` renders deterministic camera presets; screenshots are
  inspected and iterated (see TEST_REPORT.md).

## Debug API

`window.__DD__` (always present, read-mostly): `ready`, `state()`, `report()` (perf stats),
and test helpers (`teleport`, `look`, `give`, `setBlock`, `mineAt`, …) used by e2e tests.
