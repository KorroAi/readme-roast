# DEEP DOWN, the finished game: the lead's brief

## 0. The director's decision (2026-10-21, final; it overrides everything older)

> "STOP everything! We go back to the first version of the gameplay: real 3D exploration. The only thing that changes is better
> visual quality, and everything in first person. We forget the clicker idea and the different gameplay. Stay with DEEP DOWN's
> first-version gameplay. Take the remaining credits into account and be efficient. Still take my earlier remarks into account:
> I want an incredible, beautiful, exciting, addictive, varied, immersive game. I leave the choices to you. Deliver the finished
> game."

**What this means:**
- **Gameplay:** the first version, restored from commit `9eb4166` into the working tree, is the game. It has:
  - real 3D voxel exploration underground, and mining of any block;
  - the camp and trips with the lantern;
  - the backpack, storage and the workbench, with crafted upgrades;
  - discoveries, the journal, the Halden mystery, the rune doors, the rift;
  - records and the trip loop.

  The idle clicker, the hybrid "nodes" and their economies are gone. They stay in git history only: commit `7558572` holds the
  hybrid and `04587cc` the idle version.
- **First person everywhere.** The player never sees the explorer. In view are the pickaxe (right) and the lantern (left), the
  first-person "viewmodel".
- **A big visual upgrade:**
  - lighting, shadows and professional shaders;
  - the "Lantern Voxel" look the director picked: chunky bevelled stone, a warm lantern pool against cool stone, glowing crystals;
  - beautiful and free of glitches.
- **Answer every earlier remark about the first version:**

  | The director's complaint | What answers it |
  |---|---|
  | mining is horrible | tap a block and it mines to the end, with satisfying feedback; holding mines continuously |
  | the controls are unpleasant | simple first-person touch controls (below) |
  | the caverns are horribly empty | dense, varied content |
  | nothing is indicated, no help, no tutorial | an objective always on screen, guidance, a short tutorial |
  | no fun, nothing rewarding or addictive | the loops of §3 |
  | the last APK: visual glitches, far too many animations, illegible | the calm rules of §2.4 |

- **No creatures** (an earlier ruling), and no monster or companion mechanics. The first version's lumen moths become drifting
  glow spores: ambient light motes that carry no gameplay.
- **Efficient.** One round of three specialists in parallel, then the lead's gate and an APK. A short polish round only if the
  gate needs one. Spend effort where the player sees it.

## 1. First person and controls (specialist FP)

- **Camera.**
  - First person at the eye: 1.62 m standing, a portrait-correct lens with about 75–80° vertical FOV, near plane ≥ 0.05 m with a
    guard so walls never clip into view.
  - Smooth: no head bob by default (an optional gentle bob setting is fine). Gentle damping on look. Never any roll.
  - The explorer model is never rendered in play. The menu may show the camp in first person.
- **Viewmodel.**
  - The pickaxe in the lower right and the lantern in the lower left, drawn in their own pass so they never clip.
  - The pickaxe swings at each strike, with contact timing that matches the mining hits. The lantern sways very slightly with
    movement and is still at rest.
  - The pickaxe tier changes the head model and colour. The lantern tier changes the cage and the light.
  - Port from `git show 7558572:deep-down/src/render/hybrid/Viewmodel.ts`, then adapt.
- **Touch controls (portrait, one thumb first):**
  - **Tap** a block within reach (≤ 3.5 m): mine it to the end (the first version's tap-to-act).
  - **Tap** a block beyond reach, the floor, a ledge or a stair: walk there along a path (the first version's
    `TapController` BFS), then act on arrival.
  - **Tap** an object (chest, workbench, door, rope, relic, note): walk to it and use it.
  - **Drag** anywhere: look. Yaw is free, pitch is limited to ±75°. Sensitivity comes from Settings.
  - **Hold** on a block: mine continuously, moving to the next block of the same kind under the thumb.
  - **Optional joystick:** a floating joystick on the left third, appearing only where the thumb lands, for players who want to
    walk freely. Tap-walking stays the primary way to move.
  - **Buttons:** jump only where needed (a small button, or auto-step and auto-jump on ledges ≤ 1 block, which is preferred), bag,
    and pause.
  - **The rule:** no tap does nothing. A tap on the sky or the dark turns the view slightly toward it, or does a lantern raise.
- **Movement feel:** walking at about 3.2 m/s with eased starts and stops; auto-step up 1 block; ladders and ropes as rides; fall
  damage kept, but forgiving.
- **HUD for first person:**
  - Calm and branded: octagon plates, Lintel numerals.
  - Top: depth, lantern oil, the backpack count, ≡.
  - One objective line, always on.
  - A small crosshair dot that brightens over a minable or usable target.
  - Mining progress as cracks on the block and a thin ring at the dot. No big rings and no number spam.
  - A HUD element never covers the centre of the screen.
- **Tests:** update `tests/e2e/**` (desktop, slice, world, release, tap) for first person, with real touches at 390 × 844.
  `tools/apk-sim.mjs` and `tools/ui-check.mjs` pass.

## 2. The visual upgrade (specialist VIS)

The reference is the director's pick: `reference/spike-lantern/` (code) and
`/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/spikes/lantern/final-*.png` (images). The
target: every in-game first-person view looks at least as good as `final-arrival.png`, and the best views better.

Port into the first version's renderer the best of what was built since. Read it with `git show 7558572:deep-down/src/render/...`:
- `light/**` is the lighting stack:
  - one PBR shading chunk (GGX specular plus wrapped Burley diffuse);
  - lantern cube shadows with soft PCF and normal-offset bias;
  - irradiance from the voxel LightField plus an SH ambient;
  - half-res GTAO and half-res volumetric light shafts with temporal accumulation;
  - box-projected reflection probes;
  - an AgX tonemap with a LUT, energy-clamped bloom and FXAA;
  - presets and a feature-ladder governor.
- `lantern/**` is the HD stone painter (worker and cache), the 0.5 m bevel mesher ideas and the prop surfaces.

Adapt; do not transplant blindly. The first version's world is 1 m voxels with its own mesher (dual-cell chamfer, smooth normals)
and its own material system (courses, painters, biplanar). Keep what works and upgrade the surface and the light.

**Hard rules** (lessons from "horrible, glitchy, illegible"):
1. **Clear air.** Volumetrics appear only in real beams (shafts, lamp cones, the rift light). No global haze. Fog only beyond
   12–18 m, in a hued dark.
2. **A readable lantern pool** 6–8 m across. Darks hued at 0.04–0.10 display, never crushed black or flat over large areas.
   Exposure is 1.0 ± 0.15: raise the lights, not the exposure.
3. **One focal point per frame:** the thing you can mine or use, a lit landmark, or the way on.
4. **Stone in HD.** No visible texel stair-steps at 1 m at DPR 2, no swimming, no visible repetition, bevels on every edge,
   strata and rubble.
5. **No glitches:** no z-fighting, no seams, no near-plane slivers, no floating props, no light leaks through walls, no flicker.
6. **Calm FX:** at most 3 moving foreground effects. A break gives a short crumble of ≤ 9 chunks and a few dust motes, plus the
   drop flying to the bag. No screen shake on mining; no rings, flashes or chroma.
7. **Performance:** Balanced holds ≥ 45 fps on a 2022 mid-range phone (modelled with `tools/perf.mjs`): ≤ 150 draw calls and
   ≤ 250k triangles visible; shadows 256² on Balanced and off on Battery.

**Proof:**
- Captures from the real game at 390 × 844 @2: the camp, the tunnel, the Hollow, the hall, the shrine, the gate, the rift, plus 2
  deeper spaces.
- Before and after pairs, and at least 3 rounds.
- The beauty rubric at `docs/hybrid/SPEC.md` §8.11: every criterion ≥ 3, mean ≥ 4, Light ≥ 4.5.

## 3. Content, loops and progression (specialist CONTENT)

The first version's final-pass plan (`docs/final-pass/{plan,workstreams,fun-world,fun-play,fun-content}.md`) is the source.
Waves W1 and W2 were done. W3 was in progress: `w3-rift-runes-bloom` and `w3-progression-screens`. W4 and W5 were not started:
`w4-feel-juice`, `w4-home-opening-hud`, fun-play and fun-content. Finish what makes the game complete and compulsive, choosing
what matters most:
1. **Never empty.**
   - Every space has something to find within 10 m: ore veins of several tiers, crystal clusters, gem pockets, Halden caches and
     chests, relics, notes and logs, rune fragments, secret alcoves behind cracked walls.
   - Ambient wonder: glowing fungi, dripping water, roots, spores. No creatures.
   - Check every space with `tools/poi-density.ts`.
2. **Varied and deep.** Make sure the descent keeps revealing new kinds of place, and a finale:
   - Add new deeper spaces beyond the rift if the world allows it (the first version streams zones; read `src/world/gen/**`),
     such as a Crystal Grotto, a Glowroot cavern or Magma Veins, each with its own materials, light colour and finds.
   - Otherwise enrich the existing zones until each is distinct and memorable.
3. **The addictive loop.**
   - The trip: go down with the lantern, mine and find, return to the camp to bank.
   - Then craft upgrades at the workbench:
     - pickaxe tiers that open new rock;
     - lantern tiers: longer and brighter;
     - backpack size;
     - boots for the fall limit;
     - each with a visible change in first person.
   - Then go deeper: new zones, gates and rune doors open with what you found.
   - Each trip should give a new find or unlock. Records and the trip summary make you want one more trip.
4. **Achievements.** Journal feats (first copper, first crystal, depth milestones, every discovery, secrets, relics), each with a
   calm toast, a journal page and a small reward. Lifetime stats.
5. **Guidance.**
   - The objective line is always on and always says what to do next.
   - A short tutorial in the first minutes, taught by doing: look, tap to mine, tap to walk, the bag, return to camp, craft.
   - The first version's `Guidance.ts` and `NextStep.ts` are the base.
   - Hints appear when the player is stuck.
6. **An ending** (the gate and the rift finale, as planned), then free play.
7. **The moths become glow spores** (§0). Discovery names stay non-creature.
8. **Text** goes through `t()`. The save stays backward compatible with v2 saves, and the version is bumped if a field changes.

## 4. Ownership (disjoint; anyone may read anything)

| Specialist | Port | Owns |
|---|---|---|
| **FP** | 4174 | `src/game/{CameraRig,PlayerController,TapController,touchCamera,MenuCamera,MiningController,aimAssist,ropeRide,FrameGuard,GameUi}.ts`, new `src/game/fp/**`; `src/input/**`; `src/ui/**` (except text tables); `src/entities/**`; `src/main.ts`, `index.html`; `tests/e2e/**`; `tools/{apk-sim,ui-check,play}.mjs`; their unit tests |
| **VIS** | 4175 | `src/render/**` (incl. new `src/render/light/**`); `src/world/light.ts`; `src/game/effects/**`; `src/lab/**`, `visuallab.html`; `tools/{capture,png,perf}.mjs` and any new capture tool; their unit tests |
| **CONTENT** | 4176 | `src/world/**` except `light.ts`; `src/gameplay/**`; `src/config/**`; `src/save/**`; `src/audio/**`; `src/i18n/**`; `src/game/{Progression,WorldFeatures,WorldSession,Guidance,Drops,Stations,Survey,Runes,runeDoor,moths}.ts`; `tools/poi-density.ts` and the world tools; their unit tests |

**Shared hub: `src/game/Game.ts`.**
- FP owns it.
- CONTENT may make small, surgical hook edits there, each in a clearly marked block (`// CONTENT:`): re-read the file right before
  each edit, never rewrite it wholesale, and keep tsc green.
- VIS reaches the game through `Renderer` and the scene objects. If VIS truly needs a hook, VIS follows the same rule.

## 5. Ground rules

- No git (the lead commits).
- Keep `npx tsc --noEmit` green at every save.
- Evidence for every claim: test pass lines, and captures opened with the Read tool.
- Real touches at 390 × 844 in e2e. One heavy browser job at a time; the machine has 4 CPUs and SwiftShader.
- MUST first.
- About 4–5 hours, efficient: no long reports, no redundant runs.
