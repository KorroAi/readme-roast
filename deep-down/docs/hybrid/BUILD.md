# DEEP DOWN — The Lantern Crawl: build plan

`SPEC.md` (same folder) is what we build; this file is how. A day 0 for the lead, then four waves of 3–4 specialists working in
parallel on **disjoint files**. Wave 1 is a playable, beautiful vertical slice delivered to the director's phone as an APK as fast as
possible. Each wave ends at a gate run by the lead.

| Wave | Name | What exists at its gate |
|---|---|---|
| Day 0 | Decisions | the director's look pick on the phone, the Lumi Master trailer notes, the faceted spike copied into the tree, the seams below agreed, the flaky test quarantined, the baseline measured |
| **W1** | **The Lantern Slice** (APK) | first person at the camp, the six authored Topsoil nodes, the Halden Hatch and the Glowroot reveal, Glowroot chambers to 119 m (the Root Knot shown closed); tap, hold, Pick, crew lines 0–2, BEST; breakthroughs with first light; lamps, skin, stands, the focus pop, the relic ring, Dynamite; the objective line and the six-step tutorial; the leash, offline and the return; save v4; the visual bar (SPEC §8); the 2D cutaway deleted |
| W2 | Roads, Pulse, Crystal and Works | the Pulse, drafts, secrets and vaults, roads, keystones, auto-delve, events, the Codex, Feats, Chart, contracts and daily, the camp menu by Fortune, haul carts, Survey Lamps, sumps, hollows, Lantern Sense; the full Glowroot kit, Crystal Grotto and Halden Works with their seals and Vistas; music layers |
| W3 | Démesure and the deep | biomes 4–13 and the Echo strata, their seals and Vistas; Rekindle at the Ember Shrine, Weave, Breach; bore classes and verb scaling; tool forms to Lantern Edge; the lantern ladder; records, ghost and planted lanterns; the lore complete; calibration to the week |
| W4 | Polish, verification, release | every acceptance test of SPEC §13 green, the device protocol run, performance on budget, the docs rewritten, a release candidate APK and AAB |

---

## 0. Ground rules (every wave)

1. **One shared working tree, disjoint ownership.** Each specialist writes only the files their workstream owns (the tables per
   wave). Anyone may read anything. A file not listed belongs to the lead (notably `package.json`, `vite.config.ts`,
   `playwright.config.ts`, `vitest.config.ts`, `tsconfig.json`, `android/**`, `src/version.ts`, `src/config/{runes,tiles}.ts`,
   `docs/**`). A change needed in someone else's file goes to its
   owner through the lead, never as a drive-by edit.
2. **No git for specialists.** No commit, branch, stash, checkout, reset or worktree command. The lead reviews and commits at each
   gate (and at checkpoints if asked).
3. **Contracts first.** In the first 45 minutes each specialist publishes the stubs others consume (types and signatures that
   compile, placeholder bodies). After that a contract only grows; a breaking change needs the lead.
4. **tsc green.** `npx tsc --noEmit` passes at every checkpoint (hours 2, 4) and at the gate. A red error in another owner's file is
   reported to them, not fixed by you. Run your own tests during the wave (`npx vitest run tests/unit/hybrid/<yours> --maxWorkers=1`);
   the full `npm test` only at checkpoints.
5. **Evidence for every claim.** A MUST is "done" only with its evidence in the report: the test file and the pass line of its
   output; the capture path and the metric values printed by `tools/png.mjs`; the sim table; the APK path and the `apk-sim` log.
   "It should work" is not evidence. The lead re-runs a sample of every report at the gate; a claim that does not reproduce reopens
   the item.
6. **Ports and CPUs.** The machine has 4 CPUs and a software GPU (SwiftShader). At most **one heavy browser job per specialist at
   a time** (Playwright, `tools/hybrid-capture.mjs`, `tools/perf.mjs`, `tools/apk-sim.mjs`). Each specialist has a port and builds
   into its own directory through the existing `playwright.config.ts` rule:

   | Specialist slot | e2e port | Build directory | Results |
   |---|---|---|---|
   | A | 4173 | `dist/` | `test-results/` |
   | B | 4174 | `.e2e-dist-4174/` | `test-results-4174/` |
   | C | 4175 | `.e2e-dist-4175/` | `test-results-4175/` |
   | D | 4176 | `.e2e-dist-4176/` | `test-results-4176/` |

   Run as `DD_E2E_PORT=4175 npx playwright test tests/e2e/<spec>`. Prefer unit tests and pure simulations in Node; a browser run is
   for what only a browser can prove (real touches, frames, WebGL, layout).
7. **Real touches.** Every Playwright test runs at **390 × 844** (`hasTouch: true`, DPR 1) and drives the game with real touches
   through CDP (`tests/e2e/touch.ts`). `window.__DD__.hybrid` only sets up states and reads results (SPEC §13.3).
8. **Captures** go to `artifacts/hybrid/w<N>/<slot>/` (ignored by git), taken with
   `node tools/hybrid-capture.mjs --size 390x844 --dpr 2` (and `360x740`, `412x915` where listed). The lead scores them with the
   beauty rubric (SPEC §8.11); the director scores three on-phone screenshots per look round.
9. **Text** goes through `t()`. Section files: `src/i18n/en/idleCore.ts` and `idleLore.ts` (A), `idleWorld.ts` (B), `idleUi.ts` (D).
   D owns the assembly `src/i18n/en.ts`.
10. **Events.** `src/idle/bus.ts` (A) defines every event name and payload. Others request additions through the lead; A adds them
    within the hour.
11. **No second game.** New files are built beside the old ones until the **purge checkpoint** of W1 (hour 2:30), when D switches
    `src/main.ts` to the new game and every owner deletes the 2D files listed for them (§7). After that nothing of the cutaway or of
    v1 survives as a mode, a flag or dead code.
12. **The curves are frozen.** Nobody changes the HP curve, prices or multipliers before the node-paced bot says what to change;
    then only A, with the lead. The knobs, in order: K per biome, `CHAMBER_EQ`, the leash base, the side multipliers, the Ember 25.
13. **Time.** About 5–6 hours per specialist per wave: contracts (0:00–0:45), MUST work (to ≈ 3:30), tests and e2e (to ≈ 4:30),
    captures and fixes (to ≈ 5:30), then the gate. **MUST** items gate the wave; a **SHOULD** may slip and the lead moves it to the
    next wave's MUST list.

---

## 1. Day 0 (the lead, before W1; about 2 hours)

| # | Task | Output |
|---|---|---|
| 0.1 | **Look review on the phone (D1).** Send the three spike sheets to the director: `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/spikes/crystal/sheet.png` (Faceted, the default), `lantern/final-sheet.png`, `storybook/sheet.png`. Ask one question: "which one is the stone you want, at arm's length?" Note that the HUD in all three is not ours (SPEC §8.2) | the pick, recorded in `docs/hybrid/DECISIONS.md` (lead) |
| 0.2 | **Lumi Master frames (20 min).** A person with video access watches the trailers in `research/lumi-master.md` §5.9 and notes tone steps per form, fog or not, the HUD area. If nobody can, W1 proceeds with SPEC §8 as written and the item stays open for W2 | three notes in `DECISIONS.md` |
| 0.3 | **Copy the faceted spike into the tree** (read-only source: `/home/user/readme-roast/.claude/worktrees/wf_cd9faf19-b99-1/deep-down/src/spike/`): `facets.ts`, `material.ts`, `mesher.ts`, `noise.ts`, `kit.ts`, `post.ts` → `src/render/facet/spike/` as a reference copy (C ports from it; nothing imports it at the gate) | the files, tsc green |
| 0.4 | **Save decision:** migrate the v3 meta to v4 (SPEC §10) | in `DECISIONS.md` |
| 0.5 | **The creature grep gate:** `tools/purge-gate.sh` running the SPEC §13.1 command and exiting 1 on any hit outside its allow-list | the script |
| 0.6 | **Quarantine the flake:** `tests/unit/mesh-worker.test.ts` fails under parallel load (passes alone); mark it sequential | `npm test` stable |
| 0.7 | **Baseline:** `npx tsc --noEmit` (exit 0), `npx vitest run` (expect 532 pass, 4 `it.fails`), `./android/build-apk.sh` builds today's APK | the log in `DECISIONS.md` |
| 0.8 | **Seams:** circulate §2 to the four specialists before W1 starts | — |

---

## 2. The seams every wave builds on

| Seam | Owner | Contract |
|---|---|---|
| `src/idle/bus.ts` | A | every event of SPEC §12.3 with its payload |
| `src/idle/model/nodes.ts` | A | `NodeAction` union (`strike(target)`, `relight(lampId)`, `focus(id)`, `resolve(id, input)`, `exit(exitId)`, `stand(id)`, `raise(point)`, `skill(id)`, `pulse()` [W2], `road(id)` [W2]); actions enter through `stepIdle(state, dt, taps, actions, bus)`; `nodeView(state)` = {node, phase, stand, sliceIndex, leashOpen, harvested, lit, seen, charted} |
| `src/idle/model/chart.ts` | A | `nodeAt(lifeSeed, i): NodeTopo` = {i, biome, depthTop, K, kind, fork?, road?}; `nodeOfDepth(lifeSeed, d)`; `contents(runSeed, topo, template): NodeContents` (socket id → content); `TOPSOIL_NODES` |
| `src/world/hybrid/kits/types.ts` | B | `TemplateInfo` = {id, biome, kind, sockets {veins, gems, lamps, feature, stash, keystone, secret, skin}, stands [{id, reachSockets[]}], exits} as pure data; `templateFor(lifeSeed, topo): TemplateInfo` (pure, no Three) |
| `src/world/hybrid/layout.ts`, `deepPath.ts` | B | `deepPath(lifeSeed, d)` → {pos, dir, kind, slice}; `placeNode(lifeSeed, topo, template): NodePlacement` = {drift {origin, dir, up, length, faceFrame}, chamber {box, stands [{id, pos, yaw, pitch, facings}], exits [{id, pos, plate, ride: Polyline}], sockets [{id, kind, pos, bound}]}} |
| `src/render/hybrid/types.ts`, `DepthScene.ts` | C | `attach(state, chart, layout)`, `frame(dt, fxDt, view: CameraPose)`, `faceCells(): CellRect[]`, `pick(x, y): Pick` (face cell, tappable, lamp, skin cell, deep rock, nav target, far point), `strike(pick, contactPx)`, `breakBlocks(cells)`, `crumble(slice)`, `breach(node)`, `firstLight(node, t01)`, `relight(lampId)`, `focusPop(id, on)`, `lanternRaise(point)`, `rim(id or null)`, `viewmodel` {swing, form, temper, heat, mirror, lanternLevel}, `crew(lines)`, `look(biome)`, `shake(deg, ms)`, `stats()` {calls, tris, fx {fg, ambient, particles, area}}, `idBuffer()` (tests) |
| `src/game/hybrid/FirstPersonCamera.ts` | D | `pose(): CameraPose`, `shot`, `play(move)`, `skip()`, `moving`, `log()`; pure maths plus one `apply(THREE.PerspectiveCamera)` |
| `src/game/hybrid/NodeController.ts` | D | `resolve(touch, frame): NodeAction` (pure; SPEC §2.3–§2.4) |
| `src/debug/hybrid.ts`, `tests/e2e/dd.ts` | D | `window.__DD__.hybrid` (SPEC §13.3) |
| `src/save/types.ts` | A | `SaveV4` (SPEC §10) |

---

## 3. Wave 1: The Lantern Slice

**Goal at the gate.** The director installs one APK and plays, in portrait with one thumb: a first launch straight into the
plug face at the Halden camp at dusk; taps that land under the thumb in the next frame and never miss; the Pick card, the Shovel
Hand, the Pick Crew and the Mine Cart; the six Topsoil nodes (the Root Cellar breakthrough and its first light, the Copper Lode,
the Lamp Room charted, the Reliquary niche and its ring, the Cache, the Lift Bottom); Dynamite on the rack; the Halden Hatch fight
and the Glowroot reveal with the Other Lantern far below; Glowroot chambers to 119 m with a second stand and a chalk arrow; the
Root Knot shown closed ("Opens in the next build"); the objective line in every frame and the six-step tutorial; locking the phone
in Glowroot and coming back to "+N chambers" and a dark mouth waiting for the lantern; the visual bar of SPEC §8. The cutaway is
gone.

**A feel build first.** At hour ≈ 3:30 the lead builds a **checkpoint APK** (the drift, the face, taps, holds, the Pick card, the
first breakthrough into the Root Cellar, creep variants A and B in Settings) and sends it to the director for the creep A/B and the
reach read (D2, D3) while the wave finishes. The gate APK follows.

**Out of W1:** the Pulse (the lantern is a viewmodel only), roads, keystones, events, the Codex, Feats, Chart and Board sheets,
sumps, hollows, Lantern Sense, auto-delve, Survey Lamps, haul carts, Rekindle and later. The model keeps them dormant.

### 3.1 Specialist 1A: model, economy, save, purge (pure TypeScript; port 4173)

**Owns:** `src/idle/**` except `src/idle/config/biomeLooks.ts`; `src/core/**`; `src/save/**`; `src/config/balance.ts`;
`src/i18n/en/idleCore.ts`, `src/i18n/en/idleLore.ts`; `tools/econ-sim.ts`; `tools/purge-gate.sh` (after day 0);
`tests/unit/idle/{big,cells,chests,days,director,goals,hints,noPunishment,notation,offline,pacing,prestige,progression,run,save-v3,seals,shaft,tap,tutorial,widgets}.test.ts`,
`tests/unit/idle/w2fixture.ts`; `tests/unit/save-*.test.ts`; new `tests/unit/hybrid/{nodes,chart,leash,offlineLeash,tutorialSpacing,saveV4,purge,nodeBot}.test.ts`.

**Contracts (by 0:45):** `bus.ts` (all SPEC §12.3 events); `nodes.ts` (`NodeAction`, `nodeView`, the extended `stepIdle`
signature); `chart.ts` (`NodeTopo`, `NodeContents`, `TOPSOIL_NODES`); `src/save/types.ts` (`SaveV4`).

**Reuse:** the whole model (`research/reuse.md` §3.9): `shaft.ts` (`rowKinds`, `applyHit`, crumble, `settleFloor`), `tap.ts`,
`run.ts`, `crew.ts`, `offline.ts` (closed form, first-sight stop, Chest Rack), `chests.ts`, `seals.ts`, `widgets.ts` (Strike for the
relic ring), `goals.ts`, `tutorial.ts`, `hints.ts`, the sims; `SaveSystem.ts` as is.

**MUST**
1. **The purge** (SPEC §12.3 item 7) in the model, config, sims and `idleCore.ts` in one pass, by hour 2:30 (the purge checkpoint);
   `tools/purge-gate.sh` clean on A's files. Seal ids become mechanism ids; `fossilGolem`/`voidMaw` become `boneRam`/`voidEngine`;
   the Lucky Moth becomes the Drifting Ember (dormant in W1); Kindred becomes Lamplighter (dormant).
2. **`chart.ts`:** `TOPSOIL_NODES` (drifts 5, 6, 7, 7, 7, 8; C1 Root Cellar = scripted Wood chest, three root-knot veins, two
   lamps; C2 Copper Lode; C3 Lamp Room = a burning lamp, the "Day 40" note, two cold lamps; C4 Reliquary niche; C5 Cache with a
   Copper-floor chest; C6 the Lift Bottom = Seal hall with the Hatch); Glowroot generated (K = 7, Threshold first, contents classes
   and pity of SPEC §4.4, a landmark every ≤ 6 chambers); the Root Knot flagged closed for this build. Per-run contents re-roll; the
   lifetime topology does not.
3. **`nodes.ts`:** phases (drift, chamber, ride); the player's node versus the crew's dig front; **the leash** (L = 0 in Topsoil, 3 in
   Glowroot; never a seal, an unseen Vista or a first sight); Works haul at 1.00 gold per damage; chamber tappables, skin cells and
   lamps as entities (`CHAMBER_EQ` = 10; gold law L6; skin 0.6×; pockets 12 %); seen and charted bits; stands; focus resolution
   (chests through `chests.ts` with the honest roll-up; the relic ring through the Strike widget's grades; notes to lore); skipped
   items to the Chest Rack; nothing lost (L11).
4. **Offline:** `offline.ts` gains the leash stop; the return result lists up to 3 node ids for the glimpses and the first dark
   chamber; efficiency and caps as SPEC §5.3.
5. **Crew bar:** rig periods quantised to multiples of 0.9 s with damage per impact rescaled (DPS unchanged, asserted).
6. **Guidance:** `tutorial.ts` rewritten to the six steps (SPEC §6.3) plus the lesson sequencer with the L13 spacing and one prompt
   at a time; node goals in `goals.ts` (SPEC §6.2 items 1–3, 5, 7, 9, 10); `path.ts` steps for 0–120 m; hints of SPEC §6.5 that
   exist in W1.
7. **Save v4** end to end; the v3 → v4 migration of the meta with the one-time notice flag; v1/v2 stay legacy.
8. **The node-paced bot** (`src/idle/sim/nodeBot.ts`) and `npm run sim -- nodes`, printing SPEC §5.12's table for 0–120 m with the
   glide, ride and ceremony times of SPEC §3. Report the numbers; tune only K and `CHAMBER_EQ`, with the lead.
9. **Text:** every W1 line of `idleCore.ts` (cards, goals, tutorial, hints, first-time cards); `idleLore.ts`: the three Topsoil
   notes, three Glowroot notes and the Hatch's seal card.

**SHOULD:** the Pulse meter and its oil pre-fill as dormant model code; the Survey Lamps line priced but hidden.

**Unit tests:** U-M1–U-M9, U-TUT1, U-TUT2, U-SAVE1, U-SAVE2, U-PURGE (model half); every kept pure test green; the four `it.fails`
in `days.test.ts` stay honest. **Sim:** S1 (0–120 m rows), S3, S4, S5.

**Evidence in the report:** the Vitest pass lines; the `sim -- nodes` table; the purge-gate output; the save fixture round trip.

### 3.2 Specialist 1B: world (path, layout, kits, stamping; port 4174)

**Owns:** `src/world/**`; `src/config/blocks.ts`; `src/i18n/en/idleWorld.ts`; `tools/fill-scan.ts`;
`tests/unit/idle/{fill,ring,slab,slabFingerprint,tutorialCrystals}.test.ts`, `tests/unit/idle/ringFixture.ts`; `tests/unit/world.test.ts`;
new `tests/unit/hybrid/{deepPath,layout,nodeStamp,kits,fillStands}.test.ts`.

**Contracts (by 0:45):** `src/world/hybrid/kits/types.ts` (`TemplateInfo`, `templateFor`); `layout.ts` (`NodePlacement`,
`placeNode`); `deepPath.ts` (signature).

**Reuse:** `RingWorld`, `slabWorker`, `slabLoader`, `slabLight`, `fingerprint` (KEEP); `slab.ts` passes 1–3; `biomeKits.ts`'s data
(creatures purged); `caverns.ts`'s dressing grammar and weighted `pick()` (re-keyed from the cut to stand frames); `fill.ts`; v1's
architecture vocabulary mined from `git -C /home/user/readme-roast/deep-down show 9eb4166:deep-down/src/world/gen/generateWorld.ts`
(`column()` shafts, stair flights on piers, the portal gate, the corbelled shrine, the arched bridge, `crystalSeam()`, dripstone,
the lamp at every landmark).

**MUST**
1. **`RingWorld`** without the cut: `RING_CUT_Z`, its apron and `openBack` removed; light wraps y only (unchanged).
2. **`deepPath.ts`** and U-W1 **first** (determinism, the 64 × 64 footprint, lap gap ≥ 12 m), before any kit art.
3. **`layout.ts`**: `placeNode` and U-W2 (no overlap, ring bounds, every stand's frustum to 20 m clear). Roads are W2, but the
   layout leaves room for a parallel branch in a lap and the test names the fallback.
4. **`nodeStamp.ts`** replacing slab passes 4–9: drift tubes (3.0–3.6 m, the octagon heading flare at the face), face plug voxels
   (solid, never meshed), chamber volumes, skin cells, lamp sockets, survey rings, chalk-arrow anchors, Way Down volumes; passes 1–3
   keyed by path depth; U-W3 (face cells equal `rowKinds` under the snake map).
5. **Kits:** the six authored Topsoil chambers to SPEC §7 (the Root Cellar's sky shaft and shelves; the Copper Lode's ledge with a
   survey ring; the Lamp Room with two stands; the Reliquary niche; the Cache's collapsed crates and floor cracks leaking green; the
   Lift Bottom's dead hoist cage and floor hatch socket), the Glowroot Threshold (a root balcony with a gap down toward the Other
   Lantern), a Glowroot mini-kit of **4 templates × 2 sub-zones** (one Root Hall with two stands and a chalk arrow), the Root Knot
   hall; drift dressing (timber sets every 2.5 m, rails, sleepers every 0.6 m, crew lamp sockets every 8–12 m); Way Down polylines
   per exit type (rope ladder, timber stair, root chute). Every template obeys reach and size (U-W4: strike types ≤ 3.5 m from their
   stand, lamps ≤ 2.5 m and ≥ 0.55 m across, valuables at 0.5–1.4 m or ≥ 3 m away on the floor) and is authored deep and tall
   (8–14 m wide, 10–20 m deep, 6–16 m tall).
6. **Pre-lighting:** chambers are generated and lit in the slab worker ≥ 2 drifts ahead; the worker reports each chamber's
   first-light fill target to C (no light propagation on the breach frame).
7. **Fill and repetition:** `fill-scan.ts` re-aimed at stand frustums (U-W5, incl. "a new face feature every ≤ 8 slices"); U-W6.
8. **C3 stand captures:** 10 stands (all six Topsoil chambers, the Threshold, three Glowroot templates) through C's
   `tools/hybrid-capture.mjs`, proving the window composition, the wonder in the top third and ≥ 4 tappables in frame.
9. **Text:** biome, chamber, seal and exit names in `idleWorld.ts`; creature and Warden strings removed.

**SHOULD:** a fifth Glowroot template; the landmark "Root Balcony" variant at 80 m.

**Delete at the purge checkpoint:** `src/world/descent/tutorialRows.ts`; creature anchors in `slab.ts`, `caverns.ts`, `fill.ts`,
`biomeKits.ts`; `tests/unit/idle/tutorialCrystals.test.ts`; the cut-coupled parts of `slab.test.ts` and `ring.test.ts` (rewritten).

**Evidence:** Vitest lines for U-W1–U-W6; `fill-scan` output; the 10 C3 captures with their metric lines.

### 3.3 Specialist 1C: look and render (port 4175)

**Owns:** `src/render/**`; `src/idle/config/biomeLooks.ts`; `src/game/effects/**`; `src/entities/**` (to delete); `src/lab/**`,
`visuallab.html`; `tools/hybrid-capture.mjs` (new), `tools/png.mjs`, `tools/perf.mjs`, `tools/look-capture.mjs`,
`tools/descent-capture.mjs`, `tools/capture.mjs`; `tests/unit/idle/{composite,fracture,lut,particles,look,sectionField}.test.ts`;
`tests/unit/{terrainMaterials,props,structures,voxModel,mesh-sculpt,mesh-worker,character,moths}.test.ts`; new
`tests/unit/hybrid/{faceRenderer,facetMaterial,viewmodel,renderCaps}.test.ts`.

**Contracts (by 0:45):** `src/render/hybrid/types.ts` (`CellRect`, `Pick`, `CameraPose`, `FxStats`); `DepthScene.ts` (the full API
of §2 as stubs); `Viewmodel.ts` API.

**Reuse:** `Renderer`, `PostFX` (re-tuned), the LUT pipeline, `QualityGovernor`; `ChunkRenderer`, `meshPool`, `meshWorker`,
`mesher.ts` (section off, `DIG_BAND_*` and `SECTION_*` deleted, the facet pass added); `lighting.ts` (the wrapped 3-step ramp);
`LightField`/`LanternField` (source moved to the viewmodel lantern); `GpuParticles` (the z-60/57 planes become a depth fade),
`Shards`/`fracture`/`rigidBatch`, `shardMaterial` (onto the facet material); `PropRenderer` (with `raycast`), `models`,
`descentModels` (chests, crystals, crates, runes; creatures deleted), `biomeProps`, `StructureRenderer` and builders; `SealRenderer`
(Wardens removed); `Lanterns.ts` (the Other Lantern); `CrewRenderer`'s figures and impact phases; `voxModel`/`VoxBuilder`; the
`TOOL_FORMS` data in `config/gear.ts` (read only). The spike copy in `src/render/facet/spike/`.

**MUST**
1. **The faceted surface:** port the spike's facet builder and its single surface material into `src/render/facet/` (ramp rows,
   hemisphere fill, the lantern, 4 per-pixel practicals, glints, emission, height fog, the first-light fill uniform, the Lantern
   Raise spot term) and wire it into `mesher.ts` (flat per-face normals, a tangential facet jitter deterministic per world position,
   vertex AO) and `ChunkRenderer`. Strip the section path from `terrainMaterial.ts`. U-LOOK.
2. **`DepthScene`** behind the §2 API: chunks, props, structures, the LightField and LanternField, PostFX (iris, shock, chroma and
   rays removed; vignette re-weighted), BiomeLook grades for Topsoil and Glowroot (exposure 1.0 ± 0.15, saturation ≤ 1.0, bloom
   threshold ≥ 1.0, strength 0.15–0.25), `pick()` through `raycastVoxels` and `PropRenderer.raycast` with the 3.5 m reach.
3. **`FaceRenderer`:** instanced irregular fracture plugs (6–10 variants per rock family, rotated and mirrored), the 2-3-2 bond in
   the octagon heading under a timber lintel, the snake map, procedural cracks from tap points, pierce holes, the 0.3 s crumble
   shake, nuggets half-sunk, the breach tells (hairline leaks in the promise colour, dust) in the last 3 slices; 1–2 draws.
4. **`ChamberProps`:** tappables instanced with the single amber rim; cold and relit lamps (relit = a per-pixel practical; written
   into the LightField after you leave, ≤ 1 incremental open per frame); survey rings; chalk arrows; bevelled chest, relic plinth,
   note and keystone models; the focus pop transform (to 1.8 m ahead, 1.4 m up, 0.3 s; a 30 % grade dim); skin cells breaking.
5. **`Viewmodel`:** its own camera (vertical FOV 58°); the lantern lower left and the tool lower right (≤ 12 % of the area, nothing
   in the central 50 % column); the Rusty and Copper forms plus temper steps; the per-tap contact pose solved onto the tapped point
   with a ≤ 0.1 m lunge and a 220 ms recovery; combo heat; perfectly still at rest and in glides; the left-handed mirror; the Lantern
   Raise lift.
6. **`NodeCrew`:** the Shovel Hand (lower-right nook), the Pick Crew (upper-right scaffold), the Mine Cart (floor-band rail) on the
   shared 0.9 s bar; no rig pixel inside a live block's tap bound (C8).
7. **FX within SPEC §8.7:** block breaks (6–9 shards), the breakthrough wall-fall (10–16 shards), lit chips, the Dynamite blast,
   the Hatch split (≤ 40 shards, the 0.12 lift ≤ 150 ms); every count exposed through `stats()`; shakes only through
   `DepthScene.shake` when D's FX director allows it.
8. **Scenes:** the camp at dusk (first person at the adit; Fortune stages 1–2), the Halden Hatch (timber floor hatch, chains, the
   padlock weak point), the Glowroot Threshold reveal composition (the window, the title carved in light, the Other Lantern's warm
   point far below), the Root Knot hall (closed).
9. **Capture tooling:** `tools/hybrid-capture.mjs` (named shots of SPEC §8.11 at three viewports, the capture sheet) and the
   metrics C1–C14 in `tools/png.mjs`; first-person scenes (drift, chamber, reveal) in `tools/perf.mjs`.

**SHOULD:** the Iron Pick form; Lantern tier 2 (Brass Lantern) model; MSAA 2× where cheap.

**Delete at the purge checkpoint** (after D's switch): `src/render/descent/{Creatures,DescentCamera,SectionField,ToolRig,VistaBackdrop,SurfaceSky}.ts`,
`src/render/look.ts` (salvage its noise lattice helpers into `src/render/facet/` if used), creature parts of `descentModels.ts`
(`mothModel`, `moleModel`, `mimicModel`, `critterModel`, `CREATURE_LOOKS`), `src/game/effects/LumenMoths.ts`, `src/entities/character/*`,
`src/render/descent/DescentScene.ts` (its API lives on in `DepthScene`), the section ramps in `biomeLooks.ts`;
`tests/unit/idle/{look,sectionField}.test.ts`, `tests/unit/{character,moths}.test.ts`; the cutaway metrics in the capture tools.

**Evidence:** Vitest lines; the capture sheet `artifacts/hybrid/w1/C/sheet.png` with C1–C14 values for every named shot at 390 ×
844 and the C7/C8/C12 values at 360 × 740 and 412 × 915; `perf.mjs` numbers against SPEC §11; the lead's rubric score.

### 3.4 Specialist 1D: game shell, camera, input, HUD, audio, APK (port 4176)

**Owns:** `src/game/**` except `src/game/effects/**`; `src/ui/**`; `src/input/**`; `src/audio/**`; `src/debug/**`; `src/main.ts`,
`index.html`; `src/i18n/en/idleUi.ts`, `src/i18n/en/{core,brand,release,screens}.ts`, `src/i18n/en.ts`, `src/i18n/index.ts`; `tests/e2e/**`; `tools/apk-sim.mjs`, `tools/ui-check.mjs`,
`tools/play.mjs`; `tests/unit/idle/{ceremonyBudget,descentCamera,digController,easeSpring,flashBudget,juiceBudget,ledger,tapSurface,timeline}.test.ts`;
`tests/unit/{audio,audioSystem,brand,compat,governor,i18n-sections,ui,ui-screens,version}.test.ts`; new
`tests/unit/hybrid/{firstPersonCamera,nodeController,hud,fxDirector}.test.ts`. Packaging runs `android/build-apk.sh` (the lead
owns `android/**`).

**Contracts (by 0:45):** `FirstPersonCamera.ts` and `NodeController.ts` (the §2 APIs); `src/debug/hybrid.ts` and `tests/e2e/dd.ts`
(the SPEC §13.3 surface, stubbed).

**Reuse:** `IdleGame.ts` by copy (boot, modes, the fixed 60 Hz step, autosave, lifecycle, offline return, Back, the crash hook,
`saveToState`/`stateToSave`); `FrameGuard`, `main.ts`; `TapSurface.ts` (the ring, cap, holds); v1's `ropeRide.ts` and
`lockedVerticalFov` (ported from `9eb4166`), `MiningController.pick()`'s ray rules and `TapController`'s fat finger; `core/spring.ts`,
`core/ease.ts`; `JuiceDirector`, `juiceBudget`, `CameraFx`, `Timeline` and the ceremonies; the brand kit; `layout.ts`, `TopBar`,
`GoalBar`, `Card`/`QuickBuy`, `Sheet`, `FirstTimeCard`, `GhostHand` (step 1 only), `ReturnFeast`, `SealHud`; `displayLedger`,
`press`, `Ticker`, haptics; audio; `tests/e2e/touch.ts`, `release.spec.ts`.

**MUST**
1. **`FirstPersonCamera`:** the lens (hFOV 52° locked), the motion law and the five shots of SPEC §3 (Drift with creep A and B as a
   setting, Breakthrough with the Gallery step-in, Stand with survey glides and chalk turns, Way Down with the catch-up track and the
   return glimpses, Reveal), cross-fades, skips, reduced motion. U-CAM1–U-CAM6.
2. **`TapSurface`** without columns and swipes (raw points; the 8/s cap, 250 ms / 12 px holds kept). U-IN1.
3. **`NodeController`:** the hit-test order of SPEC §2.3 with the target-size, reach and fat-finger rules; the deliberate gesture for
   the rack; every touch resolves to an action. U-NC1–U-NC3.
4. **`HybridGame`:** the node state machine wired end to end (touches → actions → model → DepthScene → camera → FX director → HUD →
   audio); the first launch straight to the plug face; the return glimpses and the return plate; the seal fight; the reveal.
5. **The calm HUD** in `src/ui/hybrid/`: octagon plates (depth, gold, ≡), the objective line (from `GoalBar`), two cards (Pick and
   BEST, with prices), one Sheet with Dig and Crew tabs, the first-time card, the return plate (from `ReturnFeast`), the seal ring in
   the objective icon, the note panel in the focus pop, the settings sheet (motion level, creep variant, shake, haptics, volumes,
   quality, left-handed mirror, text size). Prune `idle.css`/`w2.css` into one calm stylesheet. Plates ≤ 17 % of the area.
6. **The FX director:** `JuiceDirector`/`juiceBudget` cut to SPEC §8.7 (taps ≤ T1, breaks T2, T3+ only for a chest, a seal or a
   reveal); it counts live groups from `DepthScene.stats()` and refuses cues over budget; `CameraFx` with no tap kick; ceremonies
   shortened (Breakthrough, First Light, Chest, Tool Form, Seal, Reveal) and all skippable. U-FX1–U-FX3.
7. **Audio and haptics:** `eventMap.ts` remapped to SPEC §9.2; music for Topsoil and Glowroot; the haptics table.
8. **The debug surface** `window.__DD__.hybrid` and `tests/e2e/dd.ts`.
9. **E2e:** `tests/e2e/hybrid-slice.spec.ts` covering E1–E14, E16–E22 (no W2 items) and E24, plus `release.spec.ts` (E23) green on
   port 4176; delete `tests/e2e/idle-*.spec.ts`.
10. **The switch** of `src/main.ts` to `HybridGame` at the purge checkpoint, then the deletions listed below.
11. **The APKs:** the checkpoint feel APK at ≈ 3:30 and the gate APK (`./android/build-apk.sh`; `DD_KEYSTORE` as today), with
    `tools/apk-sim.mjs`'s play script updated (launch, a tap breaks a block, the first breakthrough, reload keeps the save).

**SHOULD:** the menu screen at the camp for the second launch; large-text and high-contrast settings.

**Delete at the purge checkpoint:** `src/game/{IdleGame,DigController,moths}.ts` (after the copy), `src/ui/idle/{DepthRuler,SkillRow,EventBubbles,FacetHand}.ts`
(W2/W3 rebuild what they need in `src/ui/hybrid/`), `src/ui/idle/TapSurface.ts`'s column code, the cutaway parts of
`src/debug/idle.ts` (replaced by `hybrid.ts`), `tests/unit/idle/{descentCamera,digController}.test.ts` (replaced),
`tests/e2e/idle-*.spec.ts`.

**Evidence:** Vitest lines; the Playwright list output on port 4176; `apk-sim` log; the APK path and size; E21's HUD numbers.

### 3.5 Order inside W1

| Time | A | B | C | D |
|---|---|---|---|---|
| 0:00–0:45 | contracts | contracts | contracts | contracts |
| 0:45–2:30 | purge, chart, nodes | `deepPath` + U-W1, `layout`, RingWorld cut removed | facet port, `DepthScene` skeleton, `FaceRenderer` | camera, `TapSurface`, `NodeController`, `HybridGame` skeleton |
| **2:30** | **purge checkpoint:** D switches `main.ts`; everyone deletes their listed 2D files; tsc green by 2:45 | | | |
| 2:45–3:30 | leash, offline, save v4 | `nodeStamp`, Topsoil kit | `ChamberProps`, `Viewmodel` | HUD, FX director |
| **3:30** | **the checkpoint feel APK** (lead builds from D's script): drift, face, taps, holds, Pick, the Root Cellar breakthrough, creep A/B | | | |
| 3:30–4:30 | tutorial and sequencer, nodeBot | Glowroot mini-kit, fill-scan, pre-lighting | `NodeCrew`, FX, Hatch, reveal, camp | audio, the return, e2e |
| 4:30–5:30 | sim report, tests | C3 captures, tests | capture sheet, perf, fixes | e2e green, gate APK |

### 3.6 The W1 gate (the lead)

| Check | Pass |
|---|---|
| Static and unit | `npx tsc --noEmit` exit 0; `npm test` green apart from the four known `it.fails` |
| Purge | `tools/purge-gate.sh` exit 0 |
| Slice e2e | `hybrid-slice.spec.ts` and `release.spec.ts` green |
| Packaging | the gate APK built; `apk-sim` green |
| Comfort | U-CAM1–U-CAM6 |
| Taps | U-NC1 (0 nothing), E1 (next frame), E2, E22 |
| Look | C1–C14 on every W1 shot; the beauty rubric passes (every criterion ≥ 3, mean ≥ 4.0, Wonder ≥ 4 on the Root Cellar first light and the Glowroot reveal) |
| Pacing | `sim -- nodes`: the first breakthrough 0:35–0:55, the Hatch 5:30–6:45 (est. bands; outside them the lead decides K with A) |
| Device | the director plays the gate APK cold (D6); the creep A/B (D2) and the reach read (D3) recorded from the feel APK |

---

## 4. Wave 2: Roads, Pulse, Crystal and Works

**Goal at the gate.** The whole first hour as SPEC §7 and §5.13 describe: the Pulse with drafts, secrets and a vault per biome;
roads with honest promises; keystones filling the Root Knot, the Prism Lock and the Crusher; auto-delve on the exit plate; the
Director's events from session 2; the Codex (14 per biome with Lamps), Feats (Lamplighter, Cartographer), the Chart, contracts and the
daily chest; the camp menu growing with Fortune; haul carts; Survey Lamps; sumps, hollows and Lantern Sense; the full Glowroot kit,
Crystal Grotto and Halden Works with their Vistas (the Rootheart, the Hand in the Crystal, the Crusher Hall); music layers. The
director plays to Halden Works.

### 4.1 Specialist 2A: model (port 4173)

**Owns:** as 1A, plus `src/idle/model/{pulse,roads,keystones}.ts` (new) and their tests.

**MUST:** the Pulse (Surge → Pulse: tap to fire, waits when full; reveal; ×3; Bellows; oil pre-fill); drafts, secrets (≈ 1 in 3,
pity ≤ 5, lantern-tier gates) and one vault per biome behind the Unknown road; roads (the road salt in `rowKinds`, the four promise
tables with their bounds, roads not taken, the last choice remembered); keystones (0.25 / 0.5 / 0.85 of the trunk, never on a branch,
auto-socket from the rack); auto-delve stop logic (SPEC §2.5); the Director with the purged and recast events and the first deal at
≥ 11 min; the Codex at 14 per biome with legendary Lamps; Feats (Lamplighter, Cartographer, the four secret feats); contracts and the
daily surfaced from session 2; Survey Lamps (leash +1 per level, max 8); the haul cart tip; Fortune; the chart for Glowroot (full),
Crystal Grotto (K = 9) and Halden Works (K = 11) with forks, Vistas, vaults and landmarks; the seals Root Knot, Prism Lock and Crusher
opened; the bot extended to the Pulse, roads and auto-delve; `idleLore.ts` for biomes 1–3.

**Tests:** U-NC4's model half, U-M9 (roads, keystones), S1 (0–400 m), S2, S4–S7.

### 4.2 Specialist 2B: world (port 4174)

**Owns:** as 1B.

**MUST:** the full Glowroot kit and the Crystal Grotto and Halden Works kits (≥ 12 templates × 3–4 sub-zones each); the three Vistas
as real geometry taking a whole lap (no `VistaBackdrop`); Thresholds; vaults and passages; fork and road geometry in one lap with the
shared-node fallback (U-W2 roads); sumps (pit drifts with the hoist cage, the drop-in, never two in a row, never before a seal);
hollow sockets; secret slots; landmarks every ≤ 6 chambers; the diversity metric C9 in CI; the Vista windows that show earlier lit
chambers across the spiral where geometry allows.

### 4.3 Specialist 2C: render (port 4175)

**Owns:** as 1C.

**MUST:** the Pulse ring as a shell term and the reveal instance attribute; Lantern Sense pinpricks (≥ 8 px, static); hollow cubbies;
the sump shot; the Root Knot, Prism Lock and Crusher mechanisms with their weak points; the three Vista set pieces re-lit as first-person
geometry (`setPieces/{glowroot,crystal,halden}.ts`); event entities (Drifting Ember, Seed Fall, Glimmerfall, Rattling Bricks, Cave-in,
Wedged Chest, Supply Rope, Runaway Cart, Treasure Map chalk arrows); crew lines 3–5 (Steam Drill gantry, Blast Team, Tunnel Borer) in
the ceiling band and nooks; legendary lamp models; the camp stages 1–4; lantern tiers 1–4; tool forms Iron and Steel; the capture
sheet for every W2 shot.

### 4.4 Specialist 2D: shell (port 4176)

**Owns:** as 1D.

**MUST:** auto-delve (a hold ≥ 450 ms on the exit plate) with its stops and chime; the Pulse's deliberate gesture (E15); roads on the
exit plates; the Chart sheet (opened from the depth plate), the Codex sheet, the Feats sheet, the Board (contracts) and the daily chest;
the camp menu for the second launch; the event widgets (Catch, Mash, Strike, Sequence, Pick) restyled for first person; the haul cart
tip; music layers (the drums for the Pulse and seals) and the new cues; `tests/e2e/hybrid-loops.spec.ts` (E15, a road, a keystone, an
event, auto-delve stopping at a chest); the W2 APK.

### 4.5 The W2 gate

As W1, plus: S1 to 400 m in band (the Root Knot 15–19 min, Halden Works 28–36 min); S6 (auto-delve ≥ 1 stop per 2 chambers); C9 per
biome; the beauty rubric on the three Vistas (Wonder ≥ 4); the director plays to Halden Works on the phone; the Lumi Master frame notes
(day 0.2) closed.

---

## 5. Wave 3: Démesure and the deep

**Goal at the gate.** All 14 biomes and the Echo strata playable; Rekindle at the Ember Shrine (600 m) with the camp growing at dawn;
Weave and Breach; bore classes (prototype-gated) and verb scaling (sweeps, bores); tool forms to the Void Cleaver and Lantern Edge;
the lantern ladder; records, the ghost lantern and planted lanterns; facets from the second seal; every skill on the rack; the lore
complete; the economy calibrated to the week.

| Slot | Specialist | MUST |
|---|---|---|
| 3A (4173) | model | prestige surfaced (Rekindle, the Head Start cross-fade, Weave, Breach with "Blind" and "Lanternless"); Echo strata and mutators (the new **Braided**; "Inverted" without its creature clause); bore class state; the verb ladder (sweep at tier 8, bore at tier 12); records, ghost and planted lanterns; facets; Gold Rush, Overdrive, Earthquake, Cataclysm on the rack; the calibration to S1 and S8 (the four `it.fails` turn green); `idleLore.ts` complete (42 notes, 14 murals, 14 seal cards, 42 lamp plates, the Echo fragments) |
| 3B (4174) | world | kits for biomes 4–13 (≥ 12 templates × 3–4 sub-zones each), their Thresholds, Vistas, landmarks and vaults; the Ember Shrine, the Loom's Heart and the Last Gate rooms; Echo variants (hue rotation plus mutator overlays); bore class geometry (heading sizes, the crew gantry from Gallery up) within the footprint, with its tests |
| 3C (4175) | render | seals 5–14 as mechanisms; Vista set pieces 4–13; bore class rendering (floodlamps, fog start = 1.5 × standoff, shards to boulders); tool forms to the Void Cleaver and the Lantern Edge aura; the lantern ladder models; crew lines 6–14 as machines; the camp stages 5–8 and per-system growth; the ghost and planted lanterns |
| 3D (4176) | shell | the Rekindle, Weave and Breach ceremonies and sheets (the 0.6 s hold); the Lantern sheet (stats and the multiplier stack); the facet hand (≤ 30 % of the screen, the face stays tappable); records and splits; the ghost chip; music for every biome; `tests/e2e/hybrid-deep.spec.ts` (a Rekindle, a re-climb with auto-delve through seen ground, a bore class change, a Breach start); the W3 APK |

**Bore-class prototype gate (first half of W3):** a capture and phone check of Drift and Gallery classes for comfort (D2 rules) and
legibility (C7). If it fails, the ladder stops at Gallery (SPEC §5.11) and 3B/3C move that time to Vistas.

**The W3 gate:** as W2, plus S8 green; D4 (30 minutes on Balanced) on phone A; the beauty rubric on every biome's Threshold and Vista.

---

## 6. Wave 4: Polish, verification, release

| Slot | Specialist | MUST |
|---|---|---|
| 4A (4173) | balance and tests | the full bot calibration (S1–S8) on the week; save fuzzing (corrupt slots, clock rollback); every unit test of SPEC §13.1 present and green; the economy report |
| 4B (4175) | look and performance | C1–C14 on every shot of every biome at three viewports; beauty rounds with the director until every biome passes; device performance (D4) on phones A and B; the Battery preset and `QualityGovernor` thresholds re-tuned with device data |
| 4C (4176) | release | the full e2e suite and `apk-sim`; the release APK (`DD_RELEASE=1`) and the Gradle AAB; the device protocol (`docs/device-test-protocol.md`) re-written for first person and run; the docs rewritten: `GAME_DESIGN.md`, `ART_DIRECTION.md`, `TECHNICAL_ARCHITECTURE.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md`, `TEST_REPORT.md`, `docs/store-listing.md`; the iOS plan note updated |

**The release gate:** every SPEC §13 test green with evidence; D1–D7 recorded; the beauty rubric passes on every biome; a release
candidate APK and AAB.

---

## 7. What to delete (git keeps it all)

| When | What | Who |
|---|---|---|
| W1 purge checkpoint | the cutaway shell: `src/game/IdleGame.ts`, `DigController.ts`, `moths.ts`; `src/ui/idle/{DepthRuler,SkillRow,EventBubbles,FacetHand}.ts`; the column code of `TapSurface.ts`; the cutaway debug surface | D |
| W1 purge checkpoint | the cutaway renderer: `src/render/descent/{Creatures,DescentCamera,DescentScene,SectionField,ToolRig,VistaBackdrop,SurfaceSky}.ts`, `src/render/look.ts`, the creature models in `descentModels.ts`, `src/game/effects/LumenMoths.ts`, the foreman `src/entities/character/*`, the section ramps in `biomeLooks.ts` | C |
| W1 purge checkpoint | the cutaway world: `tutorialRows.ts`, the cut and apron in `RingWorld.ts`, slab passes 4–9, creature anchors in `slab.ts`, `caverns.ts`, `fill.ts`, `biomeKits.ts` | B |
| W1 purge checkpoint | every creature system: `model/moth.ts` (recast as the dormant Drifting Ember), the Bestiary, Kindred, Moth Friend, `mothSwarm`/`treasureMole`/`mimic`, `biomes.creatures`, Warden ids, the creature tappable, the creature income in `sim/pacing.ts`, the creature save fields, the creature strings | A |
| W1 purge checkpoint | tests tied to the cutaway: `tests/unit/idle/{descentCamera,digController}.test.ts` (D), `{look,sectionField}.test.ts` (C), `tutorialCrystals.test.ts` (B), `tests/unit/{character,moths}.test.ts` (C), `tests/e2e/idle-*.spec.ts` (D) | as listed |
| Already gone or never ported (v1, `9eb4166`) | `CameraRig`, `PlayerController`, `TouchControls`, `touchCamera`, `MenuCamera`, survival (hearts, fuel, cold), inventory, crafting, the walk-home fields, `zoneWorker`/`zoneLoader`, v1 `Debris`/`Particles`/`TargetMarker` | — (do not port) |
| W2 start | `src/render/materials/*` pixel painters and `sharpUv` if nothing samples them after the facet port (C checks with `grep`) | C |

---

## 8. Build risks and what each wave does about them

| Risk | Where it bites | Mitigation |
|---|---|---|
| The surface fails at first-person distance | W1 look | day 0 pick on the phone; the spike port, not a new invention; C1/C10/C11 every capture round; the director's three phone screenshots |
| Motion discomfort (the creep, glides) | W1 feel | the motion law in unit tests; the feel APK at 3:30 for the A/B; the cross-fade always available |
| The chart geometry does not fit the ring | W1 world | `deepPath` and `layout` tests before kit art; the shared-node road fallback |
| The economy changes shape | W1–W3 | the node-paced bot first; knobs in order; the `it.fails` honest until green |
| Over-juice creeps back | every wave | the FX director refuses cues over budget; U-FX1–3 in CI; any new cue names the group it replaces |
| Two people edit one file | every wave | the ownership tables; changes through the lead; the purge checkpoint as one synchronised moment |
| SwiftShader is slow | every e2e | one heavy job per specialist; one slice spec per wave; pure tests for everything else |
| The director's v3 save | W1 | the v3 → v4 meta migration and a one-time notice, tested with a fixture |
| Scope | W2–W3 | W1 ships one biome well; every later system is dormant until its wave |
