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
