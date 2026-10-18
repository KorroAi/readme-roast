# DEEP DOWN — Test Report

Milestone M1 (vertical slice "The Lantern Hollow"). Environment: Linux container, 4 CPUs,
Node 22.22, headless Chromium 141 (Playwright 1.56.1) with WebGL 2 through SwiftShader
(software rendering). **No physical Android device or emulator was available.**

## Results at a glance

| Check | Result |
|---|---|
| TypeScript (`npx tsc --noEmit`, strict; src, unit and e2e tests) | 0 errors |
| Unit tests (`npx vitest run`) | **340 passed**, 20 files |
| End-to-end (`npx playwright test`, production build) | **4 / 4 passed**, 0 console errors; 9 consecutive full runs passed during verification |
| UI + touch checks (`node tools/ui-check.mjs --no-shots --game`) | **60 / 60 passed**, 0 console problems (4 runs after the slider-check race was fixed; before that fix the slider check failed intermittently, and one audit run also timed out in the game flow while other heavy jobs shared the machine) |
| APK packaging (`node tools/apk-sim.mjs`) | 8 / 8 passed |
| Android APK (`android/build-apk.sh`) | built, aligned, signed, signature verified; 293 KB; **not run on a device** |
| Code review | 5 areas reviewed adversarially, each finding independently verified, every confirmed finding fixed; a final audit of these documents and of the late changes (below) |
| Mutation checks on the new HUD / desktop tests | freezing the hearts, lantern meter, backpack count, compass or objective, or forcing crosshair aim, makes the intended assertion fail |

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
