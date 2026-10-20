# Reuse map for the first-person hybrid (research note)

Audit of both earlier versions of DEEP DOWN for the pivot to a **first-person, tap-only 3D descent with idle upgrade loops**.
The two versions are:
- **v1**: commit `9eb4166`, a third-person voxel cave with a joystick;
- **the tree**: HEAD `657ab09`, the 2D-cutaway idle descent.

Lumi Master is a reference for **visuals, 3D exploration and the first-person tap only**. Nothing creature-related carries over:
- no collection, taming, companions, battles or trading;
- no tappable animal as a reward source.

Ambient cave life may decorate. It is never a mechanic.

No code was edited for this note. Sibling notes: `hybrids.md` (control patterns P1–P10) and `lumi-master.md` (the visual grammar).

**Verdicts**
- **KEEP**: use as is.
- **ADAPT**: keep the code; change a seam, constants or content.
- **REWRITE**: keep the idea or data; write new code.
- **MINE**: copy a few functions into new code; drop the file.
- **DELETE**: remove from the game; git keeps it.

**Quality** (an honest grade of the code for its own job, then of its fit for the new game)
- **A**: solid, tested, fits.
- **B**: works, needs real work for the new game.
- **C**: works, but the result is poor or was rejected by the director.
- **D**: wrong for the new game.

---

## 0. The answer in twelve lines

1. **Keep the engine core.** These parts are A-grade and already serve an endless vertical descent:
   - the voxel world with a y-ring (RingWorld);
   - worker slab generation;
   - the coloured light volume and the lantern visibility field;
   - the crack-free worker mesher;
   - the HD post chain;
   - GPU particles and BSP shards;
   - procedural props and structures;
   - the brand kit, the save pipeline, audio synthesis, the Android shell and the touch e2e harness.
2. **Keep the pure idle model (`src/idle/**`, 10.7k lines, no Three.js, no DOM).** It is the most valuable code in the tree:
   - Big numbers and the economy curves;
   - crew, chests, seals, the event Director, Feats, Rank, prestige and offline (an exact closed form);
   - the tutorial and goal machines.

   It is geometry-free: rows and column indices only. It can drive a first-person **7-cell way-face** with no change to its math (§3.9).
3. **Rewrite the parts that *are* the 2D cutaway:**
   - the camera (`DescentCamera`), the scene facade (`DescentScene`) and tap resolution (`DigController` column strips);
   - the slab passes that build the shaft footprint and cut face;
   - the section look (`look.ts`, `SectionField`, the cut path in `terrainMaterial`);
   - the strike-ghost tool;
   - the 2D-coupled tests.
4. **Delete:**
   - v1's third-person rig, walking physics, joystick, survival systems (hearts, fuel, cold), inventory and crafting;
   - the tree's foreman (no body in first person) and every creature system (§4).
5. **Mine v1 for small, proven pieces:**
   - `ropeRide.ts`, the station-to-station glide;
   - `MiningController.pick()`, a screen tap → voxel and prop ray;
   - the fat-finger rule of `TapController`;
   - `runeDoor.ts`, hold-to-wake for sealed gates;
   - `lockedVerticalFov`;
   - the authored architecture vocabulary of `generateWorld.ts`.
6. **Biggest risk: the look at first-person distance.**
   - The rock sits 1.5–5 m from the lens and fills most of the frame.
   - v1's 16 texels/m pixel textures and chamfered facets read as plastic lumps.
   - The tree's per-pixel section paint read as pasted tiles.
   - Neither is Lumi Master's soft, few-value storybook look.
   - The look spikes (#81) must settle the surface before the slice's art is built.
7. **Second risk: the economy is already miscalibrated.**
   - The model with every W2 system on is far too fast: 600 m at 4–5 min against a target of at least 20 min.
   - Station pacing (30–60 s per face) needs a new calibration anyway.
8. **Third risk: juice.** The cue table built the over-animated screen the director rejected. The slice ships with the budgets turned down.
9. **State today:**
   - `tsc` is clean.
   - Vitest: 532 pass, 1 flaky fail, 4 known-gap `it.fails`.
   - The working tree is clean apart from these research notes.
   - One look spike is in progress in a locked worktree.
10. **Fastest slice (§7):**
    - 3 workstreams and about 4–5k new or adapted lines on top of about 65k existing ones.
    - Content: Topsoil Roots → the Halden Hatch → the first Glowroot vista, in 6–8 stations.
    - It has: tap and hold to dig, Pick upgrades, Shovel Hand and Pick Crew visible at work, chests, one relic, an offline glide on return, and an APK.
11. **Not in the slice:** Rekindle, Weave, Breach, facets, contracts, daily, skills beyond Dynamite, and the Codex, Feats and Board sheets. The model code stays; it is not surfaced.
12. **The root docs are stale.** `GAME_DESIGN.md`, `ART_DIRECTION.md` and `TECHNICAL_ARCHITECTURE.md` are unchanged since `9eb4166` and still describe v1. The hybrid SPEC must replace them.

---

## 1. State of the code, as audited (2026-10-20, about 18:45 UTC)

| Check | Result |
|---|---|
| `git status --short` | `?? docs/hybrid/` only. HEAD `657ab09` ("WIP checkpoint: wave 2 UI specialist edits in progress"). No uncommitted code |
| `npx tsc --noEmit` | exit 0, no errors |
| `npx vitest run` | 60 files: 532 passed, **1 failed**, 4 expected fail (45.7 s). See below |
| Playwright e2e | not run for this audit (SwiftShader takes minutes per spec) |

**The failure is flaky.**
- Test: `tests/unit/mesh-worker.test.ts` › "sends the mesher options to the workers (debug viewer flags)".
- Error: `expected 0 to be greater than 0` on `workerMeshes`.
- The file passes 16/16 when run alone, so it fails under parallel load.

**The four `it.fails` are known economy gaps** (`tests/unit/idle/days.test.ts`):

| Gap | Measured | Target |
|---|---|---|
| E9 | chains of 5–7 Rekindles with runs < 3 min | no 3 in a row |
| E19 | rank 10 at about 3 min | 12–20 min |
| E25 | side multipliers ×16–×37 in the first session | ≤ ×10 by day 3 |
| Pace | 600 m at 4–5 min | ≥ 20 min |

**Other worktrees:**
- `.claude/worktrees/wf_290c9c0b-1c4-1` (locked) holds the in-progress "storybook cavern" look spike:
  - `deep-down/src/spike/sdf.ts`: signed-distance helpers (smooth min, capsules, cones, rounded boxes);
  - a `spike.html` entry added to `vite.config.ts`.
- `wf_290c9c0b-1c4-2` and `wf_cd9faf19-b99-1` (locked) hold only `node_modules` so far. They are presumably the other two spikes.
- The older `wf_cc48d904-081-*` worktrees sit at `b3251ca` (wave 2) and are stale.

**Size:**

| Version | Files | Lines |
|---|---|---|
| v1 `src` | 207 | 47.1k |
| Tree `src` (CSS included) | 293 | 65.0k |

Tree breakdown:

| Directory | Lines |
|---|---|
| `src/idle` | 10,721 |
| `src/ui/idle` | 8,044 |
| `src/game` | 5,910 |
| `src/render/descent` | 5,244 |
| `src/render/materials` | 3,330 |
| `src/render/props` | 3,056 |
| `src/audio` | 2,639 |
| `src/render/structures` | 2,317 |
| `src/world/descent` | 2,278 |

**Screenshots reviewed:**
- v1:
  - `artifacts/final-pass/first-five-w2/02,04`;
  - `artifacts/final-pass/w3/{camp-after-north,rune-star,niche-chasm,forge-close}`;
  - `artifacts/world-w2/r6/f03-grotto`;
  - `artifacts/tour/{t3_ledge,t5_bridge}`.
- Tree:
  - the APK capture `scratchpad/peek-2.png`;
  - `artifacts/idle/w1/w1-c-hud-20m`;
  - `artifacts/idle/w2/look/{r5-biome-02,r5-biome-03,r5-vista-00,r5-vista-01}`.

### 1.1 What the screenshots say (the honest visual verdict)

**v1, third person (real 3D):**
- **Good:**
  - The warm lantern pool against cool stone already *is* the "Lamplight on the Lintel" image.
  - The timber camp and the hanging lamp read well.
  - Light really comes from the lamps.
- **Bad:**
  - Rock is big chamfered facets with 16-px pixel paint smeared across them. Up close (the grotto, the niche shots) it reads as plastic lumps, and a rock face often fills half the frame.
  - Floors are empty.
  - The explorer covers the centre of the frame.
  - HUD chips are small.

**Tree, 2D cutaway (the APK the director hated):**
- **Bad:**
  - The section look paints every cell as a flat square tile with cartoon bubbles and swirls (pink, orange, blue, white). The world reads as a sticker sheet, not rock.
  - Glitches are visible:
    - a crate hangs in the vista sky (`r5-vista-00`);
    - a black root silhouette over a flat ochre card;
    - chunks float at the top edge;
    - green tiles stick out at the right edge (`r5-biome-02`, `r5-vista-01`).
  - The tap ring (a huge soft donut) covers a third of the screen in `peek-2`.
- **Good:**
  - The portrait HUD is clear and sparse: gold, rate, depth plate, goal bar, two cards.
  - The quick-buy "BEST" card works as an affordance.

**Conclusion:**
- Take v1's **3D light and space**.
- Take the tree's **economy, HUD structure and portrait discipline**.
- Throw away v1's close-range surface treatment and the tree's section paint.
- Aim the surface at Lumi Master's grammar: soft shading, few values, light baked into colour, one focal object, calm motion. Keep DEEP DOWN's amber-against-cool-stone contrast.

---

## 2. What the new game asks of the code

From the brief and `hybrids.md` §4–5. These are the technical needs the verdicts are judged against.

1. **First-person camera, no body.** A hand, the tool and the lantern may show in the lower right; they are also the comfort anchor (hybrids §4.2.4).
   - Portrait lens: horizontal FOV locked at about 52°, which gives a vertical FOV of about 93° at 390 × 844.
   - No head bob, no roll.
2. **Tap and hold only.** The world is the button (P1): a tap strikes the thing under the finger. Hold auto-strikes (P3). There is no joystick and no aim button.
3. **Stations and glides (P2).** The camera is still at a station. One tap on the tunnel mouth glides it 1.2–1.8 s along an authored rail to the next station. A reduced-motion crossfade is the fallback.
4. **A way-face to dig at each station**, plus side niches, chests and relics in the room. A focus view opens on chests and relics (P8).
5. **Crew and machines visible in the same frame (P4):**
   - Shovel Hands and Pick Crew on the side walls;
   - a mine cart on a rail;
   - a steam drill and borers on the far wall.
6. **Sealed gates are mechanisms**: a hatch, a lock wheel, a runed lintel. Never monsters (P6).
7. **The tool in hand is the upgrade showcase (P7).** It changes visibly with every tier.
8. **An offline return glide through what the crew dug (P10).**
9. **Endless:**
   - streaming in depth;
   - float rebasing;
   - Big numbers;
   - fourteen biomes, then Echo strata.
10. **The look:**
    - Lumi Master's soft, storybook first-person exploration.
    - The DEEP DOWN brand: amber lantern against cool dark stone, octagon plates, the Lintel face, the emblem.
    - Calm, readable UI animation.
11. **Platform:** Android WebView first; Three.js r186, WebGL 2, TypeScript and Vite; procedural assets only; English through `src/i18n`; offline; no store.

---

## 3. The reuse map

Paths are relative to `deep-down/`. Reach v1 files with `git -C /home/user/readme-roast/deep-down show 9eb4166:deep-down/<path>`.

### 3.1 Foundations (shared by both versions)

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/core/{math,noise,rng,events}.ts` | both | KEEP | A | seeded RNG, gradient noise, a typed EventBus whose throwing listeners never break gameplay |
| `src/core/big.ts`, `src/idle/num/notation.ts` | tree | KEEP | A | Big `{m, e}` with an exponent up to 9e15; suffixes K…Dc…Vg, then letter pairs aa–zz; tested in `big.test`, `notation.test` |
| `src/core/{ease,spring}.ts` | tree | KEEP | A | critically damped springs and eases (`easeSpring.test`) for glides, the look-at and the focus view |
| `src/world/VoxelWorld.ts` | both | KEEP | A | 1 byte per voxel, 16³ chunks, neighbour dirty marking |
| `src/world/raycast.ts` | both | KEEP | A | Amanatides–Woo DDA. **This is first-person tap picking**: camera ray → first solid voxel and face |
| `src/config/blocks.ts` | tree | ADAPT | B | Ids 1–40 come from v1. Ids 41–63 are specials; 64 + 8b + slot are biome blocks; 176–191 are emitters. Keep the ids (slabs, materials and the model use them). Drop the creature-only uses |
| `src/config/{balance,tiles,runes}.ts` | tree | KEEP | B | `balance.ts` shrank to 71 lines. `runes.ts` holds the builders' eight runes as stroke drawings, read by the tile painter, the rune stones and the UI. `tiles.ts` lists the 16 × 16 tile layers |
| `src/render/voxModel.ts` (VoxBuilder), `src/render/entityMaterial.ts` | both | KEEP | A | every procedural model, with vertex colours, emissive and instancing |
| `src/version.ts`, `tools/version.mjs`, `vite.config.ts` | both | KEEP | A | one version rule shared with Android; build plugins for the manifest, icons, licences and privacy page |

### 3.2 World, generation and streaming

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/world/gen/generateWorld.ts` (1,540 lines), `architecture.ts`, `features/{places,living,index,types}.ts`, `progression.ts` | v1 | **MINE** | B as rooms, D as structure | One bounded 160 × 128 × 160 authored zone: camp, tunnel, ledge, Hollow, hall, bridge, shrine, chasm and rift gate. It is not endless and has no biome ladder, and the director found its caverns "horribly empty". Its vocabulary is the best authored architecture in the repo and should be ported into the station grammar; the generator itself should not. That vocabulary: `column()` octagonal shafts, stair flights on piers, the portal gate, the corbelled shrine, the arched bridge, `crystalSeam()`, dripstone and flowstone dressing, and the warm-lamp-at-every-landmark rule with its emission budget test |
| `src/world/gen/{zoneWorker,zoneLoader}.ts` | v1 | DELETE | A | superseded by the slab worker |
| `src/world/analysis/{reachability,homeField,economy,fingerprint}.ts` | v1 | DELETE | B | Walk-home BFS fields (13 MB Int32 plus 3.3 MB) exist for free walking, which is gone. The fingerprint idea survives in `world/descent/fingerprint.ts` |
| `src/world/descent/RingWorld.ts` | tree | **ADAPT** | A | 64 × 160 × 64 window with a y ring of 10 slabs of 16 rows. A dead bedrock slot is the light barrier, so LightField only wraps y. This is exactly an endless vertical descent. **Remove the cutaway:** `RING_CUT_Z` = 60 and its always-air apron at z 60–63, plus the `openBack` vista hack. The 64 × 64 m footprint holds chambers up to about 40–48 m across. Bigger vistas look out to backdrop cards (`VistaBackdrop`) |
| `src/world/descent/{slabWorker,slabLoader,slabLight,fingerprint}.ts` | tree | KEEP | A | Pure, byte-identical slabs in Node and in the worker, about 19.5 ms per slab in Node (`slab.test`). Buffers are transferred, not copied; light context is max-merged; one sub-box upload |
| `src/world/descent/slab.ts` (776) | tree | **ADAPT** passes 1–3, **REWRITE** 4–9 | B | **Keep** passes 1–3, which are geometry-agnostic: the biome per row with a ragged 8-row blend, dipping strata with marker beds, and noise veins. **Rewrite** passes 4–9, which are the cutaway: the shaft footprint at x 28–34 and z 57–59; the cut at z 60; the "glow below" fissures on the cut face; the shaft lamps and plaques. They become a station grammar: chamber, way-face plug, tunnel mouth, side walls with crew anchors, glide rail, niches |
| `src/world/descent/caverns.ts` (433) | tree | ADAPT | B | Good dressing grammar: ledges with tappables, heroes, Vista rooms, geodes, weighted `pick()`. Every placement rule is keyed to `SHAFT_X0`, `BACK_Z`, `CUT` and the view column; re-key them to station frames |
| `src/world/descent/fill.ts`, `tools/fill-scan.ts` | tree | ADAPT | A as a concept | The fill contract answers "horribly empty": no empty volume of 27 m³ or more, props per m² of floor, an emitter and a tappable per cavern, an empty-floor share of at most 35 %. Re-express the checks as **what the camera sees from each station** (frustum samples), not what the cut face shows |
| `src/world/descent/biomeKits.ts` (270) | tree | KEEP the data, purge creatures | A | 14 biomes with block roles, the key emitter colour, medium props, small scatter, hero, tappables, liquid and particles |
| `src/world/descent/tutorialRows.ts` | tree | REWRITE | — | authored first 40 rows for the cutaway; becomes the first three authored stations |
| `src/world/light.ts`: LightField and LanternField (1,026) | both | **KEEP** | A | **LightField**: coloured, 18-connected flood-fill light; incremental open and close are property-tested equal to a full recompute; `wrapY` for the ring; `openMany` batches a burst of breaks. **LanternField**: 32³ visibility in 0.2–0.6 ms with real wall shadows. Move its source to the first-person lantern (hand height, slightly ahead and right). This is the engine's core art system and the brand's light |

### 3.3 Meshing

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/render/mesher.ts` (978) | both | **ADAPT** (if a voxel look wins) | B | **What it does:** crack-free surface-nets chamfer, bit-identical across chunk seams with 26 seam keys; relief noise; smooth octahedral normals; smooth AO; ring-aware `worldChunkY`. **Turn off** `MESH_OPTIONS.section` and delete `SECTION_Z`, `SECTION_XY_MAX` and `DIG_BAND_*` (hard-coded x 25–38, z ≥ 56). **Honest view:** at first-person distance its 0.25 m bevels and 2.6 m / 7.3 m relief dominate the frame, and that is what read as plastic in v1. The look spike decides:<br>• "lantern voxel" keeps it as is;<br>• "faceted" keeps it with flat normals and bigger relief;<br>• "storybook SDF" replaces it with an SDF surface mesher, but voxel occupancy stays for light, picking and the model |
| `src/render/{meshPool,meshWorker}.ts` | both | KEEP | A | 1–2 module workers, nearest first, stale results dropped, a 4 ms per frame main-thread fallback. Fix or quarantine the flaky test (§1) |
| `src/render/ChunkRenderer.ts` | both | KEEP | A | ring chunk keys, view-distance culling, `flush()` |

### 3.4 Light rig, materials and the section look

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/render/lighting.ts` (LightingRig, `LIGHTING_GLSL`) | both | ADAPT | A engine, B presets | Light volume and lantern sampling at `pos + n·0.5`, the windowed inverse-square lantern, warm and cool face ownership, analytic haze and low pooling, scene encoding for 8-bit devices. Replace v1's four zone `ATMOSPHERES` (camp, tunnel, hollow, rift) with per-biome looks (BiomeLook already blends them). For Lumi Master's softness, add a wrap or toon ramp on diffuse; do not add lights |
| `src/render/descent/BiomeLook.ts`, `src/idle/config/biomeLooks.ts` (387) | tree | KEEP the data, ADAPT the driver | B | Per biome: fog, exposure, bloom, LUT tint, accent and 5-stop ramps. Good palette data. Its section ramps are what painted the tiles |
| `src/render/terrainMaterial.ts` (677), `terrainRig.ts` | both | **ADAPT (strip)** | B | **Intact:** the v1 path (biplanar geology projection, masonry course libraries, boundary blend, tapered grooves, the `uTarget` mining crack and warm hit light) is still there behind `uSection.x < 0.5`. **Remove:** the descent path, about 200 lines (`SectionField`, `sectionIdAt`, hard-coded z 60, ledge x 28–34, the rim on the cut). **Expect** a shading rework toward few values and soft gradients. `uTarget` cracks become the strike feedback on the way-face |
| `src/render/materials/*` (painters, palette, courses, rock, masonry, minerals, timber, earth, paint, script, recolor) | both | ADAPT | B data, C at close range | Each layer is 128² at 16 texels/m, sharp-bilinear. A wall 2–4 m away in portrait spreads one texel over many screen pixels: the W1 critique's "chunky 16-px pixel tiles, brown on brown, muddy" (docs/idle/W2.md §1). Keep the palette ramps, the course libraries and the recolour helper. Paint at lower frequency (bigger features, softer ramps), or move the near field to resolution-free procedural shading. This is the look spike's call |
| `src/render/look.ts` (625) | tree | **DELETE** the cut-plane paint | C | The section look: per-pixel procedural painting of cut-plane faces. Technically clever (no texels, resolution-free), but it is the "sticker sheet" in `peek-2` and `r5-*`. Salvage only the 3D noise lattice helpers if the spike wants them |
| `src/render/descent/SectionField.ts` | tree | DELETE | — | distance field of the cut face |
| `src/render/textures.ts` | both | KEEP | B | the 16 × 16 icon and drop atlas |

### 3.5 Renderer and post

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/render/Renderer.ts` | tree | KEEP | A | Battery, Balanced and High presets. The scene renders at a dynamic fraction of native (0.45–1.0) through a sub-viewport, so a scale step never reallocates. `?rscale=` pins it |
| `src/render/PostFX.ts` (876), `post/lut.ts`, `post/composite.ts` | tree | **KEEP**, re-tune | A | **Passes:** HalfFloat scene, 4–5 level bloom clamped to the live rect, hue-preserving tone map, 32³ LUT pair of the two nearest biomes, FXAA 3.11, Catmull-Rom upsample with CAS, vignette, octagon iris, dither. **Fallback:** 8-bit. **Cost (modelled):** composite 1.891 ms and frame 7.37 ms at 390 × 844 @2.75 (LOOK.md §10). **Re-tune:** the vignette (weighted for the cutaway's top) and the iris and shock ceremonies |
| `src/render/QualityGovernor.ts` | both | KEEP | A | the preset governor plus `FineScaleController`; thresholds set by reasoning, never tuned on a phone |

### 3.6 Effects

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/render/fx/GpuParticles.ts` | tree | ADAPT (one line) | A | Stateless, exact drag and gravity in the vertex shader, one draw, premultiplied lit and additive, a density governor. Delete the hard-coded soft planes at z 60 / 57 (line 129) or replace them with a depth fade |
| `src/render/fx/{Shards,fracture,rigidBatch}.ts` | tree | KEEP | A | BSP fracture into 9–12 convex shards (`fracture.test`), one draw for every live shard, preset caps. Ideal strike feedback on the way-face |
| `src/render/fx/shardMaterial.ts` | tree | ADAPT | B | paints shards with the section look; switch to the terrain material layers |
| `src/render/fx/Beams.ts`, `src/render/descent/{LightCones,LiquidPlane}.ts` | tree | ADAPT | B | god-ray cones and water or lava planes; some placements read cut z |
| `src/game/effects/{Halos,Waterfall}.ts` | both | KEEP | B | camera-facing halo quads on lamps; the Glimmerfall |
| `src/game/effects/LumenMoths.ts`, `src/game/moths.ts` | both | KEEP as **decoration only**, or DELETE | B | an ambient moth flock that never enters rock; allowed as cave ambience, **never tappable, never a reward** |
| v1 `src/game/effects/{Debris,Particles,TargetMarker}.ts` | v1 | DELETE | B | superseded by GpuParticles, Shards and the `uTarget` crack |

### 3.7 Props, structures, set pieces and scene dressing

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/render/props/{PropRenderer,models,shapes,palette,featureModels,progressionModels,monolith,runes,types}.ts` | both | KEEP | B | About 40 procedural props: crates, barrels, lantern posts, workbench, hoist winch, bedroll, campfire, monolith, rune stones. `PropRenderer.raycast(origin, dir, maxDist)` exists already, so a first-person tap on a prop works directly |
| `src/render/props/descentModels.ts` (500) | tree | ADAPT, purge | B | **Keep:** the chest tiers (wood → lintel glows), crystal targets, boulders, crates, runes and orbs. **Delete:** `mothModel`, `moleModel`, `mimicModel`, `critterModel` and `CREATURE_LOOKS` (42 creatures) |
| `src/render/props/biomeProps.ts` | tree | KEEP | B | per-biome props |
| `src/render/structures/*` (StructureRenderer, stairs, columns, bridge, pylon, timber, builder, geometry, kinds, types) | both | KEEP | A | Hidden collision ids inside, one merged mesh per 32 m cell, stairs with ramp planes, lathe columns, an arched bridge. This is the Halden and Lantern-bearer architecture for seal halls, Halden Works and the Drowned Ruins |
| `src/render/descent/setPieces/*` (7 biomes), `kit.ts` | tree | ADAPT | B | Hero models of 2–8k triangles with **light baked into vertex colours** and a shared look clock. This is the closest code in the repo to Lumi Master's "light baked into the colour". Built as far backdrops behind a cut, they read as black silhouettes on flat cards (`r5-vista-01`). Re-light and re-frame them for first-person vistas |
| `src/render/descent/VistaBackdrop.ts` (439) | tree | ADAPT | B | Analytic skyline cards at 110 / 190 / 320 m behind openings. Good for vista windows and balconies; uncouple from `CUT_Z` and `openBack` |
| `src/render/descent/CavernProps.ts`, `DescentWorld.ts` | tree | ADAPT | B | instanced dressing per slab |
| `src/render/descent/ShaftDressing.ts` | tree | ADAPT | B | lamps every 6 m, rails, brass plaques, the lift cage whose speed shows crew DPS. Becomes the tunnel's lamp trail and the cart rail |
| `src/render/descent/SurfaceSky.ts` | tree | REWRITE | C | a dusk sky for the cutaway menu; first person needs a sky through the shaft mouth and the camp |
| `src/render/descent/SealRenderer.ts` | tree | ADAPT, purge | B | Keep the carved slab with chains and its rune band. Drop the Warden bound into it: seals are mechanisms |
| `src/game/effects/Lanterns.ts` | tree | KEEP | B | planted lanterns, the ghost lantern and **the Other Lantern 600 m below the record**: the mystery at the bottom, already built |
| `src/game/effects/EventEntities.ts` | tree | ADAPT, purge | B | event targets (crystals, boulders, crates, runes, bubbles, stars); drop moths, moles and mimics |
| `src/render/descent/CrewRenderer.ts` (335) | tree | **ADAPT** | B | Instanced miners and machines that strike on the model's impact frames, so the screen and the numbers agree. Crowns add a circlet and 8 % size. Move them from the cutaway scaffold band (`CUT_Z`, `SHAFT_X0`) to the station's side walls, floor edges and far wall. This is P4 |
| `src/render/descent/Creatures.ts` | tree | **DELETE** | — | 4 rigs × a part grammar = 42 creature kinds |
| `src/render/descent/ToolRig.ts` | tree | REWRITE the viewmodel | C | Strike "ghosts" are additive box sketches flashed on the tapped cell, with an 18° follow-through. First person needs a **solid, lit tool in hand** (lower right) that swings on tap. Keep the tier ladder data (`TOOL_TIERS`; `TOOL_FORMS`, `toolHead` and `lanternEdge` in `src/idle/config/gear.ts`) |
| `src/entities/character/*` (ExplorerModel, parts, pose, secondary) | both | **DELETE** from the game | B | No body in first person. Keep `parts.ts` only if a gloved-hand viewmodel wants its boxes |
| `src/render/descent/DescentScene.ts` (1,137) | tree | **REWRITE** (copy its API) | B | The facade's API is the right seam: `applyBreaks`, `cellFx`, `strike`, `burst`, `shock`, `kick`, `trauma`, `pickEntity`, `bindBus(bus)`, `frame(dt, fxDt)`, `DescentSource`. Its internals have 92 references to cutaway geometry (`CUT_Z`, `SHAFT_X0`, columns) |
| `src/render/descent/DescentCamera.ts` (588) | tree | DELETE; keep the spring pattern | A for its job | An off-axis cutaway projection (1 m = 44 CSS px). Its follow, kick and shake springs are reusable math, already in `core/spring.ts` |

### 3.8 Camera, input and controls

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/game/CameraRig.ts` (492) | v1 | DELETE; MINE `lockedVerticalFov(aspect, hfov, maxVfov)` | B for its job | a third-person boom with shoulder swap and 9-ray collision; the wrong camera |
| `src/game/PlayerController.ts` (393) | v1 | DELETE | B | walking physics, auto-step, stair ramps |
| `src/game/TapController.ts` (491) | v1 | **MINE** | B | **Port:** the rules a tap should follow: "a tap on a block mines it to the end"; a tap a little off a block still finds the nearest minable block (`FAT_FINGER_PX` = 30); entity before terrain. **Do not port:** `findPath`'s BFS of about 7,000 nodes, which stations do not need (maybe one in-station step to a niche, hybrids §4.1-E) |
| `src/game/MiningController.ts` (357), `aimAssist.ts` | v1 | **MINE** | B | **Port:** `pick(ndcX, ndcY, …)` (screen → raycastVoxels plus prop raycast with reach and protected or too-hard reasons); impact on the swing's strike frame; the aim-assist score `2·cos − 0.35·distance` |
| `src/ui/TouchControls.ts` (437), `src/game/touchCamera.ts`, `src/game/MenuCamera.ts`, v1 `src/input/types.ts` (the InputState with stick, look and jump) | v1 | DELETE | — | joystick, look drag, Mine, Jump and Use buttons: explicitly rejected |
| `src/game/ropeRide.ts` (111) | v1 | **KEEP (port)** | A | A pure ride along a polyline with constant acceleration over `EASE_M` at each end; the arc length never runs backwards; `rideDuration`, `rideDistance`. **This is the station-to-station glide.** Add the comfort rules (hybrids §4.2): 1.2–1.8 s, turn before the dolly, ±10° yaw |
| `src/game/runeDoor.ts` (66) | v1 | MINE | B | hold-to-wake (1.2 s, decays 2× when released, lantern-tier gate) for runed lintels and sealed gates |
| `src/ui/idle/TapSurface.ts` (369) | tree | **ADAPT** | A | **Keep:** a pointerdown tap in the same frame; a 32-slot ring with no allocation; one hold stream after 250 ms within 12 px; one shared cap of 8 hits/s; up to 3 pointers; exported pure helpers. **Drop:** the 7 column strips, swipe-across-columns and `targetColumn` |
| `src/game/DigController.ts` (211) | tree | **REWRITE** | B | In first person: entity first (chests, relics, gate weak points, lanterns), then the face cell under the finger via the camera ray, then a screen-space fat-finger fallback to the nearest live face cell. A tap must never miss (law L2). **Keep:** its batching of breaks into one `applyBreaks` per frame and its F1 latency records |
| `src/input/DesktopInput.ts` | tree | ADAPT | B | Keep keys 1–7 for the 7 face cells, B for BEST and Esc for Back (desktop testing) |
| `src/game/fx/CameraFx.ts` | tree | ADAPT | A | The FX clock (hit-stops freeze FX, not the model); kick and trauma through the budget. In first person a tap's kick must be tiny or nothing (comfort), and shake is for impacts only |

### 3.9 The pure idle model (`src/idle/**`), module by module

What each module does is in `docs/idle/SPEC.md` §3–§8 and §12. The whole model is pure: no Three.js, no DOM.

**The key finding: the model is geometry-free.**
- A shaft is rows of `COLS = 7` cells, with 1 row = 1 m of depth.
- Cells store their remaining HP as a fraction.
- Damage applies in log space, pierces down a column, then flows to the weakest floor cell.
- Five broken cells of seven crumble the rest; κ = 0.86 (the leftover crumble) is calibrated into `curves.ts`.

**The cheapest first-person mapping keeps every one of those numbers:**
- **The face:** the way-face at a station is a **7-cell rosette**: a centre and six around it, an octagon-friendly silhouette. Each cell is about 1.2 m. With a 52° horizontal FOV on a 390 px wide phone, that is about 160 px at 3 m and 120 px at 4 m.
- **Rows:** a model "row" is one slice into the face. Pierce goes deeper behind the same cell.
- **Station plug:** a station is a plug of K slices; clearing it opens the tunnel mouth and the glide. "Depth" keeps meaning metres dug along a declining tunnel.
- **Chests:** they stay on the centre cell (`CENTRE_COL` = the rosette centre), every 25 slices.

This is a design-panel decision. The point here is that **no economy constant has to change** for the slice, so the calibration tooling and roughly 25 pure test files survive.

| Module | Verdict | Quality | Notes |
|---|---|---|---|
| `bus.ts` (332) | ADAPT | A | The contract between the model, the world, the FX and the UI. Remove the moth, creature and Warden events; add station, glide, face and focus events |
| `model/state.ts`, `model/step.ts` | ADAPT | A | One fixed 60 Hz step of the whole model. Keep `COLS`, `RowState` and `SHAFT_WINDOW`. Drop `moth`, `bestiary`, `stats.creatures` and `lastUsed.creature` |
| `model/shaft.ts` (717) | **KEEP** for the slice | A | `rowKinds(runSeed, d)` is pure: the world generator calls it, so the screen and the model agree cell for cell. Also here: `applyHit` (pierce, conserved damage), crumble, `settleFloor`, `analyticRows`, `breakthroughs()` (cavern spans that become "the face opens into a grotto"), seal rows. Rename "floor" to "face" in the API only if it helps |
| `model/tap.ts` | KEEP | A | the tap's resolution order (combo, base, rally, crit, combo multiplier, Surge, skills, apply, pierce, splash, meters); combo; the Lantern Surge |
| `model/run.ts` (665) | KEEP | A | costs, MAX in closed form, crew DPS, the BEST payback rule `cost/Δincome + max(0, cost − gold)/income`, buy modes |
| `model/crew.ts`, `config/crew.ts` | KEEP; rename 2 lines | A | 15 lines, then Echo lines, with a geometric ladder from line 6 on. Rename the creature-like lines: `fossilGolem` ("a bone fist") becomes a bone press or ram; `voidMaw` ("a mouth of void") becomes a void engine. The others are machines or crews |
| `model/offline.ts` | KEEP | A | Exact closed form over the HP segments (κ·7·H per row). The crew stops at the first never-opened seal ("first sight"); the rest is paid as gallery gold; there is a Chest Rack. It drives P10's return glide |
| `model/seals.ts` | ADAPT, purge | A logic | The fight: HP = 20 s × (crew DPS + 4 × tap); the weak point lights every 5 s; a Strike finisher at 25 %; a fail keeps 50 % and nothing is lost. Warden ids become mechanism ids (§4). Seven of the fourteen are already mechanisms: Hatch, Crusher, Drowned Bell, Forge-Heart, Escapement, Astral Geode, Root Knot |
| `model/director.ts` (700), `config/events.ts` | ADAPT, purge | B | **Good:** cadence U(40, 70) s, deck rules, rotation pity, the find guarantee, the boredom breaker, idle-friendly waits. **Delete:** Lucky Moth, Moth Swarm, Treasure Mole and Mimic Chest. **Keep:** Golden Vein, Glimmerfall, Cave-in, Supply Rope, Treasure Map, Ancient Echo and Geode. Signature events become mechanisms and treasure |
| `model/moth.ts` | DELETE, or recast as a non-creature "drifting ember" | — | the Lucky Moth: a creature reward, so it is out |
| `model/widgets.ts`, `ui/idle/widgets/*` | ADAPT | B | Catch, Mash, Strike, Sequence and Pick. Strike is the relic-condition timing ring of P8; Sequence fits rune locks |
| `model/chests.ts` | KEEP | A | honest roll-ups (no near-miss), three pity gauges, the Chest Rack |
| `model/codex.ts`, `config/codex.ts` | ADAPT, purge | B | Finds (minerals, fossils, relics) and Lore stay. The Bestiary goes. A Biome Seal page becomes 11 entries, not 14. Relics with traits (P8) fit the Finds |
| `model/feats.ts`, `config/feats.ts` | ADAPT, purge | A | 20 families with tiers I–X and beyond. Drop Kindred (creatures caught) and the secret Moth Friend |
| `model/{rank,records,gain,mult}.ts` | KEEP; `mult` drops the bestiary factor | A | rank XP from everything; records and splits; the multiplier stack |
| `model/{goals,tutorial,hints}.ts`, `config/path.ts` | ADAPT | B | The always-visible goal bar and the tutorial step machine are wanted, and their targets are semantic (`cell`, `card:pick`, `card:crew:0`, `chest`, `seal`, `surge`). The steps map almost 1:1: tap the rock → clear a slice → buy the pick → hire a Shovel Hand → chest → crystals → Dynamite → the hatch → reveal. Add a "tap the tunnel mouth" glide step; reword the column and creature texts |
| `model/{contracts,daily}.ts`, `config/contracts.ts` | KEEP (after the slice) | A | Contracts point at an unused mechanic. The calendar pauses on a missed day and never resets |
| `model/{facets,prestige,skills}.ts`, `config/{facets,prestige,skills}.ts` | KEEP (after the slice) | A | Rekindle, Weave and Breach, the facet hands, skills. Not shown in the slice |
| `model/entities.ts` | ADAPT, purge | B | the tappable ids (`crystal`, `gem`, `fossil`, `crate`, `note`, `cache`, `lantern`, `chest`, `weak`, `event`); drop `creature` |
| `config/{curves,cells,upgrades,gear,biomes,rank,path}.ts` | KEEP; purge `biomes.creatures` and Warden ids | A | HP(d) slopes, the cell mix with expected value 1.00, upgrade tables, gear cards, the 14-biome ladder and the Echo spacing |
| `sim/*`, `tools/econ-sim.ts` | KEEP | A | the greedy bot, pacing and days sims on the real tables. The four known gaps (§1) mean the calibration must be redone around station pacing anyway |

### 3.10 Shell, juice and ceremonies

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/game/IdleGame.ts` (1,557) | tree | **ADAPT by copy** into a new game class | B | **Keep:**<br>• boot;<br>• modes (boot, menu, playing, paused, crashed);<br>• the fixed 60 Hz step (at most 4 per frame; a frame with taps always steps);<br>• the autosave cadence (30 s, pause and hide, purchases);<br>• lifecycle, offline return and Back handling;<br>• the crash hook;<br>• `saveToState` and `stateToSave`.<br>**Replace:** the DescentScene, column, ruler, section and foreman wiring. It is a god object: split HUD views out (`views.ts` already started) |
| `src/game/views.ts` | tree | ADAPT | B | model → UI adapters |
| `src/game/FrameGuard.ts`, `src/main.ts` (release shell) | both | KEEP | A | Three failed frames stop the loop and show the crash panel. Also: the Android bridge (Back, lifecycle), the context-loss notice, the governor |
| `src/game/fx/{JuiceDirector,juice,juiceBudget}.ts` | tree | ADAPT (**turn down**) | B machinery, C result | Tiers T0–T5 with caps, the photosensitivity limiter, trauma caps and freshness damping are good machinery. The **cue table** produced the over-animated, illegible screen the director rejected. For the slice:<br>• tap feedback ≤ T1 (crack, chips, sound, haptic);<br>• T2 for a break;<br>• T3 and above only for a chest, a seal or a reveal;<br>• no shake on taps;<br>• crew numbers merged into one "haul" counter per station (P4) |
| `src/game/fx/Timeline.ts`, `ceremonies/*` (BiomeReveal, Chest, Feat, PickTier, Rekindle, CeremonyDirector, CeremonyHost, stage) | tree | ADAPT | B | Timelines with `skip()` and fixed-time capture hooks. Re-stage for a first-person camera (focus view, a short dolly) and **shorten**: Lumi Master's developers cut presentation time after testing (lumi-master §5.7) |

### 3.11 UI

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/ui/brand/*` (tokens, strokeFont, lintelFont, wordmark, logo, emblem.mjs, motion) | both | **KEEP** | A | The identity: the Lintel TrueType built at runtime from stroke polygons, the lantern rune and emblem (also used by vite and the Android icon), WCAG colour tokens, motion tokens |
| `src/ui/{UI,dom,format,notices,screenFormat,sprites,haptics}.ts`, `ui.css`, `styles.css`, `screens/{about,settings,menu,host,widgets,compat}` | both | KEEP | B | the octagon plate rule, the screen host with exit layer, haptics rate-limited per kind, `itemRaster` specimens for Codex icons |
| `src/ui/fx/{displayLedger,press,waapi,Ticker}.ts` | tree | KEEP | A | Shown gold against real gold: a counter changes when its tokens land. Press feedback; four ticks a second |
| `src/ui/fx/{FxCanvas,spriteAtlas}.ts` | tree | ADAPT (thin out) | B | numbers, tokens and sparks in the same rAF; fewer and smaller |
| `src/ui/idle/layout.ts` | tree | ADAPT | A | pure rects from the viewport and safe insets; the CSS, the camera and the tests agree |
| `src/ui/idle/{TopBar,GoalBar,Card,QuickBuy,Sheet,FirstTimeCard,GhostHand,ReturnFeast,SealHud,icons}.ts` | tree | ADAPT | B | The pieces of a one-thumb portrait HUD. **Card:** the button is a progress bar, with a pip ring and BEST. **GhostHand:** the tutorial pointer. Restyle calmer, with fewer plates on screen |
| `src/ui/idle/{DepthRuler,EventBubbles,SkillRow,FacetHand}.ts` | tree | ADAPT later | B | The ruler is column and section framed. The others belong to systems that are not in the slice |
| `src/ui/idle/sheets/*` | tree | ADAPT later | B | Board, Feats, Codex and Lantern exist. `CrewSheet` and `DigSheet` are 8-line stubs, because the cards live in `Card.ts` and `rows.ts` |
| `src/ui/idle/idle.css`, `w2.css` (1,487 + 1,475 lines) | tree | REWRITE gradually | C | two stacked CSS layers from W1 and W2; prune with the calmer HUD |
| v1 `src/ui/hud/*`, `screens/{inventory,workbench,journal,board,summary,ending}` | v1 | DELETE | B | survival HUD (hearts, fuel), inventory and crafting screens |

### 3.12 Audio

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/audio/*` (AudioSystem, synth, voices, sfx, MusicPlayer, MusicScheduler, theory, drums, layers, graph, buffers, offline, analysis) | both | KEEP, remap | B | Fully synthesized: SFX recipes, music modes and tempo per biome, a drum layer, ambience layers, offline measurement. `eventMap.ts` maps IdleEvents to cues; remap it to the new events (glide whoosh, focus open, face slice). **Nobody has listened to it on a device** (KNOWN_ISSUES) |

### 3.13 Save

| Path | Source | Verdict | Quality | Notes |
|---|---|---|---|---|
| `src/save/SaveSystem.ts` | both | KEEP | A | two-slot writes with checksums and a pointer flip, a corrupt slot falling back, legacy detection, refusal of saves from a newer version |
| `src/save/{types,saveData}.ts` (SaveV3) | tree | ADAPT → **v4** | A | **Keep:** "no voxel delta, the world is a pure function of the seed". **Replace:** `run.floor` and `run.below` with the station state (station index, face slices with kinds and fractions, harvested bits per station). **Drop:** `bestiary`. **Decide:** add `MIGRATIONS[3]` keeping meta (gems, records, Feats, Finds, rank, settings), or report v3 as legacy like v1 and v2. The director's phone most likely holds a v3 save from the APK |
| `src/save/settings.ts` | both | KEEP | A | `deepdown.settings` survives across versions; the motion and flash levels are already there |

### 3.14 Text (i18n)

| Path | Verdict | Notes |
|---|---|---|
| `src/i18n/index.ts`, `en/{core,brand,release,screens}.ts` | KEEP | — |
| `en/idleCore.ts` (700), `en/idleUi.ts` (357), `en/idleWorld.ts` (108) | ADAPT, purge | `idleWorld.ts` holds 59 creature and Warden references. Tutorial texts talk about columns |
| `en/idleLore.ts` | WRITE | a 4-line stub: the 42 Halden notes, 14 murals, 14 seal cards and 60 Echo fragments of SPEC §7.8 do not exist yet |

### 3.15 Debug, tests, tools and Android

| Path | Verdict | Quality | Notes |
|---|---|---|---|
| `src/debug/idle.ts` (`window.__DD__.idle`) | ADAPT | A | `state`, `goal`, `fx`, `ledger`, `advance`, `setDepth`, `give`, `forceEvent`, `forceChest`, `toSeal`, `offline`, `perf`, `programs`. Replace `columns()` with the face cells' screen rects and add `station()` and `glide()` |
| `src/debug/{DebugApi,StubUI}.ts`, `src/lab/*`, `visuallab.html` | ADAPT | B | The Biome Lab page is the fastest capture loop for the first-person look |
| `tests/e2e/touch.ts` | **KEEP as is** | A | real touch through CDP `Input.dispatchTouchEvent`: tap, hold, down and up, drag, multi-touch |
| `tests/e2e/dd.ts` | ADAPT | A | the typed `__DD__` slice and the readiness and mode waits |
| `tests/e2e/release.spec.ts` | KEEP | A | the release shell (crash panel, Back, lifecycle, context loss) |
| `tests/e2e/idle-{core,economy,loops,save,tutorial,world,ceremony,hd}.spec.ts` | REWRITE | — | they encode the cutaway (column taps, the floor row, section captures) |
| `tests/unit/idle` (pure files) | KEEP | A | `big`, `notation`, `cells`, `chests`, `days`, `director`, `goals`, `hints`, `offline`, `pacing`, `prestige`, `progression`, `run`, `seals`, `shaft`, `tap`, `tutorial`, `widgets`, `save-v3`, `juiceBudget`, `flashBudget`, `ceremonyBudget`, `timeline`, `ledger`, `noPunishment`, `easeSpring` |
| `tests/unit/idle` (2D-coupled files) | REWRITE or ADAPT | — | `descentCamera`, `digController`, `tapSurface`, `sectionField`, `look`, `slab`, `slabFingerprint`, `ring`, `fill`, `tutorialCrystals` |
| `tests/unit` (engine) | KEEP | A | `mesh-sculpt`, `mesh-worker` (fix the flake), `world`, `voxModel`, `structures`, `props`, `terrainMaterials`, `audio*`, `save-*`, `brand`, `governor`, `ui*` |
| `tools/apk-sim.mjs` | ADAPT | A | Serves the packaged APK files on the WebView's virtual origin with the shell's MIME table and refuses every other request. Generic. Only its play script ("lands in the shaft, a tap digs") changes |
| `tools/perf.mjs` | KEEP | A | the GPU cost model per pass with budgets (bloom 1.0 ms, composite 1.9 ms, terrain 4.5 ms, frame 12 ms, memory 80 MB) |
| `tools/{look-capture,descent-capture,capture,ui-check,play}.mjs` | ADAPT | B | Portrait captures through `visuallab.html`. The look metrics V1–V11 are keyed to the dig band; re-key them to the way-face and the frame |
| `tools/{econ-sim,fill-scan,run-ts,png,icon-masks,audio-check,version}` | KEEP / ADAPT | A | — |
| `android/*` (MainActivity, manifest `sensorPortrait`, build-apk.sh, Gradle, make-icon.mjs, stubs) | **KEEP as is** | A | WebView on `appassets.androidplatform.net`, offline with no INTERNET permission, predictive Back by reflection, cutout insets, a shared debug keystore. Built and simulated here, and run by the director on a phone; the Gradle AAB is unverified |

---

## 4. The creature purge (the newest hard constraint)

A creature is never a mechanic: no catching, no tapping an animal for gold, no bestiary, no creature Warden. Moths may stay as drifting ambience. Everything below is mechanical work, but it spans about 40 files.

| Where | What goes or changes |
|---|---|
| `src/idle/config/biomes.ts` | `creatures: [..3]` on every biome (42 ids) |
| `src/idle/model/moth.ts`, `state.moth`, `nextMothAt`, the moth events in `bus.ts` | the Lucky Moth (Gold Shower and Moth Frenzy outcomes); its frenzy multiplier in `run`, `mult` and `tap` |
| `src/idle/model/director.ts`, `config/events.ts` | the `mothSwarm`, `treasureMole` and `mimic` events, `creatureX()`, and the Kindred perk path |
| `src/idle/model/codex.ts`, `config/codex.ts` | the Bestiary (`catchCreature`, `bestiaryTier`, `creaturesOf`) and the bestiary factor in `mult.ts`. A Biome Seal page goes from 14 entries to 11 |
| `src/idle/model/{entities,feats,goals,contracts}.ts`, `config/{feats,contracts,path}.ts` | the `creature:` tappable; the Kindred family; the secret Moth Friend; the "catch a creature" goals and contract templates |
| `src/idle/model/seals.ts`, `config/biomes.ts` Warden ids, `idleWorld.ts` | Seven Wardens are creatures and become mechanisms. Suggested replacements:<br>• Prism Warden (crystal golem) → a prism lock;<br>• Mother Spore (puffcap) → a spore valve;<br>• Singing Skull → a bone organ;<br>• Rime Wyrm → an ice lock-wheel;<br>• Loom Keeper (spider) → a thread lock;<br>• Reflection (a mirror of you) → a mirror gate;<br>• Keeper (a giant of light) → the Last Lintel. |
| `src/idle/config/crew.ts`, `idleWorld.ts` | rename `fossilGolem` and `voidMaw` as machines |
| SPEC §6.5 mutator "Inverted" | "creatures walk on ceilings" |
| `src/render/descent/Creatures.ts`, `descentModels.ts` (`CREATURE_LOOKS`, moth, mole, mimic, critter), `EventEntities.ts`, `DescentScene.ts` (30 references), `world/descent/{slab,caverns,fill,biomeKits,tutorialRows}.ts` (creature anchors) | renderers and spawn anchors |
| `src/save/{types,saveData}.ts` | `meta.bestiary`, `stats.creatures`, `lastUsed.creature` |
| `src/i18n/en/{idleWorld,idleCore,idleUi}.ts`, `src/audio/sfx.ts`, `src/ui/haptics.ts`, `src/ui/idle/widgets/common.ts`, `CodexSheet.ts`, `icons.ts` | strings, cues, icons |
| `src/idle/sim/pacing.ts` (16 references) | the sim's creature income; re-run `econ-sim` after removal |

---

## 5. Broken, half-done, or tied to the 2D cutaway

**Broken or half-done**

| Item | Detail |
|---|---|
| The economy pace with every W2 system on | 4 `it.fails`; 600 m at 4–5 min (SPEC wants ≥ 20); Rekindle chains (§1) |
| `idleLore.ts` | a stub; none of the mystery's notes or murals exist (SPEC §7.8) |
| The tool ladder | `ToolRig` has hand-built ghost forms for tiers 1–10; tiers 11+ reuse the Maul scaled to its head length (its own header says "until W3"). The critic scored *démesure* 5/10, partly because the visible tool ladder runs out early (`docs/idle/CRITIQUE.md`) |
| Sheets | `CrewSheet` and `DigSheet` are 8-line wrappers. The SPEC's Ladder sheet and TitleCard do not exist |
| Device validation | Never measured on a phone: GPU time, frame rate, audio by ear, haptics, WebView quirks, the Gradle AAB (KNOWN_ISSUES). The modelled GPU frame is 7.37 ms (LOOK.md §10); draw calls are 92–107 and triangles 136–166k at the capture spots |
| Visual glitches seen in the W2 captures | floating props in vistas, chunks hanging at the frame edge, flat backdrop cards behind openings (§1.1) |
| A flaky unit test | `mesh-worker.test.ts` under parallel load |
| Stale root docs | `TECHNICAL_ARCHITECTURE.md`, `GAME_DESIGN.md` and `ART_DIRECTION.md` still describe v1 |

**Tied to the cutaway (each must change for first person)**

| Item | Where the coupling sits |
|---|---|
| Cut plane z 60 and the light apron | RingWorld, slab, mesher (`SECTION_*`, `DIG_BAND_*`), terrainMaterial, GpuParticles, shardMaterial, LightCones, LiquidPlane, VistaBackdrop, SurfaceSky |
| Shaft footprint x 28–34, z 57–59 | slab, caverns, fill, CrewRenderer, ToolRig, DescentScene, DescentCamera |
| Column strips | TapSurface, DigController, DepthRuler, the `columns()` debug call, the e2e specs, the tutorial ghost hand |
| Off-axis camera | DescentCamera: the width lock, the 52 % floor line, parallax constants |
| The foreman | ExplorerModel and its dash and strike poses |
| The section look | look.ts, SectionField, biomeLooks' section ramps, the look-capture metrics |

---

## 6. Risks, ranked

| # | Risk | Why it is real | Mitigation |
|---|---|---|---|
| R1 | **The surface fails at first-person distance** | The lens sits 1.5–5 m from rock and rock fills 40–70 % of a portrait frame. v1's texels and facets read as plastic and pixels. The tree's section paint read as stickers. Lumi Master's look is soft, few values, light in the colour, low density | Settle the surface in the look spikes (#81) **before** the slice's art; judge them at 390 × 844 @2.75 from a real station pose. Keep rock 3–6 m away by sizing chambers, and spend detail on props, crystals and lamps rather than on rock micro-relief. Paint low-frequency ramps from the biomeLooks palette with a toon or wrap response on the light volume |
| R2 | **Motion sickness and disorientation** | First-person camera motion on a phone; glides; look-at moves | Apply hybrids §4.2 strictly: no bob or roll; glides 1.2–1.8 s eased; turn before the dolly; ±10° yaw; look-at ≤ 35° in ≤ 0.35 s; the static tool and lantern anchor; reduced motion = a 0.25 s crossfade. Port `ropeRide.ts` for continuous arc length. Add unit tests on angular velocity |
| R3 | **Taps miss or feel imprecise in 3D** | Perspective cells shrink with distance; thumbs are fat; props overlap the face | Make the face cells ≥ 88 px (rosette cells of about 1.2 m at 3–4 m with a 52° hFOV). Resolve entities first, then the ray hit, then the fat finger. Rule: a tap in the world region always lands somewhere useful. Measure with e2e real touches (F1 latency, hit rate) |
| R4 | **Over-juice again** | The juice tables and ceremonies were tuned for spectacle; the director called the result illegible | Cap taps at T1 and breaks at T2. Merge crew numbers into one haul counter. One focal event per beat (Lumi Master §5.8). Add a "pixels changed per tap" capture metric with a ceiling |
| R5 | **Economy recalibration** | The full model already runs 4–5× too fast (§1). Stations change the tempo to 30–60 s per face (hybrids P9) | Keep the slice to the tutorial biome with crew lines 0–2, where the sim is closest to target. Re-run `econ-sim` with a station-paced bot before adding systems. Keep the `it.fails` honest |
| R6 | **Performance in first person** | The cutaway saw a thin slab; first person sees deep volumes (96 m below in a vista shaft, the whole 64 × 64 footprint). There is no phone GPU measurement, ever | Use the RingWorld bound (160 chunks max), view-distance culling, the dynamic scene scale, the Battery preset. Add a first-person scene to `tools/perf.mjs`. Put a device run in the slice gate |
| R7 | **The look spike may replace the mesher** | A storybook SDF surface means a new mesher; LightField sampling at `pos + n·0.5` must still work on smooth surfaces | Keep voxel occupancy as the source of truth (light, picking, the model). Hide meshing behind a `ChunkRenderer`-compatible interface so the slice is not blocked |
| R8 | **Scope creep from about 30 model systems** | Every system exists and wants a UI | The slice exposes tap, hold, pick, crew 0–2, chests, one relic, seal 1, goal bar, tutorial and offline. Everything else stays dormant behind unlocks the slice never reaches |
| R9 | **Half-done creature purge** | About 40 files, plus strings, Feats, contracts and save fields | One owner does the purge in one pass behind the `tsc` and grep gate in §7. A unit test asserts no `creature`, `bestiary` or `moth:` id survives in config or i18n |
| R10 | **Save compatibility on the director's phone** | That phone most likely holds a v3 save from the APK they tried | Decide early: migrate the v3 meta to v4, or show the legacy notice. Test both slots |
| R11 | **Parallel editing and spikes** | Locked worktrees and specialists may change the same files (`IdleGame`, `DescentScene`, CSS) | Build the hybrid in new files beside the old ones (new game class, scene, camera, controller); switch `main.ts` once; delete the 2D files only after the slice gate |
| R12 | **Slow e2e under SwiftShader** | The first-person scene is heavier than the cutaway; the existing specs allow minutes | Keep e2e to one slice spec and the release spec. Push the rest to unit tests on the pure model and the camera math |

---

## 7. The fastest path to a playable 3D vertical slice

### 7.1 What the director gets

- **Scope:** an APK, portrait, one thumb, first person.
- **Opening:** the surface camp at dusk through the shaft mouth.
- **Stations:** six to eight, through Topsoil Roots to the Halden Hatch at 40 m. Breaking the hatch plays the reveal of the first Glowroot Caverns vista, then two Glowroot stations.

At each station:
- **Dig:** tap or hold the 7-cell way-face. The tool in hand swings; cracks grow; shards and chips fly; ore glints.
- **Buy:** the Pick card and the BEST crew card are always one tap away.
- **Crew:** the Shovel Hand appears on the left wall and the Pick Crew on a ledge, visibly striking. Their output is one haul counter.
- **Chests:** a chest in the face or in a niche; a tap opens it in the focus view.
- **Relic:** one relic niche with a Strike ring.
- **Advance:** clearing the face opens the tunnel mouth (a glowing octagon plate); one tap glides to the next station.

Around the stations:
- **Guidance:** the goal bar is always visible, the tutorial is guided, the ghost hand points.
- **Offline:** after time away, the camera glides through what the crew dug and one tap collects the haul.
- **Systems shown:** none beyond these (§0 point 11).

### 7.2 Workstreams (three in parallel; new files beside the old ones)

**WS-A, world and render**

| Step | Files | Reuse | New or changed |
|---|---|---|---|
| A1 | `world/descent/RingWorld.ts` | as is, minus the cut and apron | drop `RING_CUT_Z` reads, `openBack` |
| A2 | `world/descent/station.ts` (new) inside `slab.ts`'s pass list | slab passes 1–3, `rowKinds()`, biomeKits, caverns dressing, v1 architecture helpers | Station grammar: a chamber about 12–20 m wide, a way-face plug of K slices holding the model's 7 cells per slice, side-wall crew anchors, a niche or two, the tunnel mouth, a glide polyline down to the next station. The first three stations are authored (the tutorial) |
| A3 | `render/mesher.ts`, `ChunkRenderer`, meshPool | as is | `MESH_OPTIONS.section = false`; delete the `DIG_BAND` constants |
| A4 | `render/terrainMaterial.ts`, `lighting.ts`, `BiomeLook.ts` | the v1 path | strip the section path; the look from the spike (soft ramp, palette from biomeLooks) |
| A5 | `render/hybrid/DepthScene.ts` (new facade) | DescentScene's API, LightingRig, LanternField, PostFX, GpuParticles (remove the z planes), Shards (material layers), PropRenderer, StructureRenderer, Lanterns, setPieces, VistaBackdrop | wire everything for a station frame; `pickRay(ndc)` = raycastVoxels + `PropRenderer.raycast` |
| A6 | `render/hybrid/Viewmodel.ts` (new) | VoxBuilder, the `TOOL_FORMS` ladder, the lantern colour | a solid tool and lantern in the lower right, a 120 ms swing on tap, tiers 1–3 modelled; the lantern is the LanternField source |
| A7 | `render/hybrid/StationCrew.ts` | CrewRenderer's figure geometry and impact-frame phases | anchors on side walls and ledges |

**WS-B, camera, input, shell and HUD**

| Step | Files | Reuse | New or changed |
|---|---|---|---|
| B1 | `game/hybrid/FirstPersonCamera.ts` (new) | `ropeRide.ts` (port), `core/spring.ts`, `lockedVerticalFov` | station pose; hFOV lock about 52°; glide; look-at on tap; focus view (0.35 s, a 30 % dim from PostFX); reduced-motion crossfade; unit tests on the comfort limits |
| B2 | `ui/idle/TapSurface.ts` | the pointer ring, hold and cap | remove the column mapping; pass raw points through |
| B3 | `game/hybrid/FaceController.ts` (new; replaces DigController) | DigController's batching and records; v1 `MiningController.pick()`, `TapController` fat-finger | Entity first (chest, relic, mouth, lantern), then the face cell (ray → slice cell → model `col`), then the fat finger, then the cap. A face cell maps to the model's `(col, row)` |
| B4 | `game/HybridGame.ts` (new, from IdleGame) | boot, modes, fixed step, autosave, lifecycle, offline return, Back, crash, save | the station state machine (dig → mouth open → glide → arrive); the offline return glide |
| B5 | HUD | TopBar (gold and rate, depth), GoalBar, QuickBuy (Pick, BEST crew), one Sheet (Dig + Crew), GhostHand, FirstTimeCard, ReturnFeast, SealHud, layout.ts | Calm restyle; hide DepthRuler, SkillRow (except Dynamite), FacetHand and EventBubbles |
| B6 | `game/fx/*` | JuiceDirector, juiceBudget, CameraFx, Timeline, Chest and BiomeReveal ceremonies | caps per R4; ceremonies re-staged as focus views |
| B7 | `main.ts` | as is | construct HybridGame instead of IdleGame |

**WS-C, model, save, purge and tests**

| Step | Files | Reuse | New or changed |
|---|---|---|---|
| C1 | `src/idle/**` | everything | Add station bookkeeping (station index = floor(depth / K) or authored lengths; slices left; `mouthOpen`), plus `station:*`, `glide:*` and `focus:*` bus events. No change to the curves |
| C2 | The purge (§4) | — | in one pass; grep gate: `grep -rniE 'creature|bestiary|moth[A-Z:]|mimic|mole' src/idle src/i18n` returns only ambient-moth decoration |
| C3 | `save/types.ts`, `saveData.ts` | SaveSystem as is | v4: station state replaces floor and below; the v3 decision (R10) |
| C4 | `debug/idle.ts`, `tests/e2e/dd.ts` | the surface | `faceCells()`, `station()`, `glide()`, `focus()` |
| C5 | Tests | the pure unit tests stay green | new: `firstPersonCamera.test` (comfort limits), `faceController.test` (no miss), `station.test` (determinism; every face cell agrees with `rowKinds`; fill rules from station poses); e2e `hybrid-slice.spec.ts` (real touches: first tap breaks a cell, buy the pick, hire the crew, glide, chest focus, hatch, reveal, save and reload) |
| C6 | `tools/apk-sim.mjs`, `android/build-apk.sh`, `tools/econ-sim.ts` | the harness and the shell | update the play script; build the APK; a station-paced bot |

### 7.3 Order and dependencies

**Day 0 (before any slice code):**
- Lock the **seams** in one short doc:
  - the face mapping (7-cell rosette, K slices per station);
  - the `DepthScene` API;
  - the `FirstPersonCamera` API;
  - the new bus events;
  - Save v4.
- The look spike result must be in, or the slice starts on the stripped v1 shading with lower-frequency painters as a placeholder.

**Steps:**
1. **C2 and C1 first** (pure, fast; this unblocks everyone), with **A1 + A3** at the same time.
2. **A2 + A5** (the world shows a station) together with **B1 + B2 + B3** (taps strike the face in a test scene).
3. **B4 + C3** (it is a game: station loop, save), then **A6 + A7** (tool and crew in frame), then **B5 + B6** (HUD and juice).
4. **C5 + C6**: tests, the APK, apk-sim. Then the director's device.

**Size estimate:**
- New or adapted code is about 4–5k lines against the 65k kept:

  | Piece | Lines (about) |
  |---|---|
  | camera | 300 |
  | face controller | 250 |
  | station grammar | 600–800 |
  | scene facade, adapted from DescentScene | 700 |
  | game shell, adapted from IdleGame | 900 |
  | viewmodel | 250 |
  | HUD changes | 400 |
  | save v4 | 150 |
  | tests | 600–800 |

- This is one wave of three specialists, not a rewrite.

### 7.4 The slice gate

| Check | Pass condition |
|---|---|
| Static and unit | `tsc` clean; Vitest green apart from the known `it.fails` |
| Slice e2e | `hybrid-slice.spec.ts` green |
| Packaging | `apk-sim` green |
| Purge | the creature grep returns nothing (C2) |
| Comfort | the camera tests hold the §4.2 limits |
| Taps | F1: hit on screen in the next frame; 100 % of taps in the world region land (no miss) |
| Look | captures at 360 × 740, 390 × 844 and 412 × 915 of every slice station, the reveal and the focus view, judged against the Lumi Master grammar and the brand |
| Readability | no more than one focal effect on screen per beat; HUD weight within the 35 % rule |
| Device | one Android run: frame time, touch feel, audio. This is the first ever device measurement |

### 7.5 What not to do in the slice

- Do not port v1's walking, pathing, inventory, fuel or cold.
- Do not surface Rekindle, Weave, Breach, facets, contracts, daily or the Feats and Codex sheets. The model keeps running them silently or they stay locked.
- Do not rebuild the economy curves before a station-paced sim says what to change.
- Do not delete the 2D files until the slice gate passes; switch `main.ts` only.

---

## 8. Open questions for the design panel

1. **The face mapping.** Is it a 7-cell rosette with slices (zero economy change), or a different cell count (a recalibration of `KAPPA`, `curves.ts` and every price in "rows of gold")?
2. **Descent geometry.** Is the descent a declining tunnel (stations in a spiral inside the 64 × 64 footprint), stacked chambers linked by shafts and lifts, or a mix (shaft drops as glides)? RingWorld supports all three; the station grammar differs.
3. **Station length.** What is K? It sets the pacing of the glide beat (hybrids P9: 30–60 s per station).
4. **Where the crew digs.** On your face, beside it, or ahead of you on the next stations (the offline "dug ahead" image of P10)? The model's crew damage lands on the floor row today.
5. **The station roll (hybrids P5).** Is it in the world grammar (seeded per station) or in the Director?
6. **v3 saves.** Migrate the meta or treat them as legacy?
7. **The menu.** Is it a first-person view at the camp at dusk, or the old surface camera?
