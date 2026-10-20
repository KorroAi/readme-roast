# DEEP DOWN — Changelog

Newest first. Each entry says what changed and how it was verified.

## Unreleased — final pass toward 1.0.0

Plan: `docs/final-pass/MERGE.md` (5 waves of two specialists). Checkpoint before it: local tag
`checkpoint/pre-final-pass-w1` (commit ee3c11e).

### Final pass W2: world variety (`world/gen/features/**`, `game/WorldFeatures.ts`, `game/{ropeRide,runeDoor,moths}.ts`, `game/effects/LumenMoths.ts`, `config/livingRock.ts`)
- New places off the existing route:
  - the Halden Survey Office (first log);
  - the Moth Grotto (tapping moths at a cold slit, a gravel plug, a 1 m squeeze, a geode with glimmer);
  - the Halden Yard (track, spoil, broken cart, a lit adit with timber sets) and its hoist;
  - the Reliquary behind Rune Door 1 at the bridge's end;
  - the Lamp Gallery behind Rune Door 2 (copper lantern only);
  - the landing survey post;
  - the rift floor with the Halden's last camp and the black stone.
- Four moments:
  - Squeeze into the grotto.
  - Ride the hoist: it is chained until released from its foot, then rides up and down at 9 m/s in 5.7 s.
  - Wake a rune door: 1.2 s near it with a lit lantern, then it sinks row by row.
  - Ride the rope down to the rift floor (5.4 s). The rope is its only way home.
- Rides freeze input, ease in and out, and end standing on the stand with no fall damage. They are edges of the walk-home field, so the compass and the pack search follow them.
- With the hoist, the walk home from the yard is 41–48 % shorter.
- Discoveries 6 → 16: mothGrotto, hoist, reliquary, lampGallery, undercroft ('The Rift Floor'), monolith ('The Black Stone') and four Halden logs. All text is in `src/i18n/en/world.ts`.
- The black stone is cold and silent on touch until W3's finale sets `features.stoneAwake`. Its first touch makes the moths spiral.
- Lumen moths: one instanced draw call, at most 40/32/16 by quality, simulated within 45 m.
  - They roost at anchors and gather at the secrets.
  - Up to 8 come to a lantern with at least 20 % fuel; they scatter at pick strikes.
  - They never enter rock.
- The deep breathes: each camp entry after a trip below 70 m starts a new expedition (progression.day).
  - The Halden face (Cu 10, Fe 6) and the rift walls (Fe 12, Cu 4, Crystal 2) re-roll with exact counts.
  - Mined cells grow back, never within 1.5 m of a drop or the pack.
  - One glimmer bloom grows at one of 6 sites, never the same twice in a row.
  - The rock changes on the camp-entry frame and the bloom one frame later.
- The cache marker is now a satchel prop. It keeps the halo and the id `cache:pack`.
- Prop kinds haldenNote, hoistWinch and satchel added. Cyan emitters 103 → 117 (+14), plus 1 per bloom, within the cap of 120.
- `WORLD.genVersion` 2, fingerprint 865cc3b6.
- New `tools/poi-density.ts` and `tools/world-tour.json` (f01–f20).
- Verified: tsc clean; vitest 44 files / 546 tests; e2e 11/11 on port 4173.

### Final pass W2: wave close (orchestrator)
An independent review of wave 2 confirmed two defects, now fixed:
- **Glimmer bloom after its floor is mined.** After a reload the bloom floated over the hole,
  and a second cyan light stayed in every later save. `placeBloom` now settles the bloom onto
  the rock, so one light remains. A regression test (`bloomSettle.test.ts`) uses the real
  session and features code; it fails without the fix.
- **Old WebViews.** The brand plates use `:where()`/`:is()` (Chromium 88). On Chromium 87,
  which the gate allowed, those rules are dropped and buttons become unreadable native grey. The
  gate in `index.html` now also requires both selectors, and for the first time it stops the
  boot (`window.__DD_UNSUPPORTED__`) instead of drawing the game under the 'update your
  WebView' message. Probed with `:where()` reported as unsupported: only the message shows. On
  current Chromium the game boots as before.

### Final pass W2: brand identity, 'Lamplight on the Lintel' (`src/ui/brand/**`, `ui.css`, `notices.ts`, `sprites.ts`, `make-icon.mjs`)
- **Wordmark:** carved in the Lintel stroke face; each word hangs from its lintel. The O of DOWN is the builders' lantern rune with a breathing amber flame, whose warm light reaches D, W and N.
- **Octagon plates:** brass rims and lintel headers (a groove with pendant ticks) on every screen, the HUD, toasts, the crash panel and the context-loss notice. Ledger rows; an amber octagon focus ring.
- **Display type:** the Lintel face, built as an in-memory TrueType at startup, sets title plates, discovery titles, the death title and the depth numerals.
- **Discovery banner:** shows found/total and a major variant.
- **Specimen icons:** pixel specimens (slate flake, root coil, copper with verdigris, iron with jasper, echo shard, the Lantern-rune tablet, a rune stone per rune) replace the voxel-cube icons.
- **One emblem everywhere:** the boot mark at first paint, the favicon, the web 'any' and 'maskable' icons, the Android adaptive and themed icon, the splash and the Play icon.
- **Home screen:** the version line 'v1.0.0 · made entirely in code'; the Visual Lab stays dev or ?lab only.
- **Motion:** screens cross-fade, with tokens and a reduced-motion rule.

### Final pass W1: loop core (`game/Progression.ts`, `gameplay/{Cold,Records,NextStep,CacheSpot}.ts`, `world/analysis/homeField.ts`, save v2)
- The dark is cold. After the flame dies there are 8 s of grace, then the cold takes 10 hp per 5 s (black-out 58 s after the flame dies from full health, 148 s with the coat). Never at camp; the Attuned Lantern is immune.
- Walk-home field. The compass shows walking metres to camp and aims down the field's steepest descent (balcony: 191 m walk, 152 m straight). It is recomputed on leaving camp and every 25 mined blocks.
- Turn-back mark on the lantern bar at walkHome x 1.25 + 10 s; 'Turn back — about N s to camp' once per trip; the bar pulses red at walkHome x 1.0.
- A black-out or an abandoned trip leaves one cache (the pack minus the Sealed Pouch, plus loose drops) on the last cell the explorer stood on safely. A 'Pack N m' chip and the Next line 'Recover your pack — N m' lead back to it. Within 1.6 m the items return and any overflow stays. A second black-out destroys the first cache. The cache is saved with the death.
- Materials: Root Fibre (cave soil, 45%) and Echo Shard; stacks stone 30, fibre 20, copper 15, iron 10, glimmer 10, echo 5; iron ore drops 1-2; the seven rune key items are defined.
- Packs 6 / 8 / 10 slots; the Expedition Pack's last 2 slots are the Sealed Pouch. Lanterns 300 / 600 / 900 s.
- Expeditions and records: trip tracking, ExpeditionReport, records that only go up, depth marks every 10 m.
- The objective pill always shows a Next line; 'All objectives complete' is gone.
- Save v2: progression block, world genVersion with a fingerprint test, v1 migration (oversized stacks to storage, nothing lost), unknown items dropped and counted instead of failing the load, saves from another world wake at camp with their finds.
- Crash guard: three failed frames in a row stop the game, nothing more is saved, and 'dd:crash' is sent.
- Title screen: gameplay lens (94 degrees horizontal), 30 fps; tagline 'FOLLOW THE LIGHT DOWN', 'v1.0.0'; Ancient Ashlar / Loose Masonry / Hearth Stone / Lichen Stone.
- Loose drops fade after 90 s.
- e2e: world.spec covers the cache (death, reload, recovery); the specs wait on game time and survive a loaded machine.

### Final pass W1: release infrastructure (`src/main.ts`, `android/**`, `tools/version.mjs`, CI)
- One version source: `tools/version.mjs` (versionCode = (MAJOR×10000+MINOR×100+PATCH)×100+BUILD, prereleases refused); package.json 1.0.0 → versionCode 1000000; `src/version.ts`, vite defines, `dist/version.json`, build-apk.sh and Gradle all read it, and both Android builds refuse a web build made for another versionCode.
- Play bundle pipeline: Gradle project (AGP 8.11.1, compile/target SDK 36, min 24, no AndroidX, no minify, upload key from `DD_UPLOAD_*` environment only) and the CI workflow `.github/workflows/deep-down-android.yml` (workflow_dispatch + `deep-down-v*` tags → AAB + APK artifacts). Unverified until its first run.
- Android shell for API 35/36: predictive Back (`DeepDownAndroid.setBackHandled`), edge to edge into cutouts with insets passed to CSS, immersive via WindowInsetsController, renderer-crash recovery, explicit lifecycle (`window.deepDownLifecycle`), volume keys on media, debugging only in debuggable builds, external links in the browser; game category, `density` config change and the API 31 splash in a Gradle-only overlay. Still compiles with the API 23 toolchain.
- Adaptive launcher icon (background, foreground, monochrome) with the mark inside the safe circle, legacy icon, 512 px Play icon, splash; `tools/icon-masks.mjs` previews four launcher masks.
- Crash panel: 'DEEP DOWN hit a problem. Your last autosave is safe.' with Restart and Copy details (nothing is sent); also used for boot failures. Context loss pauses behind 'Restoring graphics…'.
- Automatic quality: Battery on first launch for ≤ 3 GB / ≤ 4-core devices; a downshift-only governor while playing (Balanced → Battery → render scale 0.65), one toast, off for good after a manual change.
- Bundled `licenses.txt` (three.js MIT, Vite helpers) and a self-contained `privacy.html`; `DD_RELEASE=1` builds only the game page.
- apk-sim: 180 s waits, load average, crash-panel/privacy/licence checks. New scripted tour `tools/tours/first-five.json`. New docs: release checklist, store listing, device test protocol, iOS plan.

### Final pass W1: wave close (orchestrator)
- One backgrounding saves once. The Android shell's pause save is followed by the WebView's
  `visibilitychange`, so a second background or pagehide save within 1 s is skipped. Other
  save reasons are unaffected.
- `tools/ui-check.mjs` follows the mobile controls: hold-to-mine waits past the 230 ms
  threshold, and the joystick checks start a fresh touch after the base has followed an
  overshoot. A new check asserts that the base follows. Sandbox 48/48.
- `package-lock.json` root version 1.0.0 (`npm ci --dry-run` passes).
- An independent review of wave 1 confirmed three defects, now fixed:
  - **Camp save order.** The camp save was written with the trip still open, so a crash and
    Continue merged two trips and lost a record. The trip now ends before the camp save and is
    announced after it. A save from an older build that still holds an open trip is closed
    quietly on load at camp.
  - **NEW BEST across a reload.** A reload mid-trip lost the trip's NEW BEST. The depth record
    at trip start (`best0`) is now saved with the trip, and older trips without it are never a
    false NEW BEST. Two regression tests cover this.
  - **Screen-on after a renderer crash.** After a renderer crash the Android shell kept the
    screen on over the menu. `recreateWebView` clears the flag, and the game always sends its
    first screen-on state.

## Unreleased — visual identity pass

Checkpoint before this pass: git tag `checkpoint/pre-visual-refactor` (commit ce23151).

### Mobile screen format and touch controls (`ui/TouchControls.ts`, `game/aimAssist.ts`, `ui/haptics.ts`, `ui/screenFormat.ts`)
- **Mine button.** A 100 px amber button under the right thumb (88 px on short screens) mines
  while held. Jump sits to its left and Use above it, mirrored in the left-handed layout. Press
  and hold on a block (now 230 ms, slop 14 px) still mines exactly that block.
- **Aim assist (touch only).** When the camera's centre ray does not land on something minable
  in reach, the Mine button works on the exposed, minable block in reach that is closest to the
  view direction (within 62°), with a clear line from the hand. It never picks a block through a
  wall. Blocks the pick is too weak for are de-prioritised, and protected blocks are excluded. A
  finger aimed at a block always wins. The aim returns to the centre ray 0.9 s after a world tap.
- **Joystick.** The radius scales with the screen (54–72 px, 15 % of the short side). The base
  follows the thumb when it overshoots, so turning back responds at once.
- **Camera follow (touch).** Walking sideways with the stick swings the camera behind the explorer,
  so a corner can be taken with the left thumb alone: up to about 36°/s with the stick fully to
  one side, less on a diagonal. It is off while mining or walking back toward the camera, and
  waits 0.8 s after the look thumb last moved (`game/touchCamera.ts`, a setting, on by default).
  `CameraRig.autoFollow` had existed but was never called.
- **Haptics.** `navigator.vibrate` gives short patterns for a strike, a too-hard block, a break,
  a pickup, damage, a discovery and a craft. Strikes and pickups are rate-limited. There is a
  Vibration setting (on by default), and vibration only fires on touch while playing. The
  Android shell declares `VIBRATE`.
- **Screen format.** On a phone browser (`(pointer: coarse) and (hover: none)`), Start and
  Continue request fullscreen and a landscape lock from the tap. A refusal is ignored. The
  Android shell is already fullscreen and landscape, and automated browsers are skipped.
  Portrait shows a "turn your phone sideways" hint on the menu.
- **Web app manifest.** The production build emits `manifest.webmanifest` (fullscreen,
  landscape, theme `#05080c`) and 192/512/180 px icons rendered by `android/make-icon.mjs`;
  `index.html` links them. The Visual Lab button is hidden in production builds unless `?lab`
  is set.
- **Fix.** Releasing the touch layer (window blur, page hidden) no longer cancels a desktop
  mouse swing. It now only clears mining that the touch layer itself started.
- **Verified.** 7 new unit tests cover assist face and reach, no wall-through, view preference,
  joystick sizing and follow, and the haptics rate limit and disable. The UI replay test was
  made relative to the hold threshold. Real CDP touches were sent to the dev server:
  - at 844×390, the assist hovered the slate in reach, and holding Mine gave 3 strikes and broke it;
  - at 390×844 portrait, the assist chose the faced block and the rotate hint showed;
  - in mobile emulation with a real tap, the page went fullscreen in `landscape-primary`.

### Visual audit (baseline)
- 12 gameplay screenshots + 4 Visual Lab views captured from the running game (915×412, Balanced,
  SwiftShader) in `artifacts/audit-before/` (git-ignored) and scored by three independent critics
  (originality/geometry, materials/seams, lighting/readability). Consensus (1–10): geometry 3,
  textures 3, transitions ~2, lighting ~5, cyan/glyphs ~3, originality 2, readability ~5,
  character/props 5, post ~5, mobile risk 6. See ART_DIRECTION.md → "Visual audit".

### Terrain material system (replaces per-block tiles for terrain)
- Seamless 128×128 material layers sampled in **world space** (16 texels/m, 8 m period): a wall is
  one continuous surface, no per-block frame, bevel or brightness hash.
  (`src/render/materials/*`, `src/render/terrainMaterial.ts`)
- New material library: ancient dark stone, deep stone, weathered rock, damp stone with sparse
  lichen, soil with embedded stones and roots, scree gravel, copper and iron **veins** that run
  through the rock, faceted crystal, the plated seal stone, large-course ashlar masonry, cap
  stones, worn floor slabs, crumbling masonry, hearth stones, timber, abyssal bedrock.
- Natural material boundaries: the mesher bakes each face's in-plane neighbour materials into
  the vertex data; the shader lets the "taller" material (pebbles, rock nubs, vein metal) push
  across the edge with a world-space wobble, identically from both sides. Only same-family
  materials blend (geology with geology, masonry with masonry).
- Crack-free sculpting: vertices are displaced by world-space noise scaled by a per-vertex
  rigidity (natural rock most, masonry a little, timber not at all) taken from the 8 voxels
  around the vertex, so shared vertices always move together. Faceted normals from screen-space
  derivatives catch the lantern.
- Shading: equalized wall shade (no Minecraft per-axis brightness steps), AO floor raised; crystal
  faces no longer lit by their own emission.
- Runes: eight-glyph "builders' script" decals (`rune0..7` tiles) carved into glyph stones,
  eroded by world-space noise, dim until the lantern is near.
- Mining cracks and the target highlight are drawn by the terrain shader on the sculpted surface
  (the floating crack box and outline are only used by tools without a terrain rig).
- Material painting (≈0.35 s) runs in the zone worker with the world generation.
- Verified: `tsc` clean, 340 unit tests, 4/4 e2e (slice spec's seal step allowed 30 s instead of
  12 s: software rendering on this container is slower, see TEST_REPORT.md), screenshots in
  `artifacts/iter1/`.
- Cost: on SwiftShader the new terrain renders ~20–35 % slower than the old one in an A/B on the
  same machine (camp 13 → 11 fps, tunnel 8 → 5). GPU cost on a phone is unmeasured.

### Round 3 — sculpted rock geometry (`mesher.ts`, `ChunkRenderer.ts`, terrain vertex shader)
- The 1 m voxel step and the printed triangle lattice are gone from natural rock: the mesher
  moves every quad corner toward its surface-nets point (chamfered edges and corners, filled
  creases, steps become slopes, 1-voxel columns octagons), relaxes slopes, and adds world-space
  relief; smooth normals and AO from a 4×4×4 occupancy gradient model the rock under the
  lantern. Masonry keeps a crisp, slightly chiselled arris; timber is exact.
- Gameplay held: walkable flat interiors move 0, edges ≈ 0.21 m, corners ≤ 0.31 m; rock reaches
  ≤ 0.4 m into open space (the camera now keeps 0.4 m from voxel hits instead of 0.3 m); cell
  picking, mining cracks and material boundaries use the undisplaced lattice position.
- Crack-free across chunks by construction (bit-identical shared vertices, 2-voxel padding,
  seam keys that re-mesh a neighbour when its seam data changed), unit-tested.
- Ledge: the flat plane, kerb box and lone cubes became a broken crag parapet; the Hollow's rim
  terraces wander instead of ringing the floor.
- Crystal seams follow their host rock, sunk 0.2 m into a groove.
- Vertex 11 → 16 bytes (one interleaved buffer); the vertex shader no longer fetches textures.
- Verified: `tsc`, 363 unit tests (new `mesh-sculpt.test.ts`: seam bit-identity, flat floors 0,
  walkable bounds, intrusion and sag caps, masonry crisp, step → slope, smooth AO, seam
  re-mesh); SwiftShader FPS within ±10 % of the previous build (6 alternating runs each); terrain
  GPU geometry 3.6 → 4.9 MB. Cost: dense chunks mesh 2.7× slower, so mining re-mesh rose to ≈2 ms
  on the main thread (spikes to 10 ms) — fixed by the mesh worker below.

### Round 3 — chunk meshing off the main thread (`meshWorker.ts`, `meshPool.ts`, `ChunkRenderer.ts`)
- Edits re-mesh in a pool of 1–2 module workers (sized from `hardwareConcurrency`; `?meshworkers=N`
  overrides): the main thread copies the 20³ padded block (8000 bytes, transferred), posts, and
  uploads the result. Byte-identical to the synchronous mesher (unit-tested over all 800 zone
  chunks; `__DD__.meshCheck()` found 800/800 identical in every browser run). Stale results are
  dropped, the old mesh stays until its replacement lands, an edit's chunks switch together, seam
  neighbours re-mesh from worker results.
- Fallback to the synchronous path when workers are unavailable, fail to load, error, or stop
  answering (watchdog); verified in the browser with `?meshworkers=0`, a throwing constructor and
  a missing worker script. The initial zone build stays on the main thread (a worker-assisted
  build was slower on this loaded container; opt-in `?meshbuild=pool` for a phone A/B).
- Measured (production builds, 4 alternating runs each): main-thread ms per mined block 1.71 →
  0.82, worst block 8.85 → 2.7, worst frame 6.65 → 2.25; a mined chunk is drawn 1 frame after
  the edit (was the same frame; 2 frames once in 80 edits). Boot unchanged within noise.
- Debug API: `meshIdle()` waits for pending meshes, `meshCheck()` verifies GPU buffers against a
  fresh mesh. `aimAt()` now lets the camera rig come to rest between corrections: with the new
  shoulder-swap spring an unsettled aim drifted ~0.3 m sideways a second later and the touch e2e
  mined the stone next to its copper target (reproduced in the browser, fixed, re-verified).

### Round 3 — mining-aim regression found and fixed (`CameraRig.ts`)
- The touch e2e then failed at the deep seal: with the new framing (lens aimed 0.8 m over the
  explorer, boom tilted 0.17 rad) a block at the boots needed a pitch past the −1.2 rad limit,
  so it could not be targeted at all. Looking down, the framing now eases toward a plain
  over-the-shoulder view (pitch tilt and yaw framing fade out, shoulder to 55 %, smoothstep
  over −0.3 → −1.0 rad); normal-pitch framing is unchanged.
- Measured offline over 260 sampled mining spots with a damped, settle-aware aim: round-2 rig
  49.6 %, round-3 rig 36.9 % (feet 41/131), fixed 50.4 % (feet 69/131). New unit tests: a block
  at the feet is targetable (fails on the unfixed rig, passes at 0.66 rad), and the explorer
  stays left and low at normal pitch.

### Round 4 — near-field light and warm/cold ownership (`lighting.ts`, `PostFX.ts`, `terrainMaterial.ts`, key lights)
- **Lantern.** The core is warm-pale (`#ffe6c6`) and reaches amber by about 1.8 m. Gain went
  1.85 → 1.6 with a flatter falloff (K 9 → 6), so the pool carries ahead of the explorer.
  - Up-facing ground 2.5–4.5 m out takes 40 % of the diffuse with 0.25 wrap: the pool reads as
    a ring on the floor.
  - A wider fuel-tank shadow leaves a dark disc under the flame instead of a hot spot at the boots.
- **Warm/cool ownership.** `ambientFrom(ls, n, facing, ao, lantern)`: lamp plus lantern light
  cuts the cool open fill by up to 75 %, so a face reads amber or blue and the lavender band
  where they meet stays narrow. The terrain uses it.
- **Split tone.** The PostFX split tone is now chroma-aware. Neutral darks lerp to a blue-black
  of the same luminance, while amber, cyan and violet darks keep their hue. This removes the
  rose/mauve falloff.
- **Lamps.** Route and amber lamps are amber-gold, no longer red-orange. The red-orange light,
  mixed with the blue fill on bluish stone, came out lavender after the light curve.
- **Atmosphere.** Hollow fill `#8a9ab5` at 0.95, exposure 2.25. The camp has cool charcoal air
  (`#1b1a1c`) and a cool base ambient.
- **Warm practicals.** A lamp in the shrine's first bay and one at the Spindle's foot, appended
  last so no prop id moves. Cyan emitters stay at 103 of 120.
- **Verified.** Full 17-shot same-camera A/B, control → this pass:
  - a04 foreground p90: 134 → 113.
  - Hue 270–360 share in Hollow shots: a06 29.5 → 1.1, a10 21.5 → 1.1, a13 16.2 → 1.1.
  - Lit floor hue 316–10° → 26–30°.
  - Feet-zone share of the brightest pixels: a08 79 → 60, a04 59 → 32.
  - Averages p95 125, std 35, local 10.0, dark 5.5, clip 0.
  - Battery and `?ldr=1` were captured and read.
  - A worldgen test guards the two practicals. tsc and vitest pass (416/416).
  - Not met: a04's whole-foreground saturation is 0.22 against the 0.25 target. The camp's cool
    counterpoint is subtle.

### Round 4 — the lens (`CameraRig.ts`, Visual Lab)
- **Lens.** A 90° horizontal lens, locked in landscape (vertical 48.5° at 915×412), and at most
  72° vertical in portrait. It opens toward 106° only while rock holds the boom short.
- **Framing.** 8.3 m boom, 1.0 m shoulder, 0.14 rad pitch and 0.21 rad yaw framing. The explorer
  is 90–111 px tall at a third of the width, clear of the joystick.
- **Space-aware.** The boom eases in for passages (5.4 m), bends, facing rock, looking down and
  looking up. It steps to the other shoulder when one side is walled in (a12: explorer box
  9.5 % → 1.3 % of the frame).
- **Visual Lab.** The props camera is fixed (std 3.4 → 29.5). The lantern view shows the explorer
  carrying the tier-1 lantern under the gameplay rig.
- **Verified.**
  - `camera.test.ts` 18/18, 6 of them new: lens lock, shoulder step, short-boom framing, passage
    boom, facing rock and looking up. The 400-pose fuzz still passes.
  - Aim over 260 sampled spots: 54.6 % (round-3 rig 50.0 %). Seal, copper, slate and iron
    aimchecks all mine.
  - Same-tree A/B: dark 7.3 → 5.8, heroTop 24.9 → 14.8.

### Round 4 — architecture off the voxel lattice (`render/structures/*`, `architecture.ts`)
- Built forms are procedural meshes drawn over hidden collision cells (new block ids 24–33:
  solid, invisible, unbreakable), so light, raycasts, mining, reachability and camera collision
  still work on whole cubes and the terrain mesher and mesh workers are untouched:
  - stair flights: 0.25 m monolithic treads with worn nosings, raking parapets with sloped
    coping, newels, rampant-arch bays with voussoirs; a jointless plinth course hides the 1 m
    flank;
  - columns: 32-segment lathe with entasis, attic base, grooved drums, echinus and abacus, or a
    fractured broken shaft;
  - the bridge: a segmental arch over a chasm widened to a 6.2 m half-width, voussoirs, keystone,
    a parapet of separate stones, saddleback coping, newels and a mid-span lamp pedestal;
  - kerbs and copings as dressed stone; the processional way levelled with kerb slopes; the
    landing tower cornice;
  - camp timber in real sections (0.18–0.34 m), a butt-jointed frame with knee braces, one
    fallen beam, plank decks on joists;
  - the abyss monolith rebuilt as a battered octagonal pylon with incised rings and a
    pyramidion; violet only in the portal niche, cyan only in the core.
- Stairs get a walking-plane collision (wedge cells solid below a 1:1 plane; the player is lifted
  along it and snapped down when descending): the drawn feet stay within 0.141 m of the treads
  (36 measured walks, unit-tested at 60 and 30 fps).
- Rendering: a dedicated structure material sharing the terrain's lighting composition and
  course libraries (world-course, strip-stone, monolith and plain modes, contact occlusion, a tone
  per stone); one mesh per 32 m cell (10 meshes, 63k vertices, 49k triangles, 2.06 MB), built
  lazily nearest-first and drawn before the terrain.
- Verified: `tsc`, 398 unit tests (new `structures.test.ts`: closed outward meshes, every hidden
  cell covered, stair planes match the spec, feet within 0.15 m), Playwright e2e 4/4 on the first
  run. Perf (5 alternating runs each, shared machine): boot and zone load within noise; triangles
  +19–39k at four spots; GPU geometry 6.4 → 7.5 MB; CPU frame time ×0.97–1.33 with overlapping
  ranges (a same-session toggle shows the structures CPU-neutral and slightly faster on fill,
  since they hide voxel faces).

### Round 4 — surface presentation (`terrainMaterial.ts` sampling, `materials/*`, `Waterfall.ts`)
- Natural rock is textured from the sculpted surface (top from above, sides from two blended wall
  planes with level beds, ceilings from below; top/side chosen from the smooth normal), so
  chamfers no longer stretch and smoothed steps no longer print 1 m top/side stripes.
- Sharp-bilinear sampling with 2× anisotropy replaces nearest magnification: crisp texel edges
  without the camouflage grid; a fine near-lens grain without a fetch.
- Rock painter: world-warped folding (no per-tile sine folds), height-only facets, broken laminae
  instead of a barcode, long open partings, dark pits; floors two ramp steps under their walls
  with dark grit (a04 foreground p90 197 → 138, pale-neutral pixels 43 → 0.7 %).
- Inscriptions read as script: a carved 'script' layer laid along the course (headline, baseline
  groove, varying glyphs and word gaps).
- Mining feedback: a soft strike light at the ray hit and growing hairline fractures replace the
  cube rim and crack stamp.
- Crystal is a dark druse of faceted points with tip glints; the hearth is soot fieldstones with
  sparse embers; the Glimmerfall is one draw call — a spreading, breaking sheet with mist and a
  ripple ring at the foot, below the bloom threshold.
- Verified: `tsc`, 398 unit tests (new: floors darker than walls, no pale floor speckle, hearth
  emission bounds, script-layer structure, geology partner tables); tour metrics hold (local
  contrast 10.1 → 9.7, a deliberate trade: the rejected speckle was part of it). Fetches on rock
  5–7 (round 3: 6); +45–70 ALU on rock. SwiftShader is slower than round 3 after a rewrite of the
  projection (feature isolation: software bilinear/anisotropy first); phone GPU cost unmeasured.

### Round 3 — exposure chain, value and hue structure, key lights (`lighting.ts`, `PostFX.ts`, palette)
- Albedos are real reflectances (rock and ashlar 1.8–3.1× brighter in linear, darkest steps
  kept low, weathered rock raised less so it never goes pale or beige); the darkness comes from
  light. Scene exposure lives in each zone preset (camp 1.8, tunnel 1.36, Hollow 2.3, rift 2.1).
- Lantern: windowed inverse-square falloff (≈4× lower at 6 m), nearly neutral core and amber
  rim, a shadow cone under the fuel tank, cool-grey bounce.
- Cool hemispheric open-space fills in the Hollow, tunnel and rift; placed light gets a
  direction from the light volume (`LAMP_DIR`, one extra fetch, off on Battery) so faces turned
  away from lamps and recesses fall to the cool fill; clearer near haze with a darker veil.
- Post: no lifted toe, a hue-keeping contrast S-curve and a split grade (blue-black shadows,
  amber highlights).
- The explorer is demoted (coat 28 % darker, its own lantern measured from 3 m, a faint rim only
  on edges away from the flame); the screen-door fade branch is gone.
- Key lights authored per space (a pass after all geometry): the Spindle's uplight and rim
  lights, the seal's underglow and the frieze recess, the shrine dais and tablet, four violet
  lights low in the chasm. Cyan/violet emitter voxels 86 → 103 (the tested cap stays 120); a new
  test checks every key light exists.
- Measured on the 16-shot tour (`metrics.py`, before → after): p95 luma 56 → 135, std 17.9 → 38.4,
  local contrast 4.9 → 10.3, below luma 12 11.9 → 7.5 % (worst shot 18 %), clipped 0 %, saturated
  cyan 0.6 %, coldDark 50 → 75 %, explorer share of the brightest 1 % 54 → 26 %. Battery and
  `?ldr=1` checked (0 % clipped). SwiftShader A/B within noise; GPU cost on a phone unmeasured
  (+1 3D fetch per terrain fragment on Balanced/High, ≈+25 ALU).

### Round 3 — masonry vocabulary, grooved cracks, no texture repeat (`materials/*`, sampling)
- Masonry is laid in world space from course libraries: 2 m of height becomes one 2 m course,
  two 1 m courses or 1.5 + 0.5 m (thin courses never stack — what made the old wall read as
  brick), each course offset and cut into hash-chosen 4 m pieces. Two vocabularies chosen by
  region without new blocks: coursed ashlar and megalithic (new layers `masonryB`,
  `crumblingB`). Crumbling is the same wall coming apart (open joints, slipped and missing
  stones, rubble core, a small cyan leak).
- Cracks are tapered grooves with a lit lip and a shaded side, following the strata (no more
  black ink lines or "dried mud" facet networks); grains are stamped in clusters (isolated
  single texels 2.5 → 0.9 % on rock); weathered rock keeps its ochre inside cracks only.
- The rock projection is bent by a slow world-space warp reusing an existing noise fetch: the
  8 m repeat is gone (autocorrelation 0.113 → 0.011 on the lab wall). A per-pixel region-hash
  flip on planes at multiples of 24 m (the dotted patch in a06) was found and fixed.
- Verified: `tsc`, 383 unit tests (3 new course-library tests); painting 0.52–0.59 s cold
  (baseline 0.50–0.52 s, same session); no added texture fetch; +170 KiB texture with mipmaps.

### Round 3 — camera framing, fade and a judgeable Visual Lab
- Camera: 1.15 m shoulder, 4.8 m boom, 67° lens (72° in portrait), the explorer small in the
  lower-left third so the route and target read; room that shrinks at once and recovers slowly,
  a critically damped shoulder swap, a shoulder that slides in behind posts.
- The explorer's near-camera fade is true transparency with a depth pre-pass (no dither pattern
  over the scene) and only starts when the camera is genuinely close.
- Visual Lab: a review light (default) makes every view judgeable; a button and `?light=game`
  switch to the real game lighting; the Transitions overview frames the whole court.
- Review tour: three new shots (gate frieze, hall columns, the Spindle); a01–a13 unchanged.
- Verified: camera tests 10/10 (5 new: framing, portrait, shoulder slide and recovery, wall end,
  alpha fade), 400-pose fuzz unchanged (0 inside, 0 blocked); offline replay of the e2e mining
  flows hits the intended blocks; lab views mean luma 35–64 with < 25 % below luma 12.

### Round 2 — architecture, geology and the light budget (`generateWorld.ts`, `blocks.ts`)
- Cyan budget: the shrine's glyph lattice, the all-glyph floor, glowing inlays, glyph balusters,
  pillar bands and bridge/balcony glyph posts are gone. Four inscriptions remain (22 glyph stones,
  was 160): the gate frieze, the shrine's back-wall band over a dais, the shrine-door lintel (the
  secret's hint) and three runes in the balcony parapet. Glyph emission ÷4, crystal emission ÷2,
  cyan light ×0.76. Crystal is now a *seam* in exposed host rock plus faceted cluster props
  (crystal voxels 179 → 35). Saturated-cyan pixels per tour shot ≤ 3.1 % (shrine 17.6 % → 0.1 %).
- Built forms: octagonal columns (footing, plinth, base ring, shaft, ring and abacus at the dome,
  fractured tops on broken ones) forming a processional way from the shrine to the gate, with
  kerbs, worn slabs, fallen drums and slabs; stair flights on piers with slab treads between
  cheek walls, battered bases and stepped arches, corbelled passages under them; a portal gate
  (stepped buttresses, pilasters, two doorway orders, lintel, frieze, cornices, forecourt); a
  corbel-vaulted shrine with a framed door; a single-arch bridge with end posts. The camp's
  glowing 3×3 hearth grid became a gravel ring with one ember under the fire.
- Geology: dipping strata with marker beds, ledges with sloping undersides, ribs, erosion
  pockets, dripstone with thick roots and uneven tapers, flowstone curtains, tunnel fissures and
  rubble, a broken lip on the ledge. New landmark **the Spindle**, a fluted hourglass column from
  floor to dome beside the Glimmerfall (`landmarks.spindle`; nothing renamed).
- Warm navigation light: 20 lamp posts (was 13) on the landings, mid-flights, stair foot, bridge
  ends, shrine door, seal and processional way; lamp light slightly warmer.
- Verified: `tsc`, all unit tests (worldgen, route walk, mining preconditions re-checked);
  generation 302–441 ms vs 363–628 ms before (same process); faces +14 %. New test: the light
  budget (≤ 120 cyan emitter voxels, today 86; a warm lamp within 7 m of every navigation point),
  measured by `tools/emission-budget.ts`.

### Round 2 — material library retune (`src/render/materials/*`)
- One palette (`palette.ts`): charcoal / blue-black rock, neutral-grey weathered rock (was
  beige), grey-green verdigris (was cyan), deep teal crystal lit from inside, cool ashlar,
  grey-brown aged timber. Value-field painters quantized through the ramps; the Bayer dither and
  single-pixel speckle are gone.
- Painters: folded beds, partings, joints that stop at partings, fractures, chips and facets for
  rock; worn plates for floors; laminated, pitted, stained weathered rock; damp stone painted on
  the slate's own rock (no glow); soil horizons with roots (new `soilSide`); angular gravel;
  copper veins riding the host rock's fractures (ore guaranteed in 99.9 % of 1 m windows); iron
  as banded metal and jasper with rust; prismatic crystal; large-course ashlar (1.5–3.5 m stones)
  and crumbling masonry as the *same* wall loosening; soot hearth stones; checked timber.
  Layers 23 → 26 (`soilSide`, `copperTop`, `ironTop`). Inventory icons and debris colours follow
  the palette.
- Visual Lab **Transitions** view (`visuallab.html?view=transitions`): stone↔soil, ↔weathered,
  ↔copper/iron, ↔crystal, masonry↔crumbling, masonry under natural rock, a mixed wall across a
  chunk seam, irregular steps; orbiting lantern + fixed cyan light, Angle and Fog buttons,
  `cam= fog= lt= amb= labels=` URL parameters for repeatable captures.
- Verified: `tsc`, unit tests, five capture rounds (`artifacts/matlib-0..5`). Painting 0.37–0.54 s
  (was 0.23–0.39 s, same session), +0.25 MiB of texture.

### Round 2 — lighting, atmosphere and post (`lighting.ts`, `PostFX.ts`, effects)
- Four authored zone atmospheres (camp warm umber, tunnel neutral grey, Hollow blue-black with
  haze pooling low, rift violet pooling low), blended by where the explorer is; lamps scatter
  into the haze; distant emission is absorbed instead of floating as specks; desaturated
  open-space fill.
- Post: hue-preserving tone map with a lifted toe (crystals stay cyan instead of clipping to
  white, darks stay rich), luminance bloom (threshold 0.75 → 1.2, strength 0.55 → 0.4), lighter
  split tone, elliptical top-weighted vignette that keeps the touch-control corners clean. The
  8-bit fallback now encodes the scene so values above 1 survive (`?ldr=1` forces it).
- Practical light: a flat, pale-gold-to-amber lantern pool, a visibility-gated bounce, softer
  emitter shoulders. The explorer gets a warm lantern rim and stays ochre under cyan or violet
  light; props and boots get contact darkening. The Glimmerfall is a thin rope that breaks into
  ragged sheets, below the bloom threshold.
- Battery preset turns the terrain boundary blend off (cheaper; verified the define is removed).
- Lead integration: the boundary claim lost a constant bias that let both faces claim a strip at
  the edge (swapping the materials there); runes follow the position along their course (no
  repeat within 8 stones) with a slow pulse travelling along the line; the debug viewer uses the
  real zone atmosphere; tour shots settle the simulation (`__DD__.step(60)`) before capture.
- Verified: `tsc`, unit tests; 12-shot tour runs `artifacts/light-0..11`: pixels below luma 12
  33.3 % → 9.4 % (shrine 67 % → 23 %), 0 % clipped, saturated cyan 0.4 %. GPU cost on a phone is
  unmeasured (shader inspection: no new texture fetch on terrain, ~25 ALU ops for the haze).

### Explorer redesign (`src/entities/character/*`)
- A silhouette readable from behind at phone size: pack-frame poles above a tipped-back brim, red
  scarf, ochre coat with mid-calf tails, olive duffel, cream bedroll, tall boots; no cyan on the
  explorer. Coat tails flare and swing without passing through the legs; a vial swings like a
  tiny lantern. Rig and animation API unchanged; 17 meshes / 2220 triangles (was 14 / 1932).
- Verified: character tests 14/14 (tail and vial behaviour included).

## 0.1.0 — vertical slice "The Lantern Hollow"
- Complete M1 slice: voxel world + light, world generation, player/camera/mining, props and
  explorer, audio, gameplay rules, saves, UI, Visual Lab, Android shell. See TEST_REPORT.md.
