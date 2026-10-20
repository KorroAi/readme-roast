# Wave 1: the lead's amendments

Read this before `BUILD.md` §3. Where the two differ, this file wins. `DECISIONS.md` records why.

## 1. The look is "Lantern Voxel", the director's pick (it overrides SPEC §8.2's faceted default)

The director chose spike B. The reference is:
- **The images:** `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/spikes/lantern/final-{arrival,mining,grotto,magma}.png` and `sheet.png`.
- **The code:** `reference/spike-lantern/src/` (outside the compiled tree; read it, port it, never import it):

| File | What it is |
|---|---|
| `grid.ts` | the 0.5 m block grid |
| `mesher.ts` | the bevelled-voxel mesher |
| `painter.ts` | the procedural HD stone textures |
| `shaders.ts` | the world shader with the lantern pool, glints, emission and fog |
| `post.ts` | the grade |
| `volumes.ts` | light shafts, emitters and occluders |
| `props.ts` | crystals, chest, lantern, roots, pebbles |
| `fx.ts` | crumble and motes |
| `scenes.ts` | the four test scenes |

The capture driver is `reference/spike-lantern/tools/spike-capture.mjs`.

What the director liked in it: real chunky 3D stone blocks with soft bevels; a strong warm amber lantern pool against cool blue-green stone; glowing crystals; a chest you want to open; a passage leading on into depth. It reads as DEEP DOWN.

### 1.1 SPEC rules replaced

| SPEC | The faceted rule | The rule for this wave |
|---|---|---|
| §8.1, row "Horrible" | No textures on the world | **HD procedural stone, only where it reads as stone at arm's length.** World-space (biplanar or triplanar) and continuous across neighbouring blocks, so blocks never repeat one tile. Never a visible texel stair-step at DPR 2–3 from 1.0 m. No streaks, no swimming, no visible repetition within 8 m. Valuables are always 3D objects (nuggets, prisms, chests), never painted squares. |
| §8.2 | Lamplit Faceted | **Lantern Voxel, refined.** Bevelled 0.5 m voxel stone (chamfer 3–6 cm), HD procedural textures, the lantern pool, cool hued fill, lifted readable shadows, vertex AO, emissive crystals and ore glints with a value-capped lantern specular, at most one slow light shaft or one mote field per space, height and depth fog. Built things (masonry, timber, machines) keep the bevel language. Storybook's grade (lifted warm mids, coloured fog) is still welcome. |
| §8.5, natural rock | facets | bevelled voxels, the HD world-space stone, strata as real 0.5 m ledges and colour bands, ±6 % value per block, irregular silhouettes (missing corner voxels, ledges), dripstone as tapered prop geometry (never stacks of cubes) |
| §8.5, face blocks | fracture plugs | still fracture plugs, in the voxel language: chamfered, 6–10 variants per rock family, rotated and mirrored, joints that read as cracks. C10 ("not tiles") is the hard test. |
| §8.10, C1 | no texels | **C1′:** a texel is ≤ 1 scene pixel at 1.0 m at DPR 2 on Balanced; the streak detector stays; an autocorrelation check finds no repeat period inside 8 m; every valuable's silhouette has ≥ 6 edges |
| §13.1, U-LOOK | samplers forbidden | terrain programs may sample the stone texture array, the ramps and one noise. Everything else in U-LOOK stands. |
| BUILD §1, item 0.3 | copy the faceted spike | done by the lead: the lantern spike, into `reference/spike-lantern/` |
| BUILD §3.3, C MUST 1 | port the facet builder | **port the lantern spike's surface into `src/render/lantern/`** (mesher bevel, painter, world shader, grade, volumes, props) and wire it into the chunk path (`mesher.ts`, `ChunkRenderer`) or replace that path. Strip the section path from `terrainMaterial.ts`. U-LOOK as amended. |

### 1.2 The spike's known defects: fix all of them in W1

- Grotto stalactites read as blocky columns of pixels: make them tapered prisms or lathe props.
- Magma veins look like lightning and glow too much near the top: make them sparse, wide, low-frequency and dim. Leave this for later if Magma is not in W1.
- The Grotto is almost one blue-teal: add a second accent and a value range.
- The arrival vault is a muddy dark teal: use hued darks at ≥ 0.04 display, with ledges catching the rim.
- The far chamber is misty grey, not luminous: the rim comes through the opening in the next space's accent (SPEC §8.3).
- The lantern brass has no texture: give it bevels and a value-capped specular.

### 1.3 The spike's cost: bring it into budget

| The spike measured | The W1 target |
|---|---|
| a 10.5 s texture paint at load | ≤ 1.5 s on a phone: paint in a worker, at a lower base resolution with the detail in the shader, and cache the result |
| 62k–294k triangles | ≤ 120k per frame on Balanced at any stand: merged faces, far-chunk LOD, frustum and distance culling |
| a lantern cube-shadow pass (25 → 62 draw calls on refresh) | no per-frame shadow on Balanced: occlusion comes from the LightField. High may refresh a lantern shadow only while the camera moves. |

SPEC §11's budgets otherwise stand.

### 1.4 Unchanged

Everything else in SPEC §8 is unchanged: the calm rules, the FX budget, stillness, the HUD (octagon plates, Lintel numerals, no pills), the readability checks C2–C14 and the beauty rubric. The spike's rounded HUD is not adopted.

## 2. Process for this wave (four specialists in parallel in one tree)

- **The purge switch without a red tree.**
  1. D switches `src/main.ts` to `HybridGame`, gets tsc green, then creates the marker file `docs/hybrid/.switched` holding one line: the time and "switched".
  2. Only after the marker exists may anyone delete a 2D or cutaway file, and only once `grep -rn "<module>" src tests` shows no importer outside the files being deleted.
  3. D deletes the old shell immediately after the switch.
  4. If a deletion would break someone else's file, tell the lead in your report; do not edit their file.
- **The feel APK.** When the drift, the face, taps, holds, the Pick card and the first breakthrough into the Root Cellar play end to end after the switch, D writes `docs/hybrid/.feel-ready` (one line). The lead builds and sends the feel APK from it. D's gate APK uses `DD_KEYSTORE=/home/user/readme-roast/deep-down/android/debug.keystore` and `DD_WEB_OUT` in D's build directory.
- **Captures** go to `artifacts/hybrid/w1/<A|B|C|D>/`.
- **The economy.** The curves are frozen (BUILD rule 12). The surviving explorer patches in `scratchpad/econ/*.patch` are evidence of what destabilises the economy (crew line growth against the HP slope; side multipliers; skills). Read them, and apply none of them blindly.
- **Speed and standard.** The director asked for an all-out, fast and demanding effort. Build the MUST items fully, with evidence, before any polish, and keep reports factual.
- **Look at your own results** as the director will: a phone at arm's length, in portrait. Anything ugly, glitchy, cluttered or confusing is a bug.

---

## 3. Varied phases, with real exploration (the director, after day 0: these override SPEC §2.1–§2.3, §4.2 and §3.3)

> "Make the visuals even better. Add varied gameplay phases with real exploration, like my first version, all in first person.
> Go beyond what I expect: a huge improvement in visual detail, and above all serious work on lighting, shadows and professional
> shaders."

The run alternates **phases**, all in first person and all playable with one thumb.

| Phase | What it is | The player's verbs | W1 |
|---|---|---|---|
| **Dig** | the drift face clicker (SPEC §3.5, §5.1, unchanged): the 7-block face, slices, the creep, breach tells | tap or hold the face, buy | yes |
| **Explore** | after a breakthrough, the chamber is a **real cavern you walk through freely**, like the first version, but by tap: multi-level spaces with ledges, stairs, bridges, side passages, alcoves behind cracked walls, Halden ruins, lamps to relight, veins, gems, chests, relics and notes. You explore it at your pace and leave by an exit. | **tap a floor, ledge or stair to walk there** (pathfinding, see below); **tap a tappable to act** (within 3.5 m it acts at once; farther, you walk to it and it acts on arrival, as the first version's tap-to-act did); **drag to look around**; hold to sweep what is in reach | yes |
| **Ride** | the Way Down is a short on-rails sequence: a rope descent, a timber stair, a root chute, or a **mine-cart run** along rails through a cavern system. Ore glints and crystal knots pass by within reach. | tap the glints as they pass (each tap mines one), tap to brake at a side ledge if offered; skippable | one cart run (Copper Lode → Lamp Room) and the rope ladders |
| **Seal** | a mechanism at the biome boundary (the Halden Hatch in W1: chains and a padlock weak point) | tap and hold, strike the weak point when it lights | yes |
| **Camp** | the surface camp at dusk, in first person: the adit, the crew board, the lantern maker | tap to walk between stations, then into the adit | the adit and the board (the menu sheet is fine) |

**Explore controls**

The SPEC §2.2 "Never: … look-drag" rule is lifted for Explore only. Gestures:
- **Tap** (down to up < 300 ms, < 12 px):
  - a walkable surface in view: walk there along a BFS path over the voxel walkability grid (as in the first version's `TapController.findPath`);
  - a tappable: act, or walk to it and then act;
  - far rock, or the dark that is not walkable: the **Lantern Raise** spot.
- **Drag** (> 12 px): look. Yaw is free, pitch is limited to ±55°, there is light damping (≤ 120 ms settle), and never any roll. A drag never acts.
- **Hold still** (≥ 250 ms, ≤ 12 px):
  - on a strike tappable: repeat-strike it;
  - elsewhere: sweep the strike tappables in reach.
- **The objective line:** tap it to walk to the current goal.

How walking moves the camera:
- **Speed:** walking follows the SPEC motion law, at ≤ 2.5 m/s with eased starts and stops. The camera turns toward the walk direction at ≤ 90°/s, blended with the player's look, so a drag during a walk wins.
- **No bob.** Steps up to 0.5 m are climbed smoothly. Ladders and ropes are path links ridden on rails.
- **Arrival:** the camera stops 0.9 m short of a target it will act on.
- **Feedback:** a small amber ring shows the tapped destination for 0.4 s.
- **Testing:** E2E tests drive every Explore gesture with real touches.

**Explore spaces** (B builds them; this replaces the "composed diorama with 1–3 stands"):
- Topsoil caverns are 14–28 m wide, 14–30 m deep and 6–18 m tall, on 2–3 levels joined by stairs, ramps, ledges or ladders.
- Each has ≥ 1 side passage or alcove, ≥ 1 secret (a cracked wall, a hollow floor or a loose brick that breaks to reveal a cache), 2–4 cold lamps, 6–14 strike tappables, 1–2 focus features and 1–2 exits.
- Everything must fit the 64 × 64 m spiral footprint. A Vista may take a whole lap.
- The first version's architecture vocabulary is welcome: column shafts, stair flights on piers, the portal gate, the corbelled shrine, the arched bridge, the crystal seam, dripstone, a lamp at every landmark.
- **The fill contract holds from every walkable point,** not only from stands. `fill-scan` samples 200 walkable points per chamber.
- Stands survive only as the arrival pose and the auto-walk targets of the objective line.
- `tools/fill-scan.ts` and the C3 captures sample walkable points.

**Pacing:**
- Explore is where wonder and discovery live. Dig stays the clicker core.
- Target: 30–90 s per chamber on a first visit, with a secret in about 1 of 2 chambers.
- The crew's leash and the Works are unchanged, so the first light of every chamber is still the player's.

## 4. Professional lighting, shadows and shaders (this overrides SPEC §8.3's "no shadow maps" and §11's lighting row)

**The aim:** lighting that looks like a premium, professionally lit game.
- Dramatic, soft and correct shadows that move as you walk with the lantern.
- Rich bounce light.
- Real volumetric light in the air.
- Physically based materials that react to the lantern: wet stone, metal, crystal and ore.
- A filmic grade.

The calm rules still hold. Light carries the drama, never motion or post effects.

**The lighting stack (owned by the new specialist 1E):**
1. **PBR shading.**
   - The lighting model: GGX specular plus wrapped Lambert/Burley diffuse, energy-conserving, in one shared GLSL lighting chunk that every world, prop, face and viewmodel material includes.
   - Material inputs: albedo, a normal from the stone painter's height layer, roughness, metalness and emission, all from 1C's material arrays.
2. **Lantern shadows.**
   - The lantern is a shadow-casting point light. Its cube shadow map is 512² on High, 256² on Balanced and off on Battery.
   - The pass renders only the geometry within 14 m. It refreshes when the lantern moves; otherwise it is reused, which costs nothing at rest.
   - Filtering is soft PCF with 8–16 rotated Poisson taps and a light contact-hardening term.
   - Normal-offset and slope bias remove acne and peter-panning; a test captures an acne-free wall at grazing angles.
   - On High, one extra shadowed practical: the nearest lit lamp, refreshed only when it changes.
3. **Bounce and ambient.**
   - The voxel LightField (1B's `world/light.ts`) becomes an irradiance volume, sampled trilinearly with a normal offset, for coloured soft bounce.
   - A per-chamber ambient probe (SH2 or a hemisphere) carries the biome fill.
   - Darks stay hued, at ≥ 0.04 display.
4. **AO.** GTAO (or SAO) at half resolution with a bilateral upsample, on Balanced and High, multiplied with the baked vertex AO.
5. **Volumetric light.**
   - Half-resolution raymarched single scattering from the lantern, shadowed on High, and from real light sources: the Root Cellar's sky shaft, crystal glows, the breach leak and lit lamps.
   - Blue-noise jitter with temporal accumulation keeps it stable. Height fog is part of the same pass.
   - This is real light in the air. Screen-space "god-ray" post effects stay banned.
6. **Many lights.** Up to 8 per-pixel practicals per view, chosen per frame (nearest and brightest) or with a clustered list; the rest stay baked into the LightField. Relighting a lamp adds its practical in the frame of the tap.
7. **Specular detail.**
   - Wet stone and puddles reflect from a per-chamber reflection probe (a cube map captured once on first light).
   - Ore and metal glints follow the lantern.
   - Crystals use a fake subsurface or inner-glow term and refraction-lite tinting.
8. **The filmic pipeline.**
   - HDR with a physically based dual-filter bloom (threshold ≥ 1.0, strength ≤ 0.25).
   - An AgX or ACES-fitted tonemap, the per-biome 32³ LUT grade, a vignette ≤ 0.15 and dither.
   - Anti-aliasing: FXAA or SMAA, or MSAA where cheap. TAA only if it is ghost-free in the tap feel.
   - Still banned: chromatic aberration, lens flare, grain, motion blur, iris, shock rings, screen-space rays.
9. **The lantern flame.** A ±3 % flicker on intensity, plus a 2–4 cm source wobble so shadows breathe slightly. Never a strobe.
10. **Presets and the governor.**
    - Battery: no shadows, AO, volumetrics or probes.
    - Balanced: everything, with 256² shadows and half-res AO and volumetrics.
    - High: 512² shadows, the second shadowed light and full volumetrics.
    - `QualityGovernor` steps down before frames drop.
    - `tools/perf.mjs` models every pass.
    - Budget on phone A at Balanced: ≥ 45 fps while digging and ≥ 55 fps while walking and riding, with a GPU frame ≤ 16 ms modelled. This replaces SPEC §11's ≤ 12 ms. The director ranks the look first.
11. **Proof.**
    - Before and after captures with the lighting stack off, then on, at every W1 shot. A grazing-angle shadow-acne test.
    - A stillness test: the shadows at rest are still, within the flicker's ΔL ≤ 0.01.
    - The beauty rubric's Light criterion ≥ 4.5 and Wonder ≥ 4.5 on first light, the Glowroot reveal and the Root Cellar shaft.

**A huge improvement in visual detail (1C):**
- Rubble and pebbles at wall feet, roots, and dripstone (tapered).
- Timber sets with grain and iron straps, rails with spikes, rope and chains.
- Mineral veins as real 3D nuggets, crystal clusters with inner light, wet puddles, cobwebs (decor only), Halden signage and plaques, carved runes.
- Bevels on every built edge. Micro-detail in the stone shader (height, normal and roughness) at close range.
- No two neighbouring blocks identical.

## 5. Ownership for this wave: five specialists

| Slot | Port | Owns |
|---|---|---|
| **1A** model | 4173 | as BUILD §3.1, plus the phase model: `nodes.ts` phases dig, explore, ride, seal, camp; explore-chamber contents (secrets, lamps, tappables) and their gold law; the ride's pass-by targets |
| **1B** world | 4174 | as BUILD §3.2, plus the Explore caverns of §3 and their **walkability grid** (`src/world/hybrid/nav.ts`: per-voxel walkable flags, step-up links, ladder and rope links, and a pure `findPath(from, to)` that 1D calls); the cart-run rails; the LightField as an irradiance volume API for 1E (`world/light.ts` stays yours) |
| **1C** look | 4175 | as BUILD §3.3 and W1-LEAD §1, **except** the files that move to 1E. Keeps the surface (materials, painter with **albedo, height-to-normal, roughness and metal layers**, mesher, ChunkRenderer), FaceRenderer, ChamberProps, Viewmodel, NodeCrew, FX, scenes, the visual-detail list above, and the capture tools (`hybrid-capture`, `png`, `look-capture`, `descent-capture`, `capture`) |
| **1D** shell | 4176 | as BUILD §3.4, plus the Explore controls of §3: tap-to-walk with 1B's `findPath`, drag-look, tap-to-act, the walking camera within the motion law, the ride phase's camera, and e2e for every phase with real touches |
| **1E** light (new) | 4177 | `src/render/Renderer.ts`, `src/render/PostFX.ts`, `src/render/QualityGovernor.ts`, `src/render/lighting.ts`, new `src/render/light/**` (the shared lighting GLSL chunk, lantern and practical shadows, irradiance sampling, GTAO, volumetrics, reflection probes, tonemap and LUT, light selection), `tools/perf.mjs`, `tests/unit/hybrid/{lighting,shadows,volumetrics,post,governor}*.test.ts`, and `tests/e2e/hybrid-light.spec.ts` |

**The 1C ↔ 1E seam (published by 1E in the first 45 minutes):** `src/render/light/chunk.ts` exports:
- `LIGHTING_GLSL`: `vec3 shade(Surface s, vec3 worldPos, vec3 viewDir)`, where `Surface` = albedo, normal, roughness, metal, ao and emission;
- `lightingUniforms()`;
- `LightRig` (the lantern, the practicals, the shadow maps, the probes, `update(camera, lantern, lamps)`).

1C's materials build a `Surface` and call `shade()`. They never compute lighting themselves.

**The 1B ↔ 1E seam:** `world/light.ts` exposes the voxel light as a 3D texture plus its origin and scale (it already does for the chunk shader). 1E samples it.

**The 1B ↔ 1D seam:** `nav.ts`'s `findPath` and `walkableAt(x, y, z)`, published by 1B in the first 45 minutes. 1D builds against the stub.

The stopped first start left stubs in `src/game/hybrid/`, `src/render/hybrid/` and `src/debug/hybrid.ts`. Their owners (1D for `game` and `debug`, 1C for `render/hybrid`) keep them, extend them or replace them.
