# DEEP DOWN: the build plan for the vertical descent

`SPEC.md` (same folder) is what we build; this file is how. Three build waves of three specialists, then a polish and
verification wave. Each wave ends at a gate run by the lead. The last wave leaves a complete, polished, publishable game.

| Wave | Name | What exists at its gate |
|---|---|---|
| W1 | One thumb, one shaft | the new game boots into the shaft; tap, crew, buy, descend 0–400 m, the tutorial to the first seal, save v3, the offline return; the old game is deleted |
| W2 | Never empty, always something | all 14 biomes with their looks and caverns, seals and Wardens, events and widgets, chests, contracts, Codex, Feats, rank, facets, skills, the Surge, Rekindle, the ceremonies, music |
| W3 | Démesure and HD | Weave, Breach, Echo strata and mutators, the long-tail balance, the HD pipeline, the Plunge, Vistas everywhere, the Ladder, records, settings, accessibility, lore |
| W4 | Polish and verification | every metric of SPEC §13 green, captures judged, performance on budget, the APK built and booted, the docs rewritten: a 2.0.0 release candidate |

---

## 0. Ground rules (every wave)

1. **One shared working tree, disjoint ownership.** Each specialist writes only the files their workstream owns (the tables
   below). Anyone may read anything. A file not listed in a wave belongs to the lead; ask before touching it. A change needed in
   someone else's file goes to its owner (through the lead), never as a drive-by edit.
2. **Contracts first.** In the first 45 minutes of a wave each specialist publishes the stubs others consume (types and
   signatures that compile, with placeholder bodies). Contract files are listed per wave. After that, a contract only grows; a
   breaking change needs the lead.
3. **Green at every checkpoint.** `npx tsc --noEmit` passes at hours 2 and 4 and at the gate. A red error in another owner's file
   is reported to them, not fixed by you. During the wave run your own tests (`npx vitest run tests/unit/idle/<yours> --maxWorkers=1`);
   run the full `npm test` at the checkpoints only.
4. **The machine has 4 CPUs and a software GPU (SwiftShader).** At most **one heavy browser job per specialist at a time**
   (Playwright, `tools/capture.mjs`, `tools/descent-capture.mjs`, `tools/perf.mjs`, `tools/ui-check.mjs`). Each specialist has a port
   and builds into its own directory through the existing `playwright.config.ts` rule:

   | Specialist | e2e port | Build directory | Results |
   |---|---|---|---|
   | A | 4173 | `dist/` | `test-results/` |
   | B | 4174 | `.e2e-dist-4174/` | `test-results-4174/` |
   | C | 4175 | `.e2e-dist-4175/` | `test-results-4175/` |

   Run as `DD_E2E_PORT=4174 npx playwright test tests/e2e/<spec>`. Prefer unit tests and pure simulations in Node; a browser run
   is for what only a browser can prove (real taps, frames, WebGL, layout).
5. **Real taps.** Every Playwright test of the new game runs at **390 × 844** (`hasTouch: true`, `deviceScaleFactor: 1`) and drives
   the game with real touches through CDP (`tests/e2e/touch.ts`). `window.__DD__.idle` (SPEC §12.4) only sets up states and reads
   results.
6. **Screenshots** go to `artifacts/idle/w<N>/` (ignored by git), named as listed per workstream, taken with
   `node tools/capture.mjs --size 390x844 --dpr 2` (and `360x740`, `412x915` where listed). The lead judges them at the gate against
   SPEC §11 and the V-metrics; `tools/png.mjs` prints the luminance metrics.
7. **Time.** About 4–5 hours per specialist per wave: contracts (0:00–0:45), MUST work (to about 3:00), tests and e2e (to about
   4:00), screenshots and fixes (to about 4:30), then the gate. **MUST** items gate the wave. **SHOULD** items may slip; the lead
   moves an unfinished SHOULD to the next wave's MUST list.
8. **No git.** Specialists do not commit, branch or stash. The lead reviews and commits at each gate.
9. **Text.** Every player-facing string goes through `t()`. Section files: `src/i18n/en/idleCore.ts` (A), `idleWorld.ts` (B),
   `idleUi.ts` (C), `idleLore.ts` (A, from W3). C owns the assembly (`src/i18n/en.ts`) and creates the four empty section files in W1's
   first 15 minutes; each then belongs to its owner.
10. **Events.** `src/idle/bus.ts` (A) defines every `IdleEvents` name and payload. B and C request additions through the lead; A adds
    them within the hour.
11. **No old game.** Nothing of the third-person game survives as a second mode, a flag or dead code. The W1 gate checks it (§2.5).

---

## 1. The architecture seams the waves build on

| Seam | Owner | What it is |
|---|---|---|
| `src/idle/model/state.ts`, `step.ts`, `bus.ts` | A | the pure game: `createIdle(seed, now)`, `stepIdle(state, dt, taps, bus)` (fixed 1/60 s), `IdleEvents` |
| `src/idle/model/run.ts` | A | the UI's view of the economy: `cards(state, sheet)`, `buy(state, id, mode)`, `best(state)`, `price(state, id, mode)` |
| `src/render/descent/DescentScene.ts` | B | the one facade the game drives: `attach(state)`, `frame(dt, fxDt)`, `applyBreaks(cells)`, `cellFx(cell, flash, pop, crack)`, `burst(kind, at, n)`, `shock(at)`, `columns()`, `floorScreenY()`, `screenOf(row, col)`, `pickEntity(x, y)`, `setSheet(fraction)`, `kick(v)`, `trauma(t)`, `dolly(...)`, `seal(...)`, `spawnEntity(kind, ...)`, `plant(depth)`, `ghost(depth)`, `look(biome)`, `programs()` |
| `src/world/descent/RingWorld.ts`, `slabLoader.ts` | B | the streamed world (SPEC §6.2) |
| `src/game/IdleGame.ts`, `DigController.ts` | C | the frame (SPEC §12.2): taps → model → DescentScene → JuiceDirector → FxCanvas → DOM |
| `src/game/fx/JuiceDirector.ts`, `juice.ts`, `juiceBudget.ts` | C | IdleEvents → cues under the budgets (SPEC §10) |
| `src/ui/fx/FxCanvas.ts`, `displayLedger.ts`, `Ticker.ts` | C | numbers, tokens, counters (SPEC §10.6) |
| `src/debug/idle.ts`, `tests/e2e/dd.ts` | C | `window.__DD__.idle` and its type |

---

## 2. Wave 1: One thumb, one shaft

**Goal at the gate.** A first launch goes straight into the shaft at the surface; the player taps (the column under the thumb, never a
miss), cells crack and burst with numbers and coins that fly to the counter, the Pick and the Shovel Hand are bought from the
quick-buy row, crew rigs dig, rows clear with the follow thunk, the descent streams through biomes 0–3 (look v1), the tutorial runs to
the Halden Hatch at 40 m and its reveal, the goal bar is always on screen, the save is v3, an offline return shows the closed-form
result. The old game is gone.

### 2.1 Specialist 1A: economy and rules (pure TypeScript)

**Owns:** `src/core/big.ts`; `src/idle/**` (except `src/idle/config/biomeLooks.ts`); `src/save/**`; `src/config/balance.ts`,
`src/config/items.ts`, `src/config/recipes.ts`, `src/config/livingRock.ts`, `src/config/runes.ts`; `src/gameplay/**`;
`src/i18n/en/idleCore.ts`; `tools/econ-sim.ts`; `tests/unit/idle/**` (the files listed below); `tests/unit/save-*.test.ts`;
`tests/e2e/idle-save.spec.ts`; the unit tests marked A in §6.

**Contracts (by 0:45):** `src/core/big.ts` (the type and every signature), `src/idle/bus.ts` (the complete IdleEvents list from SPEC
§3–§10), `src/idle/model/state.ts` (IdleState, RowState, CellKind, the biome index), `step.ts` (`createIdle`, `stepIdle`), `run.ts`
(the card API), `src/idle/num/notation.ts` (`format`, `formatDepth`, `formatRate`).

**Add:**
- `src/core/big.ts`.
- `src/idle/num/notation.ts`.
- `src/idle/config/curves.ts`, `cells.ts`, `upgrades.ts`, `crew.ts`, `gear.ts`, `skills.ts` (data only in W1), `biomes.ts` (depths, ids,
  ores, creature and Warden ids, unlocks for all 14 + the Echo formula), `path.ts` (steps 1–15).
- `src/idle/bus.ts`.
- `src/idle/model/state.ts`, `run.ts`, `shaft.ts`, `tap.ts`, `crew.ts`, `offline.ts`, `goals.ts`, `tutorial.ts`, `hints.ts`, `step.ts`.
- `src/idle/sim/bot.ts`, `src/idle/sim/pacing.ts` (the port of `m4.mjs` at the ×2 depth scale, SPEC Appendix A, first-run and session
  modes; scratch reference: `/tmp/claude-0/-home-user-readme-roast/3412eae4-0c86-53a0-90ba-d33f6a9f42b3/scratchpad/idle/merge/`).
- `tools/econ-sim.ts` (prints SPEC §5.12's tables; `node tools/run-ts.mjs tools/econ-sim.ts [first|days N|human]`); C adds the script
  `"sim"` to `package.json` on A's request.
- `src/i18n/en/idleCore.ts` (cards, goals, tutorial lines, hints, first-time cards for W1 systems).

**Replace:**
- `src/save/types.ts` → `SaveV3` (SPEC §12.3) and the new `Settings` fields; `src/save/saveData.ts` → `createNewSave`,
  `validateSaveData`, `normalizeSave` for v3; `src/save/SaveSystem.ts` → `SAVE.version` 3, `MIGRATIONS = {}`, a `legacy` load result for
  versions 1–2 (not loaded, the notice flag, overwritten by the first v3 saves), the newer-version refusal kept; `src/save/settings.ts` →
  sanitize the new fields and drop `lookSensitivity`, `invertY`, `cameraFollow`.
- `src/config/balance.ts` → keep only what the engine still reads (render, light, moths, governor, audio constants) plus `SAVE`;
  every gameplay section goes.

**Delete:** `src/gameplay/` (all 21 files), `src/config/recipes.ts`, `src/config/livingRock.ts`, `src/config/runes.ts`,
`src/save/worldDelta.ts`; `src/config/items.ts` at 3:30, once B and C have removed its imports (A checks with `grep -rn config/items
src tests`).

**MUST**
1. Big and notation to SPEC §5.1 (letters to zz, scientific, engineering, `e1.20M` past 1e1,000,000).
2. The depth curve, the cell tables of all 14 biomes, the upgrades, the 15 crew lines and the Echo formula, gear, milestones (★,
   crown, pick tier), buy ×1 / ×10 / NEXT ★ / MAX (closed form), the BEST payback.
3. The shaft model: 7-cell rows, remaining fractions, pierce down the column, spill, the leftover crumble, conservation, the tutorial
   rows' cell kinds (rows 0–39).
4. `resolveTap` in SPEC §3.2's order (combo, crit, Rally; the Surge and skill multipliers as hooks), crew damage on impact frames
   (the model exposes each line's strike schedule so B's rigs can match it).
5. Offline: the closed form, the first-sight rule (stop at an unopened seal, gallery gold), the Chest Rack, the clock guard.
6. The goal selector (SPEC §8.4) with the Path steps 1–15 and near goals; the tutorial step machine (SPEC §8.2, every step to
   1:25); hints H1–H2, H10.
7. Save v3 end to end; the legacy notice flag; settings kept.
8. The sim port; `tools/econ-sim.ts first` reproduces SPEC §5.12's first-run table within ±10 %.

**SHOULD**
1. Skills logic (Dynamite, Gold Rush, Overdrive, Earthquake, Cataclysm) and the Lantern Surge meter.
2. The Lucky Moth timer and outcome table.
3. The gems ledger (sources of SPEC §5.7 that exist in W1).

**Unit tests (new):** `tests/unit/idle/big.test.ts` (E14: round trips at 1e300, 1e5000, 1e15 exponents; no NaN), `notation.test.ts`
(every row of SPEC §5.1's table; monotonic to 1e3000), `cells.test.ts` (E13 per biome), `shaft.test.ts` (conservation to 1e-12, pierce
order, crumble at 5/7, κ measured at 0.86 ± 0.03 by a cell-level sim), `tap.test.ts` (E1, the resolution order, combo decay, crit odds over
1e5 seeded taps), `run.test.ts` (costs, MAX vs repeated ×1, NEXT ★ lands on the milestone, BEST payback), `offline.test.ts` (E7, the
seal stop, clock rollback S3), `goals.test.ts` (L5 over a 2 h sim, hysteresis, the fallback), `tutorial.test.ts` (steps advance on the
action, fallbacks fire after their delays), `pacing.test.ts` (E1–E6 on the first-run sim; ≤ 20 s), `save-v3.test.ts` (S1, S2 in Node).
**Rewritten:** `tests/unit/save-system.test.ts` (two slots, checksums, corruption fallback on v3), `tests/unit/save-settings.test.ts`.
**E2E (port 4173):** `tests/e2e/idle-save.spec.ts`: a v2 save planted in `localStorage` before load → the one-line notice once, a fresh
game, settings kept (S2); play 30 s with real taps, reload → the same depth, gold and levels; `__DD__.idle.offline(2)` → the return card
shows the closed-form depth ±1 row; Collect with a real tap.

**Screenshots:** none (A judges with `tools/econ-sim.ts` tables pasted into the gate notes).

### 2.2 Specialist 1B: world and render

**Owns:** `src/world/**`; `src/render/**`; `src/entities/**`; `src/game/effects/**`, `src/game/moths.ts`; `src/config/blocks.ts`,
`src/config/tiles.ts`; `src/idle/config/biomeLooks.ts`; `src/lab/**`, `visuallab.html`; `src/debug/viewer.ts`, `src/debug/viewer.html`;
`src/i18n/en/idleWorld.ts`; `tools/descent-capture.mjs`, `tools/fill-scan.ts`, `tools/emission-budget.ts`, `tools/gen-stats.ts`,
`tools/light-profile.ts`, `tools/poi-density.ts`, `tools/print-landmarks.ts`, `tools/probe-lamps.ts`, `tools/probe-props.ts`,
`tools/reach-debug.ts`, `tools/slice.ts`, `tools/dump-tiles.ts`, `tools/world-tour.json`, `tools/tours/`; `tests/e2e/idle-world.spec.ts`;
the unit tests marked B in §6.

**Contracts (by 0:45):** `src/render/descent/DescentScene.ts` (the facade of §1 with stub bodies), `src/world/descent/RingWorld.ts`
(class shape), `src/render/descent/DescentCamera.ts` (`columns()`, `floorScreenY()`, `project()`), `src/render/props/types.ts`,
`src/render/structures/types.ts`.

**Add:**
- `src/world/descent/RingWorld.ts` (SPEC §6.2: the ring, z < 0 AIR, sky above, STONE outside, slab recycling with the BEDROCK barrier),
  `slab.ts` (passes 1–4, 8, 10 of SPEC §6.4, alcoves and pockets of pass 5, a v1 fill), `slabWorker.ts`, `slabLoader.ts` (main-thread
  fallback), `strata.ts`, `caverns.ts` (alcoves and pockets), `fill.ts` (v1), `tutorialRows.ts` (rows 0–39 including the 4 m crossing and
  the seal hall at 40 m), `biomeKits.ts` (biomes 0–3), `fingerprint.ts` (slab bytes hash).
- `src/render/descent/DescentScene.ts`, `DescentCamera.ts` (SPEC §6.3 in full, except the dolly and the dive: SHOULD), `BiomeLook.ts`
  (atmosphere blending for biomes 0–3), `CrewRenderer.ts` (lines 0–3, impact frames from A's schedule), `ToolRig.ts` (tiers 1–4 and the
  strike ghost with its smear), `ShaftDressing.ts` (lamps, plaques), `SurfaceSky.ts` (sky gradient, sun glow, the camp, the daylight cone).
- `src/render/props/types.ts` (PropSpec, PropKind moved from `world/gen/types.ts`), `src/render/structures/types.ts` (StructureSpec),
  `src/render/structures/geometry.ts` (the helpers moved from `world/gen/architecture.ts`).
- `src/idle/config/biomeLooks.ts` (looks 0–3 of SPEC §11.2).
- `tools/descent-capture.mjs` (portrait shots of a biome at the face: `--biome N --depth m --size 390x844 --dpr 2`).

**Replace or change:**
- `src/world/light.ts` (ring indexing, the dead-slab barrier, max-merge, `openMany`).
- `src/render/mesher.ts` (reads through RingWorld; the flat cut at z = 0; `originY`), `src/render/ChunkRenderer.ts` (ring keys, AABB
  culling), `src/render/meshPool.ts`, `src/render/meshWorker.ts` (`originY`).
- `src/render/terrainMaterial.ts` (the section path v1: flat cut, rim from the open-neighbour data, depth key, fog of rock; `uCellFx[8]`
  replacing `uTarget`), `src/render/terrainRig.ts` (`setCellFx`), `src/render/lighting.ts` (BiomeLook uniforms, fog from the glass
  plane, `uCamFill`, the lantern on the foreman), `src/render/Renderer.ts` (portrait presets; one resolution in W1).
- `src/game/effects/Debris.ts` (debris coloured from the cell's ramp; it stays until W2), `src/game/effects/Halos.ts` (lamp halos),
  `src/entities/character/ExplorerModel.ts`, `pose.ts` (the foreman: strike snap, flurry, dash smear, drop and land).
- `src/render/props/PropRenderer.ts`, `models.ts`, every `src/render/structures/*.ts` importer (the type moves).
- `src/lab/VisualLab.ts`, `src/lab/main.ts`: compile against the new world (a minimal Biome Lab showing looks 0–3); `src/debug/viewer.ts`:
  a slab viewer (or delete it and `viewer.html` if not worth keeping; say which at the gate).

**Delete:** `src/world/gen/` (all: `generateWorld.ts`, `features/*`, `architecture.ts` after the move, `progression.ts`, `types.ts` after
the move, `zoneLoader.ts`, `zoneWorker.ts`), `src/world/analysis/homeField.ts`, `reachability.ts`, `economy.ts`, `fingerprint.ts`,
`src/game/effects/TargetMarker.ts`; the tools that only served the zone: `tools/emission-budget.ts`, `tools/gen-stats.ts`,
`tools/light-profile.ts`, `tools/poi-density.ts`, `tools/print-landmarks.ts`, `tools/probe-lamps.ts`, `tools/probe-props.ts`,
`tools/reach-debug.ts`, `tools/slice.ts`, `tools/world-tour.json`, `tools/tours/first-five.json`.

**MUST**
1. RingWorld, light and meshing correct under streaming (W3, W4), at 0–6 rows/s physical descent, with slabs from the worker.
2. The DescentCamera: the width lock at 44 px per metre, the off-axis shift, the floor at 52 % of the world region, the follow spring,
   the kick spring and trauma inputs, `columns()` exact at 360, 390 and 412 px; the sheet re-frame.
3. The cutaway reads: the flat section with a rim, the depth key, the fog of rock, the camera fill; the next 5–6 rows show ores and the
   chest lids (glints for valuables).
4. Cell FX: flash, pop and crack stages for 8 cells at once; break → voxels to air with debris coloured from the cell.
5. Biomes 0–3 generated (strata, veins, cells from A's tables, alcoves every 6–8 m with props and a lamp, pockets, chest cells, the gate
   rows), the tutorial rows, the surface at 0 m.
6. The foreman, the strike ghost tiers 1–4, crew rigs for lines 0–3 striking on A's impact frames, lamps every 6 m and plaques every
   20 m.
7. The old zone pipeline deleted and nothing left importing it.

**SHOULD**
1. The breakthrough fall and the Vista dolly in DescentCamera.
2. A first grotto per biome (one 12–24 m cavern every 25–40 m).
3. `GpuParticles.ts` v1 for dust (the full system is W2's MUST).

**Unit tests:** new `tests/unit/idle/ring.test.ts` (W4: after 200 recycles the light equals a fresh compute; storage-row maths;
z < 0 is AIR), `tests/unit/idle/slab.test.ts` (W3 determinism, W5 the shaft guarantee over 2,000 slabs, the tutorial rows),
`tests/unit/idle/descentCamera.test.ts` (V6 cell size, `columns()` at three widths, the follow spring's overshoot, reduced motion rest
pose), `tests/unit/idle/slabFingerprint.test.ts` (replaces `genVersion.test.ts`); rewritten `tests/unit/mesh-worker.test.ts` (fixtures
from RingWorld slabs instead of the zone; byte-identity kept), `tests/unit/moths.test.ts` (synthetic anchors), `tests/unit/structures.test.ts`
(the builder geometry only; the stair-walking assertions go with PlayerController), `tests/unit/voxModel.test.ts` (no `Drops` import),
`tests/unit/props.test.ts` (new type import).
**E2E (port 4174):** `tests/e2e/idle-world.spec.ts`: `advance` the crew through 400 rows while sampling every frame: no missing chunk in
the frustum (every chunk meshed within 2 frames of its slab), `meshCheck` equal at 100, 200 and 400 m, the light equal to a fresh compute
at 400 m, `programs()` constant; then 40 real taps on the floor: each break removes the cell's voxels and spawns debris.

**Screenshots** (`tools/descent-capture.mjs`, 390 × 844 @2): `w1-b-surface.png`, `w1-b-topsoil-10m.png`, `w1-b-glowroot-60m.png`,
`w1-b-grotto-150m.png` (Crystal Grotto), `w1-b-halden-300m.png`, `w1-b-cellfx.png` (8 cracked cells), `w1-b-360x740.png`,
`w1-b-412x915.png`.

### 2.3 Specialist 1C: the game shell, input, HUD and juice v1

**Owns:** `src/game/**` except `src/game/effects/**` and `src/game/moths.ts`; `src/ui/**`; `src/input/**`; `src/audio/**`; `src/main.ts`;
`src/debug/**` except the viewer; `src/core/events.ts`, `src/core/ease.ts`, `src/core/spring.ts`; `src/i18n/en.ts`, `src/i18n/index.ts`
and every `src/i18n/en/*.ts` except `idleCore.ts`, `idleWorld.ts`, `idleLore.ts`; `src/version.ts`; `index.html`; `vite.config.ts`;
`playwright.config.ts`; `package.json`; `tests/e2e/**` except `idle-save.spec.ts` and `idle-world.spec.ts`; `tools/ui-check.mjs`,
`tools/capture.mjs`, `tools/perf.mjs`, `tools/play.mjs`, `tools/audio-check.mjs`, `tools/apk-sim.mjs`; the unit tests marked C in §6.

**Contracts (by 0:45):** `src/game/IdleGame.ts` (modes, the public API `main.ts` uses: `boot`, `crash`, `pause`, `resume`, `saveNow`,
`mode`), `src/ui/idle/TapSurface.ts` (`TapInput {x, y, id, t}`), `src/debug/idle.ts` and its type in `tests/e2e/dd.ts`, the four i18n
section files (empty) wired into `src/i18n/en.ts`.

**Add:**
- `src/game/IdleGame.ts` (the frame of SPEC §12.2; modes boot, menu, playing, paused, crashed; fixed 60 Hz model steps ≤ 4 per frame;
  autosave; lifecycle; the idle frame-cap steps of SPEC §4.1; FrameGuard kept), `src/game/DigController.ts`.
- `src/game/fx/JuiceDirector.ts`, `juiceBudget.ts`, `juice.ts` (W1 rows: tap, crit, break, ore, pierce, row clear, crumble, purchase,
  ready ping, ★, combo tier), `CameraFx.ts` (the FX clock and hit-stop rules; kick and trauma into DescentScene), `Timeline.ts`.
- `src/core/ease.ts`, `src/core/spring.ts`.
- `src/ui/idle/TapSurface.ts`, `TopBar.ts`, `GoalBar.ts`, `DepthRuler.ts` (v1: ticks, the seal, chest cells), `QuickBuy.ts`, `Card.ts`
  (every state of SPEC §10.7, pips, the fill bar, BEST), `Sheet.ts`, `sheets/DigSheet.ts`, `sheets/CrewSheet.ts`, `sheets/SettingsSheet.ts`
  (sound, haptics, shake, quality, text size, left-handed), `ReturnFeast.ts` (v1: the plate, the count-up, Collect, the rack), `GhostHand.ts`,
  `FirstTimeCard.ts`, `idle.css`.
- `src/ui/fx/FxCanvas.ts` (numbers, tokens with trails, sparks, rings), `spriteAtlas.ts`, `Ticker.ts`, `displayLedger.ts`, `press.ts`,
  `waapi.ts`.
- `src/debug/idle.ts`.
- `src/i18n/en/idleUi.ts`.

**Replace:**
- `src/main.ts` (boots IdleGame; the crash panel, Android bridge, context loss and governor kept), `src/ui/UI.ts` (the menu at the
  surface, settings, about; hosts the idle HUD), `src/ui/types.ts`, `src/input/types.ts`, `src/input/DesktopInput.ts` (keys 1–7, Space,
  B, Esc; a click is a tap), `src/ui/haptics.ts` (SPEC §10.11 patterns, the strength setting and the limiter), `src/audio/eventMap.ts`
  (IdleEvents), `src/audio/sfx.ts` (W1 recipes: `tap.*`, `break.*`, `coin.tick`, `row.clear`, `crit`, `buy`, `buy.star`, `combo.tier`,
  `ui.tap`, `ui.no`; the pentatonic break ladder and the purchase arpeggio), `src/ui/notices.ts` (only the info toast stays),
  `src/ui/screens/menu.ts`, `settings.ts`, `about.ts`, `host.ts`, `widgets.ts` (the idle versions), `src/ui/icons.ts` (idle icons, no item
  ids), `src/ui/sprites.ts` (rasters keyed by Find and ore ids instead of item ids), `src/ui/dev/sandbox.ts` (the idle HUD sandbox),
  `src/debug/DebugApi.ts` (only engine helpers that remain), `src/debug/StubUI.ts`, `src/i18n/en/core.ts` and `screens.ts` (pruned to the
  strings still used).
- `playwright.config.ts` (viewport 390 × 844, `hasTouch`, the same ports and build directories), `tests/e2e/dd.ts`, `tests/e2e/touch.ts`
  (+ `tap(x, y)`, `tapColumn(c)`, `holdColumn(c, ms)`, `swipe(c0, c1, ms)`), `tests/e2e/release.spec.ts` (the same five behaviours in
  portrait), `tools/capture.mjs` (portrait defaults), `tools/ui-check.mjs` (rewritten for the idle HUD: targets ≥ 48 px, overlap, the thumb
  rule, text ≥ 12 px, no DOM churn, at three viewports), `tools/perf.mjs` (portrait, taps at 5/s, the descent spots), `tools/play.mjs`
  (scripted taps).
- `vite.config.ts` (entries: `index.html`, `visuallab.html`, the UI sandbox; the viewer entry follows B's decision), `package.json` (the
  `sim` script; the description "a vertical-descent idle clicker"; the version stays 1.x until W4).

**Delete:** `src/game/Game.ts`, `GameUi.ts`, `CameraRig.ts`, `PlayerController.ts`, `TapController.ts`, `MiningController.ts`,
`aimAssist.ts`, `touchCamera.ts`, `ropeRide.ts`, `runeDoor.ts`, `WorldFeatures.ts`, `WorldSession.ts`, `Survey.ts`, `Stations.ts`,
`Progression.ts`, `MenuCamera.ts`, `Drops.ts`, `Guidance.ts`, `Runes.ts`; `src/ui/TouchControls.ts`, `src/ui/touchMath.ts`,
`src/ui/hud/Hud.ts`, `hud/hearts.ts`, `hud/wake.css`, `src/ui/screens/inventory.ts` + `.css`, `workbench.ts` + `.css`, `board.ts` + `.css`,
`summary.ts` + `.css`, `journal.ts` + `.css`, `ending.ts` + `.css`, `progress.ts`, `nodeIcons.ts`; `src/i18n/en/loop.ts`, `world.ts`,
`hud.ts`, `feel.ts`, `play.ts`, `content.ts`; `tests/e2e/slice.spec.ts`, `world.spec.ts`, `desktop.spec.ts`, `progression.spec.ts`,
`tap.spec.ts`.

**MUST**
1. The input contract of SPEC §3.1 (pointerdown, the ring, entity first, columns, the target rule, hold, swipe, the 15/s cap, multi-touch).
2. IdleGame and DigController wired to A's model and B's DescentScene; a first launch skips the menu; the second launch shows the menu at
   the surface (Continue, Settings, About).
3. The HUD of SPEC §9.1 at three viewports: top bar (gold, depth, gems), the goal bar (every frame), the Depth Ruler v1, the quick-buy row
   with the Pick, BEST and crew cards, the Dig and Crew sheets with buy modes and hold-to-buy; the progressive reveal of SPEC §8.3 for W1
   elements.
4. Juice v1: same-frame impact (F1), numbers with accumulation, coin flights through the ledger with the counter catch and the odometer,
   the ready ping, the purchase burst, the ★ ceremony, the kick, trauma, hit-stop rules, haptics with the limiter, the W1 sounds.
5. The tutorial UI (the ghost hand, the focus scrim, the prompts) driven by A's step machine to 1:25; the legacy-save notice.
6. The return feast v1 (plate, count-up, Collect, the rack).
7. `__DD__.idle` (SPEC §12.4) and the e2e suite below.
8. Every old-game file listed above deleted.

**SHOULD**
1. The skill row with Dynamite and the combo ring (when A's skills land).
2. `tools/ui-check.mjs` at 360 × 740 and 412 × 915 as well as 390 × 844.
3. The WebView 88 compat fix in `ui.css` and `notices.ts` (it is W3's MUST otherwise).

**Unit tests:** new `tests/unit/idle/tapSurface.test.ts` (F3's mapping as a pure function of strips; the target rule; the cap merge),
`tests/unit/idle/ledger.test.ts` (MX: shown = actual − in flight; affordability flips on landing), `tests/unit/idle/easeSpring.test.ts`
(cubic-bezier within 1e-3 of the reference; the spring table's overshoot and settle), `tests/unit/idle/juiceBudget.test.ts` (tier caps,
hit-stop rules, a tap ends a stop); rewritten `tests/unit/ui.test.ts` (format, strokeFont, wordmark, sprites; no hearts or inventory),
`tests/unit/ui-screens.test.ts` (menu, settings, about), `tests/unit/audio.test.ts`, `tests/unit/audioSystem.test.ts` (IdleEvents in the
event map, the new recipes render), `tests/unit/i18n-sections.test.ts` (the new sections, no duplicates).
**E2E (port 4175):** `tests/e2e/idle-core.spec.ts`: (1) a first launch lands in the shaft with "Tap the rock" on the goal bar; one real tap
breaks a cell and its coin reaches the counter in 0.5–0.9 s (F4); (2) F1 over 50 taps; (3) F2 with 500 random taps and F3 per column;
(4) buying the Pick and the Shovel Hand with real taps on the quick-buy cards, a hold-to-buy for 1.5 s, the BEST chip moves; (5) a sheet open
and taps above it still dig (F11); (6) F7 counters roll; (7) F10 no DOM churn over 200 taps. `tests/e2e/idle-tutorial.spec.ts`: G1 to the
Halden Hatch and its reveal (W1 version: 2:30 at 4 taps/s), G2 the goal bar sampled every frame, G4 the random tapper. `release.spec.ts`
rewritten.

**Screenshots** (`tools/capture.mjs`, 390 × 844 @2): `w1-c-first-launch.png` (the surface, the ghost hand), `w1-c-first-coin.png` (a coin
mid-flight with its trail), `w1-c-hud-20m.png`, `w1-c-dig-sheet.png` (the floor re-framed above the sheet), `w1-c-quickbuy-states.png`
(not affordable, near, ready, BEST), `w1-c-star.png` (the ★ stamp), `w1-c-return-feast.png`, `w1-c-legacy-notice.png`, the same HUD at
`360x740` and `412x915`.

### 2.4 How the three meet in W1

| Hour | A | B | C |
|---|---|---|---|
| 0:00–0:45 | big, bus, state, run contracts | DescentScene, RingWorld, camera contracts; type moves | IdleGame skeleton, TapSurface, i18n sections, debug type |
| 0:45–2:00 | curves, cells, shaft, tap, run | RingWorld, light, ChunkRenderer, mesher | main.ts + IdleGame boot path, HUD skeleton, deletions |
| 2:00 checkpoint | tsc green (stubs everywhere) | | |
| 2:00–3:30 | offline, goals, tutorial, save v3, sim | slab gen 0–3, section path, cell FX, camera, crew, foreman | cards, sheets, FxCanvas, ledger, juice v1, tutorial UI |
| 3:30–4:30 | tests, `config/items.ts` deleted | tests, e2e, captures | e2e, ui-check, captures |

### 2.5 W1 gate (the lead)

- `npx tsc --noEmit` and `npm test` green; `node tools/run-ts.mjs tools/econ-sim.ts first` within ±10 % of SPEC §5.12.
- The e2e specs `idle-core`, `idle-tutorial`, `idle-save`, `idle-world`, `release` green on their ports.
- **The old game is gone:** none of these paths exists: `src/game/Game.ts`, `src/game/PlayerController.ts`, `src/game/CameraRig.ts`,
  `src/ui/TouchControls.ts`, `src/world/gen/`, `src/gameplay/`; and `grep -rnE "PlayerController|CameraRig|generateWorld|TouchControls|
  joystick|lanternFuel|expedition" src tests tools` finds nothing (lore words in `idleLore.ts` excepted).
- The screenshots show a readable, lit cutaway with 44 px cells, the HUD at three sizes, and the tutorial's first beats.

---

## 3. Wave 2: Never empty, always something

**Goal at the gate.** All 14 biomes look and play distinctly (looks with LUTs, rock families, ores, creatures, caverns that pass the fill
contract, a Vista and a Warden each); seals and Wardens fight; the Director deals events through the five widgets; chests roll up; contracts,
the daily chest and the calendar run; the Codex, Feats and rank fill; facets offer hands; the four skills and the Lantern Surge play; Rekindle
works end to end with the planted lantern and the ghost; every ceremony of SPEC §10.8 except the number milestones, Googol and Weave plays;
the music has its layers.

### 3.1 Specialist 2A: systems (pure)

**Owns:** as 1A, plus `tests/e2e/idle-economy.spec.ts`. (`src/config/items.ts` no longer exists.)

**Contracts (by 0:45):** the IdleEvents additions for every W2 system; `model/director.ts` (`nextEvent`, event state machines' public
shape), `model/widgets.ts` (the widget state types the UI renders), `model/chests.ts` (`rollChest(seed, floor, pity)` → the step list),
`model/seals.ts`, `model/facets.ts` (`offerHand`, `pick`), `model/prestige.ts` (`rekindleGain`, `recommend`, `projection`).

**Add:** `src/idle/model/skills.ts`, `surge.ts`, `seals.ts`, `director.ts`, `widgets.ts`, `chests.ts`, `contracts.ts`, `daily.ts`,
`codex.ts`, `feats.ts`, `rank.ts`, `facets.ts`, `records.ts` (splits, ghost samples, planted lanterns), `prestige.ts` (Rekindle, the perks,
the recommend rule, the projection that runs the pure sim within 30 ms); `src/idle/config/events.ts`, `chests.ts`, `facets.ts`, `feats.ts`,
`rank.ts`, `codex.ts`, `contracts.ts`, `prestige.ts` (Ember perks), `path.ts` (steps 16–30 and Survey Orders); the sim extended with seals,
skills, the Surge, events, facets, chests, Finds, Bestiary, Marks, Rank and Biome Seals at their expected rates, plus the "human" profile;
`idleCore.ts` strings for all of these.

**MUST**
1. Seals and Wardens (SPEC §7.1): first-time HP from the measured DPS, the timer, weak points, the Strike finisher, fail and retry,
   charted gates, the offline stop.
2. The Director (SPEC §7.2) with the 12 events and the Lucky Moth clock, deck rules, the find guarantee, the boredom breaker, the
   idle-friendly rule; the five widgets' logic.
3. Chests (roll-up, floors, pity, the rack), contracts (the generator to 90–240 s, Grand Contracts, reroll), the Daily Lantern Chest and the
   7-day calendar (pause, never reset), the clock guard.
4. The Codex (Finds with levels, Bestiary tiers, Lore, Biome Seals, Codex chests, pity, drop odds), Feats (20 families × I–X + endless,
   12 secrets, Marks, perks at X), Rank (`need(r)`, rewards, titles).
5. Facets (offers, rarity, rerolls, sets, duos, auto-pick hook), skills and Cataclysm, the Lantern Surge.
6. Rekindle (gain, reset and keep lists, perks, the recommend rule, the projection), records, the ghost samples and planted lanterns.
7. The gem economy (every source and sink of SPEC §5.7 that exists by W2).
8. The extended sim passes E8, E9, E11, E15–E25 (Breach-dependent parts of E10 wait for W3; E10's day-3 record must pass now).

**SHOULD**
1. Hints H3–H9, H11, H12.
2. The Path steps 16–30 wired to the goal bar.

**Unit tests (new):** `seals.test.ts` (E21), `director.test.ts` (E23, 10,000-event fuzz; the find guarantee fires within 1 s after 10 s
quiet), `widgets.test.ts` (Strike zones, Sequence restart, Mash tiers), `chests.test.ts` (E15, pity bounds), `contracts.test.ts` (E22),
`daily.test.ts` (pause never resets; clock rollback), `codex.test.ts` (196 entries each reachable; Biome Seal on completion; pity),
`feats.test.ts` (E18 thresholds strictly increase, every tier rewarded, secrets reachable in the sim), `rank.test.ts` (E19), `facets.test.ts`
(E24), `prestige.test.ts` (Ember totals, keep lists, the recommend rule, L7/E8 on the sim), `noPunishment.test.ts` (E16: every failure path
subtracts nothing; a static scan of `src/` for payment, ad and network APIs), `days.test.ts` (E9, E10 day 3, E11, E20, E25 on the session sim;
≤ 30 s).
**E2E (port 4173):** `tests/e2e/idle-economy.spec.ts`: Rekindle end to end with real taps (`setDepth(620)`, the Lantern tab, the 0.6 s hold on
REKINDLE): Embers credited, the run reset, perks applied, the planted lantern visible in the next run and tappable for +2 %, the ghost chip;
offline 8 h with a seal ahead → the crew stops at it, the seal card on return.

### 3.2 Specialist 2B: world content and world FX

**Owns:** as 1B.

**Contracts (by 0:45):** DescentScene additions: `seal(id, state)`, `weakPoint(at, lit)`, `spawnEntity(kind, path)`, `pickEntity` for
event entities and creatures, `vista(on)`, `plant(depth, n)`, `ghost(depth)`, `look(biome, blend)`, `dim(v)`, `iris(r)`.

**Add:**
- `src/world/descent/biomeKits.ts` (biomes 4–13 and the Echo hook), `caverns.ts` (grottos, the Vista per biome, windows, geodes, seal halls),
  `fill.ts` (the seven fill rules and per-biome fill of SPEC §6.6), `tools/fill-scan.ts`.
- `src/render/materials/biomes.ts` (the new painters), the HD array in `terrainRig.ts` with worker painting ahead of each biome,
  `palette.ts` ramps.
- `src/render/descent/SectionField.ts`, `CavernProps.ts`, `Creatures.ts` (42 kinds from 4 rigs), `SealRenderer.ts` (the slab, chains, the
  14 Wardens and their weak points), `VistaBackdrop.ts` with 2 layers and `setPieces/*.ts` for biomes 0–6, `LightCones.ts`, `LiquidPlane.ts`
  (water and lava), `CrewRenderer.ts` lines 4–14 and wall swarms, `ToolRig.ts` tiers 5–10.
- `src/render/fx/GpuParticles.ts`, `fracture.ts`, `Shards.ts`, `shardMaterial.ts`, `Beams.ts`.
- `src/render/post/lut.ts` and the LUT pair fetch in `PostFX.ts`; `uDim`, `uIris`, screen shock and the bloom pulse in `PostFX.ts`.
- `src/idle/config/biomeLooks.ts` for all 14; `src/game/effects/Halos.ts` (the Other Lantern, planted and ghost lanterns, treasure
  pulses), `LumenMoths.ts` and `moths.ts` (swarm, flock and Lucky Moth modes), `Waterfall.ts` (lava and frozen variants); the event
  entities in 3D (crystals, boulders, the mole, the crate on its rope, the mimic, runes on the back wall).
- `src/render/props/*` new kinds (SPEC §11.3).

**Replace:** `src/game/effects/Particles.ts` by `GpuParticles.ts` and `src/game/effects/Debris.ts` by `Shards.ts` (delete both old files
when nothing imports them).

**MUST**
1. Every biome 0–13 distinct (V5) with its look, rock families, ores, creatures and signature props; the boundaries ragged and blended;
   the glow below before each seal.
2. The cavern grammar and the fill contract: W1, W2, W5, W6 green in `fill-scan` over 0–7,000 m.
3. Seals and Wardens on screen with weak points; the breakthrough fall; the Vista dolly; Vistas with backdrops for biomes 0–6.
4. GPU particles and shards in place of the CPU puffs and grey cubes, within the preset caps; the tap and break timeline of SPEC §10.5
   (shards fill the cell's front metre in F0).
5. Creatures tappable (bounds), event entities placed for every event, the Other Lantern always 600 m below the record, planted lanterns
   and the ghost lantern.
6. Crew rigs for all 15 lines with crowns' looks; tool tiers 5–10.
7. LUT grades, dim, iris, shock and the bloom pulse.

**SHOULD**
1. Vistas for biomes 7–13, light cones in every Vista, liquids in every biome that has one.
2. The surface camp stages 1–3.

**Unit tests:** `tests/unit/idle/fill.test.ts` (W1, W2 per biome, 2,000 rows each), `tests/unit/idle/lut.test.ts` (V5; the builder is
pure), `tests/unit/idle/fracture.test.ts` (shard volumes sum to 1 ± 1e-6, every shard convex), `tests/unit/idle/particles.test.ts` (the
closed-form motion matches a stepped integration; the density governor never exceeds the cap), `tests/unit/idle/sectionField.test.ts`
(incremental chamfer equals a full transform).
**E2E (port 4174):** `idle-world.spec.ts` extended: a tour of the 14 biomes with `setDepth` (`programs()` constant, P3), and 30 real taps in
each biome with every frame's live particles and shards under the cap; a Vista dolly then real taps during it (they still dig).

**Screenshots** (`tools/descent-capture.mjs`, 390 × 844 @2): `w2-b-biome-00.png` … `w2-b-biome-13.png` at the face, `w2-b-grotto.png` (a
breakthrough frame), `w2-b-vista-02.png` and `w2-b-vista-05.png` (mid-dolly with backdrops), `w2-b-seal-rootknot.png`,
`w2-b-shards.png` (F2 of a break), `w2-b-creatures.png`, `w2-b-other-lantern.png`; with `tools/png.mjs` metrics for V1–V4 and V7 printed.

### 3.3 Specialist 2C: UI, ceremonies and audio

**Owns:** as 1C.

**Contracts (by 0:45):** the ceremony timeline API (`Timeline`, `skip()`, the capture hook), the widget UI component shape, the sheet
registry.

**Add:**
- `src/ui/idle/sheets/BoardSheet.ts`, `FeatsSheet.ts`, `CodexSheet.ts`, `LanternSheet.ts` (Rekindle, perks vine, the Stats panel),
  `SkillRow.ts` (the combo counter in the Surge ring, 4 skills with cooldown sweeps, the facet chip), `SealHud.ts` (the timer ring, the HP bar,
  the weak point marker, the finisher), `widgets/Catch.ts`, `Mash.ts`, `Strike.ts`, `Sequence.ts`, `Pick.ts`, `FacetHand.ts`,
  `ChestReveal.ts`, `FeatToast.ts`, `EventBubbles.ts`, `TitleCard.ts`, `RekindleScreen.ts`; the rank badge and the XP bar in `TopBar.ts`;
  `ReturnFeast.ts` complete (the seal card, the Director's welcome-back deal).
- `src/game/fx/ceremonies/Star.ts`, `Crown.ts`, `PickTier.ts`, `Chest.ts`, `Feat.ts`, `RankUp.ts`, `BiomeReveal.ts`, `ChartedGate.ts`,
  `SealBreak.ts`, `Rekindle.ts`, `OfflineFeast.ts`; `juice.ts` complete for these rows.
- `src/audio/cues.ts` (the ladders, latency-aligned scheduling); new recipes in `sfx.ts`; `MusicScheduler.ts` layers (pad, pluck on taps,
  drums on combo ≥ 25 / Surge / events, the boss layer, the 4 s biome crossfade) and per-biome modes and tempos.

**MUST**
1. Every W2 system playable with real taps through its UI: the skill row, the Surge, seals and Wardens, the five widgets, chests, the facet
   hand, the Board, the Codex, Feats, the Lantern sheet and Rekindle.
2. The ceremonies of SPEC §10.8 (except number milestones, Googol, Weave), each skippable from 400 ms, never dropping a tap, within the
   ladder's caps; exclusivity and queueing.
3. First-time cards for every W2 system and event; the progressive reveal complete; the goal bar's tap-to-go for every goal kind.
4. Audio cues and music layers; haptics for every new event.
5. The e2e suites below.

**SHOULD**
1. The Codex Guide entries (how each system works).
2. The menu → game lantern-O transition.

**Unit tests:** `tests/unit/idle/timeline.test.ts` (fixed-time states; `skip()` reaches the end state), `tests/unit/idle/ceremonyBudget.test.ts`
(MX-26: never two T4/T5 at once; toasts wait), `tests/unit/idle/flashBudget.test.ts` (F8 over a 30 min sim event stream with a Lintel chest and
a biome reveal).
**E2E (port 4175):** `tests/e2e/idle-loops.spec.ts` (real taps): `forceEvent` each event type and complete it through its widget (Catch the
Lucky Moth, a Mash, a Strike perfect, a Sequence, a Pick); open a chest and watch its steps; a seal fight won at 5 taps/s and one failed then
retried; a facet hand picked; a contract completed; a Feat toast tapped to open its family; the Codex page shows a new Find.
`tests/e2e/idle-ceremony.spec.ts`: F6 (taps every 37 ms through a pick tier and a biome reveal: 0 dropped), the skip at 400 ms, F8 flashes,
Reduced motion (the camera at rest every frame; F8), Motion Off (no flights, ≤ 20 particles per event).

**Screenshots** (390 × 844 @2): `w2-c-skillrow.png`, `w2-c-surge.png`, `w2-c-seal-hud.png`, `w2-c-chest-crystal-step.png`,
`w2-c-chest-reveal-card.png`, `w2-c-facet-hand.png`, `w2-c-feat-toast.png`, `w2-c-rankup.png`, `w2-c-widget-catch.png`, `-mash.png`,
`-strike.png`, `-sequence.png`, `w2-c-board.png`, `w2-c-codex.png`, `w2-c-feats.png`, `w2-c-lantern.png`, `w2-c-reveal-title.png`,
`w2-c-rekindle-iris.png`, `w2-c-return-feast.png`.

### 3.4 W2 gate

- tsc, `npm test`, `tools/econ-sim.ts days 3` (E10's day-3 record, E8, E9), the e2e specs of W1 and W2 green.
- `tools/fill-scan.ts` 0 violations over 0–7,000 m.
- The 14 biome captures are distinct and readable (V1, V2, V5, V7 printed and inside their bands); every listed ceremony capture exists.

---

## 4. Wave 3: Démesure and HD

**Goal at the gate.** The long tail works (Weave, Breach, Echo strata with mutators, Echo lines and gear, auto-buy perks, number milestones
and Googol), the image is HD (two resolutions, native composite, CAS, rays, chroma, the Plunge, all Vistas and set pieces, the camp's six
stages, tool tiers to 16+, titles carved in light), the Ladder, Records and Stats exist, settings and accessibility are complete, the lore is
written, and the 7-day balance with Breach passes.

### 4.1 Specialist 3A: the long tail and the content

**Owns:** as 2A, plus `src/i18n/en/idleLore.ts`.

**Add / extend:** `model/prestige.ts` (Weave, the Loom nodes, the live re-climb, Breach with the eight rule hooks and Sigils),
`config/prestige.ts` (Loom, Breach), `config/mutators.ts` and the mutator rules in the model, Echo strata in `config/biomes.ts` (the base
biome, hue, mutator stacking, never the same mutator on the same base twice running), Echo lines and Echo gear, the auto-buy, auto-skills,
auto-gear and auto-facets perks, number-milestone and Googol events, Survey Orders after Path 30, the remaining hints, the human profile in
the sim, the 7-day and 14-day session sims with Breach; `idleLore.ts` (42 Halden notes, 14 murals, 14 seal cards, 60 Echo fragments, the
Guide texts) under the arc of SPEC §7.8.

**MUST**
1. Weave and Breach end to end in the model with tests; the Breach rules hook into the systems they change (no crew, no offline, slopes, one
   line, no preview and no events, the 15-minute sprint, gold ×0.01, Embers off).
2. Echo strata and the 8 mutators (rules and the cell-mix law under each mutator).
3. E10 complete (with Breach: ≥ +600 m a day on days 8–14, an Echo stratum at least every 2 days), E4 on the human profile within ×1.6.
4. All lore and Guide text written, reviewed against the arc, under 4 lines each.
5. `tools/econ-sim.ts` prints every table of SPEC §5.12 and the 14-day calendar.

**SHOULD**
1. A "what changed in the run" breakdown for the Stats panel (each multiplier's contribution).

**Unit tests:** `weave.test.ts`, `breach.test.ts` (each rule enforced; Sigils ×2 per tier; goals +500 m per tier), `mutators.test.ts` (E13
under every mutator; the never-twice rule), `echo.test.ts` (Echo lines and gear exist for every stratum to n = 40), `days14.test.ts` (E10 with
Breach; marked slow, ≤ 60 s), `lore.test.ts` (every lore key used once, every note ≤ 4 lines).
**E2E (port 4173):** `tests/e2e/idle-prestige.spec.ts`: a Weave with real taps (`setDepth(3,150)` and the Embers needed), the Loom node bought,
the live re-climb doubling Embers; a Breach challenge started and its rule visible (Bare Hands hides the crew cards); an Echo stratum reached
(`setDepth(6,920)`): its mutator's first-time card and its gear.

### 4.2 Specialist 3B: the HD pipeline, the Plunge and the démesure on screen

**Owns:** as 2B.

**Add / change:** `src/render/Renderer.ts` and `PostFX.ts` to SPEC §11.3 (two resolutions, Catmull-Rom + CAS, rays, chroma, the plunge
blur, heat shimmer, the portrait vignette, every variant compiled at load); `src/render/QualityGovernor.ts` (the fine resolution controller and
the FX LOD step); `src/render/descent/PlungeTunnel.ts` and the Plunge enter and exit (re-climbs, Head Start, the offline feast's descent);
Echo looks (hue rotation, exposure and bloom ramps) and the 8 mutator looks; Vistas and set pieces for all 14 biomes with the 3rd layer and the
leviathan card; `SurfaceSky.ts` camp stages 1–6 and the Lighthouse beam; `ToolRig.ts` tiers 11–16+ (off-screen strikes, the aura); crew Echo
variants; `src/render/fx/SdfTitle.ts`, `sdfAtlas.ts` (titles carved in light); the Biome Lab (`src/lab/VisualLab.ts`) showing every look,
cavern template, set piece and FX trigger.

**MUST**
1. The HD pipeline on every preset with P1–P4 inside budget in `tools/perf.mjs` (portrait) and V1–V4, V7, V9, V10 green on the captures.
2. The Plunge with no voxel edits above 6 rows/s and an exit hitch ≤ 8 ms (P4).
3. Echo strata and mutators look distinct (V5 extended to Echo I–XIII).
4. All 14 Vistas and set pieces; tool tiers through Lantern Edge II; camp stages 1–6.

**SHOULD**
1. Titles carved in light (the DOM title stays as the fallback).
2. LiquidPlane ice and brass variants.

**Unit tests:** `tests/unit/idle/composite.test.ts` (the Catmull-Rom weights sum to 1; the CAS kernel; the iris mask), `tests/unit/idle/plunge.test.ts`
(enter and exit thresholds, hysteresis), `tests/unit/governor.test.ts` extended (the fine controller's step rules), `tests/unit/idle/periods.test.ts`
(every world-space period divides 8,192).
**E2E (port 4174):** `tests/e2e/idle-hd.spec.ts`: a 20,000 m soak alternating the Plunge and normal descent (`advance`), every 1,000 m the ring
light equals a fresh compute; heap growth ≤ 5 MB; 0 crash-panel events (P5); `programs()` constant through the tour (P3).

**Screenshots** (`descent-capture.mjs` at 390 × 844 @2 and @3, plus 360 × 740 and 412 × 915 for three biomes): `w3-b-hd-before-after-NN.png`
for biomes 2, 6, 11 (W2 vs W3 pipeline side by side), `w3-b-vista-NN.png` for all 14, `w3-b-plunge.png`, `w3-b-echo-01.png` …
`w3-b-echo-08.png` (one per mutator), `w3-b-camp-1.png` … `-6.png`, `w3-b-tool-16.png`, `w3-b-title-carved.png`.

### 4.3 Specialist 3C: map, records, settings, accessibility and the UI's long tail

**Owns:** as 2C.

**Add / change:** `src/ui/idle/sheets/LadderSheet.ts` (SPEC §8.6), the Records and Stats panels in `LanternSheet.ts`, the Loom and Breach
UIs, the split chip and the ghost chip, number-milestone and Googol ceremonies (`ceremonies/NumberMilestone.ts`, `Googol.ts`, `Weave.ts`) and the
counter tier colours; `sheets/SettingsSheet.ts` complete (motion levels honoured everywhere, flashes, notation, haptic strength, left-handed,
text size, high contrast, the break reminder, auto toggles, replay hints); the aria-live announcements and accessible names; the WebView 88
compat fix in `ui.css` and `notices.ts`; `tests/unit/compat.test.ts`; `src/ui/sprites.ts` at an integer texel scale and vector UI icons
through `polygonsPath()`; the Codex Guide; About and privacy text updates; `tools/ui-check.mjs` complete (U1–U4, F10 at three viewports);
the UI sandbox covering every component state.

**MUST**
1. The Ladder, Records, Stats, Loom and Breach screens, with real-tap e2e.
2. Settings complete and every motion level and flash setting honoured by every effect (F8, MX-15/16 behaviours).
3. U1–U5 green; G5 (every system has a first-time card and a Guide entry; every key resolves).
4. Number milestones, Googol and the Weave ceremony.

**SHOULD**
1. A high-contrast theme check in the captures.

**Unit tests:** `tests/unit/compat.test.ts` (U5), `tests/unit/idle/i18nCoverage.test.ts` (G5: every key used by the UI resolves; no literal
player-facing strings in `src/ui/idle` and `src/idle`), `tests/unit/brand.test.ts` extended (the `mythic` pair, the HUD-over-scrim pairs),
`tests/unit/idle/iconScale.test.ts` (V10 at DPR 1, 1.5, 2, 2.625, 2.75, 3).
**E2E (port 4175):** `tests/e2e/idle-ui.spec.ts`: open every sheet and panel with real taps and close it with Back; the Ladder jump-to; each
setting toggled and its effect observed (notation changes the counter; left-handed mirrors the skill row; Reduced stops the camera);
`tools/ui-check.mjs` run at three viewports from this spec's job.

**Screenshots** (390 × 844 @2, and 360 × 740 / 412 × 915 for the HUD): `w3-c-ladder.png`, `w3-c-records.png`, `w3-c-stats.png`,
`w3-c-loom.png`, `w3-c-breach.png`, `w3-c-settings.png`, `w3-c-number-milestone.png`, `w3-c-googol.png`, `w3-c-large-text.png`,
`w3-c-high-contrast.png`, `w3-c-left-handed.png`.

### 4.4 W3 gate

- Everything green from W1–W3; `tools/econ-sim.ts days 14` passes E10 with Breach; `tools/perf.mjs` P1–P4 inside budget on Balanced and
  Battery; the V-metrics printed for all 14 biomes and 8 mutators.
- A cold play-through by the lead from a fresh profile for 15 minutes (real device or the browser at 390 × 844) with notes on anything
  unexplained, boring or unclear: each note becomes a W4 task.

---

## 5. Wave 4: Polish and verification (a publishable 2.0.0)

Nothing new is designed in W4. Everything found is fixed by the file's owner.

### 5.1 Specialist 4A: balance and systems QA

**Owns:** `src/idle/**`, `src/save/**`, `src/core/big.ts`, `tools/econ-sim.ts`, `tests/unit/idle/*` (model and sim), the A e2e specs.

**MUST:** every E-metric green on the real tables with all systems on; the human profile within ×1.6 of the bot for every first-run mark;
a save fuzz (500 random states, every system populated, corrupt slots, clock rollbacks, a mid-ceremony kill) with 0 losses; every failure
path re-checked against L11; the lead's W3 play-through notes on pacing fixed; SPEC §5.12 refreshed with the final sim output (the lead
edits SPEC from 4A's table).
**SHOULD:** a 30-day sim report in the gate notes.
**Tests:** all A tests; `tests/unit/idle/saveFuzz.test.ts`; `tests/e2e/idle-save.spec.ts` and `idle-economy.spec.ts` re-run.

### 5.2 Specialist 4B: visual and performance QA, the APK

**Owns:** `src/world/**`, `src/render/**`, `src/entities/**`, `src/game/effects/**`, `src/lab/**`, `android/**`, `tools/descent-capture.mjs`,
`tools/fill-scan.ts`, `tools/perf.mjs` and `tools/apk-sim.mjs` (both handed over from C for this wave), `docs/device-test-protocol.md`.

**MUST:** captures of every biome, Echo mutator, Vista and ceremony at 360 × 740, 390 × 844 and 412 × 915 (DPR 2), each judged, with V1–V10
inside their bands and no visual defect left (z-fighting, popping chunks, seams at the ring, light leaks, empty-looking screens, unreadable
HUD over bright biomes); P1–P6 inside budget; `DD_RELEASE=1 android/build-apk.sh` builds the APK and `node tools/apk-sim.mjs` boots and plays
it (taps reach the game, the portrait lock holds, Back works); `docs/device-test-protocol.md` updated for the descent (P7 steps).
**SHOULD:** a battery soak note (20 minutes on Balanced in the protocol).
**Screenshots:** `w4-b-<biome>-<viewport>.png` for all, `w4-b-store-01.png` … `-08.png` (the store set: the first tap, a chest reveal, a
Vista, a seal fight, the Surge, the Lantern sheet, an Echo stratum, the Plunge).

### 5.3 Specialist 4C: UX, the full suite, docs and the release

**Owns:** `src/ui/**`, `src/game/**` except effects, `src/audio/**`, `src/main.ts`, `src/debug/**`, `src/i18n/**` except `idleCore.ts`,
`idleWorld.ts` and `idleLore.ts`, `tests/e2e/**` except A's and B's specs, `tools/ui-check.mjs`, `tools/capture.mjs`, `package.json`,
`vite.config.ts`, the root docs and `docs/*.md` except `docs/idle/` and `docs/device-test-protocol.md`.

**MUST:** the whole e2e suite green on its ports (run sequentially, one heavy job at a time); `tools/ui-check.mjs` at three viewports green;
a scripted "first-time player" e2e (`tests/e2e/idle-firstplay.spec.ts`: 3 taps/s at random world points, buying only what the ghost hand
points at, for 10 minutes accelerated where idle) that meets G1, G2, G4 and sees every tutorial step; copy polish (one voice, ≤ 8 words per
prompt, no unexplained term); the docs rewritten for the new game: `TECHNICAL_ARCHITECTURE.md` (the descent architecture: SPEC §6, §11,
§12 as built), `GAME_DESIGN.md` (a summary of SPEC with a link), `ART_DIRECTION.md` (the new pillars and looks), `PROJECT_STATUS.md`,
`TEST_REPORT.md` (every metric with its measured value), `CHANGELOG.md` (2.0.0), `KNOWN_ISSUES.md`, `docs/store-listing.md` (the new
description, the feature list, the store screenshots from 4B), `docs/release-checklist.md`; `package.json` version 2.0.0 (and the
`versionCode` through `tools/version.mjs`); `README` of `android/` if the build steps changed.
**SHOULD:** a short "How to play" page in the Codex Guide.
**Tests:** every e2e spec; `tests/unit/version.test.ts`; `tools/audio-check.mjs` (every new sound renders offline without clipping).

### 5.4 Definition of done (the release gate)

1. Every metric of SPEC §13 is green and recorded in `TEST_REPORT.md` with its measured value.
2. Every biome (14), every mutator (8) and every ceremony has a judged capture; no placeholder art, no grey debug material, no missing
   icon, no untranslated key, no "TODO" in player-facing text.
3. A fresh install plays from the surface through the tutorial, Seal 1, the first Rekindle and an Echo stratum (accelerated) with no
   crash, no console error and the goal bar always on screen.
4. The APK builds in release mode, boots in `apk-sim`, locks portrait, handles Back and lifecycle, saves on pause.
5. Old v1/v2 saves show the one-line notice and start a fresh descent; settings survive.
6. `npm run build` (tsc + vite) is clean; `npm test` is green; the e2e suite is green on all three ports.
7. The docs describe the game that ships.

---

## 6. Test inventory

**Existing unit tests** (`tests/unit/`), with their fate, owner and wave:

| Test | Fate | Owner | Wave | Why |
|---|---|---|---|---|
| `aimAssist.test.ts` | delete | C | W1 | aim assist is gone |
| `audio.test.ts` | rewrite | C | W1 | IdleEvents in the event map; new recipes |
| `audioSystem.test.ts` | rewrite | C | W1 | no item ids |
| `bloomSettle.test.ts` | delete | C | W1 | WorldFeatures and the zone are gone |
| `brand.test.ts` | keep, extend | C | W3 | `mythic` and HUD-over-scrim pairs |
| `cache.test.ts` | delete | A | W1 | the expedition cache is gone |
| `camera.test.ts` | delete | C | W1 | CameraRig is gone (DescentCamera has its own test) |
| `character.test.ts` | keep, adapt | B | W1 | the foreman's poses |
| `cold.test.ts` | delete | A | W1 | — |
| `economy.test.ts` | delete | A | W1 | the zone economy is gone (`idle/cells.test.ts` and the sim replace it) |
| `gameplay-crafting.test.ts`, `gameplay-inventory.test.ts`, `gameplay-mining.test.ts`, `gameplay-objectives.test.ts`, `gameplay-progression.test.ts`, `gameplay-survival.test.ts` | delete | A | W1 | `src/gameplay/` is gone |
| `genVersion.test.ts` | delete | B | W1 | replaced by `idle/slabFingerprint.test.ts` |
| `governor.test.ts` | keep, extend | B | W3 | the fine resolution controller |
| `guidance.test.ts` | delete | C | W1 | ropeRide and HomeField are gone |
| `homeField.test.ts` | delete | B | W1 | — |
| `i18n-sections.test.ts` | rewrite | C | W1 | the new sections |
| `livingRock.test.ts` | delete | B | W1 | — |
| `menuCamera.test.ts` | delete | C | W1 | the menu is the surface shot |
| `mesh-sculpt.test.ts` | keep | B | — | the mesher is kept |
| `mesh-worker.test.ts` | rewrite | B | W1 | fixtures from RingWorld slabs |
| `moths.test.ts` | rewrite | B | W1 | synthetic anchors |
| `player.test.ts` | delete | C | W1 | PlayerController is gone |
| `props.test.ts` | keep, adapt | B | W1 | the moved PropSpec type |
| `records.test.ts` | delete | A | W1 | replaced by `idle/records` tests in W2 |
| `rift.test.ts` | delete | C | W1 | — |
| `ropeRide.test.ts` | delete | C | W1 | — |
| `routeWalk.test.ts` | delete | C | W1 | — |
| `runeDoor.test.ts` | delete | C | W1 | — |
| `runes.test.ts` | delete | C | W1 | — |
| `save-settings.test.ts` | rewrite | A | W1 | the new settings fields |
| `save-system.test.ts` | rewrite | A | W1 | v3, the legacy result |
| `save-v2.test.ts` | delete | A | W1 | replaced by `idle/save-v3.test.ts` |
| `save-worldDelta.test.ts` | delete | A | W1 | there is no voxel delta |
| `session.test.ts` | delete | C | W1 | WorldSession is gone |
| `stations.test.ts` | delete | C | W1 | — |
| `structures.test.ts` | rewrite | B | W1 | builder geometry only |
| `tapToAct.test.ts` | delete | C | W1 | TapController is gone (`idle/tapSurface.test.ts`) |
| `terrainMaterials.test.ts` | keep, extend | B | W2 | new painters |
| `touchCamera.test.ts` | delete | C | W1 | — |
| `ui-screens.test.ts` | rewrite | C | W1 | menu, settings, about |
| `ui.test.ts` | rewrite | C | W1 | no hearts or inventory |
| `version.test.ts` | keep | C | — | — |
| `voxModel.test.ts` | rewrite | B | W1 | no `Drops` |
| `world.test.ts` | keep | B | — | VoxelWorld, light, raycast, mesher invariants |
| `worldFeatures.test.ts` | delete | B | W1 | — |
| `worldgen.test.ts` | delete | B | W1 | replaced by `idle/slab.test.ts` and `idle/fill.test.ts` |

**Existing e2e specs** (`tests/e2e/`): `slice.spec.ts`, `world.spec.ts`, `desktop.spec.ts`, `progression.spec.ts`, `tap.spec.ts`: **delete**
(C, W1; they only covered the third-person game). `release.spec.ts`: **rewrite** in portrait (C, W1). `dd.ts`: **rewrite** for `__DD__.idle`
(C, W1). `touch.ts`: **keep and extend** (C, W1).

**New tests by wave** (owner):

| Wave | Unit (`tests/unit/idle/`) | E2E (`tests/e2e/`, 390 × 844, real taps) | Sim (`tools/econ-sim.ts`) |
|---|---|---|---|
| W1 | big, notation, cells, shaft, tap, run, offline, goals, tutorial, pacing, save-v3 (A); ring, slab, descentCamera, slabFingerprint (B); tapSurface, ledger, easeSpring, juiceBudget (C) | idle-save (A, 4173), idle-world (B, 4174), idle-core, idle-tutorial, release (C, 4175) | `first` (E1–E6) |
| W2 | seals, director, widgets, chests, contracts, daily, codex, feats, rank, facets, prestige, noPunishment, days (A); fill, lut, fracture, particles, sectionField (B); timeline, ceremonyBudget, flashBudget (C) | idle-economy (A), idle-world extended (B), idle-loops, idle-ceremony (C) | `days 3` (E8–E11, E15–E25) |
| W3 | weave, breach, mutators, echo, days14, lore (A); composite, plunge, periods, governor (B); compat, i18nCoverage, iconScale, brand (C) | idle-prestige (A), idle-hd (B), idle-ui (C) | `days 14`, `human` (E4, E10) |
| W4 | saveFuzz (A) | idle-firstplay (C); every spec re-run | final tables into SPEC §5.12 |

---

## 7. Risks and what we do about them

| Risk | Answer |
|---|---|
| The economy runs away or stalls once the side systems are added | the sim includes every system at its expected rate from W2 and gates every wave; the knobs are listed in SPEC Appendix A; side multipliers are budgeted (E25) |
| Streaming hitches or seams at the ring | the dead-slab barrier, worker slabs, one slab per frame, `meshCheck` and the light equality in e2e (W4) every wave |
| Too many systems for "ultra simple" | progressive reveal and first-time cards (SPEC §8); the first 10 minutes show only tapping, three cards and the goal bar; every system is optional |
| SwiftShader hides GPU cost | budgets are checked CPU-side in `perf.mjs` and on the device protocol in W4; every effect has a preset cap and an FX LOD step |
| Three specialists collide in shared files | ownership tables, contracts in the first 45 minutes, the lead as the only cross-owner channel, i18n and event files split by owner |
| Old-game code lingers | the W1 gate's path and grep check |
| The final wave finds design problems | W3's gate includes a cold play-through whose notes become W4 tasks; W4 fixes, never redesigns |
