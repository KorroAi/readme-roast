# Final pass — workstream contracts (producer plan)

## w1-loop-core  (wave 1)

**Goal.** Make every trip a real risk/reward decision and make progress durable: 6 materials with tight stacks, the Sealed Pouch, fuel that turns into cold, a turn-back mark and a compass driven by a walking-distance field, one recoverable cache instead of losing the pack, trip tracking and records, and the save v2 groundwork. Also build the code seams that let later waves work in parallel: the Progression controller, MenuCamera, i18n sections, UI contracts and the crash guard.

**Depends on.** —

**Effort.** 4–4.5 h (heavy). MUST core about 3.75 h. Cut order: drop fade → HUD tick styling → compass gradient falls back to field distance with a straight bearing.

**Ownership.**
- src/game/Game.ts
- src/game/Progression.ts (new)
- src/game/MenuCamera.ts (new)
- src/game/Guidance.ts
- src/game/WorldSession.ts
- src/game/Drops.ts
- src/game/GameUi.ts
- src/gameplay/** (Inventory, Expedition, Lantern, Health, Objectives, Journal, Storage, counts; new Cold.ts, Records.ts)
- src/world/analysis/reachability.ts
- src/world/analysis/homeField.ts (new)
- src/config/items.ts
- src/config/balance.ts
- src/config/blocks.ts
- src/core/events.ts
- src/save/types.ts
- src/save/saveData.ts
- src/save/SaveSystem.ts
- src/save/worldDelta.ts
- src/ui/types.ts
- src/ui/hud/Hud.ts
- src/ui/screens/inventory.ts
- src/ui/screens/menu.ts (death and pause text paths only)
- src/ui/dev/sandbox.ts
- src/debug/DebugApi.ts
- src/i18n/en.ts
- src/i18n/index.ts
- src/i18n/en/core.ts (new)
- src/i18n/en/loop.ts (new); creates the empty stubs en/{release,brand,world,screens,hud,feel}.ts, whose ownership then passes to their streams
- tests/unit/gameplay-*.test.ts
- tests/unit/save-*.test.ts
- tests/unit/session.test.ts
- tests/unit/{cold,homeField,cache,records,genVersion,menuCamera,i18n}.test.ts (new)
- tests/e2e/world.spec.ts
- tests/e2e/slice.spec.ts
- tests/e2e/desktop.spec.ts
- tests/e2e/dd.ts

**Tasks.**
- [MUST, first 20 min] Split en.ts into sections:
- en.ts spreads src/i18n/en/{core,loop,world,release,brand,screens,hud,feel}.ts. Create the empty stubs for the other streams.
- Add a unit test that no key appears in two sections.
- Text fixes in core:
  - 'menu.version' → 'v{version}'
  - Ancient/Crumbling/Hearth Brick → Ancient Ashlar / Loose Masonry / Hearth Stone
  - 'Glowmoss Stone' → 'Lichen Stone'
  - shrine and objective lines without 'brick'
  - tagline 'FOLLOW THE LIGHT DOWN'
- [MUST] Materials:
- Add rootFibre and echoShard, plus the 7 rune key items (ids from plan §7). The Ancient Tablet stays as the Lantern rune.
- Stacks: stone 30, fibre 20, copper 15, iron 10, glimmer 10, echo 5.
- Cave soil drops rootFibre at 45%; iron ore drops 1–2.
- [MUST] Pack:
- balance.ts pack tiers 6 / 8 / 10, with a 2-slot Sealed Pouch on tier 3.
- Inventory protects the last N slots: takeUnprotected() for black-outs, plus dropStack(i).
- [SHOULD] Loose drops fade after 90 s and dim over the last 10 s.
- [MUST] Lantern and cold:
- Lantern tiers: Oil 300 s, Copper 600 s, Attuned 900 s (noCold, ember 0.7).
- gameplay/Cold.ts (pure): 8 s grace after the flame dies, then −10 hp every 5 s. No cold at camp; Attuned is immune; damage factor 0.5 with the coat flag.
- [MUST] world/analysis/homeField.ts:
- BFS from the camp region over standable cells, reusing reachability.standable. Int32 distances.
- walkHome = D × 1.35 / 4.6 s; steepest-descent target 6 cells ahead; extra-edge hook for rides.
- Recompute on camp:left and every 25 mined blocks; report the time in ms.
- Guidance/compass switch to walking metres, replacing Math.hypot at Game.ts:990 and the stairs-only polyline at Game.ts:169–172.
- [MUST] Turn-back:
- HudState.turnBackFraction = (walkHome × 1.25 + 10 s) / capacity.
- Emit 'lantern:turnBack' once per trip with the toast 'Turn back — about {s} s to camp'. Critical state at walkHome × 1.0.
- Minimal HUD in Hud.ts: a 2 px tick on the existing bar, .is-tight / .is-critical / .is-cold classes, and a second compass chip for the cache. W4-B redesigns these.
- [MUST] Cache:
- Expedition.makeCache = pack minus pouch, plus loose drops.
- Placement: the last cell where the explorer stood grounded ≥ 0.3 s that is inside the boot reachable set.
- One at a time: a second black-out destroys the old cache and reports its item count.
- Pickup within 1.6 m; overflow stays. Saved in the same write as the death.
- die() and returnToCamp() leave a cache instead of deleting the pack.
- Interim prop: an existing model with an ember glow, replaced by the W2 satchel model.
- Death screen text: 'Left in your pack' plus 'Your pack lies at −{d} m — {n} items'. Pause label: 'Leave your pack here and return to camp'.
- [MUST] Trip tracker and gameplay/Records.ts:
- Tracked: expedition n, t0, deepest, found, banked, damage, fuel at return, discoveries, outcome (returned / blackout / abandoned).
- Records: deepest, biggestHaul, expeditions, blackouts, bestStreak. They only go up.
- Emit 'expedition:started' and 'expedition:ended' with an ExpeditionReport (basic fields; W2/W3 add next and overnight).
- Emit 'record:depth' for each new best in 10 m steps.
- [MUST] Save v2:
- SAVE.version 2. MIGRATIONS[1]: fill defaults and move stacks above the new limits into storage, with no loss.
- SaveData.progression sub-object (day, expeditions, trip, records, cache, stations, gear, relics, seams, minedDay, hintsShown, finale, compassTarget), with normalize defaults so later waves add fields without a version bump.
- normalizeSave drops unknown item ids and counts them, instead of rejecting the save.
- WORLD.genVersion + SaveData.genVersion. A mismatch drops worldEdits and removedProps, keeps everything else, wakes the explorer at camp and shows the toast 'save.worldShifted'.
- tests/unit/genVersion.test.ts: FNV fingerprint over the generated volume and prop ids, recorded after round-4 worldgen has landed.
- [MUST] Seams in Game.ts:
- Progression controller (update, onCampEntered, onCampLeft, onBlackout, onAbandon, interact, interactLabel, hud, views, toSave, fromSave). die, returnToCamp, bank, interact and hudState delegate to it.
- Extract MenuCamera.ts: the current pose, plus the explorer's menu pose on the ledge lip with the lantern lit, plus a 30 fps cap while in the menu.
- Frame guard: try/catch around step(). After 3 consecutive failures: mode 'crashed', stop the loop, keepScreenOn(false), suspend audio, no autosave after the first error, dispatch the window CustomEvent 'dd:crash'. The counter resets on any good frame.
- Persist hintsShown.
- VERSION from src/version.ts (W1-B).
- 'item:picked' gains the drop's screen point; DiscoveryNotice gains {index, total, major}.
- [MUST] Contracts:
- ui/types.ts: the HudState fields and SaveSummary from plan §7.
- Game.createActions: getSaveSummary, getReport, dismissReport.
- Sandbox fake actions and fixtures so src/ui/dev compiles and shows the new HUD fields.
- [MUST] Tests:
- Rewrite e2e world.spec: death leaves a cache; walking to it restores the items; the cache persists across a reload.
- slice.spec and desktop.spec stay green on DD_E2E_PORT.

**Acceptance.**
- npx tsc --noEmit is clean. npx vitest run passes the whole existing suite plus the new tests. e2e (slice, world as rewritten, desktop) passes on DD_E2E_PORT=4173.
- Cold unit test: first damage exactly 8 s after the flame dies, −10 hp per 5 s, black-out 58 s after empty from 100 hp. Zero damage while lit, during the grace or at camp. The Attuned flag is immune and the coat factor halves the damage.
- homeField property test over every reachable cell: the turn-back fuel ≥ walkHome × 1.25, and following the gradient reaches camp in ≤ D steps. Recompute time on the container is printed (target ≤ 15 ms).
- At the balcony the compass distance is within 10% of the walked BFS distance. It showed 152 m straight-line against a 208 m walk before.
- Cache unit tests: contents = pack minus pouch plus loose drops; a second black-out replaces the cache and reports the count; pickup restores the items; overflow stays. A fuzz of 200 lethal falls (including the chasm and the 20 m rift drop) puts every cache in the boot reachable set.
- Save tests:
- A v1 fixture migrates to v2 with oversized stacks moved into storage and item totals unchanged.
- A save holding 'fooOre' loads with that slot emptied and the dropped count reported.
- A genVersion mismatch keeps inventory, equipment, journal and stats, empties the edits, spawns at camp and sets the toast flag.
- The fingerprint test fails when one generated block changes.
- The existing 75 save tests still pass.
- Frame guard unit test: a step that throws every frame gives mode 'crashed' after exactly 3 frames, with no save after the first error. A single transient throw recovers.
- MenuCamera unit test: the pose for t = 0..10 s matches the pre-refactor pose within 1e-6. A play.mjs menu capture is unchanged by eye. The menu frame counter shows ≤ 30 fps.
- There are no player-facing strings outside src/i18n, and the unit test finds no duplicate key across sections.


## w1-release-infra  (wave 1)

**Goal.** Make DEEP DOWN uploadable and robust: a Play-grade AAB pipeline (Gradle + CI, target/compile SDK 36), the API-36 shell behaviours, one versioning source, a crash screen, automatic low-end quality, licences and privacy, the adaptive icon and splash pipeline, and the director's checklist. It starts now so the closed-test clock can start right after this wave.

**Depends on.** —

**Effort.** 4–4.5 h. MUST core about 3.75 h. Cut order: ios-plan → context-loss notice → icon-masks tool → store-listing polish.

**Ownership.**
- android/** (MainActivity.java, new modern/ShellCompat sources, AndroidManifest.xml plus a Gradle manifest overlay, res/**, build-apk.sh, make-icon.mjs, README.md, new settings.gradle.kts, build.gradle.kts, gradle.properties, app/build.gradle.kts)
- /home/user/readme-roast/.github/workflows/deep-down-android.yml (new)
- package.json (version field only)
- tools/version.mjs (new)
- tools/apk-sim.mjs
- tools/icon-masks.mjs (new)
- tools/tours/first-five.json (new)
- vite.config.ts
- playwright.config.ts
- src/main.ts
- src/version.ts (new)
- src/render/QualityGovernor.ts (new)
- src/ui/styles.css
- src/i18n/en/release.ts
- docs/release-checklist.md (new)
- docs/store-listing.md (new)
- docs/device-test-protocol.md (new)
- docs/ios-plan.md (new, COULD)
- tests/unit/version.test.ts (new)
- tests/unit/governor.test.ts (new)
- tests/e2e/release.spec.ts (new)

**Tasks.**
- [MUST, first 10 min]
- Create src/version.ts exporting VERSION, BUILD and VERSION_CODE from the vite defines __DD_VERSION__ and __DD_BUILD__, with typed declarations.
- playwright.config reads DD_E2E_PORT (default 4173) so the two agents can run e2e in parallel.
- [MUST] Versioning:
- tools/version.mjs: versionCode = (MAJOR × 10000 + MINOR × 100 + PATCH) × 100 + BUILD, with BUILD from DD_BUILD or 0.
- package.json goes to 1.0.0.
- build-apk.sh, Gradle and the vite define all read it.
- [MUST] Gradle project:
- AGP pinned to an exact version.
- namespace com.korroai.deepdown; compileSdk 36, targetSdk 36, minSdk 24.
- Assets come from a stale-checked copy of ../dist.
- signingConfigs.release reads DD_UPLOAD_* from the environment only. No AndroidX, no minify.
- Gradle manifest overlay: android:appCategory='game', enableOnBackInvokedCallback='true', 'density' in configChanges.
- values-v31 windowSplashScreenBackground #05080C.
- [MUST] CI workflow, triggered by workflow_dispatch and tags deep-down-v*:
- Steps: checkout, node 22, npm ci, tsc, vitest, build, java 17, Android SDK, decode the keystore secret to $RUNNER_TEMP, gradle :app:bundleRelease :app:assembleRelease, upload the AAB and APK as artifacts.
- Label it 'unverified until its first run' in android/README.md.
- [MUST] Shell for API 35/36. MainActivity must still compile against API 23 for build-apk.sh: use reflection/Proxy for API 30+/33+ calls, or a Gradle-only source set.
- Back:
  - predictive Back through DeepDownAndroid.setBackHandled(bool), pushed from main.ts (true unless mode = menu and screen = menu, polled every 250 ms);
  - an OnBackInvokedCallback on API 33+, onBackPressed on 32 and below.
- Display:
  - LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES, with insets written to CSS variables as a fallback (take the larger of env() and the injected value);
  - immersive mode through WindowInsetsController on API 30+.
- Recovery and lifecycle:
  - onRenderProcessGone recreates the WebView and reloads;
  - onPause calls window.deepDownLifecycle('pause') (main.ts: saveNow('background') + pause + audio suspend, no double save within 1 s), then pauseTimers; onResume calls resumeTimers.
- Other:
  - setVolumeControlStream(STREAM_MUSIC);
  - WebContents debugging only when FLAG_DEBUGGABLE is set;
  - https links outside the app origin open with ACTION_VIEW.
- [MUST] Adaptive icon and splash pipeline in make-icon.mjs:
- Background, foreground and monochrome layers at 108–432 px; the legacy masked icon; play-icon-512.png (opaque, full-bleed); splash_logo.
- A layer-list windowBackground and mipmap-anydpi-v26/ic_launcher.xml.
- The current art is re-laid inside the 66/108 safe circle (W2-B swaps in the emblem).
- tools/icon-masks.mjs previews the circle, squircle, rounded-square and teardrop masks.
- [MUST] Crash panel (main.ts, styles.css, en/release.ts):
- It listens to 'dd:crash' and, after boot, to window 'error' and 'unhandledrejection'.
- Text: 'DEEP DOWN hit a problem. Your last autosave is safe.'
- Buttons: [Restart] reloads; [Copy details] copies version, versionCode, user agent, GL renderer and the first stack trace. Nothing is sent anywhere.
- The boot fatal() message reuses the panel with Restart. deepDownBack returns false on the panel.
- [MUST] QualityGovernor.ts: a pure ring buffer with no allocations, installed from main.ts through the public Game API (mode, updateSettings, bus toast).
- First launch: Battery when deviceMemory ≤ 3 or hardwareConcurrency ≤ 4, otherwise Balanced.
- While playing: sample from 5 s after play starts over an 8 s window. A median above 22 ms on Balanced → Battery; above 40 ms on Battery → renderScale 0.65.
- Downshift only; one toast; a manual quality change switches auto off for good.
- Off under navigator.webdriver unless ?autoq=1.
- [MUST] Licences and privacy:
- A vite plugin emits dist/licenses.txt (the three.js MIT text from node_modules/three/LICENSE, plus the Vite helpers notice) and a self-contained dist/privacy.html built from en/release.ts.
- The privacy wording follows the release audit §F: no data collected, Android backup wording kept.
- DD_RELEASE=1 builds only index.html (no visuallab, no sandbox).
- [MUST] apk-sim and the tour:
- apk-sim: reload timeout 180 s, prints the load average, adds a crash-panel check.
- tools/tours/first-five.json: the scripted first-five-minutes tour (menu → new game → tunnel → mine copper → return → workbench) run at every wave close.
- [MUST] Docs:
- docs/release-checklist.md: every director-only step from plan §12, with exact commands.
- docs/store-listing.md: title pending the trademark check; short and full descriptions with no promise of future content; IARC and Data safety answers.
- docs/device-test-protocol.md.
- [SHOULD] Context-loss notice: 'Restoring graphics…' and pause while the context is lost; after 10 s, the crash panel. Add an e2e test. [COULD] docs/ios-plan.md.

**Acceptance.**
- version unit test: 1.0.0 → 1000000; 1.2.3 build 7 → 1020307; a prerelease above its release is refused. `aapt dump badging` on the build-apk.sh output shows the computed versionCode and versionName 1.0.0.
- build-apk.sh still compiles the shell with the API-23 toolchain and signs it. apk-sim passes 3 out of 3 consecutive runs on the fresh APK.
- `aapt2 dump badging` lists mipmap-anydpi-v26 for application-icon-65534. play-icon-512.png is 512×512, opaque and under 1 MB. The icon-masks previews show the whole mark under all 4 masks (checked by eye).
- e2e release.spec on its own port:
- With drawElements patched to throw: the crash panel is visible within 1 s, mode is 'crashed', fewer than 10 console errors, and no game:saved event after the first error.
- Restart → menu with Continue on the pre-crash save.
- A post-boot Promise.reject also shows the panel.
- Governor unit tests on synthetic frame-time streams:
- 16 ms stays Balanced;
- 30 ms → Battery after the window;
- 50 ms on Battery → renderScale 0.65;
- 30 ms for 2 s then 16 ms → no change.
The e2e with ?autoq=1 and CDP CPU throttling ×6 switches to Battery with exactly one toast, and the setting persists after a reload.
- dist/licenses.txt contains the three.js copyright line and the MIT text. dist/privacy.html renders offline inside the APK in apk-sim. `unzip -l` on a DD_RELEASE APK shows no visuallab or sandbox files.
- The Gradle and CI files exist. `git grep` finds no keystore password or key material. The workflow reads only GitHub secrets. android/README.md says it is unverified until the first CI run.
- Stubbed-bridge test: deepDownLifecycle('pause') records a save and a pause. setBackHandled(false) is sent exactly at the menu root and true everywhere else.


## w2-tree-camp-stations  (wave 2)

**Goal.** Real progression you can see: the 14-node upgrade tree with prereqs and places, camp stations that rise from the ground where you build them, an iron economy that supports a tier, the Echo and Ironbound blocks for the deep tier, gear that changes how you move, and a Next line that always tells you one thing to do.

**Depends on.** w1-loop-core

**Effort.** 4–4.5 h. MUST core about 4 h. Cut order: stake-sign text → rise dust → the Survey Table opens records only.

**Ownership.**
- src/config/recipes.ts
- src/config/balance.ts
- src/config/items.ts
- src/config/blocks.ts
- src/config/tiles.ts
- src/config/runes.ts (new; RUNES glyph data moved out of render/textures.ts)
- src/render/textures.ts (RUNES move only)
- src/gameplay/Crafting.ts
- src/gameplay/Equipment.ts
- src/gameplay/Objectives.ts
- src/gameplay/Expedition.ts
- src/gameplay/Records.ts
- src/gameplay/Health.ts
- src/gameplay/NextStep.ts (new)
- src/game/Game.ts
- src/game/Progression.ts
- src/game/WorldSession.ts
- src/game/PlayerController.ts
- src/core/events.ts
- src/world/gen/generateWorld.ts
- src/world/gen/types.ts
- src/world/gen/architecture.ts
- src/render/props/models.ts
- src/render/props/PropRenderer.ts
- src/render/props/shapes.ts
- src/render/props/palette.ts
- src/render/terrainMaterial.ts and src/render/materials/{minerals,index}.ts (additive mapping for blocks 34/35 only)
- src/save/types.ts
- src/save/saveData.ts
- src/ui/types.ts
- src/ui/screens/inventory.ts
- src/ui/dev/sandbox.ts
- src/debug/DebugApi.ts
- src/i18n/en/loop.ts
- src/i18n/en/world.ts
- tests/unit/{gameplay-crafting,worldgen,props,genVersion,terrainMaterials,camera}.test.ts
- tests/unit/{economy,stations}.test.ts (new)
- tests/e2e/progression.spec.ts (new)
- tests/e2e/slice.spec.ts
- tests/e2e/dd.ts

**Tasks.**
- [MUST, first 30 min] Move the RUNES glyph data to src/config/runes.ts; render/textures.ts imports it with pixel-identical output. W2-B, W3-A and W3-B read it from there.
- [MUST] Tree data:
- NodeDef with a result union (equip tier | station | site | gear), place, prereqs, line/tier for layout, and a behaviour-sentence key. The 14 nodes from plan §2.3. RecipeId becomes an alias of NodeId (data-key craft:copperPickaxe kept).
- Balance tiers: pickaxe 4, lantern 3, pack 3.
- Gear: gripBoots (jumpVelocity 10.1, safeFallSpeed 18.3); minersCoat (maxHealth 140, cold × 0.5).
- [MUST] Crafting and Equipment:
- canCraft reasons: owned | locked (prereq) | notHere | missing | carryToSite.
- Camp nodes pay from storage plus pack; field sites from the pack only.
- Equipment tiers, gear and stations persist inside the progression save.
- [MUST] NextStep.ts and Objectives:
- The 6-step tutorial chain is unchanged.
- After it, the priority list from plan §2.7: cache → carried site cost → cheapest MUST node with prereqs met and its first missing chip → runes k/8 → rumoured seam.
- Delete objective.done; the pill never says 'done'.
- [MUST] View contracts:
- ui/types.ts: CraftTreeView, ExpeditionReport.next and craftableNow, SurveyView, JournalView, SaveSummary.
- Actions: craft(NodeId), getCraftTree, openCrafting(place), openBoard, getSurvey, setCompassTarget, openJournal, getJournal, openAbout, continueAfterEnding, dropStack. W3-A fills the survey, journal and ending data.
- Sandbox fixtures for every view.
- [MUST] Functional Workbench screen (inventory.ts buildCrafting): nodes grouped by place, lock reasons ('Build the Forge first'), cost chips; the Forge station opens its tab. Interim scaffolding: W3-B replaces it with the tree.
- [MUST] Worldgen. All new draws come from a forked rng appended after the existing calls.
- 3 camp plots: Survey Table (37,101,48), Forge (42,101,33), Relic Shelf (31,101,33), each a chalk outline plus a stake sign with the cost.
- Iron: gateIron 8 → 12, a galleryIron box at x 139–151, z 98–103, riftIron 6 → 8.
- Blocks:
  - ECHO_CRYSTAL 34: tier 3, hardness 6, the crystal tile tinted pale cyan-white, glow in the shader only, zero light-volume emission;
  - IRONBOUND 35: tier 3, hardness 12, the seal-stone look with a rune band.
  - Both get materials now; W3-A places them.
- [MUST] Prop models in the existing style:
- forge, with a LIGHT_EMBER emitter;
- surveyTable;
- relicShelf, with 8 sockets that light up;
- cache satchel with an ember glow, replacing the W1 interim prop.
Build = a 1.6 s rise from the ground with dust and the craft sound. Stations persist through save and reload and are interactable: the Forge opens its tab, the Table opens the board, the Shelf opens the journal runes. The shelf appears with the first rune (the Ancient Tablet counts).
- [MUST] Gear effects: Grip Boots in PlayerController (jump and safe fall), Miner's Coat in Health (max 140, cold × 0.5). No node ships without its effect.
- [MUST] tests/unit/economy.test.ts:
- For each node in tree order, the cumulative cost ≤ the sight-minable supply unlocked before it (reachability by tier and gate, × 1.5 average drop), with the Bloom off.
- ≥ 30 sight-minable iron voxels behind the seal.
- Fe supply ≥ 1.3 × the tree's Fe total (45).
- Print the per-node table.
- [MUST] e2e progression.spec: craft Copper Pickaxe → build Survey Table → build Forge → craft Iron Pickaxe, with the HUD Next line changing at each step; the stations survive a reload. slice.spec stays green.
- [SHOULD] Wire the dropStack action (Inventory.dropStack exists from W1); the UI comes in W3.

**Acceptance.**
- 14 nodes exist. Crafting unit tests cover every refusal reason and both payment sources. The Next line is never empty after the tutorial and never 'done' (unit test). Every node has a behaviour sentence and a working effect.
- The economy test passes, and its per-node supply/cost table is pasted into the wave report.
- Worldgen:
- The determinism test passes.
- Every pre-existing landmark and prop id is unchanged (unit test against an id snapshot).
- Each plot is 2×2 standable with ≥ 3 m headroom, ≥ 2.2 m from props and off the spawn → exit path.
- No prop overlaps after building.
- Fingerprint and genVersion updated by the rule.
- The emission budget test still counts ≤ 120 cyan/violet emitters (103 before); the forge emitter is warm.
- Camera fuzz with Grip Boots: 0 frames inside rock. Reachability with the boots: the rift floor stays disjoint from the main reachable set. Safe fall is 7 m (unit test).
- Existing block materials are unchanged: terrainMaterials.test.ts green, and the Visual Lab material shots for existing blocks are pixel-identical to the G1 baseline.
- e2e progression.spec and slice.spec are green. play.mjs captures of the camp before and after building all three stations are saved in artifacts/final-pass/w2/ and read by eye.


## w2-brand-identity  (wave 2)

**Goal.** Give DEEP DOWN its own visual identity, 'Lamplight on the Lintel':
- brass and amber expedition kit for the player, cyan builders' ink for the ancients;
- octagon plates and lintel headers in place of generic rounded translucent cards;
- a carved Lintel wordmark whose O is the lantern rune;
- a boot mark, specimen item icons and a launcher icon all drawn from one emblem.

**Depends on.** w1-loop-core, w1-release-infra

**Effort.** About 4 h. MUST core about 3.5 h. Cut order: motion/veil (moves to W4-B, which owns UI.ts) → ART_DIRECTION section → subtitle lockup.

**Ownership.**
- src/ui/styles.css
- src/ui/ui.css
- src/ui/UI.ts
- src/ui/icons.ts
- src/ui/sprites.ts
- src/ui/notices.ts
- src/ui/pixelFont.ts (delete)
- src/ui/brand/** (new: tokens.ts, strokeFont.ts, wordmark.ts, motion.ts, emblem geometry as a plain ES module plus .d.ts shared with make-icon.mjs)
- src/ui/hud/hearts.ts
- src/ui/screens/menu.ts
- src/ui/screens/settings.ts
- src/ui/screens/widgets.ts
- src/ui/screens/host.ts
- index.html
- android/make-icon.mjs
- vite.config.ts
- src/i18n/en/brand.ts
- src/i18n/en/core.ts
- tests/unit/ui.test.ts
- tests/unit/brand.test.ts (new)
- ART_DIRECTION.md (UI section only)

**Tasks.**
- [MUST] Tokens on .dd-ui, mirrored in brand/tokens.ts, using the plan §3 values.
- Octagon plates through a clip-path --cut (9 / 8 / 6 / 4 px), with the 1 px brass rim from layered backgrounds.
- Lintel header groove with pendant ticks; ledger rows with dotted leaders and tabular numbers.
- Amber-300 focus ring on ::after; the primary, secondary, danger, disabled and pressed button states.
- 12 px text floor (fixes ui.css:170/722/791/956/1483); 48 px targets with 8 px gaps.
- Remove #5ff0ff, pills and backdrop-filter.
- Restyle every existing screen, the HUD, toasts and the discovery band with CSS only, keeping every class hook.
- [MUST] The Lintel stroke face:
- A–Z, 0–9 and − . · / ? ' as filled polygons on the 4×7 grid.
- Wordmark DEEP DOWN, each word hanging from its headline; the lantern-rune O has an amber flame inside cyan ink, a warm light falls on D, W and N, and DEEP stays cold.
- Lockups: landscape line, portrait stack, emblem, and an optional subtitle line ('LANTERN HOLLOW') for the trademark decision.
- role=img with an aria-label; the flame's idle flicker is off under reduced motion.
- [MUST] Replace pixelFont.ts in the menu and the loading screen, delete it, and rewrite its tests (ui.test.ts:28–66) as glyph-coverage, layout and lantern-O position tests.
- [MUST] Home page minimum (menu.ts):
- The Visual Lab shows only with import.meta.env.DEV or ?dev=1.
- Version line bottom-left: 'v{version} · made entirely in code'.
- The tagline sits between brass rules.
- [MUST] Boot mark: an inline SVG emblem of about 600 bytes in index.html, with a 2.4 s breathing amber core in pure CSS, visible before the bundle parses. Favicon from the same emblem.
- [MUST] Specimen item icons: 16×16 sprites in the existing SHARD/TABLET/PICKAXE style for stone (slate flake), rootFibre, copper (lump with glints and a verdigris fleck), iron (dark lump with a jasper streak), echo shard and a rune stone. Icons map by item id with a fallback. No cubeIcon call remains in src/ui.
- [MUST] Launcher art: make-icon.mjs draws the emblem from the shared geometry into the W1 adaptive pipeline (foreground inside the safe circle, a monochrome silhouette). The web app's maskable icons get correct padding (vite.config webApp).
- [SHOULD] Motion:
- brand/motion.ts duration and easing tokens.
- A UI.ts exit crossfade: the leaving screen goes to an inert, aria-hidden layer and fades out over 140 ms while the new one enters over 240 ms.
- A full-screen veil API (show/hide with a duration) for W4-B's opening.
- Reduced motion: opacity only, ≤ 150 ms.
- [SHOULD] ART_DIRECTION.md UI section: the two registers, the tokens, the octagon, the lintel and how the logo is built.

**Acceptance.**
- ui-check over every scene at land, port and desk, plus the Large, contrast and lefty variants, reports zero problems (no clipped text, no target under 48 px). The screenshots are read by eye.
- Unit test computes WCAG contrast from tokens.ts: every text token is ≥ 4.5:1 on its surface (bone-100 15.4 … danger-400 6.8). grep finds no #5ff0ff and no pill radii ≥ 11 px in src/ui/*.css; any exception is listed.
- Wordmark: legible at 200, 330 and 520 px and stacked at 390×844 (ui-check menu and loading shots). Unit tests cover glyph coverage for A–Z and 0–9, layout widths and the lantern-O position. pixelFont.ts no longer exists.
- A play.mjs screenshot taken ≤ 300 ms after navigation shows the boot mark.
- grep finds no cubeIcon in src/ui. The icon test rasterizes every ItemId.
- aapt2 badging still lists the adaptive icon, and the icon-masks previews show the whole lantern mark.
- The menu has no Visual Lab button without ?dev=1 and shows it with ?dev=1. e2e is green with no selector changes.


## w3-rift-runes-bloom  (wave 3)

**Goal.** The deep half of the game: build the Rift Winch and ride into the rift, mine Echo crystal, collect the eight runes and wake the monolith for the ending, and make every night renew the Hollow (regrowth plus rumoured seams), so 'one more trip' always has a target.

**Depends on.** w2-tree-camp-stations

**Effort.** 4–4.5 h. MUST core about 4 h. Cut order: Halden Lift → seam glint → rumours show distance only (no area names).

**Ownership.**
- src/game/Game.ts
- src/game/Progression.ts
- src/game/WorldSession.ts
- src/game/PlayerController.ts
- src/game/Guidance.ts
- src/gameplay/Journal.ts
- src/gameplay/NextStep.ts
- src/gameplay/Expedition.ts
- src/gameplay/Crafting.ts
- src/gameplay/Bloom.ts (new)
- src/core/events.ts
- src/world/gen/generateWorld.ts
- src/world/gen/types.ts
- src/world/analysis/homeField.ts
- src/world/analysis/reachability.ts
- src/render/props/models.ts
- src/render/props/PropRenderer.ts
- src/render/props/monolith.ts
- src/render/props/shapes.ts
- src/config/balance.ts
- src/config/blocks.ts
- src/config/items.ts
- src/config/recipes.ts
- src/save/types.ts
- src/save/saveData.ts
- src/save/SaveSystem.ts
- src/debug/DebugApi.ts
- src/i18n/en/world.ts
- src/i18n/en/loop.ts
- tests/unit/{worldgen,genVersion,economy,camera,props}.test.ts
- tests/unit/{bloom,rift,runes}.test.ts (new)
- tests/e2e/progression.spec.ts
- tests/e2e/world.spec.ts
- tests/e2e/dd.ts

**Tasks.**
- [MUST] Ride system in Progression: a scripted ride along an authored rope polyline, in both directions.
- Input locked, player kinematic, camera driven by CameraRig.snapTo each frame (public API, no CameraRig edit), creaks through the existing sfx events.
- Ride edges are added to homeField.
- [MUST] Rift Winch field site:
- A snapped winch frame on the balcony floor (≈133.5,25,124.5), repaired by carrying its cost (paid from the pack only).
- The rope runs down the measured clear column x 131, z 124 to (131.5,7,124.5); the ride takes 4 s.
- Triggers the 'The Rift' discovery; the depth record can reach 144 m.
- [MUST] Rift content:
- The 2 rift crystalFormation groups become Echo clusters (2–3 drops), plus ≥ 12 Echo voxels.
- 2 Ironbound relic niches: one off the corridor beyond the seal, one in the rift wall.
- Echo glows in the shader only.
- [MUST] The 8 runes:
- One runeStone prop with 8 glyphs from config/runes.ts, at the placements in plan §2.6.
- Collecting one gives a key item (never lost), a journal page with one short line (mystery rules), a lit Relic Shelf socket, and the 'relic:found' event.
- The Lantern rune is the existing tablet.
- Discoveries go from 6 to 9: + The Rift, Echo Crystal, The Answer.
- [MUST] Finale:
- At 8/8 the monolith niche turns violet → cyan.
- Within 4 m: 'The Answer' (one line) and 'finale:reached', once, saved.
- End-card data (expeditions, deepest, play time) through JournalView and continueAfterEnding.
- [MUST] Bloom.ts (pure):
- A day advances on camp entry after an expedition ≥ 60 s. Regrowth rule from plan §2.5.
- generateWorld emits layout.seamSites deterministically (wall rock patches of 5–8 voxels next to reachable standable air, ≥ 10 m apart, tagged by area).
- 3 active seams (4 once the rift is open), ore weights by area, at most 2 glimmer seams of ≤ 5 voxels, rock → ore only, expiry after 2 days or 75% mined.
- Applied as one batched setBlock pass behind the report.
- SurveyView rumours ('An iron seam below the bridge — 38 m'), a compass target, and the report's overnight section.
- [MUST] Complete the NextStep priority (carried site, runes, seams). Document the progression save fields and freeze them as the v2 / 1.0 format, with a defaults test.
- [MUST] __DD__ mutating helpers (give, teleport, setBlock, grant) work only when navigator.webdriver is set or with ?debug=1. Add the test helpers grantNode, grantRunes and rideWinch.
- [MUST] Extend the economy test to the full tree including Echo: ≥ 12 voxels plus clusters cover Ec 7.
- [SHOULD] Halden Lift:
- A broken cage with a slack cable at the stairs foot (≈122.5,42,104), repaired from the pack.
- A 3 s ride to the camp mouth, and the 'Halden Lift' discovery.
- If it is not finished, remove the node, site and discovery.
- [SHOULD] A glint on active seam faces (a prop sparkle, not a voxel emitter).

**Acceptance.**
- Winch ride:
- Both endpoints are standable; the top is in the main reachable set and the bottom in the rift set.
- A round trip returns the explorer within 0.5 m of the start.
- A camera fuzz along the rope gives 0 frames inside rock.
- Every rune prop is reachable with exactly its gate (tier or winch), checked by a unit test over reachability. The finale fires exactly once at 8/8 (unit test).
- e2e: grant 7 runes → collect the 8th → the shelf shows 8/8 → walk to the monolith → 'finale:reached'.
- Bloom:
- A 20-day fuzz of random mining plus blooms keeps every critical landmark reachable.
- Every write is either a generated ore id into a generated-ore cell, or rock → ore at a seam site.
- Deterministic from (seed, day); the glimmer seam cap holds.
- The bloom batch's frame time on SwiftShader is measured and reported.
- The emission budget is unchanged (≤ 120); Echo glow adds no light-volume emitters.
- e2e progression.spec: build the winch (cost granted) → ride down → depth HUD ≥ 140 m → mine Echo → ride up. The world.spec cache flow stays green.
- In a normal browser session without ?debug=1, __DD__.give does nothing. The whole e2e suite stays green.


## w3-progression-screens  (wave 3)

**Goal.** Make progression readable and rewarding on a phone, in the new identity:
- the upgrade tree, with tiers descending;
- the Expedition Report after every trip;
- the Survey Table board;
- the Journal as a collection of discoveries and the eight runes;
- the ending card;
- the About / Licences screen.

**Depends on.** w2-brand-identity, w2-tree-camp-stations

**Effort.** 4–4.5 h. MUST core about 4 h. Cut order: Drop and pouch restyle → groove sparks → stat bars.

**Ownership.**
- src/ui/UI.ts
- src/ui/types.ts
- src/ui/screens/workbench.ts (new) + workbench.css
- src/ui/screens/summary.ts (new) + summary.css
- src/ui/screens/board.ts (new) + board.css
- src/ui/screens/journal.ts (new) + journal.css
- src/ui/screens/ending.ts (new) + ending.css
- src/ui/screens/about.ts (new) + about.css
- src/ui/screens/inventory.ts
- src/ui/screens/settings.ts
- src/ui/screens/widgets.ts
- src/ui/screens/host.ts
- src/ui/dev/sandbox.ts
- tools/ui-check.mjs
- src/i18n/en/screens.ts
- src/i18n/en/core.ts
- tests/unit/ui.test.ts
- tests/unit/ui-screens.test.ts (new)
- tests/e2e/slice.spec.ts

**Tasks.**
- [MUST] Upgrade tree (workbench.ts; buildCrafting moves out of inventory.ts):
- Tabs: Workbench | Forge | Camp & Field. Columns are the lines (Pickaxe, Lantern, Pack, Gear, Stations/Sites), and tiers descend along a carved groove.
- 56 px octagon nodes at a 64 px row pitch. States: owned, craftable (pulses on open), partial (materials ring), locked (violet '?' plus the reason), carry (field site).
- Detail pane (right 40% in landscape, a 46% bottom sheet in portrait): the behaviour sentence, before → after stat bars, the cost ledger, and a tap-to-Craft button keeping data-key craft:{id}.
- On craft, the node lights for 220 ms and sparks run along the groove for 400 ms.
- [MUST] Expedition Report (summary.ts):
- Opens on 'expedition:ended', after the camp autosave, never over another open screen; a tap skips it.
- Layout: 3 columns in landscape, 1 in portrait.
- Content:
  - a ledger with the NEW BEST stamp;
  - banked items counting up over 600 ms;
  - discoveries and runes;
  - the lost/cached black-out variant;
  - Overnight (the Bloom);
  - a Next card with missing chips;
  - the CTA Open Workbench / Head Out Again.
- data-key summary-close.
- [MUST] Survey board (board.ts): the records ledger plus the rumour list with distances. Tapping a rumour sets it as the compass target.
- [MUST] Journal (journal.ts):
- Tabs:
  - Discoveries: zone header k/N; found lore cards with the rune emblem plus expedition and depth; unfound entries as '?' with a light hint.
  - Runes: 8 plates inked once found, k/8.
  - Relic texts.
- Reachable from the Bag and the Relic Shelf (the menu button comes in W4).
- [MUST] Ending card (ending.ts) on 'finale:reached': 'THE LANTERN HOLLOW — COMPLETE · Expeditions · Deepest · time · The Hollow keeps growing.' [Continue].
- [MUST] About (about.ts), reached from Settings:
- Version and versionCode, and the © line from the repo LICENSE until the director decides otherwise.
- The credits body (everything procedural).
- The full three.js r186 MIT notice (?raw import of three/LICENSE) and the Vite helpers MIT notice.
- The privacy statement from en/release.ts.
- A support contact only if the director has supplied one; never a placeholder.
- [MUST] Sandbox scenes and ui-check SCENES for crafting:tree, crafting:forge, summary, summary:blackout, board, journal:discoveries, journal:runes, ending and about. Update e2e slice to close the report and craft through the tree.
- [SHOULD] Backpack sockets as 64 px octagons, pouch slots drawn with a lock, and long-press Drop (the action exists from W2).

**Acceptance.**
- ui-check: every new scene at land, port and desk, plus the Large and contrast variants, reports zero problems. The tree fits 915×412 without scrolling; portrait uses the bottom sheet at 390×844. The screenshots are read by eye.
- Unit: the journal counts equal the layout's discovery list; craftState precedence is unchanged; the report renders the black-out variant with lost/cached counts.
- e2e slice: Craft Copper Pickaxe through the tree (data-key craft:copperPickaxe); the report appears after banking and closes through summary-close; the 'camp' autosave still fires before the report. The whole e2e suite is green.
- The About screen is reachable in ≤ 2 taps from the menu (via Settings) and shows the three.js copyright and the MIT text.
- There is no DOM churn on steady frames (the existing ui-check check).


## w4-feel-juice  (wave 4)

**Goal.** Make every swing, step, landing and pickup feel physical on a phone:
- a visible kick and hit-stop that never move the aim;
- clean grey dust and metal sparks;
- footsteps that land on the feet;
- landing weight;
- pickups that pop and sing;
- an explorer grounded by a contact shadow.
The round-4 lighting stays intact.

**Depends on.** w2-tree-camp-stations, w3-rift-runes-bloom

**Effort.** 4–4.5 h. MUST core about 3.75 h. Cut order: S2 → body reactions → screen FX → Vein Strike.

**Ownership.**
- src/game/Game.ts
- src/game/CameraRig.ts
- src/game/MiningController.ts
- src/game/Drops.ts
- src/game/PlayerController.ts
- src/game/effects/Particles.ts
- src/game/effects/Debris.ts
- src/game/effects/TargetMarker.ts
- src/game/effects/Juice.ts (new)
- src/entities/character/pose.ts
- src/entities/character/ExplorerModel.ts
- src/entities/character/secondary.ts
- src/entities/character/parts.ts
- src/render/terrainMaterial.ts
- src/render/terrainRig.ts
- src/render/PostFX.ts
- src/render/entityMaterial.ts
- src/render/structures/structureMaterial.ts
- src/audio/sfx.ts
- src/audio/eventMap.ts
- src/audio/AudioSystem.ts
- src/ui/haptics.ts
- src/config/blocks.ts
- src/core/events.ts
- src/save/types.ts, src/save/settings.ts, src/ui/screens/settings.ts (only for the SHOULD 'Reduce flashes')
- src/i18n/en/feel.ts
- tests/unit/{camera,character,audio,audioSystem,player,gameplay-mining}.test.ts
- tests/unit/{juice,haptics}.test.ts (new)
- tests/e2e/desktop.spec.ts
- tests/e2e/world.spec.ts
- tests/e2e/dd.ts

**Tasks.**
- [MUST] Split aim from presentation; kick and hit-stop.
- rayThrough uses the un-shaken basis.
- 2D angular kick spring (ω 38 rad/s, ζ 0.45). Impulses: hit 0.40 rad/s, metal 0.45, break 0.80, too-hard 0.30 lateral with alternating sign.
- Break FOV punch: −1.5° in 50 ms, back over 220 ms.
- Hit-stop: 45 ms on a hit, 75 ms on a break. The explorer's dt, new debris and the kick freeze; the 0.42 s mining cadence is kept.
- Trauma retuned to 0.025 rad with decay 3/s, used only for landings and damage.
- Everything × settings.cameraShake.
- [MUST] Dust and debris:
- BlockDef.dust in host-rock greys; dust multiplier 2.6 → 1.1, alpha 0.5 → 0.32. Hits make 1 puff of 0.12–0.22 m, breaks make 5.
- Metal ores: 4 sparks per hit and 10 per break. A new streak kind stretched along velocity, #ffcf8a → #ff7a2a, gravity 14, life 0.18–0.32 s.
- Crystal: no cyan cloud, just 3 dark puffs.
- Battery: counts × 0.5.
- Particle pool of 400 structs with no allocation per spawn.
- [MUST] Footsteps: emit from the animator when the phase crosses π/2 and 3π/2, while walk > 0.25 and grounded. Remove the 1.15 m distance stepper in PlayerController. L/R pan ±0.12 and pitch ±3%; read the block under each foot.
- [MUST] Landing and jump:
- When v > 5 m/s: 6 + 8·sat((v − 5)/12) radial dust puffs, plus 4 pebbles at v ≥ 10.
- Pivot dip −0.05·sat((v − 4)/10) m on a spring (ω 18, ζ 0.6).
- Takeoff: 3 puffs and a 60 ms anticipation squash.
- [MUST] Pickups:
- Spawn pop 0 → 1.22 → 1.0 (easeOutBack).
- Magnet: delay 0.22 s, radius 3.2 m, with a tangential swirl so drops arc in.
- Absorb: squash, 3 sparkles and a pack spring.
- Pitch ladder: 880–1760 Hz D major pentatonic for pickups within 0.7 s, capped at 6 steps, reset after 0.9 s, through SfxParams.pitch.
- [MUST] Lantern pendulum impulses: +1.2 rad/s per hit, +2.0 per break, +0.12·v on landing.
- [MUST] Contact shadow S1 in the terrain and structure shaders:
- Two occluder spheres: hips at feet + 0.45 (r 0.42), torso at feet + 1.15 (r 0.45).
- Ambient and placed light × (1 − 0.6·occ); lantern × (1 − 0.35·occ).
- Gated within 2.5 m of the feet; runs on every preset.
- [MUST] Haptics map (extend src/ui/haptics.ts, no second system):
- prop:hit 10 ms; prop:broken [12,40,16]; landing ≥ 10 m/s 15 ms; block hit 12 ms.
- lantern:low [20,80,20]; lantern:empty [40,60,40].
- items:banked [8,30,8,30,8]; pickups of uncommon and above 10 ms; relic [10,50,24].
- turnBack and cold pulses.
- A global 50 ms floor between pulses.
- [SHOULD] Screen FX in PostFX:
- Discovery: a radial pulse from the projected landmark (peak 0.35, τ 0.6 s) replacing the full-frame wash at PostFX.ts:157.
- Damage: an edge-weighted red rim instead of the full-screen tint.
- A breathing vignette for low fuel and cold.
- A 'Reduce flashes' setting, on by default under prefers-reduced-motion.
- [SHOULD] Body and mining:
- Too-hard recoil and a damage flinch.
- Death collapse: Game.die delays the death screen 1.1 s and the lantern drops to an ember.
- A 1.4 s celebration for major discoveries.
- Vein Strike on the Glimmer-edged Pickaxe: also breaks 1–2 connected voxels of the same ore, 0.12 s apart, never a different block id.
- [COULD] Explorer lantern shadow S2 on Balanced and High.

**Acceptance.**
- Unit: rayThrough output is bit-identical with and without trauma or kick. The existing aim-at-feet camera tests pass. With Camera Shake = 0 there is zero presentation motion.
- Fixed-step capture (the audit's juice.json through tools/play.mjs, before and after in artifacts/final-pass/w4/juice/):
- the camera moves 2–4 px within 50 ms of a hit and 5–7 px on a break, and settles in under 150 ms;
- the impact pose holds 3 frames (5 on a break);
- the mining period stays 0.42 s ±1 frame.
- Dust: no particle pixel with chroma > 0.35 and luma > 0.5 except sparks and sparkles. Saturated cyan stays ≤ 3% on the crystal-break frame.
- Footsteps: over 3 s at 4.6 m/s every footstep fires within 0.05 rad of a plant phase, and the count equals cadence × time ±1 (unit test).
- Pickups: 3 quick pickups play 3 ascending pitches (unit test on eventMap). The overshoot frame is visible in the capture.
- Contact shadow:
- Floor luma under the boots is ≥ 25% darker than the floor 1.5 m away, at the camp, the ledge and a stair.
- Draw calls are unchanged; perf.mjs A/B on SwiftShader is within noise.
- Round-4 tour frames keep their mean luma within ±3% of the G1 baseline outside the feet region.
- Haptics unit test: every listed event maps to a pattern, and the 50 ms floor holds under a 10-pickup burst. Feel stays labelled unverified until a phone is used.
- The particle count never exceeds the preset budget (Battery 120) in the capture. A heap snapshot during continuous mining near the waterfall shows zero allocations per frame.
- e2e is green, including the touch and desktop mining flows.


## w4-home-opening-hud  (wave 4)

**Goal.** A first minute worth publishing:
- an opening that carves the logo out of the dark;
- a home screen with the explorer on the ledge looking into the Hollow, and a Continue card that shows your progress;
- a HUD where the lantern is the clock and the way home is always readable.

**Depends on.** w1-loop-core, w2-brand-identity, w3-progression-screens

**Effort.** About 4 h. MUST core about 3.5 h. Cut order: coach marks → fly-to → the portrait pose falls back to the cropped landscape pose.

**Ownership.**
- src/game/MenuCamera.ts
- src/ui/UI.ts
- src/ui/types.ts
- src/ui/screens/menu.ts
- src/ui/hud/Hud.ts
- src/ui/hud/hearts.ts
- src/ui/notices.ts
- src/ui/TouchControls.ts
- src/ui/ui.css
- src/ui/styles.css
- src/ui/brand/**
- index.html
- src/ui/dev/sandbox.ts
- tools/ui-check.mjs
- src/i18n/en/hud.ts
- src/i18n/en/core.ts
- tests/unit/ui.test.ts
- tests/unit/hud.test.ts (new)
- tests/e2e/slice.spec.ts

**Tasks.**
- [MUST] Home composition:
- Per-aspect hero poses in MenuCamera.ts:
  - landscape: the explorer on the ledge lip at ~62–68% x, lantern lit, seen from behind, the Spindle off-centre, a ±1.2 m drift over 40 s;
  - portrait: a vertical pose on the glimmerfall with the explorer in the lower third.
- Left column: wordmark at 330 px, tagline, Continue card, New Expedition, and a Journal | Settings row.
- Continue card: 'Continue Expedition {n}' · 'saved {time}' · 'Best −{d} m · Discoveries {k}/{N} · Runes {r}/8'.
- A left-to-right darkening veil.
- No save: New Expedition with 'Your first descent'. Damaged save: a danger rim and the existing text.
- [MUST] Opening sequence:
- The index.html boot mark grows into the wordmark: the headline carves (450 ms), the letters hang (45 ms stagger), the flame lights (220 ms).
- Progress shows as a 240×2 brass groove with the existing loading labels.
- When the world is ready (wait ≤ 0.6 s for the title), the veil fades (900 ms), the wordmark moves to its slot (600 ms) and the buttons rise (60 ms stagger).
- Any tap or key finishes everything at once. Buttons take clicks from their first frame.
- Quit-to-menu uses only a 300 ms veil. Reduced motion uses opacity ≤ 150 ms.
- If W2-B did not land the veil API, build it here in UI.ts.
- [MUST] HUD:
- The lantern gauge is the hero element: a 22 px glyph, a 150×12 octagon-capped bar, the time in m:ss, the HOME mark at turnBackFraction, and 'home ≈ m:ss' when fuel < 2× the need.
- States tight, critical, empty and cold each get a glyph plus a word; a frost edge shows when cold.
- Ember-garnet hearts at 16 px (7 with the coat).
- Depth in Lintel numerals with a violet NEW BEST.
- Bag button badge n/N, amber when full; the .dd-pill text is kept.
- Compass chip with walking metres and the cache or seam target.
- The Next chip dims to 60% after 8 s without change.
- Every e2e hook stays.
- [MUST] Pause and death:
- Pause ledger: 'Depth · Out m:ss · Pack n/N · Fuel %'.
- Return to Camp subtitle: 'Leave {n} items as a cache', or 'Nothing to lose' with no confirm when the pack is empty.
- Death screen in bone, not red: 'Your pack lies at −{d} m — {n} items, marked on your compass'.
- Add the menu's Journal button.
- [MUST] Toasts and banner:
- Record toast 'New depth record −{d} m', once per 10 m step.
- 'Upgrade ready: {node}' on camp entry.
- Discovery banner label 'DISCOVERY · k/N'.
- Minor discoveries use a compact 44 px top strip so they never cover the mining target.
- [MUST] Sandbox HUD scenes (hud:tight, hud:critical, hud:cold, hud:cache, hud:newbest) plus real-game menu captures in landscape and portrait.
- [SHOULD] Item fly-to the Bag button:
- A quadratic Bézier, 380 ms, at most 4 icons in flight.
- The pill bounces 1 → 1.16 → 1.
- Full pack: the pill shakes.
- Under reduced motion the icon fades instead of flying.
- [SHOULD] Coach marks for walk, look and mine: one at a time, data-touch-ignore, never over the target, using the persisted hints.

**Acceptance.**
- Real-game captures (tools/play.mjs) at 915×412 and 390×844 show the explorer and a Hollow landmark, with no column behind the wordmark or buttons. They are read by eye.
- Opening:
- A 200 ms-step frame sequence shows boot mark → carve → veil → menu.
- A tap during the intro reaches the final state in under 50 ms.
- A reduced-motion run shows no transforms.
- e2e slice, world and desktop are green; the menu buttons are clickable at once.
- Unit tests:
- the Continue card shows the correct facts from a saved game;
- the HOME mark fraction rises with walk-home time and is absent at camp;
- the record toast fires once per 10 m step.
- ui-check: every HUD, menu, pause and death scene at 3 viewports, plus Large, contrast and lefty, reports zero problems, with no DOM churn on steady frames. The e2e still asserts .dd-lantern[role=meter] aria-valuenow, .dd-bar-fill, the .dd-pill n/N text, .dd-hearts .dd-heart.f2 and the .dd-depth-value '-N m' text.

