# DEEP DOWN — Test Report

Milestone M1 (vertical slice "The Lantern Hollow"). Environment: Linux container, 4 CPUs,
Node 22.22, headless Chromium 141 (Playwright 1.56.1) with WebGL 2 through SwiftShader
(software rendering). **No physical Android device or emulator was available.**

## Results at a glance

| Check | Result |
|---|---|
| TypeScript (`npx tsc --noEmit`, strict; src, unit and e2e tests) | 0 errors |
| Unit tests (`npx vitest run`) | **488 passed**, 37 files (19 Oct 2026, final-pass wave 1 close) |
| End-to-end (`npx playwright test`, production build) | **10 / 10 passed** (8.9 min) at the final-pass wave 1 close, 19 Oct 2026: desktop 2, release 6 (crash panel, rejected promise, Android bridge, context loss, quality governor, no WebGL 2), slice, world (black-out cache). The specs now wait on game time, so a loaded machine slows them instead of failing them. Earlier: 4/4 after visual round 4; 9 consecutive full runs passed during the first verification. |
| UI + touch checks (`node tools/ui-check.mjs --no-shots --game`) | **61 / 61 passed**, 0 console problems (wave 1 close). Sandbox alone 48/48: the hold and joystick checks follow the mobile controls (230 ms hold, a joystick base that follows the thumb) |
| APK packaging (`node tools/apk-sim.mjs`) | **all checks passed** at wave 1 close (start, save, reload, Continue, offline privacy.html, licenses.txt, crash panel, Back on the panel, Restart, 0 refused requests, 0 page errors) |
| Android APK (`DD_RELEASE=1 android/build-apk.sh`) | built, aligned, signed: 446,062 B, versionCode 1000000, versionName 1.0.0, minSdk 24, targetSdk 36, adaptive icon; **not run on a device**. The Gradle AAB and CI are written but cannot run here (unverified) |
| Code review | 5 areas reviewed adversarially, each finding independently verified, every confirmed finding fixed; a final audit of these documents and of the late changes (below) |
| Mutation checks on the new HUD / desktop tests | freezing the hearts, lantern meter, backpack count, compass or objective, or forcing crosshair aim, makes the intended assertion fail |

## Final pass, wave 2 (world variety + brand identity)

### Final pass W2: world variety (agent A, port 4173)
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 44 files, 546 tests passed.
- New tests, 35 in 6 files:
  - worldFeatures (9): containment, camp margin, reachability sealed and open, ride sweeps, light budget and warm lamps, light leak, spacing, empty floor, beats.
  - livingRock (6).
  - moths (7): roost ≤ 1.5 m, lantern in ≤ 4 s, tappers, cap, 0 in rock over 60 s, < 0.05 ms per step.
  - ropeRide (5).
  - runeDoor (5).
  - guidance (3): the hoist ratio, 0.589 from the yard and 0.519 from the foot.
- Edited tests: genVersion (RECORDED 2 = 865cc3b6), worldgen (warm-lamp list +5), props (3 sizes), audio (sample payloads), structures (monolith bounds).
- e2e `DD_E2E_PORT=4173 npx playwright test`: 11/11 passed in 12.2 min. The new world.spec test 'Halden log, hoist lock and ride, rune door, rope to the rift floor, the black stone' takes 3.2 min. It covers the log, the hoist lock, the release and ride, a save, reload and ride down, door 1 waking and sinking, the relic, the rope with no damage, the rift floor discovery and the stone's first touch.
- poi-density, after vs before: max sight gaps 18.2/18.4/17.8/10.2/12/15/16 (was 51.1/36.1/40/–/33/74.4/38.7); empty floor over 10 m 13.2 % (was 26.9 %), columns over 15 m 51 (was 631).
- Tour: tools/world-tour.json f01–f20, 6 rounds at 915x412, every image read.
  - 0 % clipped; cyan ≤ 3.1 %; +2 to +10 draw calls and +1k to +5k triangles per shot.
  - Dark share (luma < 12) above 18 % on f13 (21.3 %, pre-existing pillar at the camera) and f17 (21.4 %, existing tunnel).
- Not covered: phone feel, audio by ear, device timing.

W2 brand:
- **tsc:** clean.
- **vitest:** 544/545. The single failure was the world agent's load-sensitive moths timing test, which passed on rerun. New: brand.test.ts 18 tests (tokens and contrast, CSS token parity, no neon/pills/blur, 12 px floor, glyph coverage and 8-direction strokes, TrueType structure and checksums, wordmark accessibility, legibility and cold DEEP, subtitle, emblem, boot mark size, motion). ui.test.ts rewritten: Lintel coverage, layout, lantern-O position, a specimen icon for every ItemId.
- **e2e on port 4174:** 11/11 (21.0 m).
- **ui-check:** 64/64 checks, 0 console problems and 0 layout problems over 20 scenes × 5 viewports with a 48 px target floor, including the game flow.
- **Icons:** icon-masks 4/4 PASS; aapt2 badging lists the adaptive icon; apk-sim all PASS.
- **Production menu:** Visual Lab hidden without ?lab and shown with it.
- **Boot mark:** FCP 176 ms with no script.
- **Evidence:** screenshots in artifacts/final-pass/brand/ (gitignored).

## Final pass, wave 1 (loop core + release infrastructure)

W1 loop core, agent A, port 4173, final code: tsc clean; vitest 37 files / 488 tests passed (was 27 / 416). New tests: cold (8), homeField (7, warm recompute 2.03 ms, balcony 191 m walk = 191 m BFS vs 152 m straight), cache (5, fuzz of 200 lethal falls: chasm 30, hollow 150, rift 20, every cache on the reachable set), records (6), genVersion (3, fingerprint 9cbb0a10 for genVersion 1), menuCamera (4), save-v2 (7), gameplay-progression (10), frame guard (2 in session.test). e2e full suite 10/10 passed in 8.8 m (desktop 2, release 6, slice, world rewritten for the cache). ui-check 43/47; the same 4 touch failures appear on HEAD.

Final pass W1 release-infra (2026-10-19):
- `npx tsc --noEmit`: clean. `npx vitest run`: 37 files, 488 tests passed. New: version.test.ts (7) covers 1.0.0→1000000, 1.2.3+7→1020307, prerelease refused, DD_BUILD parsing, package.json 1.0.0; governor.test.ts (9) covers 16 ms Balanced, 30 ms → Battery after warm-up and window, 50 ms on Battery → 0.65, a 2 s burst is ignored, median vs outliers, 2 fps counts, gaps/reset/disable.
- e2e on DD_E2E_PORT=4174: 10 passed (15.8 min, load average about 8.6 with another e2e running). New release.spec.ts (6 tests): GPU failure → panel (mode crashed, < 10 console errors, no save after the first error, save byte-equal, Restart → Continue); rejected promise → panel, Copy details = report, DOMException ignored; stubbed Android bridge (setBackHandled false exactly at the menu root, lifecycle pause → one 'background' save + paused, keepScreenOn true while playing / false when paused); context loss notice + 10 s panel; governor with ?autoq=1 and CPU throttling ×6 → Battery, one toast, persisted, manual change → auto off; no-WebGL-2 boot → panel with Restart.
- Crash timing under SwiftShader: failed frames 0.4–2.3 s apart (normal frames take about 400–500 ms on SwiftShader at 915×412); panel 4–6 ms after dd:crash.
- APK: `DD_RELEASE=1 ./android/build-apk.sh` → 446,062 B, versionCode 1000000, versionName 1.0.0, sdk 24, targetSdk 36, application-icon-65534 = mipmap-anydpi-v26/ic_launcher.xml, no visuallab/sandbox files; play-icon-512.png 512×512, opaque, 7,075 B. `node tools/apk-sim.mjs` 3/3 consecutive passes (39–64 s each, load 5–8.6), including privacy.html offline, licenses.txt, crash panel, Restart → Continue, 0 refused requests, 0 page errors.
- `node tools/icon-masks.mjs`: all four masks PASS (0 mark pixels cut); preview read by eye.
- `node tools/play.mjs tools/tours/first-five.json`: menu → new game → tunnel → copper broken in 4 hits → camp (storage copperOre 2) → workbench screen open; screenshots read.
- Not covered: the Gradle AAB and CI (not runnable here); all native shell behaviour on a device; governor thresholds, haptics and audio on phones.

Wave close (orchestrator, quiet machine):
- `tsc` clean.
- `vitest` 488/488.
- e2e 10/10.
- `ui-check --game` 61/61.
- `DD_RELEASE=1 build-apk.sh` built, then apk-sim passed all checks.
- `tools/tours/first-five.json`: no FAIL, 7 screenshots read. Copper broke in 4 hits, it was banked at camp (storage copperOre 2), and the workbench opened.

## Automated tests

| Suite | What it proves |
|---|---|
| `world.test.ts` | voxel storage, dirty-chunk marking, mesher face culling / winding / AO, DDA raycast; light **property tests**: incremental mining, emitter removal and lamp moves equal a full recompute; no ghost light next to open emitters; mined voxels get openness; changed box covers every texel; lantern visibility agrees with per-voxel ray tracing on > 90 % of voxels, still lights the open side when the flame is inside a wall, recomputes on radius change, < 5 ms |
| `worldgen.test.ts` | determinism, intact bedrock shell, spawn in camp, every critical landmark reachable on foot, shrine & gate sealed until mined then reachable, ≥ 30 reachable copper veins, every prop light is a real emitter, carving never erases an emitter |
| `routeWalk.test.ts` | the real player controller walks camp → tunnel → ledge → both stair flights → hall floor **and back** with forward input only; reaches the seal, crosses the bridge, finds the shrine door |
| `player.test.ts` | walking, auto-step, 2-block walls block, landing speed (incl. the near-floor settle), no tunnelling at max fall speed, world bounds, rescue when embedded / NaN; compass and route guidance |
| `camera.test.ts` | 360 frames of fast turns in a 3×3 tunnel: the camera is never inside rock or behind rock; flush against a wall; shoulder swap when the right is walled in; full boom in open space; **fuzz** over 400 random standing poses in the real zone (60 frames each, mid-settle swipes): never inside rock, never a blocked line to the explorer (the previous rig failed this with 70 blocked frames) |
| `session.test.ts` | save-delta round trip, corrupt delta entries ignored, lamps settle and move their light when the floor is mined, a hanging lantern breaks (and its light goes out) when the voxel it hangs from is mined while mining a neighbour leaves it, prop removal removes its light, reset restores props |
| `props.test.ts`, `character.test.ts`, `voxModel.test.ts` | every prop kind and variant builds valid geometry within size ranges; picking; animation without NaN; explorer proportions, joints, swing timing, lantern pendulum, no pops; model winding |
| `audio.test.ts`, `audioSystem.test.ts` | music theory, voice limiter, scheduler (fake clock), event → sound mapping, generators, safe no-op without Web Audio |
| `gameplay-*.test.ts` | inventory stacking / capacity / key items, crafting (missing / owned / not-at-camp / consumption order), lantern edges and NaN safety, fall damage, mining tiers & decay, objectives chain incl. skip-forward |
| `save-*.test.ts` | two-slot saves, checksum corruption and interrupted-save recovery, migrations, newer-version detection, quota errors, stores that throw, settings sanitizing (incl. brightness), world delta |
| `ui.test.ts` | pixel-font title layout, joystick math (dead zone, continuity, clamping), touch-zone split incl. left-handed, hold/tap mining state machine, hearts, icon rasters, relative time and depth formatting, workbench rules matching gameplay |
| `tests/e2e/slice.spec.ts` (915×412, touch) | **the brief's 9-step definition of success.** Movement, mining and every button use real touch events (CDP); travel to the ledge, back to camp and to the Workbench uses the debug teleport, the rest of the recipe is granted with `__DD__.give`, and aiming uses `__DD__.aimAt`. Start → underground (depth HUD) → the joystick moves the explorer > 1.5 m → press-and-hold mines a copper vein and the ore lands in the backpack → Lantern Hollow banner → the backpack is banked at camp → Use → Workbench → Craft Copper Pickaxe → slate takes fewer hits, Hardened Slate breaks → save, reload, Continue restores pickaxe, position, mined seal and journal. Also: **autosaves** with reason `discovery`, `camp` and `craft` and the persisted slot's contents; **HUD**: hearts, lantern meter matching the fuel, backpack count 0/6 → n/6 → 0/6, compass `Camp` vs `Camp N m` (true distance within 1 m), objective line changing as objectives advance, target name `Copper Vein` while mining |
| `tests/e2e/world.spec.ts` (915×412, touch) | all six discoveries (crystals, Hollow, Deep Gate, shrine, tablet via the Use button, iron vein via tier gating) show their banners, enter the journal and are autosaved; a real 6 m fall damages the explorer and the hearts follow; burning fuel drives the lantern meter to its low state; a lethal 30 m fall shows the death screen, the death is already saved (deaths + 1, empty backpack), and the explorer wakes at camp with an empty backpack and audio resumed; simulated backgrounding (`visibilitychange` → hidden) saves with reason `background` and pauses, and play stays paused until Resume |
| `tests/e2e/desktop.spec.ts` (1280×720, mouse + keyboard) | real keyboard and mouse input: W walks > 1.5 m and releasing stops; Space jumps (apex > 0.5 m) and lands; right-button drag turns the camera and dragging back reverses it exactly, without mining or capturing the pointer; a left click captures the pointer, shows the crosshair, and holding the button mines the block under the crosshair (the debug aim turns the camera onto it); E at the Workbench opens crafting and releases the mouse, Esc closes it without pausing; I and Tab open and close the bag; Esc pauses; losing the capture unexpectedly (what the browser does with Esc while captured) pauses, also when the Esc is delivered too. Second test, a browser without the Pointer Lock API: holding the left button mines exactly the block under the cursor, and moving the free cursor does not turn the camera |

## Not covered by automated tests

- Mouse look with the pointer captured: in headless Chromium the synthetic mouse moves arrive as
  +N / −N pairs around the lock point and cancel out. Right-drag look (free cursor) is tested.
- A browser that has the Pointer Lock API but refuses the lock (tested only with the API removed).
- Real Chrome's handling of Esc while the pointer is captured (the release, and whether the key is
  also delivered, are simulated in the desktop spec).
- The `pagehide` save path and a real Android `onPause`; backgrounding is simulated with
  `visibilitychange`.
- The 45 s autosave timer and the `rest`, `respawn` and `new` save reasons (the death save, the
  explicit save and Save-and-Quit → Continue are tested).
- The HUD target panel while merely hovering a block (it is checked while mining).
- Fullscreen and the landscape lock are skipped when `navigator.webdriver` is set, so the e2e
  suite never exercises them. They were checked once by hand in mobile emulation with webdriver
  hidden: a real tap entered fullscreen in `landscape-primary`. Vibration is unit-tested against
  a fake `navigator.vibrate` only.
- Visual quality (screenshots inspected by eye), audio quality (not listened to), and everything on
  a real phone.

## Lead review (adversarial, then verified)

Five read-only reviewers (game flow, physics/camera/mining, rendering, world/light, mobile/Android)
reported findings; a separate verifier tried to refute each one. Outcome:

| Area | Confirmed and fixed |
|---|---|
| Game flow | **Critical: production builds shipped without the UI** (variable dynamic import) → static import. Audio stuck paused after Return to Camp; saved Glow / render scale ignored at boot; 60 FPS cap never enforced; death not saved; Back during loading; Delete Save undone by autosave; unreadable save wiped silently; items reaching the backpack in camp not banked; double rebuild on Continue; respawn facing the back wall |
| Physics / camera / mining | drops pushed through ceilings; missed landings (fall damage skipped); camera inside rock when flush against walls; camera through walls while turning; pointer-lock aim; right-drag after blur |
| Rendering | black screen without float render targets; debug `discard` in the opaque terrain shader (early-Z / HSR off on mobile GPUs); MSAA depth resolved every frame; waterfall depth per vertex over an 89 m quad; sRGB particle colors used as linear; black pixels in the moss texture; debris frozen after lowering the budget; halos popping at screen edges |
| World / light | lantern dark when the flame is inside a wall; O(r⁴) lantern recompute (up to 7 ms, ~15×/s); lantern radius changes ignored; mined voxels without openness |
| Mobile / Android | Visual Lab buttons untappable (label layer); Back exits during boot / in the lab; system font scale breaking layouts; screen kept on everywhere; font / locale changes reloading the game; APK script packaging a placeholder build; silent black screen on too-old WebViews; flaky e2e hit counting |
| Final audit (late changes) | wider camera shoulder let rock hide the explorer on the direct line (now checked, fuzz-tested); a throwing load left a stuck loading screen and New Game erased the save first; old-WebView guard checked Chromium 80 while the build needs 87; Esc while the pointer is captured did not pause (and a late capture-release could resume); UI key capture swallowed arrow keys of the lab scene picker; unstyled lab link; dead debug clip; APK-script message unreachable under `pipefail`; debug aim diverging off-centre |

The final audit also corrected 20 statements in these documents that overstated what was verified
(e.g. the success path was described as fully played by touch; desktop controls, autosave triggers
and most HUD elements were claimed as tested before the tests above existed).

Judged not reachable in this game but hardened anyway: ghost light from removing a lamp next to an
open emitter (no removable emitter raises another on the shipped seed); `data:` icon URLs reaching
the shell's request filter (Chromium resolves image `data:` URLs in the renderer).

## Visual identity audit (October 2026)

Method: the running game was captured at 915×412 (phone landscape, Balanced, SwiftShader) on a
fixed 12-shot tour (`tools/play.mjs` with the same teleports and camera angles every time:
camp, tunnel, crystals, ledge vista, stairs, hall pillars, seal/temple, shrine, Hollow crystals,
old camp, bridge, balcony) plus Visual Lab views, with discovery banners and hints hidden.
Three independent critics (originality/geometry, materials/seams, lighting/readability) read
every image and the responsible code and scored each category 1–10. The same tour and panel are
re-run after each round, so scores are comparable. Screenshots live in `artifacts/audit-*`,
`artifacts/iter*` (git-ignored).

| Round | Geometry | Materials | Transitions | Lighting | Cyan/glyphs | Originality | Readability | Character/props | Post |
|---|---|---|---|---|---|---|---|---|---|
| Baseline (pre-refactor) | 3 / 3 / 3 | 3 / 3 / 3 | 2 / 1 / 2 | 5 / 6 / 4 | 3 / 3 / 2 | 2 / 2 / 2 | 5 / 6 / 5 | 5 / 5 / 5 | 5 / 5 / 4 |
| Round 2 (materials, architecture, lighting, explorer) | 4 / 4 / 4 | 5 / 5 / 5 | 5 / 4 / 5 | 5 / 5 / 4 | 6 / 6 / 6 | 4 / 4 / 4 | 5 / 5 / 5 | 6 / 6 / 6 | 6 / 5 / 5 |
| Round 3 (sculpted rock, camera, exposure chain, masonry courses) | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 4 / 5 | 6 / 6 / 6 | 6 / 6 / 6 | 5 / 5 / 5 | 6 / 6 / 6 | 6 / 6 / 6 | 6 / 6 / 6 |

(three critics' scores per cell; later rounds are added below as they are run)

Round 2 (`artifacts/round2`, 13 shots: the fixed 12 plus `a13-colonnade`; each shot now settles the
simulation for 2 s first). Agreed wins: cyan restraint (shrine 28 % saturated cyan → ~0 %), no
printed tile grid, continuous floors, crystals hold their hue, the explorer reads. Agreed
regressions and weaknesses, which set round 3:
- natural rock still shows the 1 m step in silhouette (terraces, a cube boulder, kerb boxes);
- global contrast collapsed: tour p95 luma 64–247 → 50–83, luma std 24–58 → 14–26; the albedo
  ramps are painted as display colours (too dark) and the Hollow lost its cold half (cool-pixel
  share a06 53 → 13 %, a11 70 → 0.9 %); the ledge reveal (a04) is an empty navy plane;
- the explorer holds 62–73 % of the brightest 1 % of pixels and hides the route at a 0.7 m
  shoulder;
- the explorer's screen-door fade shows as a stipple over the a03 crystal cluster;
- masonry reads as an upscaled running bond; cracks are 1-texel black lines;
- Lab views are too dark to judge (lantern room 92 % below luma 12).

### Terrain renderer cost (A/B on the same machine, SwiftShader, Balanced, 915×412)

| Location | Before (wall FPS) | After material system |
|---|---|---|
| Camp | 13 | 11 |
| Tunnel | 8 | 5 |
| Ledge vista | 9 | 6 |
| Hollow floor | 9 | 8 |
| Bridge | 12 | 9 |

Round 3 (`artifacts/round3`, 17 shots: a01–a13 unchanged, plus a14 gate frieze, a15 hall columns,
a16 Spindle, a17 ledge reveal at a flatter pitch). Tour metrics (`metrics.py`, averages, round 2 →
round 3): p95 luma 64 → 134, std 20 → 38, local contrast 5.5 → 10.1, below luma 12 10.1 → 8.3 %,
clipped 0 → 0 %, saturated cyan 0.4 → 0.6 %, coldDark 45 → 76 %, explorer share of the brightest 1 %
60 → 26 %. Agreed wins: no 1 m step on natural rock, the Spindle and the Hollow read as silhouettes
against haze, masonry reads as large-format ashlar, crumbling as a wall coming apart, the explorer
is demoted. Agreed weaknesses, which set round 4:
- built architecture is the main voxel tell: 1 m stair risers, square-reading columns, box
  parapets and kerbs, a 5 m chasm that reads as a corridor, 1 m camp timber, the ziggurat
  monolith's glowing slits;
- near field: the white lantern core and raised floor albedo make the floor ahead read as snow
  (a04 foreground p90 163, saturation 0.13); warm share in the Hollow fell (a11 30 → 8.5 %); a
  mauve cast on Hollow stone (hue 300–360 a06 4.7 → 18.8 %); every key light is cyan, so the shrine
  is monochrome blue;
- surface presentation: textures still project from the undisplaced lattice (stretched chamfers,
  1 m top/side stripes on smooth rock), nearest-filtered camouflage speckle, facet wedges and
  sine-wave strata in the rock painter, runes as one icon per cell, a cube outline on the mining
  target, a pixel-column Glimmerfall;
- lens: a vertical 67° at 2.22:1 is a 111° horizontal view that stretches edge boxes; the boom
  collapses into a giant explorer at the balcony;
- Lab: the props capture is blank (camera), the game-light lantern room is still near-black.

Round 3 against round 2 (commit dc24090 vs 69a9f43, production builds, three alternating runs
each, wall FPS): camp 10 / 11 / 12 → 10 / 9 / 10, tunnel 5 / 5 / 5 → 4 / 4 / 5, ledge vista
5 / 6 / 6 → 6 / 6 / 5, Hollow floor 5 / 5 / 5 → 4 / 3 / 4, bridge 7 / 5 / 7 → 6 / 6 / 7; triangles
+3–16 % (wider lens, longer boom), GPU geometry 5.1 → 6.4 MB, boot to menu +0.15–0.2 s; mining
main-thread cost per block 0.64–0.91 → 0.68–0.79 ms with the chunk drawn one frame later (mesh
workers).

Round 2 against round 1 (commit e49ffd2 vs dc24090, production builds, alternating runs, two
each, wall FPS): camp 12 / 12 → 11 / 9, tunnel 6 / 6 → 5 / 5, ledge vista 5 / 6 → 6 / 5, Hollow
floor 7 / 5 → 7 / 7, bridge 9 / 10 → 9 / 8. Triangles +12–18 % (the new architecture), CPU frame
time unchanged (≈2 ms), boot to menu 1.64 s → 1.77 s, GPU geometry 4.6 → 5.1 MB, light emitters
399 → 108. Run-to-run noise on this container is about ±1–2 FPS.

Feature isolation in the world viewer (frames in the same 6 s window, vista camera): all
features 56, without sculpting 57, without macro noise 58, without faceted normals 59, without
boundary blending 57, none of them 60; the old renderer 61. SwiftShader is a CPU rasterizer, so
these are relative numbers only; GPU cost on a phone is unmeasured.

## Visual inspection log (real WebGL screenshots, inspected and iterated)

| Iteration | Found | Fixed |
|---|---|---|
| 1 | Lantern too saturated; reveal view blocked by a pillar; chamber unreadably dark | warmer-neutral lantern; pillars moved off the sightline; openness ambient + lighter fog |
| 2 | Colored light turned red with distance (per-channel subtractive decay) | multiplicative, hue-preserving decay |
| 3 | Bridge / balcony tiles "glow everywhere"; glyph frame repeated one rune | sparse inlays; per-position texture variants (3 runes, carved brick) |
| 4 | Tunnel ended over a void | tunnels lay rock shelves across open space; reachability test |
| 5 | Crystal formations read as glowing cube piles | slender voxel cores + large faceted shard props |
| 6 | Distant lamps invisible through fog | additive halos (now camera-facing quads) |
| 7 | Camp: giant uniform orange deck, red hearth "rug" | smaller decks, soil floor, sooty ember-cracked fire pit, weathered wood, more props |
| 8 | Waterfall rendered nothing; blinded the camera up close | alpha fix; per-pixel near-camera fade |
| 9 | Motes / halos as big blurry discs near the lens | near-camera fades, smaller sizes |
| 10 | Menu framing dominated by the ledge floor | cinematic drift past the rim over the hall |
| 11 | Visual Lab lantern view black (camera outside the room) | camera moved inside; soft pillar shadows from the new lantern pass verified |
| 12 | In narrow tunnels the explorer covered the crosshair | wider shoulder, shoulder swap, earlier dither fade |

UI screenshots (menu, HUD normal / danger, discovery, inventory tabs, workbench, settings, pause,
death; `tools/ui-check.mjs` viewports 915×412, 390×844 and 1280×720; Large text and High contrast)
were inspected by the UI reviewer, who also captured 740×360 and 640×360 with ad-hoc scripts (not in
the repo); the toast stack was moved off the depth readout on narrow phones. Screenshots are written
to `artifacts/` (git-ignored), not committed.

## Performance (headless Chromium, SwiftShader, 915×412, Balanced, production build via `tools/perf.mjs`)

SwiftShader rasterizes on the CPU, so FPS is not a phone number. CPU-side costs are meaningful.
Three runs; ranges show run-to-run noise on a shared 4-CPU container.

| Location | JS frame ms (avg / p95) | Draw calls | Triangles |
|---|---|---|---|
| Camp | 1.42–1.74 / 2.3–3.1 | 62 | 21k |
| Tunnel | 1.65–1.97 / 2.4–3.5 | 176 | 83k |
| Ledge vista | 1.72–1.94 / 2.5–4.8 | 188 | 96k |
| Hollow floor | 1.56–1.80 / 2.1–2.4 | 135 | 54k |
| Bridge | 1.21–1.35 / 1.9–2.1 | 60 | 27k |

| Operation | Cost |
|---|---|
| Zone generation (module worker) | 320–390 ms, off the main thread |
| Full light + openness (worker) | 280–300 ms, off the main thread |
| Initial meshing (main thread, time-sliced) | ~125 ms |
| Mining a block: light update / remesh (20 blocks) | 0.08–0.11 / 0.20–0.58 ms avg (max 0.9 / 4.7 ms) |
| Mining a crystal (light removal) | 0.2–1.0 ms (17.4 ms before the removal flood fill) |
| Lantern visibility recompute (real world, Node, r = 11 / 14.5) | 0.23–0.39 / 0.51–0.59 ms (ray marching: 1.75 / 5.7 ms) |
| Save: build / write / read | 5.4–10.3 / 0.2–1.7 / 0.2–0.4 ms |
| Memory | JS heap 40–41 MB; GPU geometry 3.7 MB; light volume 12.5 MiB; render targets ≈ 3.3 MiB (estimate) |
| Download | game page ≈ 260 KB gzipped (three.js ≈ 167 KB of it); APK 293 KB |
| Lights | 1 dynamic (the lantern, by design); 400 static emitter voxels in the zone (61 invisible prop lights, 179 crystal, 160 glyph stone) |

## Audio (offline renders in Chromium, 48 kHz)

Spectral centroids separate the materials clearly: stone hit 2.0 kHz, metal 3.0 kHz, crystal 5.3 kHz.
All 46 sounds peak between 0.08 and 0.91 (true peak ≤ 0.904; `tools/audio-check.mjs` requires
peak > 0.05 and true peak ≤ 1.0), so none clips. **Not listened to by a human.**

## Android

`android/build-apk.sh` → `deep-down-debug.apk` (293 KB): aapt2 link, javac (release 8), dx,
zipalign, apksigner; signature verified; badging: package `com.korroai.deepdown`, minSdk 23,
targetSdk 34, label "DEEP DOWN", launcher icons. The script now refuses stale builds.

`tools/apk-sim.mjs` unpacks the APK's `assets/www` and serves it the way `MainActivity` does
(virtual origin `https://appassets.androidplatform.net/`, the same MIME table, everything else
refused) to headless Chromium on a 915×412 touch viewport at DPR 2:

| Check | Result |
|---|---|
| boots to the main menu from the packaged files | PASS |
| world generated in the module worker on that origin | PASS |
| New Expedition starts play | PASS |
| generated `data:` icon decodes | PASS |
| save written to `localStorage` on the app origin; Continue offered after reload | PASS |
| no request leaves the app origin; no page errors | PASS |

This verifies packaging, relative paths, worker loading and storage on the app's origin. It is
**not** a device test: Android WebView behaviour, GPU performance, touch latency and audio on a
real phone are unverified.
